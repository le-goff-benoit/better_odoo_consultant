"""inspect_spreadsheet handler — Odoo Spreadsheet documents and formulas."""

from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True
REQUIRES_SOURCE = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.spreadsheet_service import dispatch_spreadsheet_action

    return await dispatch_spreadsheet_action(ctx, args)
