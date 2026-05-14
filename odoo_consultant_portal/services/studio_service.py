import asyncio
from typing import Optional


async def inspect_studio_customizations(odoo, sections: Optional[list[str]] = None, model_filter: str = "") -> dict:
    """Query the connected Odoo instance for Odoo Studio customizations."""
    sections_req = [s.lower() for s in (sections or ["all"])]
    do_all = "all" in sections_req
    loop = asyncio.get_event_loop()
    result: dict = {"ok": True}

    async def _xids(model_name: str) -> list:
        xids = await loop.run_in_executor(None, lambda: odoo.search_read(
            "ir.model.data",
            [["module", "in", ["studio_customization", "web_studio"]], ["model", "=", model_name]],
            ["res_id"],
            limit=500,
        ))
        return [x["res_id"] for x in xids if x.get("res_id")]

    if do_all or "models" in sections_req:
        try:
            domain: list = [["state", "=", "manual"]]
            if model_filter:
                domain.append(["model", "ilike", model_filter])
            models = await loop.run_in_executor(None, lambda: odoo.search_read(
                "ir.model", domain,
                ["name", "model", "transient", "info"],
                limit=300,
            ))
            result["custom_models"] = {"count": len(models), "items": models}
        except Exception as exc:
            result["custom_models"] = {"count": 0, "error": str(exc)}

    if do_all or "fields" in sections_req:
        try:
            domain_f: list = [["state", "=", "manual"]]
            if model_filter:
                domain_f.append(["model", "ilike", model_filter])
            fields = await loop.run_in_executor(None, lambda: odoo.search_read(
                "ir.model.fields", domain_f,
                ["name", "field_description", "ttype", "model_id", "required",
                 "store", "index", "compute", "related", "selection"],
                limit=1000,
            ))
            by_model: dict = {}
            for f in fields:
                mid = f.get("model_id")
                m_label = mid[1] if isinstance(mid, list) and len(mid) > 1 else str(mid or "?")
                by_model.setdefault(m_label, []).append({
                    "name": f.get("name"), "label": f.get("field_description"),
                    "type": f.get("ttype"), "required": f.get("required"),
                    "store": f.get("store"), "index": f.get("index"),
                    "compute": f.get("compute") or None, "related": f.get("related") or None,
                })
            result["custom_fields"] = {"count": len(fields), "by_model": by_model}
        except Exception as exc:
            result["custom_fields"] = {"count": 0, "error": str(exc)}

    if do_all or "views" in sections_req:
        try:
            view_ids = await _xids("ir.ui.view")
            views = []
            if view_ids:
                dom_v: list = [["id", "in", view_ids]]
                if model_filter:
                    dom_v.append(["model", "ilike", model_filter])
                views = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.ui.view", dom_v,
                    ["name", "model", "type", "key", "priority", "active"],
                    limit=500,
                ))
            result["studio_views"] = {"count": len(views), "items": views}
        except Exception as exc:
            result["studio_views"] = {"count": 0, "error": str(exc)}

    if do_all or "menus" in sections_req:
        try:
            menu_ids = await _xids("ir.ui.menu")
            menus = []
            if menu_ids:
                menus = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.ui.menu", [["id", "in", menu_ids]],
                    ["name", "complete_name", "active", "sequence"],
                    limit=200,
                ))
            result["studio_menus"] = {"count": len(menus), "items": menus}
        except Exception as exc:
            result["studio_menus"] = {"count": 0, "error": str(exc)}

    if do_all or "server_actions" in sections_req:
        try:
            sa_ids = await _xids("ir.actions.server")
            actions = []
            if sa_ids:
                actions = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.actions.server", [["id", "in", sa_ids]],
                    ["name", "model_id", "state", "binding_model_id", "binding_type"],
                    limit=200,
                ))
            result["studio_server_actions"] = {"count": len(actions), "items": actions}
        except Exception as exc:
            result["studio_server_actions"] = {"count": 0, "error": str(exc)}

    if do_all or "cron" in sections_req:
        try:
            cron_ids = await _xids("ir.cron")
            if cron_ids:
                crons = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.cron", [["id", "in", cron_ids]],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    limit=100,
                ))
            else:
                crons = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.cron", [],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    limit=100,
                ))
            result["cron_actions"] = {"count": len(crons), "items": crons}
        except Exception as exc:
            result["cron_actions"] = {"count": 0, "error": str(exc)}

    if do_all or "automations" in sections_req:
        try:
            dom_a: list = []
            if model_filter:
                dom_a.append(["model_id.model", "ilike", model_filter])
            automations = await loop.run_in_executor(None, lambda: odoo.search_read(
                "base.automation", dom_a,
                ["name", "model_id", "trigger", "active"],
                limit=200,
            ))
            result["automated_actions"] = {"count": len(automations), "items": automations}
        except Exception:
            result["automated_actions"] = {"count": 0, "note": "Module d'automatisation non disponible sur cette instance"}

    if do_all or "rules" in sections_req:
        try:
            access_ids = await _xids("ir.model.access")
            accesses = []
            if access_ids:
                accesses = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.model.access", [["id", "in", access_ids]],
                    ["name", "model_id", "group_id", "perm_read", "perm_write", "perm_create", "perm_unlink"],
                    limit=200,
                ))
            result["studio_access_rules"] = {"count": len(accesses), "items": accesses}
        except Exception as exc:
            result["studio_access_rules"] = {"count": 0, "error": str(exc)}

        try:
            rule_ids = await _xids("ir.rule")
            rules = []
            if rule_ids:
                rules = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.rule", [["id", "in", rule_ids]],
                    ["name", "model_id", "global", "groups", "domain_force"],
                    limit=200,
                ))
            result["studio_record_rules"] = {"count": len(rules), "items": rules}
        except Exception as exc:
            result["studio_record_rules"] = {"count": 0, "error": str(exc)}

    return result
