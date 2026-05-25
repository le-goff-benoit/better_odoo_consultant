"""Read-only helpers for Odoo Spreadsheet documents and dashboards."""

from __future__ import annotations

import base64
import json
import re
import zipfile
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

from .odoo_pagination import bounded_int, search_read_bounded

_FORMULA_RE = re.compile(r"=\s*(ODOO\.[A-Z0-9_.]+)\s*\(", re.IGNORECASE | re.MULTILINE)
_CELL_RE = re.compile(r"^[A-Z]+[0-9]+$")
_DEFAULT_CATALOG = {
    "ODOO.PIVOT": {
        "name": "ODOO.PIVOT",
        "description": "Récupère une mesure ou un libellé depuis une source pivot Odoo Spreadsheet.",
        "args": ["pivot_id", "measure", "domain/filter values"],
        "example": '=ODOO.PIVOT("1","amount_total","stage_id","Won")',
    },
    "ODOO.LIST": {
        "name": "ODOO.LIST",
        "description": "Récupère une valeur depuis une liste Odoo synchronisée dans le spreadsheet.",
        "args": ["list_id", "field_name", "row_index"],
        "example": '=ODOO.LIST("1","name",1)',
    },
    "ODOO.FILTER.VALUE": {
        "name": "ODOO.FILTER.VALUE",
        "description": "Lit la valeur courante d'un filtre global Odoo Spreadsheet.",
        "args": ["filter_name"],
        "example": '=ODOO.FILTER.VALUE("Date")',
    },
}


async def dispatch_spreadsheet_action(ctx, args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("action") or "list")
    if action == "list":
        return await list_spreadsheets(ctx)
    if action == "inspect":
        return await inspect_spreadsheet(ctx, int(args.get("document_id") or 0), str(args.get("model") or "documents.document"))
    if action == "explain_formula":
        return explain_formula(str(args.get("formula") or ""), ctx.source_path)
    if action == "suggest_formula":
        return suggest_formula(str(args.get("query") or ""), str(args.get("model_hint") or ""), ctx.source_path)
    return {"ok": False, "error": f"Action non supportée : {action}"}


async def list_spreadsheets(ctx) -> dict[str, Any]:
    documents: list[dict[str, Any]] = []
    dashboards: list[dict[str, Any]] = []
    errors: list[str] = []
    try:
        documents, doc_meta = await search_read_bounded(
            ctx.loop,
            ctx.odoo,
            "documents.document",
            [["handler", "=", "spreadsheet"]],
            ["id", "name", "folder_id", "owner_id", "attachment_id", "handler"],
            limit=0,
            max_records=5000,
            label="Spreadsheets",
        )
    except Exception as exc:
        doc_meta = {"count": 0, "truncated": False}
        errors.append(f"documents.document indisponible ou non lisible : {exc}")
    try:
        dashboards, dash_meta = await search_read_bounded(
            ctx.loop,
            ctx.odoo,
            "spreadsheet.dashboard",
            [],
            ["id", "name"],
            limit=0,
            max_records=1000,
            label="Dashboards spreadsheet",
        )
    except Exception as exc:
        dash_meta = {"count": 0, "truncated": False}
        errors.append(f"spreadsheet.dashboard indisponible ou non lisible : {exc}")

    items = [
        {"id": row.get("id"), "name": row.get("name"), "kind": "document", "folder": _m2o_name(row.get("folder_id")), "owner": _m2o_name(row.get("owner_id")), "attachment_id": _m2o_id(row.get("attachment_id"))}
        for row in documents
    ] + [
        {"id": row.get("id"), "name": row.get("name"), "kind": "dashboard"}
        for row in dashboards
    ]
    return {"ok": True, "items": items, "count": len(items), "meta": {"documents": doc_meta, "dashboards": dash_meta}, "errors": errors}


