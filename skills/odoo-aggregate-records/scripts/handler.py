"""read_group_odoo handler — aggregate records via XML-RPC."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    raw_limit = args.get("limit", 0)
    try:
        limit = max(0, min(int(raw_limit or 0), 5000))
    except (TypeError, ValueError):
        limit = 0
    offset = max(int(args.get("offset", 0)), 0)
    rows = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.read_group(
        args["model"],
        args.get("domain", []),
        args.get("fields", []),
        args.get("groupby", []),
        limit,
        offset,
        args.get("orderby", ""),
        bool(args.get("lazy", True)),
    ))
    truncated = bool(limit > 0 and len(rows) >= limit)
    return {
        "ok": True,
        "count": len(rows),
        "limit": limit,
        "offset": offset,
        "truncated": truncated,
        "warning": (
            f"Agrégat potentiellement partiel : {len(rows)} groupes retournés avec limit={limit}. "
            "Relance avec limit=0 ou un groupby plus précis si tu dois garantir l'exhaustivité."
            if truncated else None
        ),
        "groups": rows,
    }
