import json
from pathlib import Path

import pytest

from odoo_consultant_portal.services.ai_service import _language_block, _perspective_block, _read_odoo_file, _search_odoo_source, _trim_history, _trim_project_context
from odoo_consultant_portal.services.context_service import load_context_for_prompt, read_file
from odoo_consultant_portal.services.localization_service import build_localization_context, find_available_l10n_modules
from odoo_consultant_portal.services.technical_complexity_service import (
    analyze_technical_complexity,
    build_technical_complexity_context,
)


def test_default_skills_context_uses_dynamic_date_placeholder():
    skills = read_file("skills.md")

    assert '"2025-01-01"' not in skills
    assert "<date_du_jour>" in skills


def test_perspective_blocks_have_distinct_response_contracts():
    # Legacy aliases still work and route to BA / developer.
    ba = _perspective_block("business_analyst")
    developer = _perspective_block("developer")
    architect = _perspective_block("architect")
    support = _perspective_block("support")

    assert "BUSINESS ANALYST" in ba
    assert "Point à valider techniquement" in ba
    assert "Snippets de code" in ba

    assert "DÉVELOPPEUR" in developer
    assert "fichier, ligne, modèle, champ" in developer
    assert "Impact fonctionnel" in developer

    assert "ARCHITECTE" in architect
    assert "Décision recommandée" in architect

    assert "SUPPORT" in support
    assert "Diagnostic probable" in support

    # Legacy aliases map to the right roles.
    assert _perspective_block("functional") == ba
    assert _perspective_block("technical") == developer


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


def test_technical_complexity_context_guides_response_strategy():
    raw = json.dumps({
        "mode": "studio_dev",
        "label": "Studio + Dev",
        "confidence": "high",
        "studio": {"detected": True, "signal_count": 8},
        "dev": {"detected": True, "manifest_count": 4, "python_files": 12, "xml_files": 30},
    })

    context = build_technical_complexity_context(raw)

    assert "Complexité technique du projet" in context
    assert "Studio + Dev" in context
    assert "standard, de Studio ou du code custom" in context


@pytest.mark.asyncio
async def test_technical_complexity_detects_dev_repo_from_legacy_github_repo(tmp_path, monkeypatch):
    home = tmp_path / "home"
    repo = home / ".odoo-consultant" / "repos" / "Demo" / "prod"
    module = repo / "custom_sale"
    (repo / ".git").mkdir(parents=True)
    module.mkdir()
    (module / "__manifest__.py").write_text("{'name': 'Custom Sale'}", encoding="utf-8")
    (module / "models.py").write_text("from odoo import models\n", encoding="utf-8")

    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, None, "org/demo")

    assert result["mode"] == "dev"
    assert result["dev"]["manifest_count"] == 1
    assert result["confidence"] == "high"


class FakeModuleOdoo:
    def get_installed_modules(self):
        return [
            {"name": "base", "author": "Odoo S.A."},
            {"name": "sale", "author": "Odoo S.A."},
            {"name": "web_studio", "author": "Odoo S.A."},
            {"name": "custom_connector", "author": "Customer"},
        ]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        return []


@pytest.mark.asyncio
async def test_technical_complexity_uses_installed_modules_as_custom_dev_signal(tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, FakeModuleOdoo(), None)
    context = build_technical_complexity_context(json.dumps(result))

    assert result["mode"] == "dev"
    assert result["installed_modules"]["studio_modules"] == ["web_studio"]
    assert result["installed_modules"]["custom_module_count"] == 1
    assert "custom_connector" in context


class FakeOcaOnlyOdoo:
    """Odoo instance with only OCA / community modules installed (no truly custom dev)."""

    def get_installed_modules(self):
        return [
            {"name": "base", "author": "Odoo S.A."},
            {"name": "sale", "author": "Odoo S.A."},
            {"name": "account_financial_report", "author": "Odoo Community Association (OCA)"},
            {"name": "queue_job", "author": "Camptocamp,Akretion,Odoo Community Association (OCA)"},
            {"name": "web_responsive", "author": "Odoo Community Association (OCA)"},
            {"name": "l10n_fr", "author": "Odoo S.A."},
        ]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        return []


