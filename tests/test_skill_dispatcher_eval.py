"""Sanity checks for the unified skill-dispatcher eval harness.

Mirrors the role ``test_agent_response_eval.py`` plays for the agent loop:
ensures the harness loads every shipped routing case, scores ≥ a sane
baseline, and reports the new diagnostic dimensions (paraphrase accuracy,
confusion matrix, by-split breakdown).
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts.quality_eval import run_skill_dispatcher_eval as eval_runner


def test_dispatcher_eval_loads_curated_and_per_skill():
    cases = eval_runner.load_dataset()
    sources = {c.source for c in cases}
    assert "curated" in sources
    assert any(s != "curated" for s in sources), "no per-skill eval_queries.json loaded"
    # Stable split must always cover the three tranches.
    splits = {c.split for c in cases}
    assert splits == {"train", "dev", "test"}


def test_dispatcher_eval_passes_baseline(tmp_path):
    report = eval_runner.run()
    summary = report["summary"]
    # The dispatcher must keep its on-disk corpus green; if this fails the
    # culprit is either a real regression in `_select_skill_playbooks` or
    # someone added a case the dispatcher cannot satisfy yet (mark it xfail).
    assert summary["total"] > 250
    assert summary["positive_accuracy"] >= 0.97, summary
    assert summary["negative_accuracy"] >= 0.97, summary
    # Paraphrases live on a curated subset; if we ship any, they must pass.
    if summary["paraphrase_total"]:
        assert summary["paraphrase_accuracy"] >= 0.90, summary

    # Confusion matrix structure is always emitted, even when empty.
    assert "confusion_matrix" in summary
    assert "top_confusions" in summary
    assert isinstance(summary["by_split"], dict) and set(summary["by_split"].keys()) <= {"train", "dev", "test"}

    md = eval_runner.build_report(summary, report["results"])
    assert "Skill Dispatcher Eval Report" in md
    assert "## By Split" in md
    assert "## Top confusions" in md


def test_xfail_cases_are_excluded_from_scoring():
    """A case carrying ``xfail`` must not bring the accuracy down. The
    eval runner already skips them; this test pins that invariant in case
    someone refactors ``_stats`` later."""
    fake_results = [
        {"ok": True, "should_trigger": True, "paraphrase_total": 0, "paraphrase_ok": 0, "xfail": None},
        {"ok": False, "should_trigger": True, "paraphrase_total": 0, "paraphrase_ok": 0, "xfail": "known weakness"},
    ]
    stats = eval_runner._stats(fake_results)
    assert stats["total"] == 1
    assert stats["accuracy"] == 1.0
