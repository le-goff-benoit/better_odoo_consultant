"""search_odoo_source handler — grep in Community + Enterprise sources."""
from __future__ import annotations

from typing import Any

REQUIRES_SOURCE = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.skills._shared.source_search import search
    return await search(args, ctx.source_path, include_enterprise=True)
