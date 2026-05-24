"""ToolContext — infrastructure partagée transmise à chaque handler de skill.

Construit par le dispatcher ``_run_tool`` à partir des paramètres reçus par
``stream_chat``. Les handlers consomment ce contexte au lieu de recevoir 5
arguments séparés.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .odoo_client import OdooClient


@dataclass
class ToolContext:
    odoo: Optional["OdooClient"]
    source_path: Optional[str]      # ~/.odoo-consultant/sources/<version>
    repo_path: Optional[str]        # ~/.odoo-consultant/repos/<profile>/<env>
    target_path: Optional[str]      # version cible (migration)
    loop: asyncio.AbstractEventLoop
    # v0.64 — Session key under which `attachment_store` publishes the
    # validated binary attachments for the current chat turn. Used by the
    # ``attachment_handler`` skill tools to look up PDFs/images by filename.
    session_id: Optional[str] = None
