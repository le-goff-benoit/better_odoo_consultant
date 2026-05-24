"""Live-instance inspection of Odoo views and PDF/QWeb reports.

These power the `inspect_odoo_view` / `inspect_odoo_report` tools. They query
the connected instance so the assembled result (standard + modules + Studio +
custom, after inheritance) is what the user actually sees — something the raw
source code cannot give.
"""

import asyncio
import re
import xml.etree.ElementTree as ET
from typing import Any, Optional

from .odoo_pagination import search_read_bounded

# QWeb report templates reference each other through t-call; the AI must see
# the real arch (classes, t-fields, table structure) to write valid xpath.
_TCALL_RE = re.compile(r't-call="([\w.]+)"')
_QWEB_ARCH_CAP = 50_000
_QWEB_MAX_TEMPLATES = 5
_QWEB_SUMMARY_ITEM_CAP = 400
_QWEB_TEXT_VALUE_CAP = 300


# Field attributes that matter when explaining "how is this field configured
# in this view" — readonly / required / invisible / domain, etc.
_VIEW_FIELD_ATTRS = (
    "readonly", "required", "invisible", "column_invisible",
    "domain", "widget", "options", "string", "context", "groups", "force_save",
)

_REPORT_FIELDS = [
    "name", "report_name", "model", "report_type", "report_file",
    "paperformat_id", "print_report_name", "attachment",
]


