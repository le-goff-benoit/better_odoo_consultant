"""Shared document-attachment handling for the AI-powered tools.

The Assistant, the Migration tool and the Creator all let the consultant
attach documents to a request. Three kinds are supported:

- ``text``   — .txt/.md/.csv/.po/.sql/... files, inlined as Markdown.
- ``office`` — .xlsx/.xls spreadsheets, parsed server-side into Markdown
               tables and inlined like a text attachment.
- ``image``  — .png/.jpg/... screenshots and mockups, sent to the model as a
               native vision block so it can actually *see* them.
- ``pdf``    — sent as a native document block (vision): the model reads both
               the text and the images / layout of the PDF. No OCR step, no
               text extraction — the multimodal model does it end to end.

Processing happens in two stages so errors surface as HTTP 400 at the route
and the provider-specific formatting stays out of the request handlers:

1. :func:`inject_attachments` (called from the routes) validates every file,
   inlines text files as Markdown, and stashes the validated binary
   attachments on the last user message under the private ``_attachments`` key.
2. :func:`apply_provider_attachments` (called from ``stream_chat``) rewrites
   that message into the provider-native multimodal format (Claude blocks,
   OpenAI content parts, Gemini parts).
"""

import base64
import io
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel

ATTACHMENT_MAX_FILES = 5
ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
ATTACHMENT_MAX_CHARS = 40_000
ATTACHMENT_MAX_MB = ATTACHMENT_MAX_BYTES // (1024 * 1024)

# Plain-text formats a consultant routinely works with — code, configs,
# data exports, Odoo translation catalogs. Read as UTF-8 text in the browser.
TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".py", ".log",
    ".yaml", ".yml", ".html", ".htm", ".sql", ".po", ".pot",
    ".ini", ".conf", ".cfg", ".toml", ".rst", ".js", ".ts", ".css", ".scss", ".sh",
}
# Binary spreadsheets — parsed server-side into Markdown tables.
OFFICE_EXTENSIONS = {".xlsx", ".xls"}
_OFFICE_MAX_ROWS = 500
_OFFICE_MAX_COLS = 40
IMAGE_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}
IMAGE_EXTENSIONS = set(IMAGE_MIME_BY_EXT)

# Providers that speak the OpenAI chat-completions content-part dialect.
_OPENAI_FAMILY = {"openai", "github", "copilot"}


class ChatAttachment(BaseModel):
    name: str
    mime_type: str = ""
    size: int
    kind: str  # "text" | "pdf" | "image"
    text: Optional[str] = None
    content_base64: Optional[str] = None


def _attachment_ext(name: str) -> str:
    return Path(name or "").suffix.lower()


def _trim_attachment_text(text: str, remaining: int) -> tuple[str, int]:
    if remaining <= 0:
        return "", 0
    if len(text) <= remaining:
        return text, remaining - len(text)
    suffix = "\n\n[...pièce jointe tronquée pour limiter la taille du prompt...]"
    usable = max(0, remaining - len(suffix))
    return text[:usable] + suffix, 0


def _decode_raw(att: ChatAttachment, expected_exts: set[str], label: str) -> bytes:
    """Validate a binary attachment and return its decoded bytes.
    Raises HTTPException(400) on any problem."""
    ext = _attachment_ext(att.name)
    if ext not in expected_exts:
        raise HTTPException(400, f"'{att.name}' n'est pas un {label} valide")
    if not att.content_base64:
        raise HTTPException(400, f"{label} '{att.name}' vide ou illisible")
    try:
        raw = base64.b64decode(att.content_base64, validate=True)
    except Exception:
        raise HTTPException(400, f"{label} '{att.name}' invalide (base64)")
    if not raw:
        raise HTTPException(400, f"{label} '{att.name}' vide")
    if len(raw) > ATTACHMENT_MAX_BYTES:
        raise HTTPException(400, f"'{att.name}' dépasse la limite de {ATTACHMENT_MAX_MB} MB")
    return raw


def _decode_binary(att: ChatAttachment, expected_exts: set[str], label: str) -> str:
    """Like :func:`_decode_raw` but returns canonical (whitespace-free) base64,
    ready to embed in a provider multimodal block."""
    return base64.b64encode(_decode_raw(att, expected_exts, label)).decode("ascii")


