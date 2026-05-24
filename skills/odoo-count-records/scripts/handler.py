"""count_odoo handler — search_count via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    count = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_count(
        args["model"], args.get("domain", [])
    ))
    return {"ok": True, "count": count}
