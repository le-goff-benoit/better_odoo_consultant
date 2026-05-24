"""Creator-mode context assembly — guarantees that the LLM is briefed with
the Studio guide, the conventions profile, and any op-specific snippets the
user prompt warrants."""

import pytest

from backend.services.context_service import load_context_for_prompt
from backend.services.creator_intents import (
    build_creator_intent_block,
    detect_creator_intents,
)


# ── Phase 1.1 — studio.md systematic in Creator mode ─────────────


def test_studio_guide_loaded_even_without_studio_keywords_in_creator_mode():
    """Phase 1.1: in Creator mode, studio.md must reach the LLM even when the
    user prompt does not contain Studio keywords. Out of Creator mode, the
    keyword routing still applies."""
    creator = load_context_for_prompt(
        "18.0",
        user_prompt="Ajoute un champ x_priorite sur res.partner",
        perspective="developer",
        creation=True,
    )
    non_creator = load_context_for_prompt(
        "18.0",
        user_prompt="Ajoute un champ x_priorite sur res.partner",
        perspective="developer",
    )

    assert "Projet avec Studio" in creator
    assert "Projet avec Studio" not in non_creator


# ── Phase 1.2 — profile-creator.md core section ──────────────────


def test_creator_profile_is_a_core_section_in_creator_mode():
    """Phase 1.2: the Studio conventions profile is loaded as core (never
    crowded out of the budget) when creation=True."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Crée un champ texte sur res.partner",
        perspective="developer",
        creation=True,
    )

    assert "Conventions Studio" in context
    # Some key conventions reach the prompt verbatim.
    assert "STORE_ATTR" in context
    assert "x_" in context


def test_creator_profile_absent_outside_creator_mode():
    """The Studio conventions profile is a Creator-mode concept."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse les factures clients en retard",
        perspective="developer",
    )

    assert "Conventions Studio" not in context


# ── Phase 1.3 — op-type contextual routing ───────────────────────


@pytest.mark.parametrize("prompt,expected", [
    ("Crée un champ calculé x_total qui somme les lignes", "compute"),
    ("Planifie une tâche qui tourne tous les jours", "cron"),
    ("Déclenche une automatisation à la création d'une commande", "automation"),
    ("Ajoute une action serveur sur le menu Action de la fiche", "server_action"),
    ("Modifie le pied de page du PDF facture", "report"),
    ("Crée un champ selection avec trois choix prédéfinis", "selection_field"),
    ("Ajoute un champ many2one vers res.partner", "relational_field"),
    ("Mettre à jour les fiches produit à partir d'un CSV", "records_bulk"),
])
def test_detect_creator_intents_picks_the_right_snippet(prompt, expected):
    hits = detect_creator_intents(prompt)
    assert expected in hits, f"missing intent {expected} in {hits}"


def test_detect_creator_intents_returns_empty_for_unrelated_prompt():
    assert detect_creator_intents("salut, comment ça va ?") == []


def test_build_creator_intent_block_concatenates_matching_snippets():
    block = build_creator_intent_block(
        "Crée un champ calculé puis une action planifiée nocturne"
    )
    # Both compute and cron snippets are present, with their headlines.
    assert "Champ calculé" in block
    assert "Action planifiée" in block


def test_build_creator_intent_block_empty_when_nothing_matches():
    assert build_creator_intent_block("question banale") == ""


def test_build_creator_intent_block_english():
    block = build_creator_intent_block(
        "Add a scheduled action to refresh prices every night", locale="en"
    )
    assert "Scheduled action" in block


# ── Étape B — complexity-driven routing for studio.md / dev.md ──


def test_studio_md_loaded_when_project_complexity_is_studio_even_without_keyword():
    """A Studio-classified project must always receive the Studio guide,
    even when the user prompt has no Studio keyword."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Pourquoi les factures clients sont lentes à charger ?",
        perspective="developer",
        complexity_mode="studio",
    )
    assert "Projet avec Studio" in context


def test_studio_md_loaded_when_project_complexity_is_studio_dev():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles règles d'accès filtrent les commandes ?",
        perspective="developer",
        complexity_mode="studio_dev",
    )
    assert "Projet avec Studio" in context
    assert "Projet avec dev custom" in context


def test_studio_md_keyword_still_works_for_standard_project():
    """Keyword fallback preserved: a `standard` project must still receive
    studio.md when the prompt mentions Studio vocabulary explicitly."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Comment fonctionne x_studio_ref sur sale.order ?",
        perspective="developer",
        complexity_mode="standard",
    )
    assert "Projet avec Studio" in context


def test_studio_md_absent_for_standard_project_without_keyword():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Affiche la liste des fournisseurs actifs.",
        perspective="developer",
        complexity_mode="standard",
    )
    assert "Projet avec Studio" not in context


def test_dev_md_loaded_when_project_complexity_is_dev():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Pourquoi la création d'un partenaire échoue avec ce message ?",
        perspective="developer",
        complexity_mode="dev",
    )
    assert "Projet avec dev custom" in context


