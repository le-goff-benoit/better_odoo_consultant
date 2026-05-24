"""read_group_odoo handler — aggregate records via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    rows = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.read_group(
        args["model"],
        args.get("domain", []),
        args.get("fields", []),
        args.get("groupby", []),
        min(int(args.get("limit", 80)), 500),
        max(int(args.get("offset", 0)), 0),
        args.get("orderby", ""),
        bool(args.get("lazy", True)),
    ))
    return {"ok": True, "count": len(rows), "groups": rows}
