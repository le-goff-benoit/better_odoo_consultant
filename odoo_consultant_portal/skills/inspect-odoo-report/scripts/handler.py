"""inspect_odoo_report handler — read QWeb template + layout of a PDF report."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.services.view_service import inspect_odoo_report
    return await inspect_odoo_report(
        ctx.odoo,
        args.get("model"),
        args.get("report_name"),
    )
