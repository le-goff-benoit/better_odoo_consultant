from odoo_consultant_portal.services.ai_service import _perspective_block, _trim_project_context
from odoo_consultant_portal.services.context_service import load_context_for_prompt, read_file


def test_default_skills_context_uses_dynamic_date_placeholder():
    skills = read_file("skills.md")

    assert '"2025-01-01"' not in skills
    assert "<date_du_jour>" in skills


def test_perspective_blocks_have_distinct_response_contracts():
    functional = _perspective_block("functional")
    technical = _perspective_block("technical")

    assert "AM / Business Analyst" in functional
    assert "Point à valider techniquement" in functional
    assert "Snippets de code" in functional

    assert "Architecte / Développeur" in technical
    assert "fichier, ligne, modèle, champ" in technical
    assert "Impact fonctionnel" in technical


def test_migration_context_keeps_budget_for_migration_material():
    context = load_context_for_prompt(
        "19.0",
        migration=True,
        user_prompt="Analyse une migration v18 vers v19 côté stock et comptabilité",
        perspective="technical",
    )

    assert "Méthodologie de migration" in context
    assert "Notes de version Odoo 19.0" in context
    assert "Modèle compte-rendu" not in context
    assert len(context) < 40_000


def test_context_router_selects_business_domain_sections():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles factures clients sont en retard et comment diagnostiquer les paiements ?",
        perspective="technical",
    )

    assert "Comptabilité & Finance" in context
    assert "Patterns de diagnostic avancés" in context
    assert "# Factures impayées depuis > 90 jours" in context
    assert "Notes de version Odoo 18.0" not in context
    assert "Fabrication (MRP)" not in context
    assert "Point de Vente (POS)" not in context


def test_context_router_keeps_nested_sections_for_operational_guides():
    security = load_context_for_prompt(
        "18.0",
        user_prompt="Peux-tu auditer les droits et record rules sur sale.order ?",
        perspective="technical",
    )
    performance = load_context_for_prompt(
        "18.0",
        user_prompt="Pourquoi les requêtes stock.move sont lentes ?",
        perspective="technical",
    )

    assert "Groupes standards importants" in security
    assert "Vérification droits" in security
    assert "Diagnostics lenteur fréquents" in performance
    assert "Requêtes à éviter" in performance


def test_context_router_includes_meeting_template_only_when_requested():
    normal = load_context_for_prompt("18.0", user_prompt="Analyse les commandes de vente")
    meeting = load_context_for_prompt("18.0", user_prompt="Génère un compte-rendu de réunion")

    assert "Modèle compte-rendu" not in normal
    assert "Modèle compte-rendu" in meeting


def test_context_router_includes_studio_context_only_when_relevant():
    normal = load_context_for_prompt("18.0", user_prompt="Analyse les commandes de vente")
    studio = load_context_for_prompt("18.0", user_prompt="Quels champs Studio x_studio existent sur sale.order ?")

    assert "Inspection Studio" not in normal
    assert "Inspection Studio" in studio


def test_context_router_includes_version_notes_for_version_sensitive_prompts():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles nouveautés Odoo 18 peuvent remplacer un custom CRM ?",
    )

    assert "Notes de version Odoo 18.0" in context


def test_project_context_is_trimmed_independently_from_global_context():
    trimmed = _trim_project_context("x" * 13_000)

    assert len(trimmed) < 13_000
    assert "contexte projet tronqué" in trimmed