async def _run(fn):
    """Run a blocking XML-RPC call off the event loop."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn)


# Tags kept in the structural skeleton — enough for xpath authoring.
_SKELETON_TAGS = {
    "form", "tree", "list", "kanban", "search", "graph", "pivot",
    "sheet", "header", "footer", "notebook", "page", "group",
    "div", "separator", "button", "field", "filter", "label",
    "templates", "t",
}
# Attributes preserved on skeleton elements (identification + visibility).
_SKELETON_ATTRS = {
    "name", "string", "class", "id", "invisible", "groups",
    "attrs", "colspan", "col", "widget", "position",
}


def _build_skeleton(arch: str, max_depth: int = 6) -> str:
    """Return a compact structural skeleton of the view XML.

    Keeps only structural/identifying tags and attributes so the AI can craft
    valid xpath expressions. Large repeated field blocks are collapsed after a
    few entries to keep output manageable.
    """
    try:
        root = ET.fromstring(arch)
    except ET.ParseError:
        return ""

    def _walk(el, depth: int) -> Optional[ET.Element]:
        if depth > max_depth:
            return None
        tag = el.tag
        if tag not in _SKELETON_TAGS:
            # Still recurse — a <div> may contain a <notebook>
            container = ET.Element(tag)
            for attr in _SKELETON_ATTRS:
                if el.get(attr) is not None:
                    container.set(attr, el.get(attr))
            children_added = 0
            for child in el:
                c = _walk(child, depth + 1)
                if c is not None:
                    container.append(c)
                    children_added += 1
            if children_added or tag in ("form", "sheet", "notebook", "page", "group"):
                return container
            return None
        node = ET.Element(tag)
        for attr in _SKELETON_ATTRS:
            if el.get(attr) is not None:
                node.set(attr, el.get(attr))
        # For pages/groups: always recurse. For field: leaf.
        if tag == "field":
            return node
        children_added = 0
        field_count_in_group = 0
        for child in el:
            # Collapse long runs of fields inside a group/page
            if child.tag == "field" and tag in ("group", "page", "div"):
                field_count_in_group += 1
                if field_count_in_group <= 5:
                    c = _walk(child, depth + 1)
                    if c is not None:
                        node.append(c)
                        children_added += 1
                elif field_count_in_group == 6:
                    placeholder = ET.Comment(f" ... +more fields ... ")
                    node.append(placeholder)
                continue
            c = _walk(child, depth + 1)
            if c is not None:
                node.append(c)
                children_added += 1
        return node

    skeleton_root = _walk(root, 0)
    if skeleton_root is None:
        return ""
    return ET.tostring(skeleton_root, encoding="unicode", short_empty_elements=True)


def _summarize_arch(arch: str) -> dict[str, Any]:
    """Parse an assembled view arch into a structured summary.

    Returns the per-field view-level configuration (the point of the tool) plus
    buttons and notebook pages — never the raw XML blob, to keep tool output
    compact.
    """
    try:
        root = ET.fromstring(arch)
    except Exception as exc:
        return {"parse_error": str(exc)}

    fields: list[dict] = []
    seen: set = set()
    for el in root.iter("field"):
        name = el.get("name")
        if not name:
            continue
        attrs = {k: el.get(k) for k in _VIEW_FIELD_ATTRS if el.get(k) is not None}
        key = (name, tuple(sorted(attrs.items())))
        if key in seen:
            continue
        seen.add(key)
        fields.append({"name": name, **attrs})

    buttons: list[dict] = []
    for el in root.iter("button"):
        b = {k: el.get(k) for k in ("name", "string", "type", "class", "invisible") if el.get(k)}
        if b:
            buttons.append(b)

    pages = [
        (el.get("string") or el.get("name"))
        for el in root.iter("page")
        if (el.get("string") or el.get("name"))
    ]

    return {
        "root_tag": root.tag,
        "field_count": len(fields),
        "fields": fields[:200],
        "buttons": buttons[:40],
        "notebook_pages": pages[:40],
    }


def _local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _clean_text(value: Optional[str]) -> str:
    text = " ".join((value or "").split())
    if len(text) > _QWEB_TEXT_VALUE_CAP:
        return text[:_QWEB_TEXT_VALUE_CAP] + "…"
    return text


def _append_unique(items: list[dict[str, Any]], seen: set[tuple], item: dict[str, Any], key: tuple) -> bool:
    if key in seen:
        return False
    seen.add(key)
    if len(items) >= _QWEB_SUMMARY_ITEM_CAP:
        return True
    items.append(item)
    return False


def _summarize_qweb_arch(arch: str) -> dict[str, Any]:
    """Extract an exhaustive-enough QWeb map from the full arch, not the capped copy."""
    try:
        root = ET.fromstring(arch)
    except Exception as exc:
        return {"parse_error": str(exc), "arch_chars": len(arch)}

    visible_text: list[dict[str, Any]] = []
    field_refs: list[dict[str, Any]] = []
    output_refs: list[dict[str, Any]] = []
    foreach_blocks: list[dict[str, Any]] = []
    t_calls: list[str] = []
    tables: list[dict[str, Any]] = []
    seen_text: set[tuple] = set()
    seen_field: set[tuple] = set()
    seen_output: set[tuple] = set()
    seen_foreach: set[tuple] = set()
    seen_calls: set[str] = set()
    summary_truncated = False

    for el in root.iter():
        tag = _local_tag(el.tag)
        text = _clean_text(el.text)
        if text:
            summary_truncated |= _append_unique(
                visible_text,
                seen_text,
                {"tag": tag, "text": text},
                (tag, text),
            )
        field_expr = el.get("t-field")
        if field_expr:
            summary_truncated |= _append_unique(
                field_refs,
                seen_field,
                {"tag": tag, "expr": field_expr, "class": el.get("class")},
                (tag, field_expr, el.get("class")),
            )
        for attr in ("t-out", "t-esc", "t-raw"):
            expr = el.get(attr)
            if expr:
                summary_truncated |= _append_unique(
                    output_refs,
                    seen_output,
                    {"tag": tag, "attr": attr, "expr": expr, "class": el.get("class")},
                    (tag, attr, expr, el.get("class")),
                )
        foreach_expr = el.get("t-foreach")
        if foreach_expr:
            summary_truncated |= _append_unique(
                foreach_blocks,
                seen_foreach,
                {"tag": tag, "expr": foreach_expr, "as": el.get("t-as"), "class": el.get("class")},
                (tag, foreach_expr, el.get("t-as"), el.get("class")),
            )
        call = el.get("t-call")
        if call and call not in seen_calls:
            seen_calls.add(call)
            if len(t_calls) >= _QWEB_SUMMARY_ITEM_CAP:
                summary_truncated = True
            else:
                t_calls.append(call)

    for table in root.iter():
        if _local_tag(table.tag) != "table":
            continue
        headers: list[str] = []
        refs: list[str] = []
        for node in table.iter():
            tag = _local_tag(node.tag)
            if tag == "th":
                label = _clean_text(" ".join(node.itertext()))
                if label and label not in headers:
                    headers.append(label)
            for attr in ("t-field", "t-out", "t-esc", "t-raw"):
                expr = node.get(attr)
                if expr and expr not in refs:
                    refs.append(expr)
        if len(tables) >= _QWEB_SUMMARY_ITEM_CAP:
            summary_truncated = True
            break
        tables.append({
            "class": table.get("class"),
            "headers": headers,
            "expressions": refs,
        })

    return {
        "arch_chars": len(arch),
        "root_tag": _local_tag(root.tag),
        "visible_text_count": len(seen_text),
        "field_ref_count": len(seen_field),
        "output_ref_count": len(seen_output),
        "foreach_count": len(seen_foreach),
        "t_call_count": len(seen_calls),
        "table_count": len(tables),
        "summary_truncated": summary_truncated,
        "visible_text": visible_text,
        "field_refs": field_refs,
        "output_refs": output_refs,
        "foreach_blocks": foreach_blocks,
        "t_calls": t_calls,
        "tables": tables,
    }


async def _assembled_view(odoo, model: str, view_type: str, view_id: Optional[int]) -> Optional[dict]:
    """Return the assembled view dict — get_view (Odoo 16+) with a
    fields_view_get fallback (Odoo 15)."""
    kwargs: dict[str, Any] = {"view_type": view_type}
    if view_id:
        kwargs["view_id"] = view_id
    try:
        return await _run(lambda: odoo.call(model, "get_view", [], dict(kwargs)))
    except Exception:
        try:
            return await _run(lambda: odoo.call(model, "fields_view_get", [], {"view_type": view_type}))
        except Exception:
            return None


async def inspect_odoo_view(
    odoo,
    model: str,
    view_type: Optional[str] = None,
    view_id: Optional[int] = None,
) -> dict[str, Any]:
    """Inspect a view of the connected instance: available view types, assembled
    arch (after inheritance), per-field configuration and the menu/action path."""
    model = (model or "").strip()
    if not model:
        return {"ok": False, "error": "Paramètre 'model' manquant."}

    try:
        loop = asyncio.get_event_loop()
        rows, view_type_meta = await search_read_bounded(
            loop, odoo, "ir.ui.view", [["model", "=", model]], ["type"],
            max_records=5000, label="Types de vues",
        )
    except Exception as exc:
        return {"ok": False, "error": f"Lecture des vues impossible : {exc}"}
    available = sorted({r.get("type") for r in rows if r.get("type")})
    if not available:
        return {"ok": False, "error": f"Aucune vue trouvée pour le modèle '{model}' (modèle inexistant ?)."}

    vt = (view_type or "").strip().lower()
    if vt == "tree":
        vt = "list"  # Odoo 17+ naming
    if not vt:
        vt = "form" if "form" in available else available[0]

    view_meta: dict[str, Any] = {}
    arch_summary: dict[str, Any] = {}
    raw = await _assembled_view(odoo, model, vt, view_id)
    if raw:
        view_meta = {"name": raw.get("name"), "view_db_id": raw.get("id"), "type": vt}
        arch = raw.get("arch") or ""
        if arch:
            arch_summary = _summarize_arch(arch)
            skeleton = _build_skeleton(arch)
            if skeleton:
                arch_summary["structural_skeleton"] = skeleton
    else:
        view_meta = {"type": vt, "error": f"Vue de type '{vt}' indisponible pour ce modèle."}

    access_paths: list[dict] = []
    access_meta: dict[str, Any] = {}
    try:
        loop = asyncio.get_event_loop()
        actions, actions_meta = await search_read_bounded(
            loop,
            odoo,
            "ir.actions.act_window", [["res_model", "=", model]],
            ["name", "view_mode"], max_records=1000, label="Actions fenêtre",
        )
        access_meta["actions"] = actions_meta
        if actions:
            # One batched menu query for all actions — avoids N sequential
            # XML-RPC round-trips (one per action).
            refs = [f"ir.actions.act_window,{a['id']}" for a in actions]
            menus, menus_meta = await search_read_bounded(
                loop,
                odoo,
                "ir.ui.menu", [["action", "in", refs]],
                ["complete_name", "action"], max_records=1000, label="Menus",
            )
            access_meta["menus"] = menus_meta
            by_ref: dict[str, list[str]] = {}
            for m in menus:
                ref = m.get("action")
                if isinstance(ref, (list, tuple)) and ref:
                    ref = f"ir.actions.act_window,{ref[0]}"
                if isinstance(ref, str) and m.get("complete_name"):
                    by_ref.setdefault(ref, []).append(m["complete_name"])
            for a in actions:
                access_paths.append({
                    "action": a.get("name"),
                    "view_mode": a.get("view_mode"),
                    "menus": by_ref.get(f"ir.actions.act_window,{a['id']}", []),
                })
    except Exception:
        pass

    return {
        "ok": True,
        "model": model,
        "requested_view_type": vt,
        "available_view_types": available,
        "available_view_types_meta": view_type_meta,
        "view": view_meta,
        "arch_summary": arch_summary,
        "access_meta": access_meta,
        "access_paths": access_paths,
    }


async def _collect_qweb_archs(odoo, seed_keys: list[str]) -> tuple[dict[str, str], dict[str, Any], dict[str, Any]]:
    """Breadth-first walk over t-call references starting from *seed_keys*.

    Returns capped archs plus metadata and summaries. Summaries are extracted
    from the full arch, so the model can still inventory visible blocks, tables
    and field expressions when a raw XML template exceeds the transport cap.
    """
    archs: dict[str, str] = {}
    meta: dict[str, Any] = {}
    summaries: dict[str, Any] = {}
    seen: set[str] = set()
    queue = [k for k in seed_keys if k]
    while queue and len(archs) < _QWEB_MAX_TEMPLATES:
        key = queue.pop(0)
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            rows = await _run(lambda key=key: odoo.search_read(
                "ir.ui.view", [["key", "=", key], ["type", "=", "qweb"]],
                ["arch"], limit=1))
        except Exception:
            continue
        if not rows:
            continue
        arch = rows[0].get("arch") or ""
        truncated = len(arch) > _QWEB_ARCH_CAP
        archs[key] = (arch[:_QWEB_ARCH_CAP] + "\n…[arch tronquée — voir qweb_summaries pour l'inventaire structuré extrait de l'arch complète]"
                      if truncated else arch)
        meta[key] = {
            "chars": len(arch),
            "returned_chars": min(len(arch), _QWEB_ARCH_CAP),
            "truncated": truncated,
            "warning": (
                "Arch QWeb brute bornée ; l'inventaire structuré qweb_summaries "
                "a été extrait depuis l'arch complète."
                if truncated else None
            ),
        }
        summaries[key] = _summarize_qweb_arch(arch)
        for ref in _TCALL_RE.findall(arch):
            if ref not in seen and ref not in queue:
                queue.append(ref)
    if queue:
        meta["_collection"] = {
            "truncated": True,
            "returned_templates": len(archs),
            "max_templates": _QWEB_MAX_TEMPLATES,
            "remaining_t_calls": queue,
            "warning": (
                f"Collecte QWeb bornée à {_QWEB_MAX_TEMPLATES} templates. "
                "Relance une inspection ciblée sur les t-call restants si nécessaire."
            ),
        }
    return archs, meta, summaries


async def inspect_odoo_report(
    odoo,
    model: Optional[str] = None,
    report_name: Optional[str] = None,
) -> dict[str, Any]:
    """Inspect PDF/QWeb reports: report action, QWeb template + inheritance,
    paperformat and the company document layout."""
    report_name = (report_name or "").strip()
    model = (model or "").strip()

    if report_name:
        domain = [["report_name", "=", report_name]]
    elif model:
        domain = [["model", "=", model]]
    else:
        domain = []

    try:
        loop = asyncio.get_event_loop()
        reports, reports_meta = await search_read_bounded(
            loop, odoo, "ir.actions.report", domain, _REPORT_FIELDS,
            max_records=1000, label="Rapports",
        )
    except Exception as exc:
        return {"ok": False, "error": f"Lecture des rapports impossible : {exc}"}

    if not reports:
        scope = report_name or model or "cette instance"
        return {"ok": True, "reports": [], "reports_meta": reports_meta, "note": f"Aucun rapport trouvé pour '{scope}'."}

    # List mode: a model with several reports, no specific report requested.
    if len(reports) > 1 and not report_name:
        return {"ok": True, "mode": "list", **reports_meta, "reports": reports}

    # Detail mode.
    report = reports[0]
    detail: dict[str, Any] = {"ok": True, "mode": "detail", "reports_meta": reports_meta, "report": report}
    rname = report.get("report_name")

    if rname:
        try:
            loop = asyncio.get_event_loop()
            templates, templates_meta = await search_read_bounded(
                loop,
                odoo,
                "ir.ui.view", [["key", "=", rname], ["type", "=", "qweb"]],
                ["name", "key"], max_records=100, label="Templates QWeb",
            )
            for tpl in templates:
                children, children_meta = await search_read_bounded(
                    loop,
                    odoo,
                    "ir.ui.view", [["inherit_id", "=", tpl["id"]]],
                    ["name", "key"], max_records=1000, label="Héritages QWeb",
                )
                tpl["inherited_by"] = [c.get("name") for c in children if c.get("name")]
                tpl["inherited_by_meta"] = children_meta
            detail["qweb_templates"] = templates
            detail["qweb_templates_meta"] = templates_meta
            # Real arch of the report + the templates it t-calls (document,
            # layout) — so the AI writes xpath against confirmed elements.
            seeds = [t["key"] for t in templates if t.get("key")] or [rname]
            qweb_archs, qweb_meta, qweb_summaries = await _collect_qweb_archs(odoo, seeds)
            detail["qweb_archs"] = qweb_archs
            detail["qweb_arch_meta"] = qweb_meta
            detail["qweb_summaries"] = qweb_summaries
        except Exception:
            pass

    pf = report.get("paperformat_id")
    if isinstance(pf, list) and pf:
        try:
            rows = await _run(lambda: odoo.search_read(
                "report.paperformat", [["id", "=", pf[0]]],
                ["name", "format", "orientation", "margin_top", "margin_bottom", "dpi"],
                limit=1))
            detail["paperformat"] = rows[0] if rows else None
        except Exception:
            pass

    try:
        # Scope the layout to the active company when one is selected on the
        # client — a multi-company instance must not report the wrong branding.
        comp_domain = [["id", "=", odoo.company_id]] if getattr(odoo, "company_id", None) else []
        comp = await _run(lambda: odoo.search_read(
            "res.company", comp_domain,
            ["name", "external_report_layout_id", "font", "primary_color", "secondary_color"],
            limit=1))
        if comp:
            detail["document_layout"] = comp[0]
    except Exception:
        pass

    return detail
