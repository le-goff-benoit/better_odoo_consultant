"""inspect_menus_actions handler — find menus + actions exposing a model."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    model = (args.get("model") or "").strip()
    query = (args.get("query") or "").strip()
    try:
        limit = max(1, min(int(args.get("limit") or 80), 300))
    except (TypeError, ValueError):
        limit = 80

    action_domain: list = []
    if model:
        action_domain.append(["res_model", "=", model])
    if query:
        action_domain.append(["name", "ilike", query])
    actions = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.actions.act_window",
        action_domain,
        ["name", "res_model", "view_mode", "views", "domain", "context", "target"],
        limit=limit,
        order="name asc",
    ))
    action_refs = [f"ir.actions.act_window,{a['id']}" for a in actions if a.get("id")]
    menu_domain: list = []
    if action_refs:
        menu_domain = [["action", "in", action_refs]]
    elif query:
        menu_domain = [["name", "ilike", query]]
    menus = []
    if menu_domain:
        menus = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
            "ir.ui.menu",
            menu_domain,
            ["name", "complete_name", "parent_id", "action", "groups_id", "active"],
            limit=limit,
            order="complete_name asc",
        ))
    return {
        "ok": True,
        "model": model or None,
        "query": query or None,
        "actions": actions,
        "menus": menus,
        "note": None if actions or menus else "Aucun menu/action trouvé avec ces critères.",
    }
