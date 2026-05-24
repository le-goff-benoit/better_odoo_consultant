"""read_odoo_file handler — read a slice of an Odoo source file."""
from __future__ import annotations

from typing import Any

REQUIRES_SOURCE = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.skills._shared.source_search import read_file
    return await read_file(args, ctx.source_path, include_enterprise=True)
