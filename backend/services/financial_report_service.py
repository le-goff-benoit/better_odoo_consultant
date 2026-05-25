"""Read-only helpers for Odoo Enterprise financial reports."""

from __future__ import annotations

import base64
import re
from typing import Any

from .odoo_pagination import bounded_int, search_read_bounded

_REPORT_FIELDS = [
    "id", "name", "country_id", "root_report_id", "availability_condition",
    "filter_date_range", "filter_unfold_all", "filter_partner", "filter_journals",
    "filter_analytic", "filter_multi_company", "filter_show_draft",
]
_LINE_FIELDS = ["id", "name", "code", "parent_id", "sequence", "hierarchy_level", "foldable", "groupby", "expression_ids"]
_COLUMN_FIELDS = ["id", "name", "expression_label", "figure_type", "sortable", "blank_if_zero"]
_EXPRESSION_FIELDS = ["id", "label", "engine", "formula", "subformula", "line_id"]
_KEYWORDS = {
    "bilan": ("balance", "balance sheet", "actif", "passif", "assets", "liabilities"),
    "résultat": ("profit", "loss", "p&l", "income", "compte de résultat", "compte de resultat"),
    "tva": ("tax", "vat", "déclaration", "declaration"),
    "grand livre": ("general ledger", "ledger", "gl", "journal"),
    "analytique": ("analytic", "project", "projet"),
    "client": ("aged receivable", "partner", "receivable", "customer"),
    "fournisseur": ("aged payable", "vendor", "payable", "supplier"),
}


async def dispatch_financial_report_action(ctx, args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("action") or "list")
    if action == "list":
        return await list_financial_reports(ctx)
    if action == "recommend":
        return await recommend_financial_report(ctx, str(args.get("query") or ""))
    if action == "describe":
        report_id = await resolve_report(ctx, args.get("report"))
        if report_id is None:
            return {"ok": False, "error": "Rapport financier introuvable"}
        return await describe_financial_report(ctx, report_id)
    if action == "run":
        report_id = await resolve_report(ctx, args.get("report"))
        if report_id is None:
            return {"ok": False, "error": "Rapport financier introuvable"}
        return await run_financial_report(ctx, report_id, args.get("options") or {})
    if action == "export":
        report_id = await resolve_report(ctx, args.get("report"))
        if report_id is None:
            return {"ok": False, "error": "Rapport financier introuvable"}
        return await export_financial_report(ctx, report_id, args.get("options") or {})
    return {"ok": False, "error": f"Action non supportée : {action}"}


async def list_financial_reports(ctx) -> dict[str, Any]:
    try:
        reports, meta = await search_read_bounded(
            ctx.loop,
            ctx.odoo,
            "account.report",
            [],
            _REPORT_FIELDS,
            limit=0,
            page_size=500,
            max_records=5000,
            label="Rapports financiers",
        )
    except Exception as exc:
        return {"ok": False, "error": f"Impossible de lire account.report : {exc}"}
    normalized = [_normalize_report(report) for report in reports]
    return {"ok": True, **meta, "reports": normalized, "grouped": _group_reports(normalized)}


async def recommend_financial_report(ctx, query: str) -> dict[str, Any]:
    listing = await list_financial_reports(ctx)
    if not listing.get("ok"):
        return listing
    terms = _terms(query)
    recommendations: list[dict[str, Any]] = []
    for report in listing["reports"]:
        haystack = " ".join(str(report.get(key) or "") for key in ("name", "country", "root_report"))
        score = _score_report(terms, haystack)
        if score <= 0:
            continue
        recommendations.append({
            "report": report,
            "score": score,
            "why": _why(terms, haystack),
        })
    recommendations.sort(key=lambda item: (-item["score"], item["report"]["name"]))
    return {"ok": True, "query": query, "recommendations": recommendations[:3]}


async def describe_financial_report(ctx, report_id: int) -> dict[str, Any]:
    report = await _read_one(ctx, "account.report", report_id, _REPORT_FIELDS)
    if not report:
        return {"ok": False, "error": f"Rapport financier introuvable : {report_id}"}
    lines, line_meta = await search_read_bounded(ctx.loop, ctx.odoo, "account.report.line", [["report_id", "=", report_id]], _LINE_FIELDS, limit=0, max_records=5000, label="Lignes rapport")
    columns, col_meta = await search_read_bounded(ctx.loop, ctx.odoo, "account.report.column", [["report_id", "=", report_id]], _COLUMN_FIELDS, limit=0, max_records=1000, label="Colonnes rapport")
    line_ids = [line["id"] for line in lines]
    expressions: list[dict[str, Any]] = []
    expr_meta: dict[str, Any] = {"count": 0, "truncated": False}
    if line_ids:
        expressions, expr_meta = await search_read_bounded(ctx.loop, ctx.odoo, "account.report.expression", [["line_id", "in", line_ids]], _EXPRESSION_FIELDS, limit=0, max_records=5000, label="Expressions rapport")
    return {
        "ok": True,
        "report": _normalize_report(report),
        "lines": lines,
        "columns": columns,
        "expressions": expressions,
        "filters": _filters(report),
        "meta": {"lines": line_meta, "columns": col_meta, "expressions": expr_meta},
    }


