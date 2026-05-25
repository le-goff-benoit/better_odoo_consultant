"""Tests for the routing-feedback JSONL log (P1.3)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.services import routing_feedback as rfb


@pytest.fixture
def tmp_log(tmp_path, monkeypatch):
    log = tmp_path / "routing-feedback.jsonl"
    monkeypatch.setattr(rfb, "_LOG_FILE", log)
    monkeypatch.setattr(rfb, "_LOG_DIR", tmp_path)
    monkeypatch.delenv("BETTER_ROUTING_FEEDBACK", raising=False)
    return log


def test_log_turn_appends_one_line(tmp_log):
    rfb.log_turn(
        prompt="compter les factures",
        agent="business_analyst",
        mode="assistant",
        locale="fr",
        skills=["odoo_count_records"],
        confidence={"level": "high", "top_score": 60, "selected": ["odoo_count_records"]},
        candidates=[],
    )
    lines = tmp_log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec["agent"] == "business_analyst"
    assert rec["reformulated"] is False
    assert rec["skills"] == ["odoo_count_records"]


def test_is_reformulation_detects_common_markers():
    assert rfb.is_reformulation("non, je voulais dire factures fournisseurs")
    assert rfb.is_reformulation("plutôt les commandes")
    assert rfb.is_reformulation("actually, the sale orders")
    assert rfb.is_reformulation("Rather, the supplier list")
    assert not rfb.is_reformulation("explique-moi ce comportement")
    assert not rfb.is_reformulation("")


def test_mark_previous_as_reformulated(tmp_log):
    rfb.log_turn(prompt="a", agent="developer", mode="assistant", locale="fr", skills=[])
    assert rfb.mark_previous_as_reformulated() is True
    rec = json.loads(tmp_log.read_text(encoding="utf-8").splitlines()[-1])
    assert rec["reformulated"] is True


def test_aggregate_reports_rates(tmp_log):
    for i in range(5):
        rfb.log_turn(
            prompt=f"q{i}",
            agent="developer",
            mode="assistant",
            locale="fr",
            skills=["odoo_query_records"],
            confidence={"level": "low" if i < 2 else "high", "top_score": 25 if i < 2 else 80},
        )
    rfb.mark_previous_as_reformulated()
    summary = rfb.aggregate(limit=20)
    assert summary["count"] == 5
    assert summary["agents"] == {"developer": 5}
    assert summary["low_confidence_rate"] == pytest.approx(0.4)
    assert summary["reformulation_rate"] == pytest.approx(0.2)
    assert summary["top_reformulated_skills"][0] == ("odoo_query_records", 1)


def test_log_turn_is_a_noop_when_env_disabled(tmp_log, monkeypatch):
    monkeypatch.setenv("BETTER_ROUTING_FEEDBACK", "0")
    rfb.log_turn(prompt="x", agent="developer", mode="assistant", locale="fr", skills=[])
    assert not tmp_log.exists() or tmp_log.read_text() == ""