@pytest.mark.asyncio
async def test_technical_complexity_does_not_flag_oca_modules_as_custom_dev(tmp_path, monkeypatch):
    """A project with only OCA / community modules installed must be 'standard',
    not 'dev'. Regression test for the false-positive that classified projects
    running OCA addons as having custom development."""
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, FakeOcaOnlyOdoo(), None)

    assert result["mode"] == "standard"
    assert result["installed_modules"]["custom_module_count"] == 0
    assert result["installed_modules"]["community_module_count"] >= 3
    # OCA modules are reported in their own bucket
    assert "queue_job" in result["installed_modules"]["community_modules"]
    assert "account_financial_report" in result["installed_modules"]["community_modules"]


class FakeWebStudioOnlyOdoo:
    """Odoo instance with Studio installed but no studio_customization records."""

    def get_installed_modules(self):
        return [
            {"name": "base", "author": "Odoo S.A."},
            {"name": "web_studio", "author": "Odoo S.A."},
        ]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        if model == "ir.model.data":
            # Regression guard: web_studio's own XML ids must not be counted as
            # customer Studio customizations.
            assert ["module", "=", "studio_customization"] in (domain or [])
            return []
        return []


@pytest.mark.asyncio
async def test_technical_complexity_does_not_flag_installed_web_studio_without_customizations(tmp_path, monkeypatch):
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, FakeWebStudioOnlyOdoo(), None)

    assert result["mode"] == "standard"
    assert result["studio"]["signal_count"] == 0
    assert result["installed_modules"]["studio_modules"] == ["web_studio"]


@pytest.mark.asyncio
async def test_technical_complexity_ignores_official_and_oca_manifests_in_repo(tmp_path, monkeypatch):
    home = tmp_path / "home"
    repo = home / ".odoo-consultant" / "repos" / "Demo" / "prod"
    (repo / ".git").mkdir(parents=True)
    official = repo / "sale"
    oca = repo / "queue_job"
    custom = repo / "custom_sale"
    official.mkdir()
    oca.mkdir()
    custom.mkdir()
    (official / "__manifest__.py").write_text("{'name': 'Sales', 'author': 'Odoo S.A.'}", encoding="utf-8")
    (oca / "__manifest__.py").write_text("{'name': 'Queue Job', 'author': 'Odoo Community Association (OCA)'}", encoding="utf-8")
    (custom / "__manifest__.py").write_text("{'name': 'Customer Sale'}", encoding="utf-8")
    (custom / "models.py").write_text("from odoo import models\n", encoding="utf-8")

    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, None, "org/demo")

    assert result["mode"] == "dev"
    assert result["dev"]["manifest_count"] == 1
    assert result["dev"]["repositories"][0]["ignored_manifest_count"] == 2
    assert result["dev"]["repositories"][0]["custom_modules"] == ["custom_sale"]


def test_technical_complexity_context_is_injected_in_project_variable_prompt():
    from types import SimpleNamespace
    from odoo_consultant_portal.services.ai_service import build_system

    raw = json.dumps({
        "mode": "standard",
        "label": "Pas de Studio ni Dev",
        "confidence": "high",
        "studio": {"detected": False, "signal_count": 0},
        "dev": {"detected": False, "manifest_count": 0, "python_files": 0, "xml_files": 0},
    })
    complexity_context = build_technical_complexity_context(raw)
    profile = SimpleNamespace(
        db_url="https://demo.odoo.com",
        db_name="demo",
        odoo_version="18.0",
        company_name="Demo",
        project_context=None,
    )

    _stable, variable = build_system(profile, context_md=complexity_context)

    assert "Complexité technique du projet" in variable
    assert "Pas de Studio ni Dev" in variable
    assert "demander confirmation avant d'inventer une couche Studio ou custom" in variable


