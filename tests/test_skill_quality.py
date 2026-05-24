from pathlib import Path

import pytest
import yaml

from backend.services.context_service import (
    clear_context_cache,
    last_context_trace,
    last_output_template_selection,
    last_skill_route_candidates,
    load_context_for_prompt,
)
from backend.skills.registry import SKILL_DEFINITIONS


def _selected_route_names() -> set[str]:
    return {item["name"] for item in last_skill_route_candidates() if item["selected"]}


def _candidate(name: str) -> dict | None:
    return next((item for item in last_skill_route_candidates() if item["name"] == name), None)


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    return yaml.safe_load(text.split("---", 2)[1]) or {}


def test_all_skills_have_trigger_oriented_descriptions_and_permissions():
    """Descriptions follow BETTER_SKILLS.MD: front-loaded keywords, bilingual,
    non-empty, under the 1024-char Anthropic/OpenAI compatibility cap, and
    long enough (≥100 chars) to carry both intent and limits."""
    for path in sorted(Path("skills").glob("*/SKILL.md")):
        meta = _frontmatter(path)
        description = meta.get("description", "")
        description_en = meta.get("description_en", "")
        permissions = meta.get("permissions")

        assert description, f"{meta['name']}: description is empty"
        assert description_en, f"{meta['name']}: description_en is empty"
        assert 100 <= len(description) <= 1024, f"{meta['name']}: description length {len(description)} out of [100, 1024]"
        assert 100 <= len(description_en) <= 1024, f"{meta['name']}: description_en length {len(description_en)} out of [100, 1024]"
        # Anti-regression on banned vague openings (BETTER_SKILLS.MD §"À éviter").
        banned_prefixes = ("Helps with", "General assistant", "Handles all things")
        assert not description_en.startswith(banned_prefixes), f"{meta['name']}: banned vague prefix"

        assert isinstance(permissions, dict), meta["name"]
        assert permissions.get("filesystem") in {"read", "write"}, meta["name"]
        assert permissions.get("network") is False, meta["name"]
        assert "scripts" in permissions, meta["name"]
        assert permissions.get("odoo") in {"none", "read", "write"}, meta["name"]


def test_skill_bodies_remain_progressive_and_not_overloaded():
    for skill in SKILL_DEFINITIONS:
        # SKILL.md should stay procedural. Long reference material belongs in
        # references/, templates/ or examples/ and is loaded only when useful.
        assert len(skill.body) <= 8_000, skill.name
        assert "## Quand l'utiliser" in skill.body or "## Déclencheurs" in skill.body or "## When NOT to use" in skill.body, skill.name


def test_phase_5_pilot_repo_read_file_routes_positive_and_negative_cases():
    clear_context_cache()
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Lis le fichier __manifest__.py du dépôt custom client et vérifie les dépendances",
        perspective="technical",
    )
    candidates = last_skill_route_candidates()

    assert "repo_read_file" in context
    assert any(item["name"] == "repo_read_file" and item["selected"] for item in candidates)

    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Explique en deux phrases le workflow standard des devis Odoo",
        perspective="technical",
    )

    assert not any(item["name"] == "repo_read_file" and item["selected"] for item in last_skill_route_candidates())


def test_phase_5_pilot_odoo_inspect_studio_routes_positive_and_negative_cases():
    clear_context_cache()
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Audit Studio avant migration : champs x_studio, automatisations et limites Studio",
        perspective="technical",
    )
    candidates = last_skill_route_candidates()

    assert "odoo_inspect_studio" in context
    assert any(item["name"] == "odoo_inspect_studio" and item["selected"] for item in candidates)

    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Combien de factures client sont ouvertes par statut ?",
        perspective="technical",
    )

    assert not any(item["name"] == "odoo_inspect_studio" and item["selected"] for item in last_skill_route_candidates())


def test_phase_5_pilot_output_report_writer_selects_template_only_for_livrables():
    clear_context_cache()
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Prépare une revue technique partageable du module custom",
        perspective="technical",
    )
    selection = last_output_template_selection()

    assert "FORMAT DE SORTIE" in context
    assert selection is not None
    assert selection["skill"] == "output_report_writer"
    assert selection["template"] == "technical_review"

    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Réponds brièvement : où se configure une taxe de vente ?",
        perspective="support",
    )

    assert last_output_template_selection() is None


