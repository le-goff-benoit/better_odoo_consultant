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

    try:
        max_fields = max(50, min(int(args.get("max_fields") or 150), 1000))
    except (TypeError, ValueError):
        max_fields = 150

    # Condensed index — prioritize custom (x_*) and relational fields.
    def _priority(item):
        fname, v = item
        t = v.get("type") or ""
        is_custom = fname.startswith("x_")
        is_rel = t in ("many2one", "one2many", "many2many")
        return (0 if is_custom else (1 if is_rel else 2), fname)
    ordered = sorted(raw.items(), key=_priority)
    condensed = {}
    for fname, v in ordered[:max_fields]:
        entry = {"label": v.get("string"), "type": v.get("type")}
        rel = v.get("relation")
        if rel:
            entry["relation"] = rel
        rel_f = v.get("relation_field")
        if rel_f:
            entry["relation_field"] = rel_f
        condensed[fname] = entry
    truncated = len(raw) > len(condensed)
    return {"ok": True, "model": args["model"],
            "total_fields": len(raw), "fields": condensed,
            "returned_fields": len(condensed),
            "max_fields": max_fields,
            "truncated": truncated,
            "warning": (f"Index champs condensé : {len(condensed)} champs retournés sur {len(raw)}. "
                        "Relance avec field_names=[...] pour le détail complet ou augmente max_fields.")
                       if truncated else None,
            "note": ("Custom + relations sont priorisés dans l'index condensé. "
                     "Rappelle get_odoo_fields avec field_names=[...] pour le détail complet.")
                    if truncated else None}
