"""inspect_security handler — read ACL + record rules for a model."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    model = (args.get("model") or "").strip()
    if not model:
        return {"ok": False, "error": "Paramètre model obligatoire"}
    models = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.model", [["model", "=", model]], ["name", "model", "transient"], limit=1
    ))
    if not models:
        return {"ok": False, "error": f"Modèle introuvable dans ir.model : {model}"}
    model_id = models[0]["id"]
    acl = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.model.access",
        [["model_id", "=", model_id]],
        ["name", "group_id", "perm_read", "perm_write", "perm_create", "perm_unlink", "active"],
        limit=200,
        order="name asc",
    ))
    rules = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.search_read(
        "ir.rule",
        [["model_id", "=", model_id]],
        ["name", "domain_force", "groups", "perm_read", "perm_write", "perm_create", "perm_unlink", "active", "global"],
        limit=200,
        order="name asc",
    ))
    return {"ok": True, "model": models[0], "access_controls": acl, "record_rules": rules}
