"""generate_diagram handler — deterministic Mermaid snippets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

REQUIRES_SOURCE = False
REQUIRES_ODOO = False


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.odoo_analysis import (
        extract_model_classes,
        mermaid_class_diagram,
        mermaid_flowchart,
        module_dependency_graph,
    )
    from backend.services.odoo_pagination import bounded_int, search_read_bounded

    kind = str(args.get("kind") or "flow")
    target = str(args.get("target") or "").strip()
    scope = str(args.get("scope") or "odoo")
    max_nodes = bounded_int(args.get("max_nodes"), 25, minimum=1, maximum=60)

    if kind == "flow":
        description = str(args.get("description") or target or "").strip()
        if not description:
            return {"ok": False, "error": "description manquante pour kind=flow"}
        mermaid = _flow_from_description(description, max_nodes=max_nodes)
        return {"ok": True, "kind": kind, "mermaid": mermaid, "node_count": min(len(description.split(".")), max_nodes), "summary": "Flowchart Mermaid généré depuis la description."}

    if kind == "view-inheritance":
        if ctx.odoo is None:
            return {"ok": False, "error": "Connexion Odoo requise pour view-inheritance"}
        domain: list[Any] = [["inherit_id", "!=", False]]
        if target:
            domain.append(["model", "=", target] if "." in target else ["name", "ilike", target])
        records, meta = await search_read_bounded(
            ctx.loop,
            ctx.odoo,
            "ir.ui.view",
            domain,
            ["name", "model", "type", "inherit_id"],
            limit=max_nodes,
            max_records=max_nodes,
            label="Vues héritées",
        )
        edges = [
            {"from": rec["inherit_id"][1] if isinstance(rec.get("inherit_id"), list) else "parent", "to": rec.get("name") or str(rec.get("id")), "type": "inherit_id"}
            for rec in records
        ]
        return {"ok": True, **meta, "kind": kind, "records": records, "mermaid": mermaid_flowchart(edges, direction="LR", max_edges=max_nodes), "node_count": len(records), "summary": f"{len(records)} vues héritées trouvées."}

    root = _resolve_root(scope, ctx)
    if root is None:
        return {"ok": False, "error": "Sources indisponibles pour ce diagramme"}

    if kind == "module-graph":
        if not target:
            return {"ok": False, "error": "target module manquant"}
        graph = module_dependency_graph(root, target, depth=int(args.get("depth") or 2))
        if not graph.get("ok"):
            return graph
        return {"ok": True, "kind": kind, **graph, "mermaid": mermaid_flowchart(graph["edges"], direction="TD", max_edges=max_nodes), "node_count": len(graph["nodes"]), "summary": f"Graphe de dépendances du module {target}."}

    classes = extract_model_classes(root, module=None if scope != "project" else target or None, limit=max_nodes)
    if target:
        classes = [
            item for item in classes
            if target in (item.get("model") or "") or target in item["class"] or target in " ".join(item.get("inherits") or [])
        ][:max_nodes]
    if kind in {"class", "model-inheritance"}:
        if kind == "class":
            mermaid = mermaid_class_diagram(classes, max_nodes=max_nodes)
        else:
            edges = [
                {"from": parent, "to": item.get("model") or item["class"], "type": "_inherit"}
                for item in classes
                for parent in (item.get("inherits") or [])
            ]
            mermaid = mermaid_flowchart(edges, direction="LR", max_edges=max_nodes)
        return {"ok": True, "kind": kind, "scope": scope, "target": target, "classes": classes, "mermaid": mermaid, "node_count": len(classes), "summary": f"{len(classes)} classes utilisées pour le diagramme."}

    return {"ok": False, "error": f"kind non supporté : {kind}"}


def _resolve_root(scope: str, ctx) -> str | None:
    if scope == "project":
        return ctx.repo_path
    if scope == "enterprise" and ctx.source_path:
        base = Path(ctx.source_path)
        enterprise = base.parent / f"{base.name.removesuffix('-enterprise')}-enterprise"
        return str(enterprise) if enterprise.is_dir() else ctx.source_path
    return ctx.source_path


def _flow_from_description(description: str, *, max_nodes: int) -> str:
    chunks = [part.strip(" .;:") for part in description.replace("\n", ".").split(".") if part.strip()]
    chunks = chunks[:max_nodes] or [description[:80]]
    lines = ["flowchart TD"]
    previous = None
    for idx, chunk in enumerate(chunks, start=1):
        node = f"N{idx}"
        label = chunk.replace('"', "'")[:80]
        lines.append(f'  {node}["{label}"]')
        if previous:
            lines.append(f"  {previous} --> {node}")
        previous = node
    return "\n".join(lines)
