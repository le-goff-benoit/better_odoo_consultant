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

# QWeb report templates reference each other through t-call; the AI must see
# the real arch (classes, t-fields, table structure) to write valid xpath.
_TCALL_RE = re.compile(r't-call="([\w.]+)"')
_QWEB_ARCH_CAP = 8000
_QWEB_MAX_TEMPLATES = 5


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
        rows = await _run(lambda: odoo.search_read(
            "ir.ui.view", [["model", "=", model]], ["type"], limit=400))
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
    try:
        actions = await _run(lambda: odoo.search_read(
            "ir.actions.act_window", [["res_model", "=", model]],
            ["name", "view_mode"], limit=20))
        if actions:
            # One batched menu query for all actions — avoids N sequential
            # XML-RPC round-trips (one per action).
            refs = [f"ir.actions.act_window,{a['id']}" for a in actions]
            menus = await _run(lambda: odoo.search_read(
                "ir.ui.menu", [["action", "in", refs]],
                ["complete_name", "action"], limit=100))
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
        "view": view_meta,
        "arch_summary": arch_summary,
        "access_paths": access_paths,
    }


async def _collect_qweb_archs(odoo, seed_keys: list[str]) -> dict[str, str]:
    """Breadth-first walk over t-call references starting from *seed_keys*.

    Returns ``{template_key: arch}`` (each capped) so the AI can target xpath
    against the real report structure — the document template and the layout
    are reached through the report template's t-call chain.
    """
    archs: dict[str, str] = {}
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
        archs[key] = (arch[:_QWEB_ARCH_CAP] + "\n…[arch tronquée]"
                      if len(arch) > _QWEB_ARCH_CAP else arch)
        for ref in _TCALL_RE.findall(arch):
            if ref not in seen and ref not in queue:
                queue.append(ref)
    return archs


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
        reports = await _run(lambda: odoo.search_read(
            "ir.actions.report", domain, _REPORT_FIELDS, limit=60))
    except Exception as exc:
        return {"ok": False, "error": f"Lecture des rapports impossible : {exc}"}

    if not reports:
        scope = report_name or model or "cette instance"
        return {"ok": True, "reports": [], "note": f"Aucun rapport trouvé pour '{scope}'."}

    # List mode: a model with several reports, no specific report requested.
    if len(reports) > 1 and not report_name:
        return {"ok": True, "mode": "list", "count": len(reports), "reports": reports}

    # Detail mode.
    report = reports[0]
    detail: dict[str, Any] = {"ok": True, "mode": "detail", "report": report}
    rname = report.get("report_name")

    if rname:
        try:
            templates = await _run(lambda: odoo.search_read(
                "ir.ui.view", [["key", "=", rname], ["type", "=", "qweb"]],
                ["name", "key"], limit=10))
            for tpl in templates:
                children = await _run(lambda tpl=tpl: odoo.search_read(
                    "ir.ui.view", [["inherit_id", "=", tpl["id"]]],
                    ["name", "key"], limit=40))
                tpl["inherited_by"] = [c.get("name") for c in children if c.get("name")]
            detail["qweb_templates"] = templates
            # Real arch of the report + the templates it t-calls (document,
            # layout) — so the AI writes xpath against confirmed elements.
            seeds = [t["key"] for t in templates if t.get("key")] or [rname]
            detail["qweb_archs"] = await _collect_qweb_archs(odoo, seeds)
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
