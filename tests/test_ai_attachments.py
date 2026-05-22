import base64
import io

import pytest
from fastapi import HTTPException

from odoo_consultant_portal.services.attachment_service import (
    ChatAttachment, apply_provider_attachments, inject_attachments,
)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


# ── Text attachments ─────────────────────────────────────────────


def test_inject_text_attachment_into_last_user_message():
    messages = [{"role": "user", "content": "Résume ce fichier"}]
    attachments = [
        ChatAttachment(
            name="notes.md",
            mime_type="text/markdown",
            size=18,
            kind="text",
            text="# Notes\n\nImportant",
        )
    ]

    patched = inject_attachments(messages, attachments)

    assert patched[0]["content"].startswith("Résume ce fichier")
    assert "## Pièce jointe: notes.md" in patched[0]["content"]
    assert "# Notes" in patched[0]["content"]
    assert messages[0]["content"] == "Résume ce fichier"  # original untouched


def test_reject_unsupported_attachment_format():
    messages = [{"role": "user", "content": "Analyse"}]
    attachments = [
        ChatAttachment(name="archive.zip", mime_type="application/zip",
                       size=100, kind="text", text="data")
    ]

    with pytest.raises(HTTPException) as exc:
        inject_attachments(messages, attachments)

    assert exc.value.status_code == 400
    assert "Format non supporté" in exc.value.detail


def test_extended_text_extensions_accept_po_file():
    messages = [{"role": "user", "content": "Vérifie la traduction"}]
    attachments = [
        ChatAttachment(name="fr.po", mime_type="text/x-gettext", size=30,
                       kind="text", text='msgid "Hello"\nmsgstr "Bonjour"')
    ]

    patched = inject_attachments(messages, attachments)

    assert "## Pièce jointe: fr.po" in patched[0]["content"]
    assert "Bonjour" in patched[0]["content"]


# ── Image attachments ────────────────────────────────────────────


def test_image_attachment_stashed_then_formatted_per_provider():
    messages = [{"role": "user", "content": "Décris la capture"}]
    img = ChatAttachment(name="shot.png", mime_type="image/png", size=12,
                         kind="image", content_base64=_b64(b"\x89PNG fake bytes"))

    patched = inject_attachments(messages, [img])
    # Binary attachments are stashed; the content stays a plain string.
    assert isinstance(patched[-1]["content"], str)
    assert patched[-1]["_attachments"][0]["kind"] == "image"

    claude = apply_provider_attachments(patched, "claude")[-1]
    assert "_attachments" not in claude  # private key never reaches the API
    assert claude["content"][0]["type"] == "text"
    assert claude["content"][1]["type"] == "image"
    assert claude["content"][1]["source"]["media_type"] == "image/png"

    openai = apply_provider_attachments(patched, "openai")[-1]["content"]
    assert openai[1]["type"] == "image_url"
    assert openai[1]["image_url"]["url"].startswith("data:image/png;base64,")

    gemini = apply_provider_attachments(patched, "gemini")[-1]["content"]
    assert isinstance(gemini[0], str)
    assert gemini[1]["mime_type"] == "image/png"
    assert isinstance(gemini[1]["data"], bytes)


def test_reject_image_with_invalid_base64():
    messages = [{"role": "user", "content": "x"}]
    bad = ChatAttachment(name="shot.png", mime_type="image/png", size=5,
                         kind="image", content_base64="!!!not-base64!!!")

    with pytest.raises(HTTPException) as exc:
        inject_attachments(messages, [bad])

    assert exc.value.status_code == 400


# ── PDF attachments ──────────────────────────────────────────────


def test_pdf_attachment_formatted_as_native_document():
    messages = [{"role": "user", "content": "Analyse le devis"}]
    pdf = ChatAttachment(name="devis.pdf", mime_type="application/pdf", size=20,
                         kind="pdf", content_base64=_b64(b"%PDF-1.4 fake"))

    patched = inject_attachments(messages, [pdf])

    claude = apply_provider_attachments(patched, "claude")[-1]["content"]
    assert claude[1]["type"] == "document"
    assert claude[1]["source"]["media_type"] == "application/pdf"

    openai = apply_provider_attachments(patched, "openai")[-1]["content"]
    assert openai[1]["type"] == "file"
    assert openai[1]["file"]["filename"] == "devis.pdf"

    gemini = apply_provider_attachments(patched, "gemini")[-1]["content"]
    assert gemini[1]["mime_type"] == "application/pdf"


# ── Office (spreadsheet) attachments ─────────────────────────────


def test_office_xlsx_inlined_as_markdown_table():
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Clients"
    ws.append(["Nom", "Ville"])
    ws.append(["ACME", "Genève"])
    buf = io.BytesIO()
    wb.save(buf)
    raw = buf.getvalue()

    messages = [{"role": "user", "content": "Analyse l'export"}]
    xls = ChatAttachment(
        name="export.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size=len(raw), kind="office", content_base64=_b64(raw),
    )

    patched = inject_attachments(messages, [xls])
    content = patched[-1]["content"]

    assert "export.xlsx" in content
    assert "Feuille : Clients" in content
    assert "ACME" in content and "Genève" in content
    # Spreadsheets are inlined as text — no binary block to format later.
    assert "_attachments" not in patched[-1]


# ── apply_provider_attachments edge cases ────────────────────────


def test_apply_provider_attachments_noop_without_binary():
    messages = [{"role": "user", "content": "juste du texte"}]
    assert apply_provider_attachments(messages, "claude") is messages


def test_apply_provider_attachments_unknown_provider_drops_binary():
    messages = [{"role": "user", "content": "x"}]
    img = ChatAttachment(name="shot.png", mime_type="image/png", size=8,
                         kind="image", content_base64=_b64(b"fakeimage"))
    patched = inject_attachments(messages, [img])

    result = apply_provider_attachments(patched, "mystery")[-1]
    assert isinstance(result["content"], str)
    assert "_attachments" not in result
