import json
from pathlib import Path

import pytest

from backend.services.ai_service import _language_block, _perspective_block, _source_read_odoo_file, _source_search_odoo, _trim_history, _trim_project_context
from backend.services.context_service import load_context_for_prompt, read_file
from backend.services.localization_service import build_localization_context, find_available_l10n_modules
from backend.services.technical_complexity_service import (
    analyze_technical_complexity,
    build_technical_complexity_context,
)


def test_default_consultant_memo_uses_dynamic_date_placeholder():
    skills = read_file("consultant-memo.md")

    assert '"2025-01-01"' not in skills
    assert "<date_du_jour>" in skills


def test_perspective_blocks_have_distinct_response_contracts():
    # Legacy aliases still work and route to BA / developer.
    ba = _perspective_block("business_analyst")
    developer = _perspective_block("developer")
    architect = _perspective_block("architect")
    support = _perspective_block("support")

    assert "Application Manager / Business Analyst Odoo" in ba
    assert "points de validation" in ba
    assert "Pas de snippet de code" in ba

    assert "développeur Odoo senior" in developer
    assert "chemin + numéro de ligne" in developer
    assert "Impact migration / upgrade" in developer

    assert "architecte Odoo / tech lead" in architect
    assert "recommandation finale" in architect

    assert "consultant support Odoo expérimenté" in support
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
    assert "Profil Business Analyst" not in context


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
    assert "Réflexe Studio / Studio + Dev" in context
    assert "`ir.actions.server`, `ir.cron`, `base.automation`" in context
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

    assert "Projet avec Studio" not in normal
    assert "Projet avec Studio" in studio


def test_context_router_includes_version_notes_for_version_sensitive_prompts():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles nouveautés Odoo 18 peuvent remplacer un custom CRM ?",
    )

    assert "Notes de version Odoo 18.0" in context


def test_context_router_includes_selected_fiscal_localization():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Comment gérer la TVA et les factures clients ?",
        country_code="CH",
    )

    assert "Localisation fiscale CH" in context
    assert "Localisation fiscale Suisse" in context
    assert "l10n_ch_reports" in context


def test_context_router_can_force_general_mode_localization():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Comment fonctionne le workflow des ventes ?",
        country_code="FR",
        force_localization=True,
    )

    assert "Localisation fiscale FR" in context
    assert "Localisation fiscale France" in context


def test_context_router_supports_english_context_defaults():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Which customer invoices are overdue and how should I diagnose payments?",
        perspective="technical",
        locale="en",
    )

    assert "Odoo consultant memo" in context
    assert "Accounting & Finance" in context
    assert "Advanced diagnostic patterns" in context
    assert "Notes de version" not in context


def test_context_router_supports_english_specialized_files():
    meeting = load_context_for_prompt("18.0", user_prompt="Generate meeting minutes", locale="en")
    studio = load_context_for_prompt("18.0", user_prompt="Which Studio x_studio fields exist?", locale="en")
    version = load_context_for_prompt("18.0", user_prompt="What are the Odoo 18 upgrade highlights?", locale="en")

    assert "Meeting minutes template" in meeting
    assert "Project with Studio" in studio
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


def test_priority_blocks_are_injected_before_routed_context():
    block = "## Bloc prioritaire test\nContenu prioritaire à ne jamais tronquer."
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse les commandes de vente",
        perspective="technical",
        priority_blocks=[block],
    )

    assert "Bloc prioritaire test" in context
    # Priority blocks come before the routed skills section.
    assert context.index("Bloc prioritaire test") < context.index("Mémo consultant Odoo")


