"""query_odoo handler — paginated search_read via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True

DEFAULT_PAGE_SIZE = 500
DEFAULT_MAX_RECORDS = 5000
MAX_PAGE_SIZE = 1000
MAX_RECORDS_LIMIT = 20000


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    offset = max(int(args.get("offset", 0)), 0)
    raw_limit = args.get("limit", 0)
    limit = max(int(raw_limit or 0), 0)
    page_size = max(1, min(int(args.get("page_size") or DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    max_records = max(1, min(int(args.get("max_records") or DEFAULT_MAX_RECORDS), MAX_RECORDS_LIMIT))
    domain = args.get("domain", [])
    fields = args.get("fields", [])
    order = args.get("order", "")

    total_count = await ctx.loop.run_in_executor(
        None,
        lambda: ctx.odoo.search_count(args["model"], domain),
    )
    remaining = max(total_count - offset, 0)
    target_count = min(remaining, limit) if limit > 0 else min(remaining, max_records)

    records: list[dict[str, Any]] = []
    pages_fetched = 0
    while len(records) < target_count:
        batch_limit = min(page_size, target_count - len(records))
        batch_offset = offset + len(records)
        page = await ctx.loop.run_in_executor(None, lambda batch_limit=batch_limit, batch_offset=batch_offset: ctx.odoo.search_read(
            args["model"],
            domain,
            fields,
            batch_limit,
            batch_offset,
            order,
        ))
        pages_fetched += 1
        if not page:
            break
        records.extend(page)
        if len(page) < batch_limit:
            break

    visible_until = offset + len(records)
    truncated = total_count > visible_until
    warning = None
    if truncated:
        if limit > 0:
            warning = (
                f"Résultat partiel : {len(records)} enregistrements récupérés sur "
                f"{total_count} visibles car limit={limit}."
            )
        else:
            warning = (
                f"Résultat borné : {len(records)} enregistrements récupérés sur "
                f"{total_count} visibles. Augmente max_records ou affine le domain "
                "pour analyser le reste."
            )

    return {
        "ok": True,
        "count": len(records),
        "total_count": total_count,
        "offset": offset,
        "limit": limit,
        "page_size": page_size,
        "max_records": max_records,
        "pages_fetched": pages_fetched,
        "truncated": truncated,
        "warning": warning,
        "records": records,
    }
