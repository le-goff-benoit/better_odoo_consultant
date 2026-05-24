"""In-memory session store for attachments referenced by skill tools.

The chat handler pushes the validated binary attachments here when a request
arrives; the ``attachment_handler`` skill tools (extract_pdf_text, pdf_to_images,
compare_documents) read from this store by filename.

The store is per-process and bounded — the OS attachment cap is already
enforced upstream (`ATTACHMENT_MAX_FILES`, `ATTACHMENT_MAX_BYTES`). Each
request publishes its attachments under a synthetic ``session_id`` and pops
them when the chat ends. If a session_id is reused (long-running chat), the
latest publish wins.
"""

from __future__ import annotations

import base64
import threading
from contextvars import ContextVar
from typing import Optional

_STORE: dict[str, list[dict]] = {}
_LOCK = threading.Lock()

# Per-task pointer to the currently active chat session so skill handlers can
# look up attachments without plumbing a session_id down through every layer.
_CURRENT_SESSION: ContextVar[Optional[str]] = ContextVar("attachment_session", default=None)


def set_current_session(session_id: Optional[str]) -> None:
    _CURRENT_SESSION.set(session_id)


def current_session() -> Optional[str]:
    return _CURRENT_SESSION.get()


def publish(session_id: str, attachments: list[dict]) -> None:
    """Replace the attachments registered for ``session_id``.

    ``attachments`` is the same list of dicts that ``inject_attachments``
    stashes on ``message["_attachments"]`` — i.e. ``{kind, name, mime_type, data}``
    where ``data`` is canonical base64.
    """
    if not session_id:
        return
    with _LOCK:
        if attachments:
            _STORE[session_id] = list(attachments)
        else:
            _STORE.pop(session_id, None)


def clear(session_id: str) -> None:
    with _LOCK:
        _STORE.pop(session_id, None)


def get(session_id: str, name: str) -> Optional[dict]:
    """Return the attachment dict matching ``name`` (exact), or None."""
    if not session_id:
        return None
    with _LOCK:
        for att in _STORE.get(session_id, []):
            if att.get("name") == name:
                return att
    return None


def list_names(session_id: str) -> list[str]:
    with _LOCK:
        return [a.get("name", "") for a in _STORE.get(session_id, [])]


def get_bytes(session_id: str, name: str) -> Optional[bytes]:
    """Convenience: return the decoded bytes of an attachment, or None."""
    att = get(session_id, name)
    if not att or not att.get("data"):
        return None
    try:
        return base64.b64decode(att["data"])
    except Exception:
        return None