def _fmt_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).replace("\n", " ").replace("\r", " ").replace("|", "\\|").strip()


def _sheet_to_markdown(title: str, rows_iter) -> str:
    """Render one spreadsheet sheet as a Markdown table (capped in size)."""
    rows: list[list[str]] = []
    truncated = False
    for i, row in enumerate(rows_iter):
        if i >= _OFFICE_MAX_ROWS:
            truncated = True
            break
        rows.append([_fmt_cell(c) for c in list(row)[:_OFFICE_MAX_COLS]])
    while rows and not any(c for c in rows[-1]):
        rows.pop()
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    header, body = rows[0], rows[1:]
    lines = [f"### Feuille : {title}",
             "| " + " | ".join(header) + " |",
             "| " + " | ".join("---" for _ in header) + " |"]
    lines += ["| " + " | ".join(r) + " |" for r in body]
    if truncated:
        lines.append(f"_[…feuille tronquée à {_OFFICE_MAX_ROWS} lignes]_")
    return "\n".join(lines)


def _extract_office(raw: bytes, name: str, ext: str) -> str:
    """Parse an .xlsx / .xls workbook into Markdown tables."""
    sheets: list[str] = []
    if ext == ".xlsx":
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(400, "Lecture .xlsx indisponible — installez 'openpyxl'")
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception as exc:
            raise HTTPException(400, f"Impossible de lire le classeur '{name}' : {exc}")
        try:
            for ws in wb.worksheets:
                sheets.append(_sheet_to_markdown(ws.title, ws.iter_rows(values_only=True)))
        finally:
            wb.close()
    elif ext == ".xls":
        try:
            import xlrd
        except ImportError:
            raise HTTPException(400, "Lecture .xls indisponible — installez 'xlrd'")
        try:
            book = xlrd.open_workbook(file_contents=raw)
        except Exception as exc:
            raise HTTPException(400, f"Impossible de lire le classeur '{name}' : {exc}")
        for sh in book.sheets():
            rows = (sh.row_values(r) for r in range(sh.nrows))
            sheets.append(_sheet_to_markdown(sh.name, rows))
    else:
        raise HTTPException(400, f"Format de classeur non supporté pour '{name}'")
    text = "\n\n".join(s for s in sheets if s).strip()
    if not text:
        raise HTTPException(400, f"Classeur '{name}' vide ou sans données exploitables")
    return text


def _attachment_instruction(has_text: bool, n_image: int, n_pdf: int) -> str:
    if not (has_text or n_image or n_pdf):
        return ""
    lines = [
        "Le consultant a joint des documents à analyser. "
        "Exploite-les pour répondre à la demande."
    ]
    if n_image or n_pdf:
        lines.append(
            "Les images et PDF sont fournis comme pièces jointes visuelles : lis-les "
            "attentivement — texte, tableaux, captures d'écran, schémas et mise en page. "
            "S'il s'agit d'une maquette de rapport ou d'un écran modélisé par le client, "
            "décris précisément la structure attendue (champs, colonnes, sections, "
            "libellés, totaux) afin de guider la construction du rapport QWeb ou de la "
            "vue Odoo correspondante."
        )
    lines.append("Ne mentionne les pièces jointes que si c'est utile à la réponse.")
    return "\n".join(lines)


