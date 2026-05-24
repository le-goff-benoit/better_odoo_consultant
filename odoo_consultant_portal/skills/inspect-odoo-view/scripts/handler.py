"""inspect_odoo_view handler — read the assembled XML arch of a view after inheritance."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.services.view_service import inspect_odoo_view
    return await inspect_odoo_view(
        ctx.odoo,
        args.get("model", ""),
        args.get("view_type"),
        args.get("view_id"),
    )
