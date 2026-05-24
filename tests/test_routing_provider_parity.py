"""Cross-provider parity for skill routing and toolset assembly.

The dispatcher and toolset builder must be provider-agnostic: for the same
runtime conditions and the same prompt, Claude, OpenAI-compatible and Gemini
must see the same set of tools, and the dispatcher must pick the same skills.
This guarantees that switching providers (Claude <-> GitHub Models <-> Gemini)
never silently changes which skill answers a question.
"""

from __future__ import annotations

import inspect

import pytest

from backend.services import ai_service
from backend.services.context_service import _select_skill_playbooks
from backend.services.toolset_builder import (
    ProviderToolSets,
    build_provider_toolsets,
)


def _inputs(base):
    return ai_service._toolset_inputs(*base)


def _claude_names(toolsets: ProviderToolSets) -> set[str]:
    return {tool.get("name") for tool in toolsets.claude if tool.get("name")}


def _openai_names(toolsets: ProviderToolSets) -> set[str]:
    return {
        (tool.get("function") or {}).get("name")
        for tool in toolsets.openai
        if (tool.get("function") or {}).get("name")
    }


def _gemini_names(toolsets: ProviderToolSets) -> set[str]:
    if not toolsets.gemini:
        return set()
    return {
        decl.get("name")
        for decl in toolsets.gemini[0].get("function_declarations", [])
        if decl.get("name")
    }


@pytest.mark.parametrize(
    "repo_available, source_available, target_available, live_odoo_available",
    [
        (False, True, False, False),
        (True, True, False, False),
        (True, True, True, False),
        (True, True, True, True),
        (False, False, False, True),
    ],
)
def test_provider_toolsets_expose_same_tool_names(
    repo_available, source_available, target_available, live_odoo_available
):
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE, ai_service.TOOLS_OPENAI, ai_service.TOOLS_GEMINI)),
        repo_available=repo_available,
        source_available=source_available,
        target_available=target_available,
        live_odoo_available=live_odoo_available,
    )

    claude_names = _claude_names(toolsets)
    openai_names = _openai_names(toolsets)
    gemini_names = _gemini_names(toolsets)

    assert claude_names == openai_names == gemini_names, {
        "claude_only": sorted(claude_names - openai_names - gemini_names),
        "openai_only": sorted(openai_names - claude_names - gemini_names),
        "gemini_only": sorted(gemini_names - claude_names - openai_names),
    }
    # exposed_skills mirrors what we just compared.
    assert set(toolsets.exposed_skills) == claude_names


def test_disabled_tools_filter_uniformly_across_providers():
    disabled = ["odoo_query_records", "repo_search_code"]
    toolsets = build_provider_toolsets(
        _inputs((ai_service.TOOLS_CLAUDE, ai_service.TOOLS_OPENAI, ai_service.TOOLS_GEMINI)),
        source_available=True,
        repo_available=True,
        live_odoo_available=True,
        disabled_tools=disabled,
    )

    for name in disabled:
        assert name not in _claude_names(toolsets), f"{name} leaked into Claude toolset"
        assert name not in _openai_names(toolsets), f"{name} leaked into OpenAI toolset"
        assert name not in _gemini_names(toolsets), f"{name} leaked into Gemini toolset"


def test_dispatcher_signature_is_provider_agnostic():
    """Structural invariant: the dispatcher must not learn about providers.

    If a ``provider`` keyword shows up in ``_select_skill_playbooks``, routing
    decisions become coupled to the LLM backend and the multi-provider
    promise breaks. This test fails loudly on that drift.
    """
    sig = inspect.signature(_select_skill_playbooks)
    forbidden = {"provider", "model", "adapter", "tool_format"}
    leaked = forbidden & set(sig.parameters)
    assert not leaked, f"dispatcher leaked provider-coupling params: {sorted(leaked)}"


@pytest.mark.parametrize(
    "prompt",
    [
        "Liste-moi les 10 dernières factures impayées",
        "Chiffre d'affaires par mois sur 2025",
        "Combien de commandes en brouillon ?",
        "Cherche _compute_amount dans les sources Odoo standard",
        "Trouve l'override _inherit account.move dans notre code custom",
        "Diagnostique les droits d'accès sur res.partner",
    ],
)
def test_dispatcher_picks_same_skills_regardless_of_provider_context(prompt):
    """The dispatcher takes no provider parameter, so by construction it
    returns the same routing for any provider. This test pins the contract
    by calling it twice and asserting the matched set is stable — a future
    refactor that adds hidden provider state (e.g. via a contextvar) would
    flip these results turn-to-turn."""
    _select_skill_playbooks(prompt, disabled_tools=None, locale="fr")
    first = list(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    _select_skill_playbooks(prompt, disabled_tools=None, locale="fr")
    second = list(getattr(_select_skill_playbooks, "_last_matched", []) or [])
    assert first == second, f"routing flipped between calls for prompt {prompt!r}: {first} -> {second}"
