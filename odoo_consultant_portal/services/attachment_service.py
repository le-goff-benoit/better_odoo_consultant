"""Shared document-attachment handling for the AI-powered tools.

The Assistant, the Migration tool and the Creator all let the consultant
attach PDF or text documents to a request. This module turns those uploads
into Markdown appended to the user turn, so every tool shares one
implementation and one set of limits.
"""

import base64
import io
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel

ATTACHMENT_MAX_FILES = 5
ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
ATTACHMENT_MAX_CHARS = 40_000
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml", ".py", ".log"}


class ChatAttachment(BaseModel):
    name: str
    mime_type: str = ""
    size: int
    kind: str  # "text" | "pdf"
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


def _extract_pdf_attachment(att: ChatAttachment) -> str:
    if not att.content_base64:
        raise HTTPException(400, f"PDF '{att.name}' vide ou illisible")
    try:
        raw = base64.b64decode(att.content_base64, validate=True)
    except Exception:
        raise HTTPException(400, f"PDF '{att.name}' invalide (base64)")
    if len(raw) > ATTACHMENT_MAX_BYTES:
        raise HTTPException(400, f"'{att.name}' dépasse la limite de 5 MB")
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                pages.append(f"### Page {idx}\n{page_text}")
    except Exception as exc:
        raise HTTPException(400, f"Impossible d'extraire le PDF '{att.name}' : {exc}")
    text = "\n\n".join(pages).strip()
    if not text:
        raise HTTPException(400, f"PDF '{att.name}' sans texte extractible (OCR non supporté en v1)")
    return text


def attachments_markdown(attachments: list[ChatAttachment]) -> str:
    """Render a list of attachments into a single Markdown block."""
    if not attachments:
        return ""
    if len(attachments) > ATTACHMENT_MAX_FILES:
        raise HTTPException(400, f"Maximum {ATTACHMENT_MAX_FILES} fichiers par message")

    sections: list[str] = []
    remaining = ATTACHMENT_MAX_CHARS
    for att in attachments:
        if att.size > ATTACHMENT_MAX_BYTES:
            raise HTTPException(400, f"'{att.name}' dépasse la limite de 5 MB")
        ext = _attachment_ext(att.name)
        if att.kind == "pdf":
            if ext != ".pdf":
                raise HTTPException(400, f"'{att.name}' n'est pas un PDF valide")
            raw_text = _extract_pdf_attachment(att)
        elif att.kind == "text":
            if ext not in TEXT_EXTENSIONS:
                raise HTTPException(400, f"Format non supporté pour '{att.name}'")
            raw_text = (att.text or "").strip()
            if not raw_text:
                raise HTTPException(400, f"'{att.name}' ne contient pas de texte exploitable")
        else:
            raise HTTPException(400, f"Type de pièce jointe inconnu pour '{att.name}'")

        text, remaining = _trim_attachment_text(raw_text, remaining)
        if not text:
            break
        sections.append(
            f"## Pièce jointe: {att.name}\n"
            f"- Type: {att.mime_type or att.kind}\n"
            f"- Taille: {att.size} octets\n\n"
            f"{text}"
        )
    if not sections:
        return ""
    return "\n\n---\n\n".join(sections)


def inject_attachments(messages: list[dict], attachments: list[ChatAttachment]) -> list[dict]:
    """Append the rendered attachments to the last user turn of *messages*."""
    md = attachments_markdown(attachments)
    if not md:
        return messages
    if not messages or messages[-1].get("role") != "user":
        raise HTTPException(400, "Les pièces jointes doivent être associées à un message utilisateur")
    patched = list(messages)
    patched[-1] = {
        **patched[-1],
        "content": (
            f"{patched[-1].get('content', '').strip()}"
            "\n\n---\n\n"
            "Utilise les pièces jointes suivantes pour répondre à la demande. "
            "Ne les mentionne que si c'est utile.\n\n"
            f"{md}"
        ).strip(),
    }
    return patched
