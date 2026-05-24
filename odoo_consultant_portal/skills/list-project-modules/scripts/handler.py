"""list_project_modules handler — parse __manifest__.py files of the client repo."""
from __future__ import annotations

from typing import Any

REQUIRES_REPO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.skills._shared.project_modules import list_project_modules
    return list_project_modules(
        ctx.repo_path,
        path=args.get("path") or "",
        include_invalid=bool(args.get("include_invalid", True)),
        limit=max(1, min(int(args.get("limit") or 300), 1000)),
    )