async def inspect_spreadsheet(ctx, document_id: int, model: str = "documents.document") -> dict[str, Any]:
    if not document_id:
        return {"ok": False, "error": "document_id manquant"}
    payload: bytes | None = None
    record: dict[str, Any] | None = None
    if model == "spreadsheet.dashboard":
        records, _meta = await search_read_bounded(ctx.loop, ctx.odoo, model, [["id", "=", document_id]], ["id", "name", "spreadsheet_data"], limit=1, max_records=1, label="Dashboard spreadsheet")
        record = records[0] if records else None
        data = record.get("spreadsheet_data") if record else None
        payload = data.encode("utf-8") if isinstance(data, str) else None
    else:
        records, _meta = await search_read_bounded(ctx.loop, ctx.odoo, "documents.document", [["id", "=", document_id]], ["id", "name", "attachment_id"], limit=1, max_records=1, label="Spreadsheet")
        record = records[0] if records else None
        attachment_id = _m2o_id(record.get("attachment_id")) if record else None
        if attachment_id:
            payload = await _read_attachment(ctx, attachment_id)
    if not record:
        return {"ok": False, "error": f"Spreadsheet introuvable : {document_id}"}
    if payload is None:
        return {"ok": False, "error": "Payload spreadsheet introuvable ou illisible", "record": record}
    parsed = _parse_spreadsheet_payload(payload)
    inventory = _formula_inventory(parsed["sheets"])
    return {"ok": True, "record": record, **parsed, "formula_summary": inventory}


def explain_formula(formula: str, source_path: str | None) -> dict[str, Any]:
    name = _formula_name(formula)
    if not name:
        return {"ok": False, "error": "Formule ODOO.* introuvable dans l'argument"}
    catalog = load_odoo_spreadsheet_formula_catalog(source_path)
    match = catalog.get(name.upper())
    if match:
        return {"ok": True, "formula": formula, "name": name.upper(), **match}
    candidates = [entry for key, entry in catalog.items() if name.upper() in key or key in name.upper()]
    return {"ok": bool(candidates), "formula": formula, "name": name.upper(), "match": candidates[:3], "error": None if candidates else "Formule absente du catalogue local"}


def suggest_formula(query: str, model_hint: str, source_path: str | None) -> dict[str, Any]:
    text = f"{query} {model_hint}".casefold()
    catalog = load_odoo_spreadsheet_formula_catalog(source_path)
    suggestions: list[dict[str, Any]] = []
    if any(term in text for term in ("pivot", "agrég", "agreg", "total", "kpi", "par client", "par mois", "revenue", "ca")):
        suggestions.append(_suggest("ODOO.PIVOT", catalog, "Agrégation ou KPI depuis une source pivot."))
    if any(term in text for term in ("liste", "list", "ligne", "rows", "records", "détail", "detail")):
        suggestions.append(_suggest("ODOO.LIST", catalog, "Lecture de lignes synchronisées depuis une liste Odoo."))
    if any(term in text for term in ("filtre", "filter", "période", "periode", "date", "global")):
        suggestions.append(_suggest("ODOO.FILTER.VALUE", catalog, "Réutilisation d'un filtre global dans une formule."))
    if not suggestions:
        suggestions = [_suggest("ODOO.PIVOT", catalog, "Suggestion par défaut pour un indicateur Odoo."), _suggest("ODOO.LIST", catalog, "Alternative si le besoin porte sur des lignes détaillées.")]
    return {"ok": True, "query": query, "model_hint": model_hint or None, "suggestions": suggestions[:3]}


async def _read_attachment(ctx, attachment_id: int) -> bytes | None:
    records, _meta = await search_read_bounded(ctx.loop, ctx.odoo, "ir.attachment", [["id", "=", attachment_id]], ["id", "name", "raw", "datas"], limit=1, max_records=1, label="Pièce jointe spreadsheet")
    if not records:
        return None
    record = records[0]
    value = record.get("raw") or record.get("datas")
    if isinstance(value, bytes):
        return value
    if isinstance(value, str):
        try:
            return base64.b64decode(value)
        except Exception:
            return value.encode("utf-8")
    return None


def _parse_spreadsheet_payload(payload: bytes) -> dict[str, Any]:
    data: Any = None
    version = "unknown"
    try:
        data = json.loads(payload.decode("utf-8"))
        version = "json"
    except Exception:
        data = _parse_xlsx(payload)
        version = "xlsx"
    sheets = _extract_sheets(data)
    returned_cells = 0
    truncated = False
    for sheet in sheets:
        cells = sheet["cells"]
        if returned_cells + len(cells) > 2000:
            keep = max(0, 2000 - returned_cells)
            sheet["cells"] = cells[:keep]
            truncated = True
        returned_cells += len(sheet["cells"])
    return {"version": version, "sheets": sheets, "cell_count": returned_cells, "truncated": truncated}


