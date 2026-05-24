"""get_odoo_fields handler — list model fields, prioritising custom + relational."""
from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    attrs = ["string", "type", "relation", "relation_field",
             "required", "store", "help"]
    raw = await ctx.loop.run_in_executor(None, lambda: ctx.odoo.fields_get(
        args["model"], attrs
    ))
    wanted = [str(n).strip() for n in (args.get("field_names") or []) if str(n).strip()]
    if wanted:
        detail = {}
        missing = []
        for fname in wanted:
            if fname in raw:
                v = raw[fname]
                entry = {"label": v.get("string"), "type": v.get("type")}
                for k in ("relation", "relation_field", "required", "store", "help"):
                    val = v.get(k)
                    if val not in (None, "", False):
                        entry[k] = val
                detail[fname] = entry
            else:
                missing.append(fname)
        return {"ok": True, "model": args["model"], "fields": detail,
                **({"missing": missing} if missing else {})}

    # Condensed index — prioritize custom (x_*) and relational fields, cap to 150.
    def _priority(item):
        fname, v = item
        t = v.get("type") or ""
        is_custom = fname.startswith("x_")
        is_rel = t in ("many2one", "one2many", "many2many")
        return (0 if is_custom else (1 if is_rel else 2), fname)
    ordered = sorted(raw.items(), key=_priority)
    condensed = {}
    for fname, v in ordered[:150]:
        entry = {"label": v.get("string"), "type": v.get("type")}
        rel = v.get("relation")
        if rel:
            entry["relation"] = rel
        rel_f = v.get("relation_field")
        if rel_f:
            entry["relation_field"] = rel_f
        condensed[fname] = entry
    return {"ok": True, "model": args["model"],
            "total_fields": len(raw), "fields": condensed,
            "note": ("Index condensé (max 150, custom + relations en tête). "
                     "Rappelle get_odoo_fields avec field_names=[...] pour le détail complet.")
                    if len(raw) > 150 else None}
