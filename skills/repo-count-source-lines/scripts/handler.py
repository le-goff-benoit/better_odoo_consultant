"""count_source_lines handler — exhaustive LOC count by module / extension / directory.

Like ``git_show_commit``, accepts a ``scope`` argument so we can't declare
a static ``REQUIRES_*``. We validate scope → path manually here.
"""
from __future__ import annotations

from typing import Any


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.source_lines import count
    scope = (args.get("scope") or "").lower()
    scope_map = {"odoo": ctx.source_path, "target": ctx.target_path, "project": ctx.repo_path}
    if scope not in scope_map:
        return {"ok": False, "error": "scope doit être 'odoo', 'target' ou 'project'"}
    base = scope_map[scope]
    if not base:
        labels = {"odoo": "Sources Odoo", "target": "Sources de la version cible", "project": "Repo projet client"}
        return {"ok": False, "error": f"{labels[scope]} non disponible"}
    return await count(args, base)
