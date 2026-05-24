"""attachment_handler — in-process tool dispatch for the ``attachment_handler``
skill.

Exposes three tools the LLM can call:

* ``extract_pdf_text(attachment_name, pages?)`` — pypdf extraction from an
  already-uploaded PDF (looked up by name in the session attachment store).
* ``pdf_to_images(attachment_name, pages?, dpi?)`` — pdf2image render of
  selected pages, returned inline as base64 PNGs.
* ``compare_documents(name_a, name_b, mode?)`` — diff two PDFs by text or
  by detected structure.

All three are read-only and require ``permissions.scripts: true`` on the
skill (already in SKILL.md frontmatter). They access the binary payload via
``services.attachment_store`` (keyed on ``ctx.session_id``).

The dispatcher in ``ai_service._run_tool`` calls ``run(args, ctx)`` once per
tool call. The tool name comes via ``args["_tool"]`` — convention used only
for this multi-tool handler since the rest of the registry is one-tool-per-
skill.
"""
from __future__ import annotations

import asyncio
import base64
import io
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

REQUIRES_ODOO = False
REQUIRES_SOURCE = False


def _parse_pages_arg(raw) -> Optional[list[int]]:
    """Parse the ``pages`` argument. Accepts list[int], "1,2,5-7", or None."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        return [int(p) for p in raw if isinstance(p, (int, str))]
    if isinstance(raw, int):
        return [raw]
    if isinstance(raw, str):
        out: list[int] = []
        for tok in raw.split(","):
            tok = tok.strip()
            if not tok:
                continue
            if "-" in tok:
                a, b = tok.split("-", 1)
                out.extend(range(int(a), int(b) + 1))
            else:
                out.append(int(tok))
        return out
    return None


def _current_session() -> Optional[str]:
    from backend.services import attachment_store
    return attachment_store.current_session()


def _list_session_attachments() -> list[str]:
    sid = _current_session()
    if not sid:
        return []
    from backend.services import attachment_store
    return attachment_store.list_names(sid)


def _resolve_attachment_bytes(name: str) -> Optional[bytes]:
    sid = _current_session()
    if not sid:
        return None
    from backend.services import attachment_store
    return attachment_store.get_bytes(sid, name)


async def _extract_pdf_text(args: dict, ctx) -> dict:
    name = (args.get("attachment_name") or "").strip()
    if not name:
        return {"ok": False, "error": "attachment_name est obligatoire."}
    raw = _resolve_attachment_bytes(name)
    if raw is None:
        return {
            "ok": False,
            "error": f"Pièce jointe '{name}' introuvable dans cette conversation.",
            "available": _list_session_attachments(),
        }
    pages_filter = _parse_pages_arg(args.get("pages"))

    def _do() -> dict:
        try:
            import pypdf
        except ImportError:
            return {"ok": False, "error": "pypdf manquant côté serveur."}
        try:
            reader = pypdf.PdfReader(io.BytesIO(raw))
        except Exception as exc:
            return {"ok": False, "error": f"Lecture PDF impossible : {exc}"}
        total = len(reader.pages)
        target = pages_filter or list(range(1, total + 1))
        kept: list[tuple[int, str]] = []
        for page_num in target:
            if page_num < 1 or page_num > total:
                continue
            try:
                t = (reader.pages[page_num - 1].extract_text() or "").strip()
            except Exception:
                t = ""
            if t:
                kept.append((page_num, t))
        body = "\n\n".join(f"--- Page {n} ---\n\n{t}" for n, t in kept)
        return {
            "ok": True,
            "attachment_name": name,
            "total_pages": total,
            "extracted_pages": len(kept),
            "char_count": len(body),
            "content": body,
        }

    return await ctx.loop.run_in_executor(None, _do)


_DEFAULT_DPI = 120
_MAX_PAGES_RENDER = 10


async def _pdf_to_images(args: dict, ctx) -> dict:
    name = (args.get("attachment_name") or "").strip()
    if not name:
        return {"ok": False, "error": "attachment_name est obligatoire."}
    raw = _resolve_attachment_bytes(name)
    if raw is None:
        return {
            "ok": False,
            "error": f"Pièce jointe '{name}' introuvable.",
            "available": _list_session_attachments(),
        }
    pages_filter = _parse_pages_arg(args.get("pages"))
    dpi_raw = args.get("dpi") or _DEFAULT_DPI
    try:
        dpi = max(60, min(int(dpi_raw), 240))
    except (TypeError, ValueError):
        dpi = _DEFAULT_DPI

    def _do() -> dict:
        try:
            from pdf2image import convert_from_bytes
        except ImportError:
            return {
                "ok": False,
                "error": "pdf2image indisponible côté serveur. Installe `pdf2image` (Python) + `poppler-utils` (OS).",
            }
        try:
            if pages_filter:
                first, last = min(pages_filter), max(pages_filter)
                images = convert_from_bytes(raw, dpi=dpi, first_page=first, last_page=last, fmt="png")
                selected = sorted(set(pages_filter))
                pairs = [(idx, img) for idx, img in zip(range(first, last + 1), images) if idx in selected]
            else:
                images = convert_from_bytes(raw, dpi=dpi, last_page=_MAX_PAGES_RENDER, fmt="png")
                pairs = list(enumerate(images, start=1))
        except Exception as exc:
            return {"ok": False, "error": f"Conversion impossible (poppler installé ?) : {exc}"}
        blocks: list[dict] = []
        for page_num, img in pairs[:_MAX_PAGES_RENDER]:
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            blocks.append({
                "page": page_num,
                "mime_type": "image/png",
                "base64": base64.b64encode(buf.getvalue()).decode("ascii"),
                "size_bytes": buf.tell(),
            })
        return {
            "ok": True,
            "attachment_name": name,
            "pages_rendered": len(blocks),
            "dpi": dpi,
            "capped": len(pairs) > _MAX_PAGES_RENDER,
            "images": blocks,
        }

    return await ctx.loop.run_in_executor(None, _do)


async def _compare_documents(args: dict, ctx) -> dict:
    name_a = (args.get("name_a") or "").strip()
    name_b = (args.get("name_b") or "").strip()
    mode = (args.get("mode") or "text").strip().lower()
    if not name_a or not name_b:
        return {"ok": False, "error": "name_a et name_b sont obligatoires."}
    if mode not in ("text", "structure"):
        return {"ok": False, "error": "mode doit être 'text' ou 'structure'."}
    raw_a = _resolve_attachment_bytes(name_a)
    raw_b = _resolve_attachment_bytes(name_b)
    if raw_a is None or raw_b is None:
        missing = [n for n, r in [(name_a, raw_a), (name_b, raw_b)] if r is None]
        return {
            "ok": False,
            "error": f"Pièces jointes introuvables : {missing}",
            "available": _list_session_attachments(),
        }

    def _do() -> dict:
        try:
            import pypdf
        except ImportError:
            return {"ok": False, "error": "pypdf manquant côté serveur."}
        import difflib

        def _extract(buf: bytes) -> str:
            try:
                r = pypdf.PdfReader(io.BytesIO(buf))
            except Exception as exc:
                raise RuntimeError(f"Lecture PDF impossible : {exc}")
            return "\n".join((p.extract_text() or "") for p in r.pages)

        try:
            text_a = _extract(raw_a)
            text_b = _extract(raw_b)
        except RuntimeError as exc:
            return {"ok": False, "error": str(exc)}

        if mode == "text":
            diff = list(difflib.unified_diff(
                text_a.splitlines(), text_b.splitlines(),
                fromfile=name_a, tofile=name_b, lineterm="", n=2,
            ))
            ratio = difflib.SequenceMatcher(None, text_a, text_b).ratio()
            return {
                "ok": True,
                "name_a": name_a, "name_b": name_b,
                "mode": "text",
                "similarity": round(ratio, 3),
                "diff_lines": len(diff),
                "diff": "\n".join(diff[:500]),
                "truncated": len(diff) > 500,
            }

        # mode == "structure"
        heading_re = re.compile(
            r"(?m)^(?:#{1,4}\s+.+|(?:\d+(?:\.\d+)*|[IVXLC]+)\.?\s+[A-ZÉÈÀ][^\n]{2,80})$"
        )

        def _sections(text: str) -> list[tuple[str, str]]:
            matches = list(heading_re.finditer(text))
            if not matches:
                return [("", text.strip())]
            sections: list[tuple[str, str]] = []
            starts = [m.start() for m in matches] + [len(text)]
            for i, m in enumerate(matches):
                sections.append((m.group().strip(), text[m.end():starts[i + 1]].strip()))
            return sections

        sa, sb = _sections(text_a), _sections(text_b)
        ha = {h.lower(): body for h, body in sa}
        hb = {h.lower(): body for h, body in sb}
        keys = list(dict.fromkeys(list(ha) + list(hb)))
        diff: list[dict] = []
        for k in keys:
            a, b = ha.get(k), hb.get(k)
            if a is None:
                diff.append({"section": k, "status": "ajouté dans B"})
            elif b is None:
                diff.append({"section": k, "status": "retiré dans B"})
            elif a.strip() == b.strip():
                diff.append({"section": k, "status": "identique"})
            else:
                ratio = difflib.SequenceMatcher(None, a, b).ratio()
                diff.append({
                    "section": k, "status": "modifié",
                    "similarity": round(ratio, 3),
                    "details": f"{abs(len(a) - len(b))} chars d'écart",
                })
        return {
            "ok": True,
            "name_a": name_a, "name_b": name_b,
            "mode": "structure",
            "sections_a": [h for h, _ in sa],
            "sections_b": [h for h, _ in sb],
            "diff": diff,
        }

    return await ctx.loop.run_in_executor(None, _do)


_TOOLS = {
    "extract_pdf_text": _extract_pdf_text,
    "pdf_to_images": _pdf_to_images,
    "compare_documents": _compare_documents,
}


async def run(args: dict[str, Any], ctx) -> dict[str, Any]:
    """Multi-tool handler. The dispatcher passes the tool name via ``_tool``
    in ``args`` (convention specific to this skill)."""
    tool = args.get("_tool")
    fn = _TOOLS.get(tool)
    if fn is None:
        return {"ok": False, "error": f"Tool inconnu pour attachment_handler : {tool!r}",
                "supported": list(_TOOLS)}
    return await fn(args, ctx)
