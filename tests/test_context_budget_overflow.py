"""Defensive tests for the context-budget packer.

The runtime assembles a Markdown system prompt from many sources (profiles,
release notes, routed skill playbooks, auto-loaded references, priority
blocks). Two budget guarantees protect against context rot and provider
413/overflow errors:

1. ``CONTEXT_BUDGET_CHARS`` (32 k) — soft target for the routed sections.
2. ``MAX_CONTEXT_CHARS`` (36 k) — hard ceiling for the final assembled string.

These tests pin those budgets so a regression in ``_fit_context_budget`` or
``load_context_for_prompt`` surfaces immediately, instead of failing at the
provider boundary with an opaque "too many tokens" error.
"""

from __future__ import annotations

from backend.core.context_constants import (
    CONTEXT_BUDGET_CHARS,
    MAX_CONTEXT_CHARS,
)
from backend.services.context_service import (
    _fit_context_budget,
    clear_context_cache,
    last_context_trace,
    load_context_for_prompt,
)


def _fat_section(title: str, kilobytes: int) -> tuple[str, str]:
    return (title, ("x" * 1024 + "\n") * kilobytes)


def test_fit_budget_drops_sections_that_do_not_fit():
    """When total size exceeds the budget, ``_fit_context_budget`` keeps the
    earliest sections that fit and drops the rest — it must never return a
    list whose rendered size exceeds the budget."""
    sections = [
        _fat_section("A", 8),    # ~8 kB
        _fat_section("B", 8),    # ~8 kB
        _fat_section("C", 20),   # ~20 kB → overflow
        _fat_section("D", 5),    # ~5 kB → also dropped since C fills/truncates
    ]
    budget = 20_000
    fitted = _fit_context_budget(sections, budget=budget)

    rendered = "\n\n---\n\n".join(f"## {t}\n\n{c.strip()}" for t, c in fitted)
    assert len(rendered) <= budget, (
        f"packer returned {len(rendered)} chars > budget {budget}"
    )
    titles = [t for t, _ in fitted]
    # A and B always fit. C overflowing means D must be dropped (packer breaks
    # on first overflow).
    assert "A" in titles and "B" in titles
    assert "D" not in titles


def test_fit_budget_truncates_last_overflowing_section_with_marker():
    """The last section that *partially* fits must be truncated with a clear
    marker so the LLM sees the cut, not silently lose content."""
    sections = [
        _fat_section("A", 5),
        _fat_section("B", 50),   # massive — gets truncated to fill the remaining budget
    ]
    budget = 15_000
    fitted = _fit_context_budget(sections, budget=budget)

    rendered = "\n\n---\n\n".join(f"## {t}\n\n{c.strip()}" for t, c in fitted)
    assert len(rendered) <= budget
    # The truncated section keeps its title and ends with the marker.
    assert any(content.rstrip().endswith("section de contexte tronquée par le routeur...]") for _, content in fitted), \
        "expected the truncation marker on the last overflowing section"


def test_fit_budget_keeps_core_sections_first_even_when_listed_last():
    """``core_sections`` is the seatbelt for must-have content (localization,
    technical complexity). It must survive even when domain sections come first
    in the input list and would otherwise eat the budget."""
    sections = [
        _fat_section("noise_1", 8),
        _fat_section("noise_2", 8),
        ("CORE_LOCALIZATION", "important localization data\n" * 5),
    ]
    budget = 12_000
    fitted = _fit_context_budget(sections, budget=budget, core_sections={"CORE_LOCALIZATION"})
    titles = [t for t, _ in fitted]
    assert "CORE_LOCALIZATION" == titles[0], \
        f"core section should be first, got order {titles}"


def test_load_context_truncates_oversized_priority_block_with_trace_event():
    """A single priority block larger than ``_MAX_PRIORITY_BLOCK_CHARS`` (6 k)
    is truncated and the truncation is recorded in the context trace."""
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Question simple",
        perspective="technical",
        priority_blocks=["## Bloc énorme\n\n" + ("x" * 10_000)],
        run_id="run-budget-overflow-1",
    )
    trace = last_context_trace()
    truncations = [e for e in trace if e.get("type") == "priority_block_truncated"]
    assert truncations, "expected a priority_block_truncated event in the trace"
    event = truncations[0]
    assert event["run_id"] == "run-budget-overflow-1"
    assert event["original_chars"] > event["capped_chars"]
    assert event["capped_chars"] == 6_000


def test_load_context_assembly_stays_under_max_ceiling():
    """End-to-end: even with many priority blocks and an aggressive prompt,
    the final assembled context must stay under MAX_CONTEXT_CHARS — that is
    the hard contract for the provider call."""
    clear_context_cache()
    # Five priority blocks that each *individually* fit but together claim
    # roughly half the budget — combined with routed playbooks this exercises
    # the routed_budget = total - blocks subtraction path.
    blocks = [f"## Block {i}\n\n" + ("y" * 4_000) for i in range(5)]
    assembled = load_context_for_prompt(
        "18.0",
        user_prompt=(
            "Analyse cette vue form de sale.order, vérifie les droits d'accès, "
            "lis le module custom et donne-moi un KPI par statut"
        ),
        perspective="technical",
        priority_blocks=blocks,
        run_id="run-budget-overflow-2",
    )
    assert len(assembled) <= MAX_CONTEXT_CHARS, (
        f"assembled context {len(assembled)} chars > hard ceiling {MAX_CONTEXT_CHARS}"
    )


def test_budget_constants_remain_within_expected_envelope():
    """Guardrail on the constants themselves. If someone bumps these without
    a conscious decision (memory_user_role.md test exists for that), this
    test fires and forces the conversation. Adjust the bounds intentionally."""
    assert 20_000 <= CONTEXT_BUDGET_CHARS <= 48_000, CONTEXT_BUDGET_CHARS
    assert MAX_CONTEXT_CHARS >= CONTEXT_BUDGET_CHARS + 2_000, (
        f"MAX_CONTEXT_CHARS {MAX_CONTEXT_CHARS} should leave headroom over "
        f"CONTEXT_BUDGET_CHARS {CONTEXT_BUDGET_CHARS}"
    )
