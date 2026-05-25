"""Static Odoo source analysis helpers shared by skills."""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from .source_search import source_display_path, source_roots

_MANIFEST_NAMES = ("__manifest__.py", "__openerp__.py")
_EXCLUDED_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", "dist", "build"}


def read_manifest(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except Exception as exc:
        return None, f"Lecture/parsing impossible : {exc}"
    for node in tree.body:
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Dict):
            try:
                value = ast.literal_eval(node.value)
            except Exception as exc:
                return None, f"Manifest non littéral : {exc}"
            return (value if isinstance(value, dict) else None), None
    return None, "Aucun dictionnaire manifest trouvé"


def iter_manifest_paths(root: str) -> list[Path]:
    found: list[Path] = []
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in _EXCLUDED_DIRS]
        manifest = next((name for name in _MANIFEST_NAMES if name in files), None)
        if manifest:
            found.append(Path(current) / manifest)
    return found


def build_manifest_index(root: str) -> dict[str, dict[str, Any]]:
    base = Path(root).resolve()
    modules: dict[str, dict[str, Any]] = {}
    for manifest_path in iter_manifest_paths(str(base)):
        data, error = read_manifest(manifest_path)
        rel = str(manifest_path.parent.resolve().relative_to(base))
        name = manifest_path.parent.name
        modules[name] = {
            "technical_name": name,
            "path": "." if rel == "." else rel,
            "manifest_path": str(manifest_path),
            "manifest": data or {},
            "error": error,
        }
    return modules


def module_dependency_graph(root: str, module: str, *, depth: int = 2) -> dict[str, Any]:
    index = build_manifest_index(root)
    if module not in index:
        return {"ok": False, "error": f"Module introuvable : {module}", "available_modules": sorted(index)[:50]}

    max_depth = max(0, min(int(depth or 2), 6))
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, str]] = []
    cycles: list[list[str]] = []

    def visit(name: str, level: int, stack: list[str]) -> None:
        info = index.get(name)
        manifest = info["manifest"] if info else {}
        nodes.setdefault(name, {
            "name": name,
            "path": info.get("path") if info else None,
            "level": level,
            "known": bool(info and not info.get("error")),
            "summary": manifest.get("summary") or manifest.get("name"),
        })
        if level >= max_depth:
            return
        for dep in manifest.get("depends") or []:
            dep = str(dep)
            edges.append({"from": name, "to": dep, "type": "depends"})
            if dep in stack:
                cycles.append([*stack, dep])
                continue
            visit(dep, level + 1, [*stack, dep])

    visit(module, 0, [module])
    return {
        "ok": True,
        "module": module,
        "depth": max_depth,
        "nodes": list(nodes.values()),
        "edges": edges,
        "cycles": cycles,
    }


def _literal_string(node: ast.AST) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def _literal_string_list(node: ast.AST) -> list[str]:
    if isinstance(node, ast.List | ast.Tuple):
        return [value for elt in node.elts if (value := _literal_string(elt))]
    value = _literal_string(node)
    return [value] if value else []


def extract_model_classes(root: str, *, module: str | None = None, limit: int = 500) -> list[dict[str, Any]]:
    base = Path(root).resolve()
    search_root = base / module if module else base
    if not search_root.exists():
        return []
    classes: list[dict[str, Any]] = []
    for path in search_root.rglob("*.py"):
        if any(part in _EXCLUDED_DIRS for part in path.parts):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            continue
        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue
            model_name: str | None = None
            inherits: list[str] = []
            delegated: dict[str, str] = {}
            fields: list[str] = []
            methods: list[str] = []
            for stmt in node.body:
                if isinstance(stmt, ast.Assign):
                    names = [target.id for target in stmt.targets if isinstance(target, ast.Name)]
                    if "_name" in names:
                        model_name = _literal_string(stmt.value)
                    if "_inherit" in names:
                        inherits = _literal_string_list(stmt.value)
                    if "_inherits" in names and isinstance(stmt.value, ast.Dict):
                        try:
                            delegated = ast.literal_eval(stmt.value)
                        except Exception:
                            delegated = {}
                    for target in stmt.targets:
                        if isinstance(target, ast.Name) and _is_field_call(stmt.value):
                            fields.append(target.id)
                elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)) and not stmt.name.startswith("_"):
                    methods.append(stmt.name)
            if model_name or inherits:
                classes.append({
                    "class": node.name,
                    "model": model_name,
                    "inherits": inherits,
                    "delegated_inherits": delegated,
                    "fields": sorted(fields),
                    "methods": sorted(methods),
                    "path": str(path.resolve().relative_to(base)),
                })
                if len(classes) >= limit:
                    return classes
    return classes


