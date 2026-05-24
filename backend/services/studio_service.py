import asyncio
from typing import Any, Optional

from .odoo_pagination import search_read_bounded


def _merge_xid_truncation(meta: dict[str, Any], xid_meta: dict[str, Any]) -> dict[str, Any]:
    if not xid_meta.get("truncated"):
        return meta
    merged = dict(meta)
    merged["truncated"] = True
    merged["total_count"] = max(int(merged.get("total_count") or 0), int(xid_meta.get("total_count") or 0))
    merged["warning"] = (
        "Inventaire Studio borné pendant la lecture des identifiants XML : "
        f"{xid_meta.get('count')} identifiants lus sur {xid_meta.get('total_count')}. "
        "Affinez le filtre ou augmentez le plafond pour garantir l'exhaustivité."
    )
    return merged


async def inspect_studio_customizations(odoo, sections: Optional[list[str]] = None, model_filter: str = "") -> dict:
    """Query the connected Odoo instance for Odoo Studio customizations."""
    sections_req = [s.lower() for s in (sections or ["all"])]
    do_all = "all" in sections_req
    loop = asyncio.get_event_loop()
    result: dict = {"ok": True}

    async def _xids(model_name: str) -> tuple[list[int], dict[str, Any]]:
        xids, meta = await search_read_bounded(
            loop,
            odoo,
            "ir.model.data",
            [["module", "=", "studio_customization"], ["model", "=", model_name]],
            ["res_id"],
            label="Inventaire Studio",
        )
        return [x["res_id"] for x in xids if x.get("res_id")], meta

    if do_all or "models" in sections_req:
        try:
            # state="manual" matches ANY hand-created model (incl. technical UI
            # without Studio). Restrict to studio_customization xmlids so this
            # stays a Studio-specific signal, like views/menus below.
            model_ids, xid_meta = await _xids("ir.model")
            models = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if model_ids:
                domain: list = [["id", "in", model_ids]]
                if model_filter:
                    domain.append(["model", "ilike", model_filter])
                models, meta = await search_read_bounded(
                    loop, odoo, "ir.model", domain,
                    ["name", "model", "transient", "info"],
                    label="Modèles Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["custom_models"] = {**meta, "items": models}
        except Exception as exc:
            result["custom_models"] = {"count": 0, "error": str(exc)}

    if do_all or "fields" in sections_req:
        try:
            field_ids, xid_meta = await _xids("ir.model.fields")
            fields = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if field_ids:
                domain_f: list = [["id", "in", field_ids]]
                if model_filter:
                    domain_f.append(["model", "ilike", model_filter])
                fields, meta = await search_read_bounded(
                    loop, odoo, "ir.model.fields", domain_f,
                    ["name", "field_description", "ttype", "model_id", "required",
                     "store", "index", "compute", "related", "selection"],
                    label="Champs Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
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
            result["custom_fields"] = {**meta, "by_model": by_model}
        except Exception as exc:
            result["custom_fields"] = {"count": 0, "error": str(exc)}

    if do_all or "views" in sections_req:
        try:
            view_ids, xid_meta = await _xids("ir.ui.view")
            views = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if view_ids:
                dom_v: list = [["id", "in", view_ids]]
                if model_filter:
                    dom_v.append(["model", "ilike", model_filter])
                views, meta = await search_read_bounded(
                    loop, odoo, "ir.ui.view", dom_v,
                    ["name", "model", "type", "key", "priority", "active"],
                    label="Vues Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["studio_views"] = {**meta, "items": views}
        except Exception as exc:
            result["studio_views"] = {"count": 0, "error": str(exc)}

    if do_all or "menus" in sections_req:
        try:
            menu_ids, xid_meta = await _xids("ir.ui.menu")
            menus = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if menu_ids:
                menus, meta = await search_read_bounded(
                    loop, odoo, "ir.ui.menu", [["id", "in", menu_ids]],
                    ["name", "complete_name", "active", "sequence"],
                    label="Menus Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["studio_menus"] = {**meta, "items": menus}
        except Exception as exc:
            result["studio_menus"] = {"count": 0, "error": str(exc)}

    if do_all or "server_actions" in sections_req:
        try:
            sa_ids, xid_meta = await _xids("ir.actions.server")
            actions = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if sa_ids:
                actions, meta = await search_read_bounded(
                    loop, odoo, "ir.actions.server", [["id", "in", sa_ids]],
                    ["name", "model_id", "state", "binding_model_id", "binding_type"],
                    label="Actions serveur Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["studio_server_actions"] = {**meta, "items": actions}
        except Exception as exc:
            result["studio_server_actions"] = {"count": 0, "error": str(exc)}

    if do_all or "cron" in sections_req:
        try:
            cron_ids, xid_meta = await _xids("ir.cron")
            if cron_ids:
                crons, meta = await search_read_bounded(
                    loop, odoo, "ir.cron", [["id", "in", cron_ids]],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    label="Actions planifiées",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            else:
                crons, meta = await search_read_bounded(
                    loop, odoo, "ir.cron", [],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    label="Actions planifiées",
                )
                if xid_meta.get("truncated"):
                    meta["warning"] = xid_meta.get("warning")
            result["cron_actions"] = {**meta, "items": crons}
        except Exception as exc:
            result["cron_actions"] = {"count": 0, "error": str(exc)}

    if do_all or "automations" in sections_req:
        try:
            dom_a: list = []
            if model_filter:
                dom_a.append(["model_id.model", "ilike", model_filter])
            automations, meta = await search_read_bounded(
                loop, odoo, "base.automation", dom_a,
                ["name", "model_id", "trigger", "active"],
                label="Automatisations",
            )
            result["automated_actions"] = {**meta, "items": automations}
        except Exception:
            result["automated_actions"] = {"count": 0, "note": "Module d'automatisation non disponible sur cette instance"}

    if do_all or "rules" in sections_req:
        try:
            access_ids, xid_meta = await _xids("ir.model.access")
            accesses = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if access_ids:
                accesses, meta = await search_read_bounded(
                    loop, odoo, "ir.model.access", [["id", "in", access_ids]],
                    ["name", "model_id", "group_id", "perm_read", "perm_write", "perm_create", "perm_unlink"],
                    label="ACL Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["studio_access_rules"] = {**meta, "items": accesses}
        except Exception as exc:
            result["studio_access_rules"] = {"count": 0, "error": str(exc)}

        try:
            rule_ids, xid_meta = await _xids("ir.rule")
            rules = []
            meta = {**xid_meta, "count": 0, "total_count": 0}
            if rule_ids:
                rules, meta = await search_read_bounded(
                    loop, odoo, "ir.rule", [["id", "in", rule_ids]],
                    ["name", "model_id", "global", "groups", "domain_force"],
                    label="Record rules Studio",
                )
                meta = _merge_xid_truncation(meta, xid_meta)
            result["studio_record_rules"] = {**meta, "items": rules}
        except Exception as exc:
            result["studio_record_rules"] = {"count": 0, "error": str(exc)}

    return result