async def run_financial_report(ctx, report_id: int, options: dict[str, Any]) -> dict[str, Any]:
    report = await _read_one(ctx, "account.report", report_id, ["id", "name"])
    normalized_options = _build_options(options)
    max_lines = bounded_int(options.get("max_lines"), 500, minimum=1, maximum=2000)
    try:
        lines = await ctx.loop.run_in_executor(
            None,
            lambda: ctx.odoo.call("account.report", "_get_lines", [[report_id], normalized_options], {}),
        )
    except Exception as exc:
        return {
            "ok": False,
            "error": f"Impossible d'exécuter account.report._get_lines via XML-RPC : {exc}",
            "report": report,
            "options_used": normalized_options,
        }
    lines = lines or []
    truncated = len(lines) > max_lines
    returned = lines[:max_lines]
    return {
        "ok": True,
        "report": report,
        "options_used": normalized_options,
        "count": len(returned),
        "total_count": len(lines),
        "truncated": truncated,
        "warning": f"Rapport tronqué à {max_lines} lignes sur {len(lines)}." if truncated else None,
        "lines": returned,
        "totals": _extract_totals(returned),
    }


async def export_financial_report(ctx, report_id: int, options: dict[str, Any]) -> dict[str, Any]:
    normalized_options = _build_options(options)
    try:
        payload = await ctx.loop.run_in_executor(
            None,
            lambda: ctx.odoo.call("account.report", "export_to_xlsx", [[report_id], normalized_options], {}),
        )
    except Exception as exc:
        return {"ok": False, "error": f"Export XLSX impossible via XML-RPC : {exc}", "options_used": normalized_options}
    content = _extract_export_content(payload)
    if content is None:
        return {"ok": False, "error": "Réponse export_to_xlsx non reconnue", "raw_type": type(payload).__name__}
    size = len(content)
    max_bytes = 5 * 1024 * 1024
    if size > max_bytes:
        return {"ok": True, "filename": _export_filename(payload, report_id), "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "size": size, "content_b64": None, "truncated": True, "warning": "Export supérieur à 5 MB : lancez l'export manuel dans Odoo."}
    return {"ok": True, "filename": _export_filename(payload, report_id), "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "size": size, "content_b64": base64.b64encode(content).decode("ascii"), "truncated": False}


async def resolve_report(ctx, value: Any) -> int | None:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    query = str(value or "").strip()
    if not query:
        return None
    reports, _meta = await search_read_bounded(ctx.loop, ctx.odoo, "account.report", [["name", "ilike", query]], ["id", "name"], limit=1, max_records=1, label="Rapport financier")
    return int(reports[0]["id"]) if reports else None


async def _read_one(ctx, model: str, record_id: int, fields: list[str]) -> dict[str, Any] | None:
    records, _meta = await search_read_bounded(ctx.loop, ctx.odoo, model, [["id", "=", record_id]], fields, limit=1, max_records=1, label=model)
    return records[0] if records else None


def _normalize_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": report.get("id"),
        "name": report.get("name"),
        "country": _m2o_name(report.get("country_id")),
        "root_report": _m2o_name(report.get("root_report_id")),
        "filters_enabled": _filters(report),
        "availability_condition": report.get("availability_condition"),
    }


def _filters(report: dict[str, Any]) -> dict[str, Any]:
    return {key: report.get(key) for key in report if key.startswith("filter_") and report.get(key) not in (False, None, "")}


def _group_reports(reports: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for report in reports:
        key = report.get("country") or report.get("root_report") or "Global"
        grouped.setdefault(str(key), []).append(report)
    return grouped


def _terms(query: str) -> set[str]:
    normalized = query.casefold()
    tokens = set(re.findall(r"[\w&.-]+", normalized))
    for key, aliases in _KEYWORDS.items():
        if key in normalized or any(alias in normalized for alias in aliases):
            tokens.add(key)
            tokens.update(aliases)
    return tokens


def _score_report(terms: set[str], haystack: str) -> int:
    text = haystack.casefold()
    return sum(3 if " " in term else 1 for term in terms if term and term in text)


def _why(terms: set[str], haystack: str) -> list[str]:
    text = haystack.casefold()
    return sorted(term for term in terms if term and term in text)[:8]


def _m2o_name(value: Any) -> str | None:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return str(value[1])
    return None


def _build_options(options: dict[str, Any]) -> dict[str, Any]:
    opts = {
        "date": {
            "date_from": options.get("date_from"),
            "date_to": options.get("date_to"),
            "mode": "range",
        },
        "unfold_all": bool(options.get("unfold_all", False)),
    }
    for key in ("partner_ids", "analytic_account_ids", "company_ids", "journal_ids"):
        if options.get(key):
            opts[key] = [int(value) for value in options.get(key) or []]
    if options.get("comparison"):
        opts["comparison"] = {"filter": options["comparison"]}
    return opts


def _extract_totals(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals = []
    for line in lines:
        name = str(line.get("name") or "")
        if line.get("level") == 0 or "total" in name.casefold():
            totals.append(line)
    return totals[:20]


def _extract_export_content(payload: Any) -> bytes | None:
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, str):
        try:
            return base64.b64decode(payload)
        except Exception:
            return payload.encode("utf-8")
    if isinstance(payload, dict):
        for key in ("content", "file_content", "data"):
            value = payload.get(key)
            if isinstance(value, bytes):
                return value
            if isinstance(value, str):
                try:
                    return base64.b64decode(value)
                except Exception:
                    return value.encode("utf-8")
    return None


def _export_filename(payload: Any, report_id: int) -> str:
    if isinstance(payload, dict):
        for key in ("filename", "file_name", "name"):
            if payload.get(key):
                return str(payload[key])
    return f"account_report_{report_id}.xlsx"