def _extract_sheets(data: Any) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    sheets_raw = data.get("sheets") or data.get("sheetsData") or []
    if isinstance(sheets_raw, dict):
        sheets_iter = sheets_raw.values()
    else:
        sheets_iter = sheets_raw
    sheets = []
    for idx, sheet in enumerate(sheets_iter):
        if not isinstance(sheet, dict):
            continue
        name = sheet.get("name") or sheet.get("id") or f"Sheet {idx + 1}"
        cells = _extract_cells(sheet)
        formulas = [cell for cell in cells if isinstance(cell.get("content"), str) and _FORMULA_RE.search(cell["content"])]
        sheets.append({"name": name, "cells": cells, "formulas": formulas})
    return sheets


def _extract_cells(sheet: dict[str, Any]) -> list[dict[str, Any]]:
    cells_raw = sheet.get("cells") or sheet.get("data") or {}
    cells: list[dict[str, Any]] = []
    if isinstance(cells_raw, dict):
        for key, value in cells_raw.items():
            if isinstance(value, dict) and _CELL_RE.match(str(key)):
                content = value.get("content") or value.get("value")
                if content not in (None, ""):
                    cells.append({"cell": key, "content": content})
            elif isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    if isinstance(sub_value, dict):
                        content = sub_value.get("content") or sub_value.get("value")
                        if content not in (None, ""):
                            cells.append({"cell": f"{key}:{sub_key}", "content": content})
    return cells


def _parse_xlsx(payload: bytes) -> dict[str, Any]:
    sheets = []
    try:
        with zipfile.ZipFile(BytesIO(payload)) as zf:
            for name in zf.namelist():
                if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                    text = zf.read(name).decode("utf-8", errors="replace")
                    cells = [{"cell": match.group(1), "content": match.group(2)} for match in re.finditer(r'<c[^>]* r="([^"]+)"[^>]*>.*?<f[^>]*>(.*?)</f>', text, re.DOTALL)]
                    sheets.append({"name": Path(name).stem, "cells": cells, "formulas": [cell for cell in cells if "ODOO." in str(cell.get("content", "")).upper()]})
    except Exception:
        return {"sheets": []}
    return {"sheets": sheets}


def _formula_inventory(sheets: list[dict[str, Any]]) -> dict[str, list[dict[str, str]]]:
    out: dict[str, list[dict[str, str]]] = {}
    for sheet in sheets:
        for cell in sheet.get("formulas") or []:
            raw = str(cell.get("content") or "")
            match = _FORMULA_RE.search(raw)
            if not match:
                continue
            out.setdefault(match.group(1).upper(), []).append({"sheet": str(sheet["name"]), "cell": str(cell.get("cell")), "raw": raw[:500]})
    return out


@lru_cache(maxsize=8)
def load_odoo_spreadsheet_formula_catalog(source_path: str | None) -> dict[str, dict[str, Any]]:
    catalog = dict(_DEFAULT_CATALOG)
    if not source_path:
        return catalog
    roots = [Path(source_path)]
    enterprise = Path(str(source_path) + "-enterprise")
    if enterprise.exists():
        roots.append(enterprise)
    pattern = re.compile(r'name\s*:\s*["\'](ODOO\.[A-Z0-9_.]+)["\']')
    for root in roots:
        for path in root.glob("**/spreadsheet*/static/src/**/*.js"):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for match in pattern.finditer(text):
                name = match.group(1).upper()
                catalog.setdefault(name, {"name": name, "description": "Formule Odoo Spreadsheet détectée dans les sources locales.", "source": str(path.relative_to(root))})
    return catalog


def _formula_name(formula: str) -> str | None:
    match = _FORMULA_RE.search(formula)
    return match.group(1) if match else None


def _suggest(name: str, catalog: dict[str, dict[str, Any]], why: str) -> dict[str, Any]:
    entry = catalog.get(name, {"name": name})
    return {"formula": name, "why": why, "sample": entry.get("example") or f'={name}("...")', "catalog": entry}


def _m2o_name(value: Any) -> str | None:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return str(value[1])
    return None


def _m2o_id(value: Any) -> int | None:
    if isinstance(value, (list, tuple)) and value:
        return int(value[0])
    if isinstance(value, int):
        return value
    return None
