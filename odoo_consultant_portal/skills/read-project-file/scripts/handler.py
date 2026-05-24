"""read_project_file handler — read a file from the client custom repository."""
from __future__ import annotations

from typing import Any

REQUIRES_REPO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.skills._shared.source_search import read_file
    return await read_file(args, ctx.repo_path, include_enterprise=False)
