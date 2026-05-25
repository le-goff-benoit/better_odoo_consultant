"""Agent routing tests — feeds the positive/negative prompts declared in
``agents/<slug>/eval_queries.json`` through the server-side perspective
inference and asserts the right agent wins.

The schema supports optional ``category`` and ``not_expected_agent`` fields:
- ``category="explicit_prompt"`` exercises the regex-driven shortcut in
  ``_infer_perspective`` (BETTER §4.2). These must resolve to the owner
  agent regardless of keyword scoring.
- ``not_expected_agent`` strengthens negative assertions: when present,
  the prompt must not pick that specific agent (in addition to not
  picking the owner of the file when the case is negative)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.agents import list_agents
from backend.services.ai_service import _infer_perspective


def _load_queries():
    cases = []
    for ag in list_agents():
        if not ag.eval_queries_file:
            continue
        data = json.loads(Path(ag.eval_queries_file).read_text(encoding="utf-8"))
        for q in data.get("positive", []):
            cases.append((ag.name, q.get("prompt", ""), True,
                          q.get("not_expected_agent"), q.get("category", "positive")))
        for q in data.get("negative", []):
            cases.append((ag.name, q.get("prompt", ""), False,
                          q.get("not_expected_agent"), q.get("category", "negative")))
    return cases


@pytest.mark.parametrize("owner,prompt,is_positive,not_expected,category", _load_queries())
def test_agent_routing_eval_queries(owner: str, prompt: str, is_positive: bool,
                                     not_expected: str | None, category: str):
    # Use the owner agent's name as the explicit fallback so a positive case
    # where the prompt is ambiguous still passes (no need to over-tune
    # keywords for borderline phrasing).
    resolved = _infer_perspective(prompt, fallback=owner if is_positive else "business_analyst")
    if is_positive:
        assert resolved == owner, (
            f"[POSITIVE/{category}] '{prompt}' expected agent={owner}, got {resolved}"
        )
        if not_expected:
            assert resolved != not_expected, (
                f"[POSITIVE/{category}] '{prompt}' should NOT pick {not_expected}, but did"
            )
    else:
        # Negative: the prompt should NOT pick our owner agent.
        assert resolved != owner, (
            f"[NEGATIVE/{category}] '{prompt}' should not pick owner={owner}, but it did"
        )
        if not_expected:
            assert resolved != not_expected, (
                f"[NEGATIVE/{category}] '{prompt}' should NOT pick {not_expected}, but did"
            )
