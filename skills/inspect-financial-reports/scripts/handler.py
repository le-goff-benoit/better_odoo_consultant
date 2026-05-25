"""inspect_financial_reports handler — account.report audit/run/export."""

from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.financial_report_service import dispatch_financial_report_action

    return await dispatch_financial_report_action(ctx, args)
