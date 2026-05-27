from backend.api.routes.ai import _skills_selected_payload
from backend.services.context_service import (
    clear_context_cache,
    last_output_template_selection,
    load_context_for_prompt,
    select_output_template,
)
from backend.services.output_renderer import OutputRenderer
from backend.services.skill_loader import SkillLoadResult
from backend.skills.registry import normalize_disabled_skill_names


def test_output_renderer_selects_technical_review_template():
    selection = OutputRenderer().select_template("Prépare une revue technique du module custom")

    assert selection is not None
    assert selection.skill_name == "output_report_writer"
    assert selection.template_name == "technical_review"
    assert selection.label == "Revue technique"
    assert selection.score > 100
    assert selection.reason.startswith("trigger:")
    assert "# Revue technique" in selection.body


def test_output_renderer_selects_functional_spec_template():
    selection = OutputRenderer().select_template("Rédige un cahier des charges pour ce besoin")

    assert selection is not None
    assert selection.skill_name == "output_report_writer"
    assert selection.template_name == "functional_spec"
    assert "# Cahier des charges fonctionnel" in selection.body


def test_output_renderer_respects_disabled_unlocked_skill():
    selection = OutputRenderer().select_template(
        "Prépare une entrée changelog pour ce patch",
        disabled_tools=["source_show_commit"],
    )

    assert selection is None


def test_output_renderer_ignores_disabled_locked_skill():
    selection = OutputRenderer().select_template(
        "Prépare une revue technique du module custom",
        disabled_tools=["output_report_writer"],
    )

    assert selection is not None
    assert selection.skill_name == "output_report_writer"


def test_disabled_skill_normalization_reports_locked_ignored():
    disabled, ignored_locked = normalize_disabled_skill_names(["output_report_writer", "repo_read_file", "missing"])

    assert disabled == ["repo_read_file"]
    assert ignored_locked == ["output_report_writer"]


def test_output_renderer_returns_none_when_template_is_denied():
    class DenyingLoader:
        def load_template(self, *args, **kwargs):
            return SkillLoadResult(ok=False, error="filesystem read permission required")

    selection = OutputRenderer(loader=DenyingLoader()).select_template("Prépare une revue technique")

    assert selection is None


def test_context_injects_output_template_priority_block_and_exposes_selection():
    clear_context_cache()

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Prépare une revue technique du module custom",
        perspective="technical",
    )
    selection = last_output_template_selection()

    assert "FORMAT DE SORTIE" in context
    assert "# Revue technique" in context
    assert selection is not None
    assert selection["skill"] == "output_report_writer"
    assert selection["template"] == "technical_review"
    assert "body" not in selection


def test_context_does_not_inject_output_template_without_trigger():
    clear_context_cache()

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse rapidement les commandes en retard",
        perspective="technical",
    )

    assert "FORMAT DE SORTIE" not in context
    assert last_output_template_selection() is None


def test_select_output_template_keeps_legacy_tuple_contract():
    result = select_output_template("Rédige une spécification fonctionnelle")

    assert result is not None
    skill_name, body = result
    assert skill_name == "output_report_writer"
    assert "# Cahier des charges fonctionnel" in body


def test_skills_selected_payload_keeps_existing_fields_and_adds_template():
    output_template = {
        "skill": "output_report_writer",
        "template": "technical_review",
        "label": "Revue technique",
        "score": 116,
        "reason": "trigger:revue technique",
    }

    payload = _skills_selected_payload(
        ["output_report_writer"],
        [{"name": "output_report_writer", "score": 10, "reason": "keyword", "selected": True}],
        output_template,
    )

    assert payload["type"] == "skills_selected"
    assert payload["skills"] == ["output_report_writer"]
    assert payload["candidates"][0]["name"] == "output_report_writer"
    assert payload["output_template"] == output_template


def test_skills_selected_payload_omits_template_when_absent():
    payload = _skills_selected_payload([], [])

    assert payload == {"type": "skills_selected", "skills": [], "candidates": []}


def test_skills_selected_payload_includes_run_trace_when_present():
    payload = _skills_selected_payload(
        [],
        [],
        run_id="run-123",
        context_trace=[{"type": "reference_auto_loaded", "run_id": "run-123"}],
    )

    assert payload["run_id"] == "run-123"
    assert payload["context_trace"] == [{"type": "reference_auto_loaded", "run_id": "run-123"}]


# ── v0.99.2 — sélection agent-aware ───────────────────────────────────


def test_output_renderer_business_analyst_gets_business_impact_template():
    """Régression 0.99.2 : un BA demandant un « audit Studio » récupère le
    template business_impact_review, pas technical_review (qui sort des
    file:line et des slots Python inadaptés au public BA)."""
    selection = OutputRenderer().select_template(
        "Fais-moi un audit des personnalisations Studio sur cette instance",
        agent="business_analyst",
    )
    assert selection is not None
    assert selection.template_name == "business_impact_review"
    assert "agent:business_analyst" in selection.reason


def test_output_renderer_developer_keeps_technical_review_on_audit():
    """Un dev qui dit « audit » doit toujours recevoir technical_review
    (preferred), pas business_impact (forbidden pour developer)."""
    selection = OutputRenderer().select_template(
        "Fais un audit du module custom client",
        agent="developer",
    )
    assert selection is not None
    assert selection.template_name == "technical_review"


def test_output_renderer_forbidden_agent_skips_template():
    """technical_review est interdit pour business_analyst. Si seul ce
    template matche, on ne sélectionne rien plutôt que d'imposer un
    format inadapté."""
    selection = OutputRenderer().select_template(
        "Fais-moi une revue technique du module custom",
        agent="business_analyst",
    )
    # « revue technique » trigger technical_review, mais business_impact a
    # « revue » aussi → business_impact wins via preferred_agents + le fait
    # que technical_review est forbidden.
    assert selection is not None
    assert selection.template_name == "business_impact_review"


def test_output_renderer_preferred_agent_boosts_template():
    """Sans agent indiqué, l'ancien comportement reste (premier match)."""
    selection = OutputRenderer().select_template("Fais un audit du système")
    assert selection is not None
    assert selection.template_name in {"business_impact_review", "technical_review"}


def test_technical_review_template_no_longer_leaks_scaffolding_blockquotes():
    """Régression 0.99.2 : les blockquotes « > Ce qui empêche la mise en
    prod. Vide si rien. » sont supprimées du template (elles étaient
    recopiées telles quelles dans la sortie LLM)."""
    selection = OutputRenderer().select_template(
        "Prépare une revue technique du module custom",
        agent="developer",
    )
    assert selection is not None
    assert "Vide si rien" not in selection.body
    assert "Pas bloquants mais à traiter" not in selection.body
    assert "Améliorations qualitatives, à arbitrer" not in selection.body
    # Mais la directive auteur en HTML comment doit être présente :
    assert "INSTRUCTIONS AUTEUR" in selection.body


def test_business_impact_review_template_exists_and_is_business_framed():
    selection = OutputRenderer().select_template(
        "Audit Studio sur sale.order et helpdesk",
        agent="business_analyst",
    )
    assert selection is not None
    assert selection.template_name == "business_impact_review"
    assert "Impact métier" in selection.body
    assert "Flux métier impactés" in selection.body
    # Pas de slot Python imposé sur le BA template :
    assert "```python" not in selection.body
