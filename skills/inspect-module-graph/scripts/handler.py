"""inspect_module_graph handler — manifest dependencies and model inheritance."""

from __future__ import annotations

from pathlib import Path
from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.odoo_analysis import (
        extract_model_classes,
        mermaid_flowchart,
        module_dependency_graph,
    )

    module = str(args.get("module") or "").strip()
    if not module:
        return {"ok": False, "error": "module manquant"}
    root = _resolve_root(args.get("scope") or "odoo", ctx)
    if root is None:
        return {"ok": False, "error": "Source indisponible pour ce scope"}

    graph = module_dependency_graph(root, module, depth=int(args.get("depth") or 2))
    if not graph.get("ok"):
        return graph

    include_inheritance = bool(args.get("include_inheritance", True))
    inheritance = extract_model_classes(root, module=module, limit=300) if include_inheritance else []
    inheritance_edges = [
        {"from": parent, "to": item.get("model") or item["class"], "type": "_inherit"}
        for item in inheritance
        for parent in (item.get("inherits") or [])
    ]
    mermaid = mermaid_flowchart([*graph["edges"], *inheritance_edges], direction="TD")
    return {
        **graph,
        "ok": True,
        "scope": args.get("scope") or "odoo",
        "root": root,
        "inheritance": inheritance,
        "mermaid": mermaid,
        "summary": (
            f"{len(graph['nodes'])} modules, {len(graph['edges'])} dépendances"
            + (f", {len(inheritance)} classes modèle" if include_inheritance else "")
        ),
    }


def _resolve_root(scope: str, ctx) -> str | None:
    if scope == "project":
        return ctx.repo_path
    if scope == "enterprise" and ctx.source_path:
        base = Path(ctx.source_path)
        enterprise = base.parent / f"{base.name.removesuffix('-enterprise')}-enterprise"
        return str(enterprise) if enterprise.is_dir() else ctx.source_path
    return ctx.source_path
