"""read_target_file handler — read a file from the migration target sources."""
from __future__ import annotations

from typing import Any

REQUIRES_TARGET = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.skills._shared.source_search import read_file
    return await read_file(args, ctx.target_path, include_enterprise=True)