def inject_attachments(messages: list[dict], attachments: list[ChatAttachment]) -> list[dict]:
    """Validate *attachments* and bind them to the last user turn of *messages*.

    Text files are inlined as Markdown. Binary files (image, pdf) are validated
    and stashed on the message under ``_attachments`` for
    :func:`apply_provider_attachments` to format later.
    """
    if not attachments:
        return messages
    if len(attachments) > ATTACHMENT_MAX_FILES:
        raise HTTPException(400, f"Maximum {ATTACHMENT_MAX_FILES} fichiers par message")
    if not messages or messages[-1].get("role") != "user":
        raise HTTPException(400, "Les pièces jointes doivent être associées à un message utilisateur")

    text_sections: list[str] = []
    binary: list[dict] = []
    remaining = ATTACHMENT_MAX_CHARS

    for att in attachments:
        if att.size > ATTACHMENT_MAX_BYTES:
            raise HTTPException(400, f"'{att.name}' dépasse la limite de {ATTACHMENT_MAX_MB} MB")
        ext = _attachment_ext(att.name)

        if att.kind == "text":
            if ext not in TEXT_EXTENSIONS:
                raise HTTPException(400, f"Format non supporté pour '{att.name}'")
            raw_text = (att.text or "").strip()
            if not raw_text:
                raise HTTPException(400, f"'{att.name}' ne contient pas de texte exploitable")
            text, remaining = _trim_attachment_text(raw_text, remaining)
            if text:
                text_sections.append(
                    f"## Pièce jointe: {att.name}\n"
                    f"- Type: {att.mime_type or 'text'}\n"
                    f"- Taille: {att.size} octets\n\n"
                    f"{text}"
                )
        elif att.kind == "pdf":
            data = _decode_binary(att, {".pdf"}, "PDF")
            binary.append({"kind": "pdf", "name": att.name,
                           "mime_type": "application/pdf", "data": data})
        elif att.kind == "image":
            mime = IMAGE_MIME_BY_EXT.get(ext)
            if not mime:
                raise HTTPException(400, f"Format d'image non supporté pour '{att.name}'")
            data = _decode_binary(att, IMAGE_EXTENSIONS, "Image")
            binary.append({"kind": "image", "name": att.name,
                           "mime_type": mime, "data": data})
        elif att.kind == "office":
            raw = _decode_raw(att, OFFICE_EXTENSIONS, "classeur")
            sheet_md = _extract_office(raw, att.name, ext)
            text, remaining = _trim_attachment_text(sheet_md, remaining)
            if text:
                text_sections.append(
                    f"## Pièce jointe (classeur): {att.name}\n"
                    f"- Taille: {att.size} octets\n\n"
                    f"{text}"
                )
        else:
            raise HTTPException(400, f"Type de pièce jointe inconnu pour '{att.name}'")

    n_image = sum(1 for b in binary if b["kind"] == "image")
    n_pdf = sum(1 for b in binary if b["kind"] == "pdf")
    instruction = _attachment_instruction(bool(text_sections), n_image, n_pdf)
    if not instruction:
        return messages

    base_text = (messages[-1].get("content") or "").strip()
    parts = [base_text, instruction] if base_text else [instruction]
    if text_sections:
        parts.append("\n\n---\n\n".join(text_sections))
    new_text = "\n\n---\n\n".join(parts).strip()

    patched = list(messages)
    last = {**patched[-1], "content": new_text}
    if binary:
        last["_attachments"] = binary
    patched[-1] = last
    return patched


# ── Provider-native multimodal formatting ────────────────────────


def _claude_content(text: str, binary: list[dict]) -> list[dict]:
    blocks: list[dict] = [{"type": "text", "text": text}]
    for b in binary:
        if b["kind"] == "image":
            blocks.append({"type": "image", "source": {
                "type": "base64", "media_type": b["mime_type"], "data": b["data"]}})
        else:  # pdf
            blocks.append({"type": "document", "source": {
                "type": "base64", "media_type": "application/pdf", "data": b["data"]}})
    return blocks


_PDF_FALLBACK_MAX_PAGES = 10
_PDF_FALLBACK_MIN_TEXT_CHARS = 50


def _pypdf_extract_text(b64_data: str) -> str:
    """Best-effort PDF→text via pypdf. Returns empty string on any failure
    (the caller will fall through to image rendering)."""
    try:
        import pypdf
    except ImportError:
        return ""
    try:
        raw = base64.b64decode(b64_data)
        reader = pypdf.PdfReader(io.BytesIO(raw))
        pages = [(p.extract_text() or "").strip() for p in reader.pages]
        return "\n\n".join(p for p in pages if p).strip()
    except Exception:
        return ""


