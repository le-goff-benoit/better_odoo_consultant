"""Shared bounded pagination helpers for read-only Odoo XML-RPC tools."""
from __future__ import annotations

from typing import Any

DEFAULT_PAGE_SIZE = 500
DEFAULT_MAX_RECORDS = 5000
MAX_PAGE_SIZE = 1000
MAX_RECORDS_LIMIT = 20000


def bounded_int(value: Any, default: int, *, minimum: int = 0, maximum: int = MAX_RECORDS_LIMIT) -> int:
    try:
        parsed = int(value if value is not None else default)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


async def search_count_or_none(loop, odoo, model: str, domain: list) -> int | None:
    if not hasattr(odoo, "search_count"):
        return None
    try:
        return await loop.run_in_executor(None, lambda: odoo.search_count(model, domain))
    except Exception:
        return None


async def search_read_bounded(
    loop,
    odoo,
    model: str,
    domain: list | None = None,
    fields: list[str] | None = None,
    *,
    limit: int = 0,
    offset: int = 0,
    order: str = "",
    page_size: int = DEFAULT_PAGE_SIZE,
    max_records: int = DEFAULT_MAX_RECORDS,
    label: str = "Résultat",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read records in pages and return explicit exhaustiveness metadata.

    ``limit=0`` means exhaustive bounded: read all visible records up to
    ``max_records``. A positive limit is treated as an explicit partial read.
    """
    domain = domain or []
    fields = fields or []
    limit = bounded_int(limit, 0, minimum=0, maximum=MAX_RECORDS_LIMIT)
    offset = bounded_int(offset, 0, minimum=0, maximum=MAX_RECORDS_LIMIT)
    page_size = bounded_int(page_size, DEFAULT_PAGE_SIZE, minimum=1, maximum=MAX_PAGE_SIZE)
    max_records = bounded_int(max_records, DEFAULT_MAX_RECORDS, minimum=1, maximum=MAX_RECORDS_LIMIT)

    total_count = await search_count_or_none(loop, odoo, model, domain)
    remaining = max((total_count if total_count is not None else max_records) - offset, 0)
    target_count = min(remaining, limit) if limit > 0 else min(remaining, max_records)

    records: list[dict[str, Any]] = []
    pages_fetched = 0
    while len(records) < target_count:
        batch_limit = min(page_size, target_count - len(records))
        batch_offset = offset + len(records)
        page = await loop.run_in_executor(None, lambda batch_limit=batch_limit, batch_offset=batch_offset: odoo.search_read(
            model,
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
    if total_count is None:
        total_for_response = visible_until
        truncated = len(records) >= target_count and target_count >= max_records
    else:
        total_for_response = total_count
        truncated = total_count > visible_until

    warning = None
    if truncated:
        if limit > 0:
            warning = (
                f"{label} partiel : {len(records)} enregistrements récupérés sur "
                f"{total_for_response} visibles car limit={limit}."
            )
        else:
            warning = (
                f"{label} borné : {len(records)} enregistrements récupérés sur "
                f"{total_for_response} visibles. Augmente max_records ou affine le domaine "
                "pour analyser le reste."
            )

    meta = {
        "count": len(records),
        "total_count": total_for_response,
        "offset": offset,
        "limit": limit,
        "page_size": page_size,
        "max_records": max_records,
        "pages_fetched": pages_fetched,
        "truncated": truncated,
        "warning": warning,
    }
    return records, meta
