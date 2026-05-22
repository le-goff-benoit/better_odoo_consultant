"""Before/after previews of Creator changeset operations.

A ``modify_view`` / ``modify_report`` operation is hard to judge from raw XML.
This service computes what the change actually produces — **without persisting
anything**: it applies the operation (and the ``create_field`` operations that
precede it in the same changeset) transiently via the executor (``tag=False``
so no traceability record is left), captures the result, then rolls everything
back.

Previewing the operation *in changeset context* matters: a ``modify_view`` that
adds ``x_project_type`` to a form is only valid once the ``create_field`` that
creates ``x_project_type`` has run — so the preview applies those prerequisites
first.

The same computation doubles as a validation gate: if the inherited view does
not assemble (bad xpath, missing field) or the report does not render, the
operation is reported ``valid=False`` with the reason.

- Views   → assembled arch before and after (the frontend draws a schematic
            Odoo-style wireframe and highlights what changed).
- Reports → the real PDF before and after. Odoo blocks ``_render_qweb_pdf``
            over XML-RPC, so the PDF is fetched through the ``/report/pdf`` web
            controller using a short-lived cookie session.
"""

import asyncio
import base64
import html
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any, Optional

import httpx

from .creator_executor import _Executor, OperationError
from .view_service import _assembled_view

log = logging.getLogger(__name__)

PREVIEWABLE_OPS = {"modify_view", "modify_report"}
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_SAMPLE_FIELD_LIMIT = 80


async def _run(fn):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn)


def _http_error_detail(resp: httpx.Response, max_chars: int = 1200) -> str:
    """Return a compact, readable detail from an Odoo HTTP error page."""
    text = resp.text or ""
    content_type = (resp.headers.get("content-type") or "").lower()
    if "html" in content_type:
        text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = _WS_RE.sub(" ", text).strip()
    if not text:
        text = resp.reason_phrase
    if len(text) > max_chars:
        text = text[:max_chars].rstrip() + "..."
    return f"HTTP {resp.status_code} {resp.reason_phrase}: {text}"


