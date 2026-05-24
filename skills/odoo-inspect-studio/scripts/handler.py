"""inspect_studio handler — inventory Studio customizations on the live instance.

Thin wrapper over :mod:`backend.services.studio_service` so the
live tool and the technical-complexity analyzer share one implementation.
"""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.studio_service import inspect_studio_customizations
    return await inspect_studio_customizations(
        ctx.odoo,
        sections=args.get("sections") or ["all"],
        model_filter=(args.get("model_filter") or "").strip(),
    )
