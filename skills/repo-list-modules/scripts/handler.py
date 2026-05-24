"""list_project_modules handler — parse __manifest__.py files of the client repo."""
from __future__ import annotations

from typing import Any

REQUIRES_REPO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.project_modules import list_project_modules
    from backend.services.odoo_pagination import bounded_int

    return list_project_modules(
        ctx.repo_path,
        path=args.get("path") or "",
        include_invalid=bool(args.get("include_invalid", True)),
        limit=bounded_int(args.get("limit"), 300, minimum=1, maximum=5000),
    )
