"""Tests for the eager reference loader (``select_auto_load_refs``).

Each SKILL.md can declare ``references_auto_load`` entries: reference files
that the runtime eagerly injects into a priority block when one of their
``triggers`` substrings appears in the user prompt. This is the main lever
for progressive disclosure — every entry asserts:

1. A prompt containing one of the declared triggers loads that reference.
2. A prompt with none of the triggers does NOT load it (no spurious context).
3. The trace records the load with ``type=reference_auto_loaded``.
"""

from __future__ import annotations

import yaml
from pathlib import Path

import pytest

from backend.services.context_service import (
    clear_context_cache,
    last_context_trace,
    load_context_for_prompt,
    select_auto_load_refs,
)


_SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"


def _frontmatter(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8").split("---", 2)[1]) or {}


def _collect_auto_load_specs() -> list[tuple[str, str, str, list[str]]]:
    """Return ``(skill_folder, skill_name, ref_file, triggers)`` for every
    declared auto-load entry."""
    specs: list[tuple[str, str, str, list[str]]] = []
    for path in sorted(_SKILLS_DIR.glob("*/SKILL.md")):
        meta = _frontmatter(path)
        for entry in meta.get("references_auto_load") or []:
            triggers = [t for t in (entry.get("triggers") or []) if t]
            if not triggers:
                continue
            specs.append((path.parent.name, meta["name"], entry["file"], triggers))
    return specs


_SPECS = _collect_auto_load_specs()


def _pick_trigger(triggers: list[str]) -> str:
    """Choose a trigger long enough to be unambiguous when embedded in a
    sentence (avoids 3-char tokens like ``[IMP]`` matching everywhere)."""
    sized = sorted(triggers, key=len, reverse=True)
    return sized[0]


@pytest.mark.parametrize(
    "skill_folder, skill_name, ref_file, triggers",
    _SPECS,
    ids=[f"{folder}::{ref}" for folder, _, ref, _ in _SPECS],
)
def test_trigger_loads_its_reference(skill_folder, skill_name, ref_file, triggers):
    trigger = _pick_trigger(triggers)
    prompt = f"Question sur {trigger} dans ce projet."
    block = select_auto_load_refs(prompt)
    assert block is not None, (
        f"[{skill_folder}] trigger {trigger!r} should produce an auto-load block"
    )
    assert f"{skill_name}/{ref_file}" in block, (
        f"[{skill_folder}] expected reference {skill_name}/{ref_file} in block, got:\n{block[:400]}"
    )


@pytest.mark.parametrize(
    "skill_folder, skill_name, ref_file, triggers",
    _SPECS,
    ids=[f"{folder}::{ref}" for folder, _, ref, _ in _SPECS],
)
def test_unrelated_prompt_does_not_load_reference(skill_folder, skill_name, ref_file, triggers):
    """A neutral prompt containing none of the declared triggers must NOT
    eagerly load the reference. The whole point of progressive disclosure is
    to avoid injecting every reference on every turn."""
    # Use a generic prompt that is unlikely to match any auto-load trigger.
    prompt = "Bonjour, peux-tu me dire la date du jour ?"
    block = select_auto_load_refs(prompt)
    if block is None:
        return  # nothing loaded — contract satisfied
    assert f"{skill_name}/{ref_file}" not in block, (
        f"[{skill_folder}] reference {ref_file} loaded for an unrelated prompt:\n{block[:400]}"
    )


def test_trigger_records_a_trace_event_with_run_id():
    """When a trigger matches during ``load_context_for_prompt``, the trace
    must include a ``reference_auto_loaded`` event tagged with the run id —
    that is what the SSE channel surfaces to the UI for observability."""
    # Pick a trigger that is uniquely associated with a single reference.
    # ``xpath`` is in ``odoo_inspect_view`` / ``view_inheritance_primer.md``.
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Explique le mécanisme d'xpath dans les vues héritées",
        perspective="technical",
        run_id="run-autoload-trace",
    )
    trace = last_context_trace()
    autoloads = [e for e in trace if e.get("type") == "reference_auto_loaded"]
    assert autoloads, f"no reference_auto_loaded event in trace: {trace}"
    assert any(e.get("run_id") == "run-autoload-trace" for e in autoloads)
    # The fired event must point at the inheritance primer.
    assert any(
        e.get("skill") == "odoo_inspect_view"
        and e.get("filename") == "view_inheritance_primer.md"
        for e in autoloads
    ), f"expected view_inheritance_primer.md in autoloads: {autoloads}"


def test_disabled_skill_does_not_auto_load_its_references():
    """When the user disables a skill, its auto-load references must stay
    out of the context — otherwise the toggle is a lie."""
    prompt = "Explique le mécanisme d'xpath dans les vues héritées"
    enabled = select_auto_load_refs(prompt)
    assert enabled is not None and "view_inheritance_primer.md" in enabled

    disabled = select_auto_load_refs(prompt, disabled_tools=["odoo_inspect_view"])
    if disabled is None:
        return
    assert "view_inheritance_primer.md" not in disabled, (
        f"disabled skill leaked its reference into context:\n{disabled[:400]}"
    )


def test_auto_load_per_file_cap_truncates_long_reference():
    """``_AUTO_LOAD_REF_MAX_PER_FILE`` caps each loaded reference to keep
    the priority block bounded. The trace must surface that capping so the
    team can tell whether they are reading a partial reference."""
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Explique le mécanisme d'xpath dans les vues héritées",
        perspective="technical",
        run_id="run-autoload-cap",
    )
    autoloads = [e for e in last_context_trace() if e.get("type") == "reference_auto_loaded"]
    # The event always carries original_chars and capped_chars so any future
    # cap regression (e.g. someone doubles the cap silently) is visible.
    # The truncated body has a short "[…]" marker appended after the cap,
    # so the rendered ``chars`` overshoots the cap by a handful of bytes
    # — give a 16-char tolerance for the marker plus any rstrip whitespace.
    for event in autoloads:
        assert "original_chars" in event and "capped_chars" in event, event
        assert event["chars"] <= event["capped_chars"] + 16, event
