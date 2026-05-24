"""Default Markdown playbooks for application skills.

Bodies now live alongside their skill folder (``skills/<slug>/SKILL.md``).
This module re-exports them under the legacy ``skill-<slug>.md`` keys so
context_service and the context-file API keep working unchanged.
"""

from __future__ import annotations

from .registry import SKILL_DEFINITIONS


def _build_defaults() -> dict[str, str]:
    out: dict[str, str] = {}
    for skill in SKILL_DEFINITIONS:
        body = (skill.body or "").strip()
        if not body:
            continue
        out[skill.context_file] = body + "\n"
    return out


SKILL_CONTEXT_DEFAULTS: dict[str, str] = _build_defaults()
SKILL_CONTEXT_DEFAULTS_EN: dict[str, str] = SKILL_CONTEXT_DEFAULTS
