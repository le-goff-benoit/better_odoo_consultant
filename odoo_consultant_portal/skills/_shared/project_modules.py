"""Project repository manifest scanner — used by ``list_project_modules``."""

from __future__ import annotations

import ast
import os
from pathlib import Path
from typing import Any


_MANIFEST_NAMES = ("__manifest__.py", "__openerp__.py")
_EXCLUDED_DIRS = {".git", "__pycache__", ".venv", "venv", "node_modules", "dist", "build"}


def _safe_repo_path(repo_path: str, sub_path: str = "") -> Path | None:
    base = Path(repo_path).resolve()
    target = (base / sub_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None
    return target


def _read_manifest(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
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


def list_project_modules(repo_path: str, *, path: str = "", include_invalid: bool = True, limit: int = 300) -> dict:
    root = _safe_repo_path(repo_path, path or "")
    if not root:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}
    if not root.is_dir():
        return {"ok": False, "error": f"Dossier introuvable : {path or repo_path}"}

    modules: list[dict[str, Any]] = []
    invalid: list[dict[str, str]] = []
    scanned = 0
    base = Path(repo_path).resolve()

    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in _EXCLUDED_DIRS]
        manifest_name = next((name for name in _MANIFEST_NAMES if name in files), None)
        if not manifest_name:
            continue
        scanned += 1
        manifest_path = Path(current) / manifest_name
        rel_dir = str(Path(current).resolve().relative_to(base))
        data, error = _read_manifest(manifest_path)
        if error or data is None:
            if include_invalid:
                invalid.append({"path": str(manifest_path.resolve().relative_to(base)), "error": error or "Manifest invalide"})
            continue
        modules.append({
            "technical_name": Path(current).name,
            "path": rel_dir,
            "manifest": manifest_name,
            "name": data.get("name") or Path(current).name,
            "version": data.get("version"),
            "summary": data.get("summary"),
            "author": data.get("author"),
            "license": data.get("license"),
            "depends": data.get("depends") or [],
            "data_files": len(data.get("data") or []),
            "demo_files": len(data.get("demo") or []),
            "assets_bundles": sorted((data.get("assets") or {}).keys()) if isinstance(data.get("assets"), dict) else [],
            "installable": data.get("installable", True),
            "application": bool(data.get("application")),
        })
        if len(modules) >= limit:
            break

    modules.sort(key=lambda m: (str(m["path"]).count(os.sep), str(m["technical_name"])))
    return {
        "ok": True,
        "repo_path": repo_path,
        "sub_path": path or ".",
        "scanned_manifests": scanned,
        "modules": modules,
        "invalid_manifests": invalid,
        "truncated": len(modules) >= limit,
    }