def _pdf_to_image_blocks(b64_data: str, max_pages: int = _PDF_FALLBACK_MAX_PAGES) -> list[dict]:
    """Render PDF pages to PNG images, return OpenAI-style image_url blocks.

    Returns an empty list if pdf2image or poppler are missing — the caller
    will surface a clear error to the user instead of a cryptic 400."""
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        return []
    try:
        raw = base64.b64decode(b64_data)
        images = convert_from_bytes(raw, dpi=120, last_page=max_pages, fmt="png")
    except Exception:
        return []
    blocks: list[dict] = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        blocks.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{img_b64}"},
        })
    return blocks


def _openai_content(text: str, binary: list[dict], provider: str = "openai") -> list[dict]:
    """Build the OpenAI-style content parts for the last user message.

    - **openai** (direct API) keeps the native `file` part for PDFs, which
      gpt-4o-mini and gpt-4o accept on Pro tier.
    - **github** and **copilot** proxies refuse the `file` part with the
      cryptic ``type has to be either 'image_url' or 'text'`` 400. For them
      we run a fallback chain: pypdf → text part, then pdf2image → image
      parts when the PDF is scanned (no extractable text).
    """
    parts: list[dict] = [{"type": "text", "text": text}]
    for b in binary:
        data_uri = f"data:{b['mime_type']};base64,{b['data']}"
        if b["kind"] == "image":
            parts.append({"type": "image_url", "image_url": {"url": data_uri}})
            continue
        # PDF path
        if provider == "openai":
            parts.append({"type": "file", "file": {
                "filename": b["name"], "file_data": data_uri}})
            continue
        # github / copilot — fallback chain
        extracted = _pypdf_extract_text(b["data"])
        if extracted and len(extracted) >= _PDF_FALLBACK_MIN_TEXT_CHARS:
            parts.append({"type": "text", "text": (
                f"\n\n[Pièce jointe PDF — `{b['name']}` — texte extrait via pypdf "
                f"({len(extracted)} caractères, le provider ne supporte pas le PDF natif)]\n\n"
                f"```\n{extracted}\n```"
            )})
            continue
        # Scanned PDF (no extractable text) → render pages as images
        image_blocks = _pdf_to_image_blocks(b["data"])
        if image_blocks:
            parts.append({"type": "text", "text": (
                f"\n\n[Pièce jointe PDF — `{b['name']}` — converti en {len(image_blocks)} "
                f"image(s) via pdf2image (PDF scanné, sans texte extractible)]"
            )})
            parts.extend(image_blocks)
        else:
            parts.append({"type": "text", "text": (
                f"\n\n[Pièce jointe PDF — `{b['name']}` — IMPOSSIBLE À LIRE : "
                f"le provider {provider} ne supporte pas les PDFs en natif, "
                f"pypdf n'a rien extrait, et pdf2image/poppler n'est pas disponible. "
                f"Installez `pdf2image` + `poppler-utils` ou utilisez Claude/Gemini.]"
            )})
    return parts


def _gemini_parts(text: str, binary: list[dict]) -> list:
    # Gemini accepts a list of parts where each part is a plain string or an
    # inline-data mapping {"mime_type", "data": bytes}.
    parts: list = [text]
    for b in binary:
        parts.append({"mime_type": b["mime_type"], "data": base64.b64decode(b["data"])})
    return parts


def apply_provider_attachments(messages: list[dict], provider: str) -> list[dict]:
    """Rewrite the last user message into *provider*'s native multimodal format.

    No-op when the last message carries no binary attachments. The private
    ``_attachments`` key is always stripped from the returned message so it is
    never sent to a provider API.
    """
    if not messages:
        return messages
    last = messages[-1]
    binary = last.get("_attachments")
    if not binary:
        return messages

    text = last.get("content") or ""
    if provider == "claude":
        content: object = _claude_content(text, binary)
    elif provider in _OPENAI_FAMILY:
        content = _openai_content(text, binary, provider=provider)
    elif provider == "gemini":
        content = _gemini_parts(text, binary)
    else:
        # Unknown provider: keep the text turn, drop the binary attachments.
        content = text

    patched = list(messages)
    patched[-1] = {**{k: v for k, v in last.items() if k != "_attachments"},
                   "content": content}
    return patched