def test_priority_blocks_returned_even_without_routed_sections():
    # No version/odoo_version, no prompt → no routed sections, but the priority
    # block must still be returned.
    context = load_context_for_prompt(priority_blocks=["## Bloc seul\nTexte."])
    assert "Bloc seul" in context


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

    search = await _source_search_odoo({"pattern": "Swiss", "file_types": ["*.py"]}, str(source))
    read = await _source_read_odoo_file({"path": "enterprise/l10n_ch_reports/__manifest__.py"}, str(source))

    assert search["ok"] is True
    assert "community/addons/l10n_ch/__manifest__.py" in search["files"]
    assert "enterprise/l10n_ch_reports/__manifest__.py" in search["files"]
    assert read["ok"] is True
    assert read["path"] == "enterprise/l10n_ch_reports/__manifest__.py"
    assert "Swiss enterprise reports" in read["content"]


@pytest.mark.asyncio
async def test_source_tools_resolve_base_module_under_odoo_addons(tmp_path):
    """The `base` module lives under odoo/addons/, not the top-level addons/.
    A path written as addons/base must still resolve to odoo/addons/base."""
    source = tmp_path / "sources" / "18.0"
    base_module = source / "odoo" / "addons" / "base"
    base_module.mkdir(parents=True)
    (base_module / "__manifest__.py").write_text("Base module manifest", encoding="utf-8")

    read = await _source_read_odoo_file({"path": "addons/base/__manifest__.py"}, str(source))
    search = await _source_search_odoo(
        {"pattern": "Base module", "path": "addons/base", "file_types": ["*.py"]}, str(source)
    )

    assert read["ok"] is True
    assert "Base module manifest" in read["content"]
    assert search["ok"] is True
    assert search["files_count"] == 1


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
    assert "actions serveur, actions planifiées, automatisations et record rules" in context


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
    # No Odoo connection → Studio could not be inspected, so confidence must
    # not be "high": a repo scan alone says nothing about Studio.
    assert result["confidence"] == "low"
    assert result["studio"]["inspected"] is False


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


class FakeStudioCustomizationOdoo:
    """Studio actually used: studio_customization module installed, with a
    non-Odoo author — and no custom dev modules at all."""

    def get_installed_modules(self):
        return [
            {"name": "base", "author": "Odoo S.A."},
            {"name": "web_studio", "author": "Odoo S.A."},
            {"name": "studio_customization", "author": "Acme Corp"},
        ]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        return []


@pytest.mark.asyncio
async def test_studio_customization_module_is_not_counted_as_custom_dev(tmp_path, monkeypatch):
    """The studio_customization module is generated by Studio; despite its
    non-Odoo author it must NOT be classified as custom dev, and its presence
    must mark the project as Studio even with no Studio records read."""
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, FakeStudioCustomizationOdoo(), None)

    assert result["installed_modules"]["custom_module_count"] == 0
    assert result["studio"]["module_installed"] is True
    assert result["studio"]["detected"] is True
    assert result["mode"] == "studio"
    assert result["confidence"] == "high"


class FakePartialStudioErrorOdoo:
    """Odoo where one Studio section (views) fails while the rest succeed."""

    def get_installed_modules(self):
        return [{"name": "base", "author": "Odoo S.A."}]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        if model == "ir.ui.view":
            raise RuntimeError("view read boom")
        if model == "ir.model.data" and ["model", "=", "ir.ui.view"] in (domain or []):
            return [{"res_id": 1}]
        return []


@pytest.mark.asyncio
async def test_partial_studio_section_error_lowers_confidence(tmp_path, monkeypatch):
    """A single failing Studio section must surface its error and pull
    confidence down to medium instead of being silently swallowed."""
    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", lambda: home)

    result = await analyze_technical_complexity("Demo", None, FakePartialStudioErrorOdoo(), None)

    assert result["studio"]["inspected"] is True
    assert "view read boom" in (result["studio"]["error"] or "")
    assert result["confidence"] == "medium"


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


class FakeAppsOdoo:
    """Odoo instance exposing installed modules with the `application` flag."""

    def get_installed_modules(self):
        return [
            {"name": "base", "shortdesc": "Base", "author": "Odoo S.A.", "application": False},
            {"name": "sale", "shortdesc": "Sales", "author": "Odoo S.A.", "application": True},
            {"name": "account", "shortdesc": "Accounting", "author": "Odoo S.A.", "application": True},
            {"name": "custom_connector", "shortdesc": "Custom Connector", "author": "Customer", "application": True},
        ]

    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        return []


