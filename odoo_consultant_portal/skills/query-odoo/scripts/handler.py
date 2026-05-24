"""query_odoo handler — search_read via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    offset = max(int(args.get("offset", 0)), 0)
    records = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        args["model"],
        args.get("domain", []),
        args.get("fields", []),
        min(int(args.get("limit", 20)), 500),
        offset,
        args.get("order", ""),
    ))
    return {"ok": True, "count": len(records), "offset": offset, "records": records}
