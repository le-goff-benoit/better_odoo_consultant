"""query_odoo handler — paginated search_read via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.odoo_pagination import search_read_bounded

    records, meta = await search_read_bounded(
        ctx.loop,
        ctx.odoo,
        args["model"],
        args.get("domain", []),
        args.get("fields", []),
        limit=args.get("limit", 0),
        offset=args.get("offset", 0),
        order=args.get("order", ""),
        page_size=args.get("page_size", 500),
        max_records=args.get("max_records", 5000),
        label="Résultat",
    )
    return {"ok": True, **meta, "records": records}