@pytest.mark.asyncio
async def test_technical_complexity_captures_installed_apps(tmp_path, monkeypatch):
    """Installed apps (application=True) are captured so the AI knows which
    Odoo apps actually run on the instance — and surfaced in the context."""
    monkeypatch.setattr(Path, "home", lambda: tmp_path / "home")

    result = await analyze_technical_complexity("Demo", None, FakeAppsOdoo(), None)
    apps = result["installed_modules"]["installed_apps"]

    assert "Sales" in apps
    assert "Accounting" in apps
    assert "Custom Connector" in apps
    assert "Base" not in apps  # application=False → not an app

    context = build_technical_complexity_context(json.dumps(result))
    assert "Apps Odoo installées" in context
    assert "Sales" in context


def test_technical_complexity_context_is_injected_in_project_variable_prompt():
    from types import SimpleNamespace
    from backend.services.ai_service import build_system

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
    from backend.core.context_constants import MAX_HISTORY_TURNS

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
    from backend.core.context_constants import MAX_HISTORY_TURNS

    msgs = []
    for i in range(MAX_HISTORY_TURNS + 5):
        msgs.append({"role": "user", "content": f"q{i}"})
        msgs.append({"role": "assistant", "content": f"a{i}"})
    msgs.append({"role": "tool", "tool_call_id": "x", "content": "orphan"})
    msgs.append({"role": "user", "content": "follow-up"})

    trimmed = _trim_history(msgs)
    assert trimmed[0]["role"] == "user"


def test_build_system_general_returns_tuple_with_stable_variable_split():
    from backend.services.ai_service import build_system_general

    stable, variable = build_system_general(
        "18.0",
        source_path="/tmp/sources/18.0",
        context_md="## Mémo consultant Odoo\nDummy routed context",
        perspective="developer",
        response_language="fr",
        user_ctx="Consultant : Benoit",
    )
    # Stable part: identity, sources, instructions — all turn-invariant.
    assert "Consultant : Benoit" in stable
    assert "expert Odoo" in stable
    assert "/tmp/sources/18.0" in stable
    assert "source_search_odoo" in stable
    # Variable part: language directive, perspective block, routed context.
    assert "Réponds toujours en français" in variable
    assert "développeur Odoo senior" in variable
    assert "Mémo consultant Odoo" in variable
    # Sources instructions must NOT leak into the variable half.
    assert "source_search_odoo" not in variable


def test_build_system_migration_returns_tuple_with_target_path_in_stable():
    from backend.services.ai_service import build_system_migration

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
    assert "architecte Odoo / tech lead" in variable
    # Migration-specific addon should be present in architect mode.
    assert "Spécifique migration" in variable
    # Version-only migration (no profile) must not invent an instance block.
    assert "Instance source connectée" not in stable
    assert "Contexte projet" not in stable
    assert "<source_context>" in stable


def test_build_system_migration_injects_project_when_profile_set():
    """A project-mode migration must not be blind to the project: the source
    instance, its access rights and the free-text project context flow in."""
    from types import SimpleNamespace
    from backend.services.ai_service import build_system_migration

    profile = SimpleNamespace(
        db_url="https://acme.odoo.com", db_name="acme", odoo_version="17.0",
        company_name="Acme SA",
        project_context="Client e-commerce — double validation des commandes.",
        user_access_info='{"is_system": true, "user_name": "Admin"}',
    )
    stable, _ = build_system_migration(
        "17.0", "19.0", source_path="/tmp/s/17.0", target_path="/tmp/s/19.0",
        perspective="architect", profile=profile,
        project_context=profile.project_context,
    )
    assert "Instance source connectée" in stable
    assert "acme.odoo.com" in stable
    assert "Notes projet (consultant)" in stable
    assert "<project_context>" in stable
    assert "double validation" in stable
    assert "administrateur système" in stable
    # Live-instance method step exposes Studio inspection.
    assert "odoo_inspect_studio" in stable


