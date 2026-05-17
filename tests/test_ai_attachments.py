import pytest
from fastapi import HTTPException

from odoo_consultant_portal.services.attachment_service import (
    ChatAttachment, inject_attachments,
)


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
    assert messages[0]["content"] == "Résume ce fichier"


def test_reject_unsupported_attachment_format():
    messages = [{"role": "user", "content": "Analyse"}]
    attachments = [
        ChatAttachment(
            name="table.xlsx",
            mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size=100,
            kind="text",
            text="data",
        )
    ]

    with pytest.raises(HTTPException) as exc:
        inject_attachments(messages, attachments)

    assert exc.value.status_code == 400
    assert "Format non supporté" in exc.value.detail
