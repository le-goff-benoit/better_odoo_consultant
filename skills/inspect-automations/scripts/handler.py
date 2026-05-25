"""inspect_automations handler — unified read-only audit of server automations."""

from __future__ import annotations

from typing import Any

REQUIRES_ODOO = True

_CONFIG = {
    "cron": {
        "model": "ir.cron",
        "fields": ["id", "name", "active", "model_id", "state", "code", "interval_number", "interval_type", "nextcall"],
    },
    "automation": {
        "model": "base.automation",
        "fields": ["id", "name", "active", "model_id", "trigger", "state", "code", "filter_domain"],
    },
    "server_action": {
        "model": "ir.actions.server",
        "fields": ["id", "name", "active", "model_id", "state", "code", "usage"],
    },
    "mail_template": {
        "model": "mail.template",
        "fields": ["id", "name", "active", "model_id", "subject", "email_from", "email_to", "body_html"],
    },
}


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    from backend.services.odoo_pagination import search_read_bounded

    kind = str(args.get("kind") or "all")
    kinds = list(_CONFIG) if kind == "all" else [kind]
    if any(item not in _CONFIG for item in kinds):
        return {"ok": False, "error": f"kind invalide : {kind}"}

    module_filter = str(args.get("module") or "").strip()
    model_filter = str(args.get("model") or "").strip()
    active_only = bool(args.get("active_only", True))

    sections: dict[str, Any] = {}
    for item in kinds:
        config = _CONFIG[item]
        domain: list[Any] = []
        if active_only:
            domain.append(["active", "=", True])
        if model_filter:
            domain.append(["model_id.model", "=", model_filter])
        try:
            records, meta = await search_read_bounded(
                ctx.loop,
                ctx.odoo,
                config["model"],
                domain,
                config["fields"],
                limit=0,
                page_size=500,
                max_records=5000,
                label=item,
            )
        except Exception as exc:
            sections[item] = {"ok": False, "error": str(exc), "records": []}
            continue
        records = [_compact_record(record, item) for record in records]
        if module_filter:
            records = await _filter_origin_module(ctx, config["model"], records, module_filter)
        else:
            records = await _attach_origin_modules(ctx, config["model"], records)
        sections[item] = {"ok": True, **meta, "records": records}

    return {
        "ok": True,
        "kind": kind,
        "active_only": active_only,
        "module": module_filter or None,
        "model": model_filter or None,
        "sections": sections,
        "summary": {name: len(section.get("records") or []) for name, section in sections.items()},
    }


def _compact_record(record: dict[str, Any], kind: str) -> dict[str, Any]:
    out = dict(record)
    for field in ("code", "body_html"):
        value = out.get(field)
        if isinstance(value, str) and len(value) > 4000:
            out[field] = value[:4000] + "\n... [tronqué]"
    out["kind"] = kind
    return out


async def _attach_origin_modules(ctx, model: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not records:
        return records
    origins = await _origin_modules(ctx, model, [record["id"] for record in records])
    for record in records:
        record["origin_module"] = origins.get(record["id"])
    return records


async def _filter_origin_module(ctx, model: str, records: list[dict[str, Any]], module: str) -> list[dict[str, Any]]:
    records = await _attach_origin_modules(ctx, model, records)
    return [record for record in records if record.get("origin_module") == module]


async def _origin_modules(ctx, model: str, ids: list[int]) -> dict[int, str]:
    from backend.services.odoo_pagination import search_read_bounded

    records, _meta = await search_read_bounded(
        ctx.loop,
        ctx.odoo,
        "ir.model.data",
        [["model", "=", model], ["res_id", "in", ids]],
        ["module", "res_id"],
        limit=0,
        page_size=500,
        max_records=max(5000, len(ids)),
        label="XML IDs",
    )
    return {int(row["res_id"]): str(row["module"]) for row in records if row.get("res_id") and row.get("module")}