def test_format_access_context_variants():
    from backend.services.ai_service import _format_access_context

    assert _format_access_context(None) == ""
    assert _format_access_context("not json") == ""
    assert "administrateur système" in _format_access_context('{"is_system": true, "user_name": "X"}')
    assert "administrateur ERP" in _format_access_context('{"is_admin": true}')
    assert "utilisateur standard" in _format_access_context('{"user_name": "Bob"}')


def test_build_system_injects_access_rights():
    from types import SimpleNamespace
    from backend.services.ai_service import build_system

    profile = SimpleNamespace(
        db_url="https://x.odoo.com", db_name="x", odoo_version="18.0",
        company_name="X", project_context=None,
        user_access_info='{"is_system": false, "is_admin": false, "user_name": "Bob"}',
    )
    stable, _ = build_system(profile)
    assert "utilisateur standard" in stable


# ── View / report inspection tools ───────────────────────────────

_SAMPLE_FORM_ARCH = (
    "<form>"
    '<field name="partner_id" readonly="1" domain="[]"/>'
    '<field name="amount_total"/>'
    '<button name="action_confirm" string="Confirmer" type="object"/>'
    '<notebook><page string="Lignes"><field name="order_line"/></page></notebook>'
    "</form>"
)


class FakeViewOdoo:
    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        if model == "ir.ui.view":
            wanted = next((d[2] for d in (domain or []) if d and d[0] == "model"), None)
            if wanted == "sale.order":
                return [{"type": "form"}, {"type": "list"}, {"type": "kanban"}]
            return []
        if model == "ir.actions.act_window":
            return [{"id": 7, "name": "Commandes", "view_mode": "list,form"}]
        if model == "ir.ui.menu":
            return [{"complete_name": "Ventes/Commandes", "action": "ir.actions.act_window,7"}]
        return []

    def call(self, model, method, args=None, kwargs=None):
        if method == "get_view":
            return {"name": "sale.order.form", "id": 42, "arch": _SAMPLE_FORM_ARCH}
        raise RuntimeError("unsupported method")


def test_summarize_arch_extracts_field_config():
    from backend.services.view_service import _summarize_arch

    summary = _summarize_arch(_SAMPLE_FORM_ARCH)
    fields = {f["name"]: f for f in summary["fields"]}
    assert fields["partner_id"]["readonly"] == "1"
    assert "domain" in fields["partner_id"]
    assert "amount_total" in fields
    assert summary["buttons"][0]["name"] == "action_confirm"
    assert "Lignes" in summary["notebook_pages"]


def test_summarize_arch_handles_bad_xml():
    from backend.services.view_service import _summarize_arch

    assert "parse_error" in _summarize_arch("<form><unclosed>")


@pytest.mark.asyncio
async def test_odoo_inspect_view_returns_structured_summary():
    from backend.services.view_service import inspect_odoo_view

    result = await inspect_odoo_view(FakeViewOdoo(), "sale.order", "form")
    assert result["ok"] is True
    assert set(result["available_view_types"]) == {"form", "list", "kanban"}
    assert result["view"]["name"] == "sale.order.form"
    fields = {f["name"]: f for f in result["arch_summary"]["fields"]}
    assert fields["partner_id"]["readonly"] == "1"
    assert result["access_paths"][0]["menus"] == ["Ventes/Commandes"]


@pytest.mark.asyncio
async def test_odoo_inspect_view_normalizes_tree_to_list():
    from backend.services.view_service import inspect_odoo_view

    result = await inspect_odoo_view(FakeViewOdoo(), "sale.order", "tree")
    assert result["requested_view_type"] == "list"


@pytest.mark.asyncio
async def test_odoo_inspect_view_rejects_unknown_model():
    from backend.services.view_service import inspect_odoo_view

    result = await inspect_odoo_view(FakeViewOdoo(), "does.not.exist")
    assert result["ok"] is False