def test_output_report_writer_does_not_route_for_generic_client_email():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Peux-tu écrire un email de suivi à un client Odoo après notre workshop ?",
        perspective="support",
    )

    assert last_output_template_selection() is None
    assert not any(
        item["name"] == "output_report_writer" and item["selected"]
        for item in last_skill_route_candidates()
    )


@pytest.mark.parametrize("prompt,expected,excluded", [
    (
        "Quel temps fait-il aujourd'hui ?",
        set(),
        {"odoo_query_records", "source_search_odoo", "output_report_writer"},
    ),
    (
        "Analyse le rapport PDF facture et propose un xpath QWeb fiable",
        {"odoo_inspect_report", "odoo_inspect_view"},
        {"odoo_query_records", "odoo_count_records", "odoo_inspect_fields", "runtime_attachment_handler", "output_report_writer"},
    ),
    (
        "Explique les attrs states readonly invisible dans la vue formulaire sale.order",
        {"odoo_inspect_view"},
        {"odoo_inspect_navigation", "odoo_inspect_security", "source_search_odoo", "source_read_odoo_file", "odoo_query_records", "odoo_inspect_fields"},
    ),
    (
        "Analyse les ACL et record rules sur res.partner",
        {"odoo_inspect_security"},
        {"odoo_inspect_navigation", "odoo_query_records", "odoo_count_records", "odoo_inspect_fields"},
    ),
    (
        "Lis le manifest du dépôt client pour comprendre ce module custom",
        {"repo_list_modules", "repo_search_code", "repo_read_file"},
        {"source_search_odoo", "source_show_commit", "odoo_query_records", "output_report_writer"},
    ),
    (
        "Analyse le commit a3f8b2c1 et résume son impact",
        {"source_show_commit"},
        {"odoo_query_records", "odoo_count_records", "odoo_inspect_fields", "odoo_inspect_view"},
    ),
    (
        "Prépare une revue technique partageable du module custom",
        {"output_report_writer", "repo_list_modules", "repo_search_code", "repo_read_file"},
        {"odoo_inspect_view", "odoo_inspect_navigation", "odoo_inspect_security"},
    ),
])
def test_routing_matrix_limits_near_miss_over_selection(prompt, expected, excluded):
    clear_context_cache()
    load_context_for_prompt("18.0", user_prompt=prompt, perspective="technical")

    selected = _selected_route_names()

    assert expected <= selected
    assert selected.isdisjoint(excluded)


def test_pruned_route_candidates_remain_observable_with_reason():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Analyse le rapport PDF facture et propose un xpath QWeb fiable",
        perspective="technical",
    )

    pruned = _candidate("odoo_query_records")

    assert pruned is not None
    assert pruned["selected"] is False
    assert "pruned:report-focus" in pruned["reason"]


def test_implicit_invocation_disabled_skill_is_not_selected_from_keywords_only():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Peux-tu rédiger un rapport synthétique sur les taxes Odoo ?",
        perspective="support",
    )

    assert not any(item["name"] == "output_report_writer" and item["selected"] for item in last_skill_route_candidates())
    assert last_output_template_selection() is None


def test_template_route_still_selects_implicit_disabled_skill_explicitly():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Prépare une revue technique partageable du module custom",
        perspective="technical",
    )

    candidate = _candidate("output_report_writer")

    assert candidate is not None
    assert candidate["selected"] is True
    assert "template:technical_review" in candidate["reason"]


def test_context_trace_records_auto_loaded_references_with_run_id():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Analyse le rapport PDF QWeb account.report_invoice et son external_layout",
        perspective="technical",
        run_id="run-trace-1",
    )
    trace = last_context_trace()

    assert any(
        event["type"] == "reference_auto_loaded"
        and event["run_id"] == "run-trace-1"
        and event["skill"] == "odoo_inspect_report"
        for event in trace
    )
    assert not any(event["type"] == "priority_block_truncated" for event in trace)


def test_context_trace_records_priority_block_truncation():
    clear_context_cache()
    load_context_for_prompt(
        "18.0",
        user_prompt="Question simple",
        perspective="technical",
        priority_blocks=["## Bloc énorme\n\n" + ("x" * 7000)],
        run_id="run-trace-2",
    )

    assert any(
        event["type"] == "priority_block_truncated"
        and event["run_id"] == "run-trace-2"
        and event["original_chars"] > event["capped_chars"]
        for event in last_context_trace()
    )