def _field_names_from_arch(*arches: str) -> list[str]:
    """Extract unique field names from one or more XML view architectures."""
    names: list[str] = []
    seen: set[str] = set()
    for arch in arches:
        if not arch:
            continue
        try:
            root = ET.fromstring(arch)
        except ET.ParseError:
            continue
        for field in root.iter("field"):
            name = field.attrib.get("name")
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def _sample_value(value: Any) -> Any:
    """Keep preview sample values compact and JSON-friendly."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        out = [_sample_value(v) for v in value[:8]]
        return out
    if isinstance(value, dict):
        return {str(k): _sample_value(v) for k, v in list(value.items())[:8]}
    return str(value)


async def _sample_record_for_view(odoo, model: str, arches: list[str]) -> dict:
    """Read a recent record and field metadata for a view preview.

    The preview remains read-only: it uses the active Odoo environment and
    company context, but only calls fields_get/search_read.
    """
    try:
        fields_meta = await _run(lambda: odoo.fields_get(
            model, ["string", "type", "selection", "relation"]))
    except Exception as exc:  # noqa: BLE001 - sample data is best-effort
        log.info("Aperçu vue — fields_get impossible pour %s : %s", model, exc)
        return {}

    arch_fields = [
        name for name in _field_names_from_arch(*arches)
        if name in fields_meta and not str(name).startswith("__")
    ]
    # Avoid pulling huge binary/html values into the modal. The layout still
    # gets their type from fields_meta, but their sample value stays empty.
    readable_fields = [
        name for name in arch_fields
        if (fields_meta.get(name) or {}).get("type") not in {"binary", "html"}
    ][: _SAMPLE_FIELD_LIMIT]
    read_fields = list(dict.fromkeys(["display_name", *readable_fields]))

    rows = []
    try:
        rows = await _run(lambda: odoo.search_read(
            model, [], read_fields, limit=1, order="write_date desc, id desc"))
    except Exception as exc:  # noqa: BLE001
        log.info("Aperçu vue — record sample impossible pour %s : %s", model, exc)
        try:
            rows = await _run(lambda: odoo.search_read(
                model, [], ["display_name"], limit=1, order="id desc"))
        except Exception:
            rows = []

    row = rows[0] if rows else {}
    sample_values = {
        field: _sample_value(row.get(field))
        for field in readable_fields
        if field in row
    }
    sample_id = row.get("id")
    sample_name = row.get("display_name") or (f"#{sample_id}" if sample_id else None)
    field_info = {
        name: {
            "string": meta.get("string") or name,
            "type": meta.get("type"),
            "selection": meta.get("selection") or [],
            "relation": meta.get("relation"),
        }
        for name, meta in fields_meta.items()
        if name in arch_fields
    }
    return {
        "record": {"id": sample_id, "name": sample_name} if sample_id else None,
        "field_info": field_info,
        "sample_values": sample_values,
    }


async def preview_operation(odoo, operations: list[dict], index: int,
                            version: Optional[str]) -> dict:
    """Preview ``operations[index]`` in the context of the whole changeset."""
    if index < 0 or index >= len(operations):
        return {"ok": False, "error": "Index d'opération invalide."}
    op_type = (operations[index] or {}).get("type")
    if op_type == "modify_view":
        return await preview_view_operation(odoo, operations, index, version)
    if op_type == "modify_report":
        return await preview_report_operation(odoo, operations, index, version)
    return {"ok": False,
            "error": f"Aperçu non disponible pour l'opération « {op_type} »."}


async def _apply_prerequisites(executor: _Executor, operations: list[dict],
                               index: int) -> None:
    """Apply transiently the ``create_field`` operations preceding the target.

    A modify_view / modify_report frequently references a field created earlier
    in the same changeset; that field must exist for Odoo to validate the view.
    """
    for op in operations[:index]:
        if (op or {}).get("type") == "create_field":
            await executor.op_create_field(op.get("params") or {})


# ── Views ────────────────────────────────────────────────────────


async def preview_view_operation(odoo, operations: list[dict], index: int,
                                 version: Optional[str]) -> dict:
    """Assemble the target view before and after the inherited view is applied.

    The inherited view (and any prerequisite custom fields) are created
    transiently then rolled back, so Odoo itself performs the xpath inheritance
    — the assembled arch is authoritative.
    """
    target = operations[index]
    params = target.get("params") or {}
    model = params.get("model")
    view_type = params.get("view_type") or "form"
    if not model:
        return {"ok": True, "kind": "view", "valid": False,
                "error": "Paramètre 'model' manquant sur l'opération."}

    before = await _assembled_view(odoo, model, view_type, None)
    before_arch = (before or {}).get("arch") or ""

    executor = _Executor(odoo, dry=False, version=version, tag=False)
    after_arch = ""
    sample_context: dict = {}
    valid = True
    error: Optional[str] = None
    try:
        await _apply_prerequisites(executor, operations, index)
        await executor.op_modify_view(params)
        after = await _assembled_view(odoo, model, view_type, None)
        after_arch = (after or {}).get("arch") or ""
        if not after_arch:
            valid = False
            error = ("La vue modifiée n'a pas pu être réassemblée par Odoo — "
                     "l'héritage est probablement invalide.")
        else:
            sample_context = await _sample_record_for_view(
                odoo, model, [before_arch, after_arch])
    except OperationError as exc:
        valid = False
        error = str(exc)
    except Exception as exc:  # noqa: BLE001 — surfaced to the consultant
        valid = False
        error = f"Erreur inattendue pendant l'aperçu : {exc}"
    finally:
        rb_errors = await executor.rollback()
    if rb_errors:
        log.warning("Aperçu vue — rollback incomplet : %s", rb_errors)

    return {
        "ok": True, "kind": "view", "valid": valid, "error": error,
        "model": model, "view_type": view_type,
        "before_arch": before_arch, "after_arch": after_arch,
        "rollback_warnings": rb_errors,
        **sample_context,
    }


# ── Reports ──────────────────────────────────────────────────────


async def _odoo_web_session(odoo) -> httpx.AsyncClient:
    """Open an authenticated Odoo web (cookie) session.

    Report controllers (``/report/pdf``) are not exposed over XML-RPC. The
    stored API key is accepted in place of the password by Odoo's credential
    check, so no separate password is needed.
    """
    client = httpx.AsyncClient(base_url=odoo.url, timeout=90.0, follow_redirects=True)
    try:
        resp = await client.post("/web/session/authenticate", json={
            "jsonrpc": "2.0", "method": "call",
            "params": {"db": odoo.db, "login": odoo.login, "password": odoo.api_key},
        })
        resp.raise_for_status()
        result = (resp.json() or {}).get("result") or {}
        if not result.get("uid"):
            raise RuntimeError("authentification web Odoo refusée (login / clé API)")
    except Exception:
        await client.aclose()
        raise
    return client


async def _render_report_pdf(client: httpx.AsyncClient, report_name: str,
                             record_id: int) -> bytes:
    resp = await client.get(f"/report/pdf/{report_name}/{record_id}")
    if resp.status_code >= 400:
        raise RuntimeError(_http_error_detail(resp))
    ctype = (resp.headers.get("content-type") or "").lower()
    if "pdf" not in ctype:
        raise RuntimeError(
            f"réponse inattendue du contrôleur de rapport ({ctype or 'type inconnu'})")
    return resp.content


async def _resolve_report(odoo, params: dict) -> Optional[dict]:
    """Find the ir.actions.report to render from the operation params."""
    fields = ["report_name", "model", "name"]
    for key in (params.get("report_name"), params.get("template_key")):
        if not key:
            continue
        rows = await _run(lambda key=key: odoo.search_read(
            "ir.actions.report", [["report_name", "=", key]], fields, limit=1))
        if rows:
            return rows[0]
    return None


async def preview_report_operation(odoo, operations: list[dict], index: int,
                                   version: Optional[str]) -> dict:
    """Render the report as a PDF before and after the inherited QWeb view."""
    target = operations[index]
    params = target.get("params") or {}

    report = await _resolve_report(odoo, params)
    if not report:
        return {"ok": True, "kind": "report", "valid": False,
                "error": ("Rapport introuvable — précise `report_name` (le "
                          "report_name de l'ir.actions.report) dans l'opération.")}

    model = report.get("model")
    rname = report.get("report_name")
    sample = await _run(lambda: odoo.search_read(
        model, [], ["display_name"], limit=1, order="id desc")) if model else []
    if not sample:
        return {"ok": True, "kind": "report", "valid": False,
                "report_name": rname, "report_label": report.get("name"),
                "error": f"Aucun enregistrement « {model} » disponible pour l'aperçu."}
    record_id = sample[0]["id"]
    record_name = sample[0].get("display_name") or f"#{record_id}"

    executor = _Executor(odoo, dry=False, version=version, tag=False)
    before_pdf: Optional[bytes] = None
    after_pdf: Optional[bytes] = None
    valid = True
    error: Optional[str] = None
    rb_errors: list = []
    client: Optional[httpx.AsyncClient] = None
    try:
        client = await _odoo_web_session(odoo)
        before_pdf = await _render_report_pdf(client, rname, record_id)
        try:
            await _apply_prerequisites(executor, operations, index)
            await executor.op_modify_report(params)
            after_pdf = await _render_report_pdf(client, rname, record_id)
        except OperationError as exc:
            valid = False
            error = str(exc)
        except Exception as exc:  # noqa: BLE001
            valid = False
            error = f"Le rapport modifié n'a pas pu être rendu : {exc}"
        finally:
            rb_errors = await executor.rollback()
    except Exception as exc:  # noqa: BLE001
        valid = False
        error = error or f"Aperçu du rapport impossible : {exc}"
    finally:
        if client is not None:
            await client.aclose()
    if rb_errors:
        log.warning("Aperçu rapport — rollback incomplet : %s", rb_errors)

    return {
        "ok": True, "kind": "report", "valid": valid, "error": error,
        "report_name": rname, "report_label": report.get("name"),
        "record": {"id": record_id, "name": record_name},
        "before_pdf": base64.b64encode(before_pdf).decode() if before_pdf else None,
        "after_pdf": base64.b64encode(after_pdf).decode() if after_pdf else None,
        "rollback_warnings": rb_errors,
    }
