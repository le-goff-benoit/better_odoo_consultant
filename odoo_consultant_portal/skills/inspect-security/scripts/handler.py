"""inspect_security handler — read ACL + record rules for a model."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from odoo_consultant_portal.services.odoo_pagination import search_read_bounded

    model = (args.get("model") or "").strip()
    if not model:
        return {"ok": False, "error": "Paramètre model obligatoire"}
    models = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.model", [["model", "=", model]], ["name", "model", "transient"], limit=1
    ))
    if not models:
        return {"ok": False, "error": f"Modèle introuvable dans ir.model : {model}"}
    model_id = models[0]["id"]
    acl, acl_meta = await search_read_bounded(
        ctx.loop,
        ctx.odoo,
        "ir.model.access",
        [["model_id", "=", model_id]],
        ["name", "group_id", "perm_read", "perm_write", "perm_create", "perm_unlink", "active"],
        order="name asc",
        label="ACL",
    )
    rules, rules_meta = await search_read_bounded(
        ctx.loop,
        ctx.odoo,
        "ir.rule",
        [["model_id", "=", model_id]],
        ["name", "domain_force", "groups", "perm_read", "perm_write", "perm_create", "perm_unlink", "active", "global"],
        order="name asc",
        label="Record rules",
    )
    return {
        "ok": True,
        "model": models[0],
        "access_controls_meta": acl_meta,
        "record_rules_meta": rules_meta,
        "truncated": bool(acl_meta.get("truncated") or rules_meta.get("truncated")),
        "warning": acl_meta.get("warning") or rules_meta.get("warning"),
        "access_controls": acl,
        "record_rules": rules,
    }
