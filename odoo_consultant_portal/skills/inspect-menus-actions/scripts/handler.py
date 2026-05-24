"""inspect_menus_actions handler — find menus + actions exposing a model."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.services.odoo_pagination import search_read_bounded

    model = (args.get("model") or "").strip()
    query = (args.get("query") or "").strip()
    limit = int(args.get("limit") or 0)
    max_records = int(args.get("max_records") or 1000)

    action_domain: list = []
    if model:
        action_domain.append(["res_model", "=", model])
    if query:
        action_domain.append(["name", "ilike", query])
    actions, action_meta = await search_read_bounded(
        ctx.loop,
        ctx.odoo,
        "ir.actions.act_window",
        action_domain,
        ["name", "res_model", "view_mode", "views", "domain", "context", "target"],
        limit=limit,
        max_records=max_records,
        order="name asc",
        label="Actions fenêtre",
    )
    action_refs = [f"ir.actions.act_window,{a['id']}" for a in actions if a.get("id")]
    menu_domain: list = []
    if action_refs:
        menu_domain = [["action", "in", action_refs]]
    elif query:
        menu_domain = [["name", "ilike", query]]
    menus = []
    menu_meta = {"count": 0, "total_count": 0, "truncated": False, "warning": None, "pages_fetched": 0}
    if menu_domain:
        menus, menu_meta = await search_read_bounded(
            ctx.loop,
            ctx.odoo,
            "ir.ui.menu",
            menu_domain,
            ["name", "complete_name", "parent_id", "action", "groups_id", "active"],
            limit=limit,
            max_records=max_records,
            order="complete_name asc",
            label="Menus",
        )
    return {
        "ok": True,
        "model": model or None,
        "query": query or None,
        "actions_meta": action_meta,
        "menus_meta": menu_meta,
        "truncated": bool(action_meta.get("truncated") or menu_meta.get("truncated")),
        "warning": action_meta.get("warning") or menu_meta.get("warning"),
        "actions": actions,
        "menus": menus,
        "note": None if actions or menus else "Aucun menu/action trouvé avec ces critères.",
    }