def _is_field_call(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    func = node.func
    return isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name) and func.value.id == "fields"


def mermaid_flowchart(edges: list[dict[str, str]], *, direction: str = "TD", max_edges: int = 60) -> str:
    lines = [
        "%%{init: {'flowchart': {'curve': 'linear', 'htmlLabels': true, 'nodeSpacing': 65, 'rankSpacing': 75}}}%%",
        f"flowchart {direction}",
    ]
    labels: dict[str, str] = {}
    for edge in edges[:max_edges]:
        labels.setdefault(_mermaid_id(edge["from"]), _node_title(edge["from"]))
        labels.setdefault(_mermaid_id(edge["to"]), _node_title(edge["to"]))
    for node_id, label in sorted(labels.items()):
        lines.append(f'  {node_id}["<b>{_escape_label(label)}</b>"]')
    seen: set[tuple[str, str, str]] = set()
    for edge in edges[:max_edges]:
        src = _mermaid_id(edge["from"])
        dst = _mermaid_id(edge["to"])
        key = (src, dst, edge.get("type", ""))
        if key in seen:
            continue
        seen.add(key)
        label = edge.get("type")
        if label and label != "depends":
            lines.append(f"  {src} -- {label} --> {dst}")
        else:
            lines.append(f"  {src} --> {dst}")
    if len(edges) > max_edges:
        lines.append(f"  truncated[\"<b>Diagramme tronqué</b><br/>{len(edges) - max_edges} liens masqués\"]")
    lines.extend([
        "  classDef default fill:#F8FAFC,stroke:#CBD5E1,stroke-width:1px,color:#111827;",
        "  classDef truncated fill:#FEF3C7,stroke:#D97706,stroke-width:1.5px,color:#78350F;",
    ])
    return "\n".join(lines)


def mermaid_class_diagram(classes: list[dict[str, Any]], *, max_nodes: int = 25) -> str:
    lines = ["classDiagram"]
    for cls in classes[:max_nodes]:
        model = cls.get("model") or cls["class"]
        node_id = _mermaid_id(model)
        lines.append(f"  class {node_id} {{")
        for field in (cls.get("fields") or [])[:8]:
            lines.append(f"    +{field}")
        for method in (cls.get("methods") or [])[:8]:
            lines.append(f"    +{method}()")
        lines.append("  }")
        for parent in cls.get("inherits") or []:
            lines.append(f"  {_mermaid_id(parent)} <|-- {node_id}")
    if len(classes) > max_nodes:
        lines.append(f"  class truncated[... {len(classes) - max_nodes} classes masquees]")
    return "\n".join(lines)


def find_xml_record(root: str, xml_id: str) -> dict[str, Any] | None:
    wanted = xml_id.rsplit(".", 1)[-1]
    for label, source_root in source_roots(root):
        for path in Path(source_root).rglob("views/*.xml"):
            try:
                tree = ElementTree.parse(path)
            except Exception:
                continue
            for record in tree.findall(".//record"):
                if record.get("id") == wanted:
                    return {
                        "path": source_display_path(root, str(path), include_enterprise=True),
                        "id": wanted,
                        "scope": label,
                        "xml": ElementTree.tostring(record, encoding="unicode"),
                    }
    return None


def _mermaid_id(value: str) -> str:
    clean = re.sub(r"[^0-9A-Za-z_]", "_", str(value)).strip("_")
    if not clean:
        return "node"
    if clean[0].isdigit():
        clean = f"n_{clean}"
    return clean


def _node_title(value: str) -> str:
    return str(value).replace("_", " ").replace(".", " · ").strip()[:80]


def _escape_label(value: str) -> str:
    return str(value).replace("&", "&amp;").replace('"', "'").replace("<", "&lt;").replace(">", "&gt;")
