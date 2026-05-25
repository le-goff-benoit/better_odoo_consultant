"""Integrity checks for the agent registry (agents/<slug>/AGENT.md).

Mirrors the role test_skill_registry_integrity.py plays for skills: ensures
the on-disk catalog parses cleanly, that there are no duplicate or empty
agents, and that exactly one agent is marked default."""
from __future__ import annotations

import pytest

from backend.agents import list_agents, list_agent_issues, reload_agents
from backend.agents.registry import AgentRegistryIssue


@pytest.fixture(autouse=True)
def _fresh():
    reload_agents()
    yield
    reload_agents()


def test_agents_load_without_errors():
    issues = list(list_agent_issues())
    errors = [i for i in issues if i.severity == "error"]
    assert not errors, f"Agent registry errors: {errors}"


def test_at_least_the_four_builtin_agents_exist():
    names = {a.name for a in list_agents()}
    for required in ("support", "business_analyst", "architect", "developer"):
        assert required in names, f"Missing built-in agent: {required}"


def test_exactly_one_default_agent():
    defaults = [a for a in list_agents() if a.default]
    assert len(defaults) == 1, f"Expected exactly one default agent, got {[a.name for a in defaults]}"


def test_every_agent_has_label_description_color_icon():
    for ag in list_agents():
        assert ag.label and ag.label_en, f"{ag.name} missing label(s)"
        assert ag.description and ag.description_en, f"{ag.name} missing description(s)"
        assert ag.color.startswith("#") and len(ag.color) == 7, f"{ag.name} invalid color {ag.color!r}"
        assert ag.icon, f"{ag.name} missing icon"


def test_every_agent_has_system_prompt_body():
    for ag in list_agents():
        assert ag.body and len(ag.body) > 50, f"{ag.name} body too short or empty"
        assert ag.body_en and len(ag.body_en) > 50, f"{ag.name} EN body too short or empty"


def test_every_agent_has_migration_in_both_languages():
    for ag in list_agents():
        assert ag.migration_fr_file, f"{ag.name} missing migration.md"
        assert ag.migration_en_file, f"{ag.name} missing migration.en.md"


def test_every_agent_has_eval_queries():
    for ag in list_agents():
        assert ag.eval_queries_file, f"{ag.name} missing eval_queries.json"


def test_auto_keywords_have_strong_and_weak_sets():
    for ag in list_agents():
        assert ag.auto_keywords.strong, f"{ag.name} has empty 'strong' keyword set"
        assert ag.auto_keywords.weak, f"{ag.name} has empty 'weak' keyword set"


def test_preferred_skills_reference_existing_skills():
    from backend.skills.registry import SKILL_DEFINITIONS
    known = {s.name for s in SKILL_DEFINITIONS}
    for ag in list_agents():
        for skill in ag.preferred_skills:
            assert skill in known, f"{ag.name} preferred_skills references unknown skill {skill!r}"


def test_no_duplicate_agent_names_or_aliases():
    seen: dict[str, str] = {}
    for ag in list_agents():
        assert ag.name not in seen, f"Duplicate agent name {ag.name} (already used by {seen.get(ag.name)})"
        seen[ag.name] = ag.name
        for alias in ag.aliases:
            assert alias != ag.name
