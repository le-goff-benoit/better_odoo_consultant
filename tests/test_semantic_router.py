"""Tests for the lightweight TF-IDF semantic fallback (P1.1)."""
from __future__ import annotations

import os
import pytest

from backend.services import semantic_router as sr
from backend.services.context_service import (
    _select_skill_playbooks,
    last_selected_skill_names,
    last_skill_route_candidates,
    last_skill_route_confidence,
)


def setup_module(module):  # noqa: D401 — pytest hook
    """Ensure the index is built against the current skill catalogue."""
    os.environ["BETTER_SEMANTIC_ROUTER"] = "1"
    sr.rebuild_index()


def test_index_builds_and_is_enabled():
    assert sr.is_enabled() is True


def test_tokenizer_drops_short_tokens_and_stopwords():
    toks = sr._tokenize("Le PoS et la commande client en français")
    # Stopwords ("le", "et", "la", "en") and 1-letter junk excluded.
    assert "le" not in toks
    assert "et" not in toks
    assert "pos" in toks
    assert "commande" in toks


def test_semantic_fallback_returns_relevant_hits_for_count_paraphrase():
    hits = sr.semantic_fallback("how many records are there in this model")
    assert hits, "expected at least one hit"
    names = [h.name for h in hits]
    assert any("count" in n or "query" in n or "aggregate" in n for n in names), names


def test_should_run_semantic_gates_on_low_lexical_score():
    assert sr.should_run_semantic(0) is True
    assert sr.should_run_semantic(40) is True
    assert sr.should_run_semantic(60) is False
    assert sr.should_run_semantic(100) is False


def test_dispatcher_exposes_confidence_summary():
    _select_skill_playbooks("compter les commandes de vente en draft", migration=False)
    conf = last_skill_route_confidence()
    assert conf, "confidence side-channel must be populated"
    assert conf["level"] in {"high", "medium", "low"}
    assert isinstance(conf["top_score"], int)
    assert isinstance(conf["selected"], list)


def test_disable_via_env_var(monkeypatch):
    monkeypatch.setenv("BETTER_SEMANTIC_ROUTER", "0")
    # Force a fresh index that reads the env var.
    fresh = sr._SemanticIndex()
    fresh.build([])
    assert fresh.enabled() is False


def test_semantic_does_not_override_strong_lexical_match():
    # "compter" matches odoo_count_records via keywords with score 60 — the
    # semantic fallback must NOT fire at all because the lexical layer
    # already scored above 60.
    _select_skill_playbooks("compter les factures en draft", migration=False)
    cands = last_skill_route_candidates()
    semantic_hits = [c for c in cands if "semantic-fallback" in str(c.get("reason", ""))]
    assert not semantic_hits, f"semantic should be gated by strong lexical match, got: {semantic_hits}"
