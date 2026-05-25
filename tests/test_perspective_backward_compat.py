"""Ensure legacy ``perspective`` values (functional/technical) keep resolving
to the new agent names so older payloads and stored configs don't break."""
from __future__ import annotations

from backend.services.ai_service import _normalize_perspective
from backend.agents import resolve_agent


def test_legacy_functional_alias_resolves_to_business_analyst():
    assert _normalize_perspective("functional") == "business_analyst"
    assert resolve_agent("functional").name == "business_analyst"


def test_legacy_technical_alias_resolves_to_developer():
    assert _normalize_perspective("technical") == "developer"
    assert resolve_agent("technical").name == "developer"


def test_unknown_perspective_defaults_to_developer():
    assert _normalize_perspective("not-a-thing") == "developer"
    assert _normalize_perspective(None) == "developer"
    assert _normalize_perspective("") == "developer"


def test_known_canonical_values_pass_through():
    for name in ("support", "business_analyst", "architect", "developer"):
        assert _normalize_perspective(name) == name