def test_trim_history_drops_orphan_tool_result_user_turn():
    # Build a long history where, after trimming to MAX_HISTORY_TURNS, the
    # first kept message would be an orphan Anthropic tool_result user turn.
    from odoo_consultant_portal.core.context_constants import MAX_HISTORY_TURNS

    msgs = []
    # 30 normal turns (user/assistant pairs) — far more than the cap.
    for i in range(MAX_HISTORY_TURNS + 5):
        msgs.append({"role": "user", "content": f"q{i}"})
        msgs.append({"role": "assistant", "content": f"a{i}"})
    # Drop the trailing assistant to land on a boundary, then inject the
    # tool-cycle pattern right at the trim window.
    msgs.append({"role": "assistant", "content": [{"type": "tool_use", "id": "t1", "name": "x", "input": {}}]})
    msgs.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "ok"}]})
    msgs.append({"role": "assistant", "content": "final"})
    msgs.append({"role": "user", "content": "follow-up"})

    trimmed = _trim_history(msgs)
    # First retained message must be a genuine user turn.
    assert trimmed[0]["role"] == "user"
    first_content = trimmed[0].get("content")
    if isinstance(first_content, list):
        assert first_content[0].get("type") != "tool_result"


def test_trim_history_drops_orphan_openai_tool_message():
    from odoo_consultant_portal.core.context_constants import MAX_HISTORY_TURNS

    msgs = []
    for i in range(MAX_HISTORY_TURNS + 5):
        msgs.append({"role": "user", "content": f"q{i}"})
        msgs.append({"role": "assistant", "content": f"a{i}"})
    msgs.append({"role": "tool", "tool_call_id": "x", "content": "orphan"})
    msgs.append({"role": "user", "content": "follow-up"})

    trimmed = _trim_history(msgs)
    assert trimmed[0]["role"] == "user"


def test_build_system_general_returns_tuple_with_stable_variable_split():
    from odoo_consultant_portal.services.ai_service import build_system_general

    stable, variable = build_system_general(
        "18.0",
        source_path="/tmp/sources/18.0",
        context_md="## Compétences consultant\nDummy routed context",
        perspective="developer",
        response_language="fr",
        user_ctx="Consultant : Benoit",
    )
    # Stable part: identity, sources, instructions — all turn-invariant.
    assert "Consultant : Benoit" in stable
    assert "expert Odoo" in stable
    assert "/tmp/sources/18.0" in stable
    assert "search_odoo_source" in stable
    # Variable part: language directive, perspective block, routed context.
    assert "Réponds toujours en français" in variable
    assert "DÉVELOPPEUR" in variable
    assert "Compétences consultant" in variable
    # Sources instructions must NOT leak into the variable half.
    assert "search_odoo_source" not in variable


def test_build_system_migration_returns_tuple_with_target_path_in_stable():
    from odoo_consultant_portal.services.ai_service import build_system_migration

    stable, variable = build_system_migration(
        "17.0", "18.0",
        source_path="/tmp/s/17.0",
        target_path="/tmp/s/18.0",
        context_md="dummy",
        perspective="architect",
    )
    assert "17.0" in stable and "18.0" in stable
    assert "/tmp/s/17.0" in stable
    assert "/tmp/s/18.0" in stable
    assert "ARCHITECTE" in variable
    # Migration-specific addon should be present in architect mode.
    assert "Spécifique migration" in variable


def test_infer_perspective_strong_signals():
    from odoo_consultant_portal.services.ai_service import _infer_perspective, PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA, PERSPECTIVE_SUPPORT, PERSPECTIVE_ARCHITECT

    # Code block → developer
    assert _infer_perspective("```python\nclass Foo(_inherit='res.partner')") == PERSPECTIVE_DEVELOPER
    # Traceback → developer
    assert _infer_perspective("J'ai cette traceback : ValueError") == PERSPECTIVE_DEVELOPER
    # Strong BA tokens
    assert _infer_perspective("Décris-moi le cas d'usage métier de la règle de gestion") == PERSPECTIVE_BA
    # Strong support
    assert _infer_perspective("Le client a un incident bloquant en P1, panne complète") == PERSPECTIVE_SUPPORT
    # Strong architect
    assert _infer_perspective("Quelle stratégie de migration et architecture multi-company recommandes-tu ?") == PERSPECTIVE_ARCHITECT
    # Below threshold → fallback
    assert _infer_perspective("salut", fallback=PERSPECTIVE_DEVELOPER) == PERSPECTIVE_DEVELOPER
    # Empty → fallback
    assert _infer_perspective("", fallback=PERSPECTIVE_BA) == PERSPECTIVE_BA
