import json

import pytest

from odoo_consultant_portal.services.ai_service import _language_block, _perspective_block, _read_odoo_file, _search_odoo_source, _trim_project_context
from odoo_consultant_portal.services.context_service import load_context_for_prompt, read_file
from odoo_consultant_portal.services.localization_service import build_localization_context, find_available_l10n_modules


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


def test_language_block_can_force_english_answers():
    block = _language_block("en")

    assert "Always answer in English" in block
    assert "Never translate Odoo technical identifiers" in block


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


def test_migration_context_includes_source_and_target_version_notes():
    context = load_context_for_prompt(
        "18.0",
        target_version="19.0",
        migration=True,
        user_prompt="Analyse les changements de migration entre Odoo 18 et Odoo 19",
        perspective="architect",
    )

    assert "Méthodologie de migration" in context
    assert "Notes de version Odoo 18.0" in context
    assert "Notes de version Odoo 19.0" in context


def test_context_router_treats_new_ba_perspective_as_functional():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse ce besoin utilisateur et propose une approche",
        perspective="business_analyst",
    )

    assert "Modèles transversaux essentiels" in context
    assert "Bonnes pratiques d'analyse client" in context
    assert "Profil Business Analyst" in context


def test_context_router_avoids_short_keyword_false_positives():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse ce besoin utilisateur et propose une approche",
        perspective="business_analyst",
    )

    assert "Point de Vente (POS)" not in context


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


def test_context_router_supports_english_context_defaults():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Which customer invoices are overdue and how should I diagnose payments?",
        perspective="technical",
        locale="en",
    )

    assert "Consultant skills" in context
    assert "Accounting & Finance" in context
    assert "Advanced diagnostic patterns" in context
    assert "Notes de version" not in context


def test_context_router_supports_english_specialized_files():
    meeting = load_context_for_prompt("18.0", user_prompt="Generate meeting minutes", locale="en")
    studio = load_context_for_prompt("18.0", user_prompt="Which Studio x_studio fields exist?", locale="en")
    version = load_context_for_prompt("18.0", user_prompt="What are the Odoo 18 upgrade highlights?", locale="en")

    assert "Meeting minutes template" in meeting
    assert "Studio inspection" in studio
    assert "Odoo 18.0 release notes" in version


def test_project_context_is_trimmed_independently_from_global_context():
    trimmed = _trim_project_context("x" * 13_000)

    assert len(trimmed) < 13_000
    assert "contexte projet tronqué" in trimmed


def test_available_l10n_modules_detects_community_and_enterprise(tmp_path):
    base = tmp_path / "sources"
    (base / "18.0" / "addons" / "l10n_ch").mkdir(parents=True)
    (base / "18.0" / "addons" / "l10n_fr").mkdir(parents=True)
    (base / "18.0-enterprise" / "l10n_ch_reports").mkdir(parents=True)

    modules = find_available_l10n_modules("18.0", "CH", base)

    assert modules == [
        {"name": "l10n_ch", "source": "community", "path": "addons/l10n_ch"},
        {"name": "l10n_ch_reports", "source": "enterprise", "path": "l10n_ch_reports"},
    ]


def test_localization_context_is_compact_for_non_fiscal_questions():
    company_ids = json.dumps([{
        "id": 1,
        "name": "SwissCo",
        "country_code": "CH",
        "country_name": "Switzerland",
        "currency": "CHF",
        "installed_l10n_modules": ["l10n_ch"],
        "available_l10n_modules": [{"name": "l10n_ch_reports", "source": "enterprise", "path": "l10n_ch_reports"}],
    }])

    context = build_localization_context(company_ids, 1, "18.0", "Analyse la performance de sale.order", "developer")

    assert "Localisation fiscale" in context
    assert "Switzerland (CH)" in context
    assert "Modules l10n disponibles" not in context


def test_localization_context_expands_for_fiscal_questions():
    company_ids = json.dumps([{
        "id": 1,
        "name": "FranceCo",
        "country_code": "FR",
        "country_name": "France",
        "currency": "EUR",
        "installed_l10n_modules": ["l10n_fr", "l10n_fr_fec"],
        "available_l10n_modules": [{"name": "l10n_fr_reports", "source": "enterprise", "path": "l10n_fr_reports"}],
    }])

    context = build_localization_context(company_ids, 1, "18.0", "Peux-tu vérifier la TVA et le FEC ?", "support")

    assert "France (FR)" in context
    assert "l10n_fr_fec" in context
    assert "l10n_fr_reports (enterprise)" in context


@pytest.mark.asyncio
async def test_source_tools_cover_community_and_enterprise_siblings(tmp_path):
    source = tmp_path / "sources" / "18.0"
    enterprise = tmp_path / "sources" / "18.0-enterprise"
    community_module = source / "addons" / "l10n_ch"
    enterprise_module = enterprise / "l10n_ch_reports"
    community_module.mkdir(parents=True)
    enterprise_module.mkdir(parents=True)
    (community_module / "__manifest__.py").write_text("Swiss accounting chart", encoding="utf-8")
    (enterprise_module / "__manifest__.py").write_text("Swiss enterprise reports", encoding="utf-8")

    search = await _search_odoo_source({"pattern": "Swiss", "file_types": ["*.py"]}, str(source))
    read = await _read_odoo_file({"path": "enterprise/l10n_ch_reports/__manifest__.py"}, str(source))

    assert search["ok"] is True
    assert "community/addons/l10n_ch/__manifest__.py" in search["files"]
    assert "enterprise/l10n_ch_reports/__manifest__.py" in search["files"]
    assert read["ok"] is True
    assert read["path"] == "enterprise/l10n_ch_reports/__manifest__.py"
    assert "Swiss enterprise reports" in read["content"]
