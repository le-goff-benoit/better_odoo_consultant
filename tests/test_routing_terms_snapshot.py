"""Prevent silent drift between backend keyword-routing constants and the
frontend copies in ``aiContext.ts``. When the frontend predicts which context
files will be loaded (for the panel display), it must agree with what the
backend actually loads — otherwise the user sees a pill that the LLM never got
(or misses one it did).

The test parses the frontend TypeScript file with a small regex (no JS engine)
and compares the JS array literals to the Python tuples."""

from __future__ import annotations

import re
from pathlib import Path

from backend.services.context_service import (
    _DEV_TERMS,
    _STUDIO_TERMS,
)

_FRONTEND_FILE = (
    Path(__file__).resolve().parents[1] / "frontend" / "src" / "utils" / "aiContext.ts"
)


def _extract_const_array(source: str, name: str) -> list[str]:
    """Pull the string entries of ``const NAME = [...]`` out of a TS file."""
    match = re.search(rf"const\s+{re.escape(name)}\s*=\s*\[(.*?)\]", source, re.DOTALL)
    if not match:
        raise AssertionError(f"Constant {name} not found in {_FRONTEND_FILE}")
    body = match.group(1)
    # Strip line comments inside the array literal so they don't pollute matches.
    body = re.sub(r"//[^\n]*", "", body)
    # Capture every single- or double-quoted string entry.
    return re.findall(r"['\"]([^'\"]+)['\"]", body)


def test_studio_terms_synced_between_backend_and_frontend():
    src = _FRONTEND_FILE.read_text(encoding="utf-8")
    frontend = set(_extract_const_array(src, "STUDIO_TERMS"))
    backend = set(_STUDIO_TERMS)
    missing_in_front = backend - frontend
    extra_in_front = frontend - backend
    assert not missing_in_front, (
        f"STUDIO_TERMS present in backend but missing in frontend: {missing_in_front}"
    )
    assert not extra_in_front, (
        f"STUDIO_TERMS present in frontend but missing in backend: {extra_in_front}"
    )


def test_dev_terms_synced_between_backend_and_frontend():
    src = _FRONTEND_FILE.read_text(encoding="utf-8")
    frontend = set(_extract_const_array(src, "DEV_FILE_TERMS"))
    backend = set(_DEV_TERMS)
    missing_in_front = backend - frontend
    extra_in_front = frontend - backend
    assert not missing_in_front, (
        f"DEV_TERMS present in backend but missing in frontend: {missing_in_front}"
    )
    assert not extra_in_front, (
        f"DEV_TERMS present in frontend but missing in backend: {extra_in_front}"
    )
