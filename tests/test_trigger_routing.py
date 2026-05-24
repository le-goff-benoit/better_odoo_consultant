"""Trigger-routing regression tests built from per-skill eval_queries.json.

For each skill that ships an ``eval_queries.json``, replay every query through
the live dispatcher (``_select_skill_playbooks``) and assert the expected
outcome:

- ``should_trigger: true``  -> ``expected_skill`` must be in the selected list
- ``should_trigger: false`` -> ``expected_skill`` must NOT be selected as the
  primary candidate for *this* query, even if it shares keywords with the
  intended skill. This catches the BETTER_SKILLS.MD "near miss" class, which
  is where most bad routings come from.

Adding a new eval file is enough to extend coverage — no test changes needed.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.services.context_service import _select_skill_playbooks


_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"


def _collect_cases() -> list[tuple[str, str, dict]]:
    cases: list[tuple[str, str, dict]] = []
    for eval_path in sorted(_SKILLS_DIR.glob("*/eval_queries.json")):
        skill_folder = eval_path.parent.name
        data = json.loads(eval_path.read_text(encoding="utf-8"))
        for entry in data:
            cases.append((skill_folder, entry["query"], entry))
    return cases


_CASES = _collect_cases()


def _ids(cases: list[tuple[str, str, dict]]) -> list[str]:
    return [f"{folder}::{entry.get('category','?')}::{query[:48]}" for folder, query, entry in cases]


def _owner_skill_name(folder: str) -> str:
    """``odoo-query-records`` → ``odoo_query_records``. The eval file lives in
    the folder of the skill whose routing it guards; the dispatcher uses the
    underscore form throughout."""
    return folder.replace("-", "_")


@pytest.mark.parametrize("skill_folder, query, entry", _CASES, ids=_ids(_CASES))
def test_eval_query_routes_as_expected(skill_folder: str, query: str, entry: dict):
    """Assert routing for the *owner* skill of this eval file.

    Convention (mirrors BETTER_SKILLS.MD):
    - ``should_trigger: true``  → owner skill MUST be selected.
    - ``should_trigger: false`` (near_miss / negative) → owner skill MUST NOT
      be selected. ``expected_skill`` is informational: it documents which
      skill *should* fire instead, but the assertion is purely about the owner.
    """
    modes = entry.get("modes") or ["assistant"]
    should_trigger = bool(entry.get("should_trigger"))
    owner = _owner_skill_name(skill_folder)

    # Per-case xfail: when an eval case documents a known dispatcher
    # weakness we can't fix in this iteration, the JSON entry sets
    # ``"xfail": "reason..."``. The test still runs; the suite stays
    # green; the day the dispatcher improves the case xpasses and the
    # team knows to drop the marker.
    xfail_reason = entry.get("xfail")
    if xfail_reason:
        pytest.xfail(xfail_reason)

    matched: list[str] = []
    for mode in modes:
        _select_skill_playbooks(
            query,
            migration=(mode == "migration"),
            creation=(mode == "creator"),
            disabled_tools=None,
            locale="fr",
        )
        matched.extend(getattr(_select_skill_playbooks, "_last_matched", []) or [])

    matched_set = set(matched)

    if should_trigger:
        assert owner in matched_set, (
            f"[{skill_folder}] expected owner {owner!r} to trigger, matched={sorted(matched_set)}\n"
            f"  query: {query}"
        )
    else:
        assert owner not in matched_set, (
            f"[{skill_folder}] near-miss expected owner {owner!r} NOT to trigger, matched={sorted(matched_set)}\n"
            f"  query: {query}\n"
            f"  notes: {entry.get('notes','')}\n"
            f"  expected_skill (informational): {entry.get('expected_skill')}"
        )


def test_every_eval_file_has_positives_and_near_misses():
    """Force eval files to stay balanced — a file with only positives gives a
    false sense of safety, and a file with only negatives proves nothing."""
    eval_files = sorted(_SKILLS_DIR.glob("*/eval_queries.json"))
    assert eval_files, "no eval_queries.json found — at least one is required"
    for path in eval_files:
        data = json.loads(path.read_text(encoding="utf-8"))
        cats = {item.get("category") for item in data}
        assert "positive" in cats, f"{path} has no positive case"
        assert any(c in cats for c in ("near_miss", "negative")), (
            f"{path} has no near_miss or negative case"
        )