class FakeReportOdoo:
    def search_read(self, model, domain=None, fields=None, limit=80, offset=0, order=""):
        if model == "ir.actions.report":
            return [{
                "id": 1, "name": "Facture", "report_name": "account.report_invoice",
                "model": "account.move", "report_type": "qweb-pdf",
                "paperformat_id": [3, "A4"],
            }]
        if model == "ir.ui.view":
            if any(d and d[0] == "inherit_id" for d in (domain or [])):
                return [{"id": 9, "name": "Studio invoice tweak", "key": "studio_customization.x"}]
            return [{"id": 5, "name": "Invoice", "key": "account.report_invoice"}]
        if model == "report.paperformat":
            return [{"name": "A4", "format": "A4", "orientation": "Portrait", "dpi": 90}]
        if model == "res.company":
            return [{"name": "Acme", "external_report_layout_id": [2, "Boxed"], "font": "Lato"}]
        return []

    def call(self, *a, **k):
        raise RuntimeError("n/a")


@pytest.mark.asyncio
async def test_odoo_inspect_report_detail_mode():
    from backend.services.view_service import inspect_odoo_report

    result = await inspect_odoo_report(FakeReportOdoo(), report_name="account.report_invoice")
    assert result["ok"] is True and result["mode"] == "detail"
    assert result["report"]["report_name"] == "account.report_invoice"
    assert result["qweb_templates"][0]["inherited_by"] == ["Studio invoice tweak"]
    assert result["paperformat"]["orientation"] == "Portrait"
    assert result["document_layout"]["external_report_layout_id"] == [2, "Boxed"]


def test_infer_perspective_strong_signals():
    from backend.services.ai_service import _infer_perspective, PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA, PERSPECTIVE_SUPPORT, PERSPECTIVE_ARCHITECT

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


# ── Context assembly contract: ordered sections ──────────────────
# The "predictable context" guarantee — these tests fail if the section
# order changes silently, which would shift LLM attention without notice.


def test_context_assembly_order_is_stable_for_business_question():
    """For an accounting question on v18 with a CH company, the assembled
    context must contain these sections in a fixed order. Any reordering
    changes how the LLM weighs information and must be an explicit decision."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Comment diagnostiquer les factures clients en retard ?",
        perspective="technical",
        country_code="CH",
    )

    expected_order = [
        "Mémo consultant Odoo",
        "Comptabilité & Finance",
        "Localisation fiscale CH",
    ]
    positions = [context.find(section) for section in expected_order]
    # Every expected section must be present.
    assert all(p >= 0 for p in positions), (
        f"Missing sections: {[s for s, p in zip(expected_order, positions) if p < 0]}"
    )
    # And appear in the declared order.
    assert positions == sorted(positions), (
        f"Section order drifted: {list(zip(expected_order, positions))}"
    )


def test_context_assembly_priority_blocks_always_lead():
    """Priority blocks must come first, period — that's the contract."""
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Quelles factures clients sont en retard ?",
        perspective="technical",
        priority_blocks=["## URGENT\nDeadline demain."],
    )

    assert context.find("URGENT") >= 0
    assert context.find("URGENT") < context.find("Mémo consultant Odoo")


def test_skill_playbook_is_routed_for_kpi_question():
    from backend.services.context_service import last_skill_route_candidates

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Donne-moi le CA par mois avec un KPI fiable",
        perspective="technical",
    )

    assert "Mode d'emploi des skills" in context
    assert "odoo_aggregate_records" in context
    assert "odoo_query_records" not in context or context.find("odoo_aggregate_records") < context.find("odoo_query_records")
    candidates = last_skill_route_candidates()
    read_group = next(item for item in candidates if item["name"] == "odoo_aggregate_records")
    assert read_group["selected"] is True
    assert read_group["score"] > 0
    assert "kpi" in read_group["reason"] or "intent:kpi" in read_group["reason"]