def test_dev_md_keyword_fallback_for_standard_project():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Cherche dans le code custom où _inherit est utilisé.",
        perspective="developer",
        complexity_mode="standard",
    )
    assert "Projet avec dev custom" in context


def test_dev_md_absent_for_pure_studio_project_without_dev_keyword():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Liste les automatisations existantes.",
        perspective="developer",
        complexity_mode="studio",
    )
    assert "Projet avec dev custom" not in context


# ── Phase 1.4 — assembly order in Creator mode ───────────────────


def test_creator_context_assembly_order_is_stable():
    """The Creator context must contain these sections, in this order. Any
    drift changes how the LLM weighs the guidance and must be an explicit
    decision. The role profile (Profil de réponse) is NOT loaded in Creator
    mode — profile-creator.md ("Conventions Studio") is the locked authority."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Crée un champ calculé x_total sur sale.order",
        perspective="developer",
        creation=True,
    )

    # Sections that must all be present.
    expected_present = [
        "Compétences consultant",
        "Projet avec Studio",
        "Méthodologie de création Studio",
        "Conventions Studio",
    ]
    positions = {name: context.find(name) for name in expected_present}
    missing = [n for n, p in positions.items() if p < 0]
    assert not missing, f"missing sections: {missing}"

    # The role profile must NOT leak into Creator mode.
    assert "Profil de réponse" not in context
    assert "Profil Développeur" not in context

    # And the Studio creation methodology must come before its conventions
    # profile (methodology = WHY, conventions = HOW).
    assert positions["Méthodologie de création Studio"] < positions["Conventions Studio"]


# ── v0.45 — context performance & quality improvements ──────────


def test_is_topic_of_requires_two_hits_or_early_position():
    """A single late incidental mention should NOT load studio.md.
    Production callers always pass `_normalize_text`-ed input (lower-cased,
    accent-folded) — tests mirror that contract."""
    from backend.services.context_service import _is_topic_of, _STUDIO_TERMS
    # Single hit far in the prompt — not a topic.
    long_prompt = ("a" * 200) + " studio"
    assert _is_topic_of(long_prompt, _STUDIO_TERMS) is False
    # Single hit in the first 80 chars — IS a topic.
    assert _is_topic_of("etudie la couche studio sur sale.order", _STUDIO_TERMS) is True
    # Two hits anywhere — IS a topic.
    assert _is_topic_of("au debut, etude. " * 8 + "studio personnalisation", _STUDIO_TERMS) is True


def test_studio_not_loaded_on_incidental_keyword_far_in_prompt():
    """Regression for the threshold: a tail mention shouldn't force studio.md."""
    long_prompt = " ".join(["question"] * 60) + " studio"
    context = load_context_for_prompt(
        "18.0",
        user_prompt=long_prompt,
        perspective="developer",
        complexity_mode="standard",
    )
    assert "Projet avec Studio" not in context


def test_version_notes_filter_trims_irrelevant_sections():
    """A fiscal question on Odoo 18 must not pull POS/HR/eCommerce sections."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles nouveautés comptables sur Odoo 18 ? TVA, facture, impôt",
        perspective="developer",
        complexity_mode="standard",
    )
    # Cross-cutting sections stay.
    assert "Notes de version Odoo 18.0" in context
    assert "Comptabilité" in context
    # Domains absent from the prompt should be trimmed.
    assert "Point de Vente" not in context
    assert "Ressources Humaines" not in context


def test_complexity_profile_block_added_to_priority_blocks():
    """The complexity-tuning snippet must reach the LLM for Studio/dev projects."""
    from backend.services.context_service import complexity_profile_block
    assert "Studio" in complexity_profile_block("studio")
    assert "custom" in complexity_profile_block("dev")
    assert complexity_profile_block("standard") == ""
    assert complexity_profile_block(None) == ""


def test_priority_block_overflow_is_truncated_with_warning(caplog):
    """A huge priority block must not starve the routed context."""
    import logging
    huge = "x" * 8000
    with caplog.at_level(logging.WARNING):
        result = load_context_for_prompt(
            "18.0",
            user_prompt="test",
            perspective="developer",
            priority_blocks=[huge],
        )
    # Block in the result is truncated, with a marker.
    assert "[…bloc tronqué" in result
    assert any("Priority context block truncated" in r.message for r in caplog.records)


def test_load_context_for_prompt_is_memoized():
    """Same args = same call cached. Edit a file and we still get the cached
    result until the cache is explicitly cleared."""
    from backend.services.context_service import clear_context_cache
    clear_context_cache()
    a = load_context_for_prompt(
        "18.0", user_prompt="Quelle est la version 18 ?",
        perspective="developer", complexity_mode="standard",
    )
    b = load_context_for_prompt(
        "18.0", user_prompt="Quelle est la version 18 ?",
        perspective="developer", complexity_mode="standard",
    )
    # Identity check: cached result returns the same exact string object.
    assert a is b