def test_skill_playbook_body_is_loaded_from_skill_markdown():
    from backend.skills.registry import skill_body

    content = skill_body("odoo_query_records") or ""

    assert "## odoo_query_records" in content
    assert "Quand l'utiliser" in content


def test_disabled_skill_playbook_is_not_routed():
    from backend.services.context_service import last_skill_route_candidates

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Donne-moi le CA par mois avec un KPI fiable",
        perspective="technical",
        disabled_tools=["odoo_aggregate_records"],
    )

    assert "odoo_aggregate_records" not in context
    assert all(item["name"] != "odoo_aggregate_records" for item in last_skill_route_candidates())


def test_security_custom_modules_routes_project_and_acl_playbooks():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Est-ce qu'il y a des règles de sécurité particulières dans les modules custom de NECA ?",
        perspective="technical",
    )

    assert "Mode d'emploi des skills" in context
    assert "odoo_inspect_security" in context
    assert "repo_list_modules" in context
    assert "repo_search_code" in context
    assert "repo_read_file" in context


def test_pilot_repo_read_file_routes_repo_prompt_with_candidate():
    from backend.services.context_service import last_skill_route_candidates
    from backend.skills.registry import skill_by_name

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Lis le manifest du dépôt client pour comprendre ce module custom",
        perspective="technical",
    )

    assert "repo_read_file" in context
    skill = skill_by_name("repo_read_file")
    assert skill is not None
    assert skill.permissions.scripts is False
    candidates = last_skill_route_candidates()
    assert any(item["name"] == "repo_read_file" and item["selected"] for item in candidates)


def test_pilot_odoo_inspect_studio_routes_advanced_skill_with_reference_metadata():
    from backend.services.context_service import last_skill_route_candidates
    from backend.skills.registry import skill_by_name

    context = load_context_for_prompt(
        "18.0",
        user_prompt="Audit Studio : quelles personnalisations x_studio et limites Studio avant migration ?",
        perspective="technical",
    )
    skill = skill_by_name("odoo_inspect_studio")

    assert "odoo_inspect_studio" in context
    assert skill is not None
    assert skill.permissions.scripts is True
    assert "studio_limits.md" in skill.references
    assert "scan_studio_customizations.py" in skill.scripts
    assert any(item["name"] == "odoo_inspect_studio" and item["selected"] for item in last_skill_route_candidates())


def test_record_analysis_routes_live_data_bundle():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse la commande sale.order SO001 avec toutes ses lignes",
        perspective="technical",
    )

    assert "odoo_inspect_fields" in context
    assert "odoo_query_records" in context
    assert "odoo_count_records" in context


def test_view_question_routes_view_menu_security_bundle():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Pourquoi ce champ est invisible sur l'écran formulaire et dans quel menu cliquer ?",
        perspective="technical",
    )

    assert "odoo_inspect_navigation" in context
    assert "odoo_inspect_view" in context
    assert "odoo_inspect_security" in context


def test_report_question_routes_report_bundle():
    context = load_context_for_prompt(
        "18.0",
        user_prompt="Analyse le rapport PDF facture et propose un xpath QWeb fiable",
        perspective="technical",
    )

    assert "odoo_inspect_report" in context
    assert "odoo_inspect_view" in context


def test_skill_playbook_selection_is_not_capped_to_six_skills():
    context = load_context_for_prompt(
        "18.0",
        user_prompt=(
            "odoo_query_records odoo_count_records odoo_aggregate_records odoo_inspect_fields "
            "odoo_inspect_modules odoo_inspect_security odoo_inspect_navigation "
            "odoo_inspect_studio odoo_inspect_view odoo_inspect_report source_search_odoo "
            "source_read_odoo_file source_show_commit repo_search_code repo_read_file "
            "repo_list_modules repo_count_source_lines"
        ),
        perspective="technical",
    )

    assert "odoo_inspect_navigation" in context
    assert "repo_count_source_lines" in context
