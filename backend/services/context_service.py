"""Manage editable markdown context files used to enrich AI prompts."""

import logging
import re
from collections import OrderedDict
from pathlib import Path
from typing import Optional, TypedDict

_logger = logging.getLogger(__name__)


class SkillRouteCandidate(TypedDict):
    name: str
    score: int
    reason: str
    selected: bool


class ContextTraceEvent(TypedDict, total=False):
    type: str
    run_id: str
    skill: str
    filename: str
    chars: int
    original_chars: int
    capped_chars: int
    heading: str
    reason: str
    cached: bool

from ..core.context_constants import CONTEXT_BUDGET_CHARS as _CONTEXT_BUDGET_CHARS

from .context_defaults import (
    _PROFILE_DEFAULTS, _PROFILE_DEFAULTS_EN,
    _SKILLS_MD, _SKILLS_MD_EN,
    _MEETING_MINUTE_MD, _MEETING_MINUTE_MD_EN,
    _MIGRATION_MD, _MIGRATION_MD_EN,
    _STUDIO_MD, _STUDIO_MD_EN,
    _CREATION_MD, _CREATION_MD_EN,
    _PROFILE_CREATOR_MD, _PROFILE_CREATOR_MD_EN,
    _DEV_MD, _DEV_MD_EN,
    _VERSION_NOTES, _VERSION_NOTES_EN,
    _L10N_NOTES, _L10N_NOTES_EN,
)
from .output_renderer import DEFAULT_OUTPUT_RENDERER, OutputTemplateSelection
from ..skills.registry import SKILL_DEFINITIONS, normalize_disabled_skill_names

_CONTEXT_DIR = Path.home() / ".odoo-consultant" / "context"
_SUPPORTED_LOCALES = {"fr", "en"}
_DEFAULT_LOCALE = "fr"


def _canonical_disabled(disabled_tools: Optional[list[str]]) -> set[str]:
    disabled, _ignored_locked = normalize_disabled_skill_names(disabled_tools)
    return set(disabled)


_LAST_CONTEXT_TRACE: list[ContextTraceEvent] = []
_CURRENT_CONTEXT_RUN_ID: Optional[str] = None


def _begin_context_trace(run_id: Optional[str]) -> None:
    global _LAST_CONTEXT_TRACE, _CURRENT_CONTEXT_RUN_ID
    _LAST_CONTEXT_TRACE = []
    _CURRENT_CONTEXT_RUN_ID = run_id


def _record_context_trace(event: ContextTraceEvent) -> None:
    if _CURRENT_CONTEXT_RUN_ID and "run_id" not in event:
        event = {**event, "run_id": _CURRENT_CONTEXT_RUN_ID}
    _LAST_CONTEXT_TRACE.append(event)


def last_context_trace() -> list[ContextTraceEvent]:
    return list(_LAST_CONTEXT_TRACE)

# Minimum accumulated score for a skill to be injected into the prompt.
# Below this floor, a skill candidate is recorded with selected=False and a
# "below-threshold" reason so it stays visible in observability without
# polluting the context. Tuned so that any single signal currently in the
# router (mode-default=25, intent=40, keywords=60, patterns=75-90, explicit=100)
# crosses the floor on its own; only weak accidental matches fall under it.
_MIN_SKILL_SCORE = 25


_ALLOWED_NAME = re.compile(r'^[\w\-\.]+\.md$')
_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$", re.MULTILINE)
_CORE_SKILLS_HEADINGS = (
    "Rôle de l'assistant",
    "Mode d'emploi pour l'IA",
    "Règles d'or du consultant",
    "Contrat de réponse par défaut",
)
_CORE_SKILLS_HEADINGS_EN = (
    "Assistant role",
    "How the AI should use this file",
    "Consultant rules",
    "Default response contract",
)

_DOMAIN_RULES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("Comptabilité & Finance", "Accounting & Finance", ("compta", "account", "accounting", "finance", "invoice", "facture", "avoir", "refund", "payment", "paiement", "écriture", "ecriture", "journal", "tax", "taxe", "analytic", "analytique", "budget", "reconcile", "rapprochement")),
    ("Ventes & CRM", "Sales & CRM", ("sale", "sales", "vente", "quote", "quotation", "devis", "order", "commande", "crm", "lead", "opportun", "pipeline", "commercial", "subscription", "abonnement")),
    ("Achats", "Purchasing", ("purchase", "achat", "vendor", "supplier", "fournisseur", "rfq", "appel d'offre", "procurement", "approvisionnement")),
    ("Stock & Logistique", "Inventory & Logistics", ("stock", "inventory", "picking", "delivery", "livraison", "receipt", "réception", "reception", "transfer", "transfert", "quant", "serial", "warehouse", "entrepôt", "entrepot")),
    ("Ressources Humaines & Paie", "HR & Payroll", ("hr", "employee", "employé", "employe", "leave", "congé", "conge", "payroll", "paie", "payslip", "contract", "contrat", "attendance", "présence", "presence")),
    ("Projets & Timesheets", "Projects & Timesheets", ("project", "projet", "task", "tâche", "timesheet", "feuille de temps", "milestone", "jalon")),
    # "of" alone is a false-positive magnet (preposition in English). Use the
    # full expression "ordre de fabrication" / "manufacturing order" instead.
    ("Fabrication (MRP)", "Manufacturing (MRP)", ("manufacturing", "fabrication", "mrp", "manufacturing order", "ordre de fabrication", "bom", "nomenclature", "workorder", "work center", "poste de charge")),
    ("eCommerce & Site Web", "eCommerce & Website", ("ecommerce", "e-commerce", "website", "site web", "panier", "shop", "seo", "portal", "portail")),
    # "pos" matches "propose", "exposé"… require either word-boundary "pos" or
    # an unambiguous multi-word phrase. Handled by _term_matches() below.
    ("Point de Vente (POS)", "Point of Sale (POS)", ("pos", "point of sale", "point de vente", "caisse", "session pos")),
    ("Règles de sécurité et droits d'accès", "Security & Access Rights", ("right", "permission", "droit", "security", "sécurité", "securite", "acl", "record rule", "ir.rule", "groupe", "accès")),
    # "custom" matches "customer" — handled by word-boundary logic.
    ("Customisations : comment les repérer", "Customizations: how to spot them", ("custom", "customization", "personnalisation", "studio", "third-party module", "module tiers", "module custom", "x_studio")),
    ("Performance & Optimisation", "Performance & Optimization", ("performance", "slow", "slowness", "lenteur", "optimization", "optimisation", "timeout", "lent")),
)

_DIAGNOSTIC_TERMS = ("diagnostic", "diagnosti", "diagnos", "audit", "anomalie", "anomaly", "bloqué", "bloque", "blocked", "problème", "probleme", "problem", "issue", "erreur", "error", "incohérence", "incoherence", "duplicate", "doublon")
_MEETING_TERMS = ("compte-rendu", "compte rendu", "meeting minute", "réunion", "reunion", "pv de réunion", "pv de reunion")
_STUDIO_TERMS = ("studio", "x_studio", "personnalisation", "customisation", "champ custom", "modèle custom", "modele custom", "odoo_inspect_studio")
# Custom-development vocabulary: triggers loading dev.md when the prompt
# explicitly references custom code patterns or the project repo.
_DEV_TERMS = (
    "module custom", "custom module", "dev custom", "custom dev",
    "_inherit", "_inherits", "@api.depends", "@api.constrains", "@api.onchange",
    "repo_search_code", "repo_read_file", "code custom",
    "depot client", "dépôt client", "client repo", "modules sur mesure",
    "surcharge", "monkey patch", "monkey_patch",
)
# Removed bare "version" (matches every prompt mentioning Odoo versions); kept
# explicit migration/upgrade vocabulary and version tokens.
_VERSION_TERMS = ("migration", "upgrade", "nouveauté", "nouveaute", "changement de version", "breaking", "deprecated", "dépréci", "depreci", "supprimé", "supprime", "renommé", "renomme", "compatib", "v15", "v16", "v17", "v18", "v19", "odoo 15", "odoo 16", "odoo 17", "odoo 18", "odoo 19")

# Single-word tokens of ≤6 chars that are ambiguous substrings of common words.
# Matched with word boundaries instead of plain substring containment.
_BOUNDARY_TOKENS = frozenset({
    "pos", "of", "lot", "serie", "série", "x_",
    "hr", "vat", "mrp", "tax", "seo", "acl",
    "custom", "right", "group", "groupe", "groupes", "groups",
    "read", "view", "vue", "orm",
})

_SECTION_TITLES = {
    "fr": {
        "skills": "Compétences consultant",
        "meeting": "Modèle compte-rendu",
        "studio": "Projet avec Studio",
        "dev": "Projet avec dev custom",
        "version": "Notes de version Odoo {version}",
        "migration": "Méthodologie de migration",
        "creation": "Méthodologie de création Studio",
        "profile": "Profil de réponse",
        "creator_profile": "Conventions Studio",
        "localization": "Localisation fiscale {country}",
        "creator_intent": "Spécificité de l'opération demandée",
        "skill_playbooks": "Mode d'emploi des skills",
        "examples": "Exemples de tools en situation",
    },
    "en": {
        "skills": "Consultant skills",
        "meeting": "Meeting minutes template",
        "studio": "Project with Studio",
        "dev": "Project with custom dev",
        "version": "Odoo {version} release notes",
        "migration": "Migration methodology",
        "creation": "Studio creation methodology",
        "profile": "Response profile",
        "creator_profile": "Studio conventions",
        "localization": "Fiscal localization {country}",
        "creator_intent": "Operation-specific guidance",
        "skill_playbooks": "Skill playbooks",
        "examples": "Tool usage examples",
    },
}

# Curated fiscal-localization knowledge files are routed in when the active /
# selected country is known and the prompt is fiscally relevant.
_L10N_FILE_RE = re.compile(r"^l10n_([a-z]{2})\.md$")
_FISCAL_TERMS = (
    "compta", "comptabil", "account", "accounting", "fiscal", "fisc",
    "tva", "vat", "taxe", "tax", "impôt", "impot", "facture", "factur",
    "invoice", "avoir", "refund", "plan comptable", "chart of accounts",
    "écriture", "ecriture", "journal", "localisation", "localization", "l10n",
    "devise", "currency", "reporting légal", "legal report", "fec", "intrastat",
    "qr-bill", "qr bill", "qr-facture", "bvr", "iso 20022", "paie", "payroll",
    "salaire", "déclaration", "declaration", "swissdec", "factur-x", "chorus",
)

# Map of perspective → markdown filename. Legacy aliases are mapped to their
# closest new role so older clients (or stored prompts) still pick up a profile.
_PROFILE_FILES = {
    "support": "profile-support.md",
    "business_analyst": "profile-business-analyst.md",
    "architect": "profile-architect.md",
    "developer": "profile-developer.md",
    # legacy aliases
    "functional": "profile-business-analyst.md",
    "technical": "profile-developer.md",
}

_BA_LIKE = {"business_analyst", "functional"}

_SKILL_INTENT_BUNDLES: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("record_analysis", (
        "analyse", "analyser", "analyze", "detail", "détail", "record", "records",
        "fiche", "ligne", "lignes", "line", "lines", "commande", "order",
        "sale.order", "facture", "invoice", "devis", "partner", "contact",
    ), ("odoo_inspect_fields", "odoo_query_records", "odoo_count_records")),
    ("live_data", (
        "liste", "lister", "list", "montre", "show", "affiche", "display",
        "donnée", "données", "data", "enregistrement", "enregistrements",
        "search_read", "export", "voir les", "récupère", "recupere",
    ), ("odoo_inspect_fields", "odoo_query_records", "odoo_count_records")),
    ("kpi", (
        "kpi", "indicateur", "dashboard", "tableau de bord", "synthèse",
        "synthese", "summary", "agrég", "aggregate", "group by", "par mois",
        "par statut", "par commercial", "chiffre d'affaires", "ca par",
        "total par", "somme", "moyenne", "average",
    ), ("odoo_aggregate_records", "odoo_count_records")),
    ("fields", (
        "champ", "champs", "field", "fields", "relation", "many2one",
        "one2many", "many2many", "x_", "x_studio", "invalid field",
        "structure", "schema", "schéma",
    ), ("odoo_inspect_fields",)),
    ("view_screen", (
        "écran", "ecran", "screen", "vue", "view", "formulaire", "form",
        "liste", "kanban", "readonly", "invisible", "onglet", "bouton",
        "button", "où cliquer", "ou cliquer", "where click", "menu",
        "navigation", "accéder", "acceder",
    ), ("odoo_inspect_navigation", "odoo_inspect_view", "odoo_inspect_security")),
    ("report", (
        "rapport", "report", "pdf", "qweb", "template", "xpath",
        "facture pdf", "devis pdf", "bon de livraison", "layout",
    ), ("odoo_inspect_report", "odoo_inspect_view")),
    ("security", (
        "sécurité", "securite", "security", "droit", "droits", "access",
        "acl", "ir.model.access", "record rule", "ir.rule", "permission",
        "groupe", "groups", "ne voit pas", "invisible",
    ), ("odoo_inspect_security", "odoo_inspect_navigation")),
    ("studio", (
        "studio", "x_studio", "personnalisation", "customization",
        "automatisation", "automation", "base.automation", "action serveur",
        "server action", "modèle custom", "modele custom", "champ custom",
    ), ("odoo_inspect_studio", "odoo_inspect_fields", "odoo_inspect_view")),
    ("odoo_source", (
        "source odoo", "sources odoo", "standard odoo", "code odoo", "méthode", "methode",
        "method", "class", "_name", "_inherit", "orm", "api.", "@api",
        "comportement standard", "standard behavior", "odoo/addons", ".py odoo",
    ), ("source_search_odoo", "source_read_odoo_file")),
    ("project_source", (
        "repo", "dépôt", "depot", "code custom", "module custom",
        "modules custom", "override", "surcharge", "spécifique", "specifique",
        "client repo", "project source", "__manifest__",
    ), ("repo_list_modules", "repo_search_code", "repo_read_file")),
    ("migration_target", (
        "migration", "upgrade", "version cible", "target version", "breaking",
        "compatibilité", "compatibilite", "renommé", "renomme", "supprimé",
        "supprime", "deprecated", "dépréci",
    ), ("odoo_inspect_modules", "odoo_inspect_studio", "repo_list_modules", "migration_search_target_source", "migration_read_target_file")),
    ("volume", (
        "volumétrie", "volumetrie", "loc", "lignes de code", "lines of code",
        "taille", "size", "effort", "combien de lignes",
    ), ("repo_count_source_lines", "repo_list_modules")),
    ("commit", (
        "commit", "sha", "diff", "patch", "git show", "régression", "regression",
    ), ("source_show_commit",)),
)

# Short profile-shaping snippets injected as priority blocks when the project
# complexity tells us the role should adapt. They are intentionally tiny
# (~300-500 chars) so the budget cost is negligible while the LLM gets the
# *attitude* right for the kind of project at hand.
_COMPLEXITY_PROFILE_FR = {
    "studio": (
        "Adaptation profil — projet Studio.\n"
        "Avant toute proposition technique, vérifie ce qui a été fait via Studio "
        "(`odoo_inspect_studio`, `x_*`, `studio_customization.*`). Beaucoup de "
        "comportements « inexplicables » viennent de là. Ne suggère un module "
        "custom qu'après avoir confirmé que Studio ne couvre pas le besoin."
    ),
    "dev": (
        "Adaptation profil — projet avec dev custom.\n"
        "Le code custom du dépôt client peut surcharger n'importe quel modèle / "
        "vue / action standard. Avant de répondre « comportement standard » ou "
        "« champ inexistant », vérifie avec `repo_search_code` et "
        "`repo_read_file`. La vue assemblée (`odoo_inspect_view`) reste la "
        "vérité finale."
    ),
    "studio_dev": (
        "Adaptation profil — projet Studio + dev custom.\n"
        "Studio ET dev cohabitent. Ordre d'investigation : (1) instance live, "
        "(2) Studio (`odoo_inspect_studio`), (3) code custom (`repo_search_code`), "
        "(4) standard Odoo. Toujours déterminer d'où vient un comportement avant "
        "de proposer une correction — Studio peut surcharger un héritage custom "
        "et inversement."
    ),
}

_COMPLEXITY_PROFILE_EN = {
    "studio": (
        "Profile tuning — Studio project.\n"
        "Before any technical proposal, check what was done via Studio "
        "(`odoo_inspect_studio`, `x_*`, `studio_customization.*`). Many « unexplained » "
        "behaviours come from there. Suggest a custom module only after "
        "confirming Studio cannot cover the need."
    ),
    "dev": (
        "Profile tuning — project with custom dev.\n"
        "The client repo's custom code can override any standard model / view / "
        "action. Before answering « standard behaviour » or « field does not exist », "
        "check with `repo_search_code` and `repo_read_file`. The assembled "
        "view (`odoo_inspect_view`) is the final truth."
    ),
    "studio_dev": (
        "Profile tuning — Studio + custom dev project.\n"
        "Studio AND custom dev coexist. Investigation order: (1) live instance, "
        "(2) Studio (`odoo_inspect_studio`), (3) custom code (`repo_search_code`), "
        "(4) standard Odoo. Always identify the source of a behaviour before "
        "proposing a fix — Studio can override custom inheritance and vice-versa."
    ),
}


# Cross-cutting sections of a version note that are ALWAYS kept regardless
# of the prompt — they describe what changes everyone needs to know.
_VERSION_CORE_HEADINGS = (
    "Prérequis techniques", "Technical prerequisites",
    "Nouveaux modules", "New modules",
    "Suppressions", "Removals",
    "Suppressions / remplacements", "Removals / replacements",
    "Modifications majeures", "Major changes",
    "Compatibilité", "Compatibility",
)

# Map of heading-substring -> tuple of keyword terms, derived from _DOMAIN_RULES.
# Lets us decide whether a domain section ("## Comptabilité") matches the user
# prompt without re-parsing _DOMAIN_RULES at every call.
_DOMAIN_HEADING_KEYWORDS: list[tuple[tuple[str, ...], tuple[str, ...]]] = [
    (("Comptabilité", "Compta", "Accounting", "Finance"),  rule[2])
    for rule in _DOMAIN_RULES if "Comptabilité" in rule[0]
] + [
    (("Vente", "Sales", "CRM"),                            rule[2])
    for rule in _DOMAIN_RULES if "Vente" in rule[0] or "CRM" in rule[0]
] + [
    (("Achat", "Purchas"),                                 rule[2])
    for rule in _DOMAIN_RULES if "Achats" in rule[0]
] + [
    (("Stock", "Inventory", "Logist"),                     rule[2])
    for rule in _DOMAIN_RULES if "Stock" in rule[0]
] + [
    (("RH", "HR", "Paie", "Payroll", "Ressources Humaines"), rule[2])
    for rule in _DOMAIN_RULES if "Humaines" in rule[0] or "HR " in rule[0]
] + [
    (("Projet", "Project", "Timesheet"),                   rule[2])
    for rule in _DOMAIN_RULES if "Projet" in rule[0] or "Project" in rule[0]
] + [
    (("Fabrication", "Manufacturing", "MRP"),              rule[2])
    for rule in _DOMAIN_RULES if "MRP" in rule[0]
] + [
    (("eCommerce", "Site Web", "Website", "Shop"),         rule[2])
    for rule in _DOMAIN_RULES if "eCommerce" in rule[0]
] + [
    (("Point de Vente", "POS"),                            rule[2])
    for rule in _DOMAIN_RULES if "POS" in rule[0]
] + [
    (("Performance", "Optimisation", "Optimization"),       rule[2])
    for rule in _DOMAIN_RULES if "Performance" in rule[0]
]


def _filter_version_note_by_domain(content: str, prompt: str) -> str:
    """Keep cross-cutting sections + domain sections matching the prompt.

    On a typical 5kB version note this trims away 40-70% of irrelevant
    content (e.g. HR/POS/eCommerce sections when the question is purely
    accounting). Empty or whole-document fallback if nothing matches."""
    if not content or not prompt:
        return content
    parts = _markdown_sections(content)
    if not parts:
        return content
    kept: list[str] = []
    matched_domains = 0
    for heading, chunk, _level in parts:
        # Always keep the document-leading chunk and the core cross-cutting
        # sections — they carry the version's identity and overall changes.
        if not heading or any(core_h in heading for core_h in _VERSION_CORE_HEADINGS):
            kept.append(chunk)
            continue
        domain_hit = False
        for heading_subs, keywords in _DOMAIN_HEADING_KEYWORDS:
            if any(sub in heading for sub in heading_subs):
                if _has_any(prompt, keywords):
                    kept.append(chunk)
                    matched_domains += 1
                    domain_hit = True
                break
        if not domain_hit and not any(any(sub in heading for sub in subs)
                                       for subs, _kw in _DOMAIN_HEADING_KEYWORDS):
            # Heading not recognised as a domain → keep (safe fallback).
            kept.append(chunk)
    # If we filtered out everything domain-specific AND the prompt clearly
    # asks about a domain, the user wants the *whole* note rather than a
    # core-only stub. Detect this by checking the prompt against any of the
    # domain keyword bags.
    if matched_domains == 0:
        any_domain_intent = any(_has_any(prompt, kw) for _subs, kw in _DOMAIN_HEADING_KEYWORDS)
        if not any_domain_intent:
            return "\n\n".join(kept)
        return content  # prompt is domain-y but no version section matched → keep all
    return "\n\n".join(kept)


def complexity_profile_block(complexity_mode: Optional[str], locale: Optional[str] = None) -> str:
    """Return a short profile-shaping snippet for the given project complexity.
    Empty string when no adaptation is needed (standard project, no project)."""
    mode = (complexity_mode or "").lower()
    table = _COMPLEXITY_PROFILE_EN if normalize_locale(locale) == "en" else _COMPLEXITY_PROFILE_FR
    return table.get(mode, "")


def normalize_locale(locale: Optional[str]) -> str:
    code = (locale or _DEFAULT_LOCALE).split("-")[0].lower()
    return code if code in _SUPPORTED_LOCALES else _DEFAULT_LOCALE


def context_dir(locale: Optional[str] = None) -> Path:
    lang = normalize_locale(locale)
    path = _CONTEXT_DIR if lang == _DEFAULT_LOCALE else _CONTEXT_DIR / lang
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe(name: str, locale: Optional[str] = None) -> Path:
    if not _ALLOWED_NAME.match(name):
        raise ValueError(f"Nom de fichier invalide : {name}")
    return context_dir(locale) / name


def list_files(locale: Optional[str] = None) -> list[dict]:
    d = context_dir(locale)
    result = []
    for f in sorted(d.glob("*.md")):
        stat = f.stat()
        result.append({"name": f.name, "size": stat.st_size, "modified": stat.st_mtime})
    return result


# Mtime-aware cache for context files. A single chat turn calls read_file()
# 4-6 times (skills + profile + studio + version notes ± migration), and every
# turn re-reads from disk. The cache key is (path, mtime_ns), so any file edit
# from the Settings page invalidates instantly without explicit busting.
_READ_CACHE: dict[tuple[str, int], str] = {}
_READ_CACHE_MAX = 64


def _cached_read(path: Path) -> str:
    key = (str(path), path.stat().st_mtime_ns)
    cached = _READ_CACHE.get(key)
    if cached is not None:
        return cached
    text = path.read_text(encoding="utf-8")
    # Bound cache size; on overflow drop oldest insert (Python 3.7+ preserves insertion order).
    if len(_READ_CACHE) >= _READ_CACHE_MAX:
        _READ_CACHE.pop(next(iter(_READ_CACHE)))
    _READ_CACHE[key] = text
    return text


def read_file(name: str, locale: Optional[str] = None) -> str:
    lang = normalize_locale(locale)
    path = _safe(name, lang)
    if not path.exists():
        content = _default_content(name, lang)
        if content:
            return content  # return default without writing to disk
        raise FileNotFoundError(f"{name} introuvable")
    return _cached_read(path)


def write_file(name: str, content: str, locale: Optional[str] = None) -> None:
    _safe(name, locale).write_text(content, encoding="utf-8")


def delete_file(name: str, locale: Optional[str] = None) -> None:
    path = _safe(name, locale)
    if path.exists():
        path.unlink()


def _normalize_text(text: Optional[str]) -> str:
    return (text or "").casefold()


_BOUNDARY_PATTERN_CACHE: dict[str, "re.Pattern[str]"] = {}


def _term_matches(text: str, term: str) -> bool:
    """Return True if *term* appears in *text*.

    Ambiguous short tokens (see _BOUNDARY_TOKENS) are matched with word
    boundaries so that e.g. "pos" doesn't match "propose" and "custom"
    doesn't match "customer". Everything else uses fast substring matching.
    """
    if term in _BOUNDARY_TOKENS:
        pattern = _BOUNDARY_PATTERN_CACHE.get(term)
        if pattern is None:
            pattern = re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", re.UNICODE)
            _BOUNDARY_PATTERN_CACHE[term] = pattern
        return bool(pattern.search(text))
    return term in text


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(_term_matches(text, term) for term in terms)


# Heuristic: a single late hit on a generic term is often a false positive
# ("a quick note on the studio mode"). The prompt is *about* the topic when
# either (a) two or more hits, or (b) the first hit lands in the early window
# — that's where the user typically states their actual subject.
_TOPIC_EARLY_WINDOW = 80
_TOPIC_MIN_HITS = 2


def _term_hit_positions(text: str, term: str) -> list[int]:
    """All match positions of *term* in *text* (boundary-aware for short tokens)."""
    if term in _BOUNDARY_TOKENS:
        pattern = _BOUNDARY_PATTERN_CACHE.get(term)
        if pattern is None:
            pattern = re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", re.UNICODE)
            _BOUNDARY_PATTERN_CACHE[term] = pattern
        return [m.start() for m in pattern.finditer(text)]
    return [m.start() for m in re.finditer(re.escape(term), text)]


def _is_topic_of(text: str, terms: tuple[str, ...]) -> bool:
    """Stricter than ``_has_any``: returns True when the prompt is *about* one
    of the terms, not just contains it incidentally. Used for routing markdown
    files where a false positive costs tokens and degrades answer focus."""
    total_hits = 0
    early_hit = False
    for term in terms:
        positions = _term_hit_positions(text, term)
        if not positions:
            continue
        total_hits += len(positions)
        if not early_hit and positions[0] < _TOPIC_EARLY_WINDOW:
            early_hit = True
        if total_hits >= _TOPIC_MIN_HITS or early_hit:
            return True
    return False


def _markdown_sections(content: str) -> list[tuple[str, str, int]]:
    """Split a markdown document by level-2/level-3 headings.

    Returns (heading, markdown_chunk, level). Text before the first level-2 heading is
    attached to the first section so the document title is preserved. A section keeps
    its nested lower-level headings, so selecting a level-2 heading also keeps its
    level-3 operational details.
    """
    matches = list(_HEADING_RE.finditer(content))
    if not matches:
        return [("", content.strip(), 0)] if content.strip() else []

    sections: list[tuple[str, str, int]] = []
    preamble = content[:matches[0].start()].strip()
    for idx, match in enumerate(matches):
        heading = match.group(2).strip()
        level = len(match.group(1))
        end = len(content)
        for next_match in matches[idx + 1:]:
            next_level = len(next_match.group(1))
            if next_level <= level:
                end = next_match.start()
                break
        chunk = content[match.start():end].strip()
        if idx == 0 and preamble:
            chunk = f"{preamble}\n\n{chunk}"
        sections.append((heading, chunk, level))
    return sections


def _heading_for_locale(fr_heading: str, en_heading: str, locale: str) -> str:
    return en_heading if locale == "en" else fr_heading


def _select_skills_context(prompt: str, perspective: Optional[str], locale: Optional[str] = None) -> str:
    lang = normalize_locale(locale)
    skills = read_file("skills.md", lang)
    sections = _markdown_sections(skills)
    by_heading = {heading: chunk for heading, chunk, _level in sections}
    selected: list[str] = []

    for heading in (_CORE_SKILLS_HEADINGS_EN if lang == "en" else _CORE_SKILLS_HEADINGS):
        chunk = by_heading.get(heading)
        if chunk:
            selected.append(chunk)

    matched_domains: list[str] = []
    for fr_heading, en_heading, terms in _DOMAIN_RULES:
        if _has_any(prompt, terms):
            matched_domains.append(_heading_for_locale(fr_heading, en_heading, lang))

    if not matched_domains and perspective in _BA_LIKE:
        matched_domains.extend(["Essential cross-functional models", "Client analysis best practices"] if lang == "en" else ["Modèles transversaux essentiels", "Bonnes pratiques d'analyse client"])
    elif not matched_domains:
        matched_domains.append("Essential cross-functional models" if lang == "en" else "Modèles transversaux essentiels")

    for heading in matched_domains:
        chunk = by_heading.get(heading)
        if chunk and chunk not in selected:
            selected.append(chunk)

    if _has_any(prompt, _DIAGNOSTIC_TERMS):
        chunk = by_heading.get("Advanced diagnostic patterns" if lang == "en" else "Patterns de diagnostic avancés")
        if chunk:
            selected.append(chunk)

    supporting_headings = ("Status workflows — quick reference", "Client analysis best practices") if lang == "en" else ("Workflow des statuts — Référence rapide", "Bonnes pratiques d'analyse client")
    for heading in supporting_headings:
        if heading in by_heading and (_has_any(prompt, _DIAGNOSTIC_TERMS) or perspective in _BA_LIKE):
            selected.append(by_heading[heading])

    return "\n\n".join(dict.fromkeys(selected)).strip()


def _candidate_reason_has(candidate: SkillRouteCandidate, marker: str) -> bool:
    return marker in candidate.get("reason", "")


def _is_protected_route(candidate: SkillRouteCandidate) -> bool:
    reason = candidate.get("reason", "")
    return (
        "explicit-skill-name" in reason
        or "creator-default" in reason
        or "migration-default" in reason
        or "template:" in reason
    )


def _is_explicit_invocation_reason(reason: str) -> bool:
    return (
        "explicit-skill-name" in reason
        or "creator-default" in reason
        or "migration-default" in reason
        or "template:" in reason
    )


def _append_route_reason(candidate: SkillRouteCandidate, reason: str) -> None:
    if reason not in candidate["reason"]:
        candidate["reason"] = f"{candidate['reason']}, {reason}"


def _prune_skill_routes(
    prompt_norm: str,
    selected_skills: list[str],
    route_candidates: dict[str, SkillRouteCandidate],
) -> list[str]:
    """Remove low-confidence neighboring skills after scoring.

    The first routing pass intentionally keeps broad signals so candidates are
    observable. This second pass is conservative: explicit skill names, mode
    defaults and output templates are never pruned. The goal is to prevent a
    single strong intent (QWeb report, view XML, ACL, SHA commit) from dragging
    in unrelated live-data/source playbooks through generic words like
    ``facture``, ``form`` or ``analyse``.
    """
    keep = set(selected_skills)

    def selected(name: str) -> bool:
        return name in keep and bool(route_candidates.get(name, {}).get("selected"))

    def deselect(name: str, reason: str) -> None:
        candidate = route_candidates.get(name)
        if candidate is None or name not in keep or _is_protected_route(candidate):
            return
        keep.discard(name)
        candidate["selected"] = False
        _append_route_reason(candidate, reason)

    def lacks_any(terms: tuple[str, ...]) -> bool:
        return not _has_any(prompt_norm, terms)

    data_action_terms = (
        "combien", "count", "nombre", "liste", "lister", "list",
        "montre", "montre-moi", "show", "show me",
        "affiche-moi", "afficher", "display the", "display me",
        "records", "enregistrements", "search_read",
        "export", "valeur", "valeurs", "données", "donnees", "data",
    )
    attachment_action_terms = (
        "pièce jointe", "piece jointe", "attachment", "upload", "uploaded",
        "uploadé", "uploade", "joindre", "joint en", "extrais", "extraire",
        "extract", "comparer ce", "compare this", "pdf scanné", "pdf scanne",
        "capture", "screenshot",
    )
    navigation_terms = ("où cliquer", "ou cliquer", "where click", "menu", "navigation", "accéder", "acceder", "naviguer", "navigate")
    security_strong_terms = (
        "acl", "ir.model.access", "record rule", "ir.rule", "security rule",
        "règle de sécurité", "règles de sécurité", "regle de securite",
        "droits d'accès", "droit d'accès", "access right", "access rights",
        "permission", "groupe", "groups", "ne voit pas", "accès refusé",
        "acces refuse", "access denied",
    )
    # "Actor" terms: tell apart a UI question ("pourquoi le champ est
    # invisible" — pure layout) from a security question ("pourquoi
    # l'utilisateur ne voit pas ce champ" — ACL / record rule).
    security_actor_terms = (
        "utilisateur", "user ", "users ", "groupe", "groups", "rôle",
        "role", "ne voit pas", "access denied", "accès refusé",
        "acces refuse",
    )

    # QWeb/report questions often contain business nouns such as "facture" and
    # the generic verb "analyse". Those should not imply live record reading.
    if selected("odoo_inspect_report"):
        if lacks_any(data_action_terms):
            for name in ("odoo_query_records", "odoo_count_records", "odoo_aggregate_records", "odoo_inspect_fields"):
                deselect(name, "pruned:report-focus")
        if lacks_any(attachment_action_terms):
            deselect("runtime_attachment_handler", "pruned:report-focus")
        # The "report" intent bundle adds ``odoo_inspect_view`` because reports
        # share XML inheritance with views. Suppress view when the prompt is
        # purely about a printed report (no view-architecture term present).
        view_arch_terms = (
            "xpath", "attrs", "states", "readonly", "invisible",
            "héritage vue", "heritage vue", "inherit_id", "view inheritance",
            "vue form", "vue list", "vue kanban", "vue search",
        )
        if lacks_any(view_arch_terms):
            deselect("odoo_inspect_view", "pruned:report-focus")

    # Pure XML/view-architecture prompts should stay focused on the assembled
    # view unless the user also asks where to click or describes an access issue.
    if selected("odoo_inspect_view") and _has_any(prompt_norm, ("attrs", "states", "readonly", "invisible", "xpath", "formulaire", "form", "vue", "view")):
        if lacks_any(navigation_terms):
            deselect("odoo_inspect_navigation", "pruned:view-focus")
        # Keep security only when the UI-visibility symptom is paired with an
        # actor reference. "Pourquoi le champ est invisible" → layout. "Pourquoi
        # l'utilisateur ne voit pas le champ" → security.
        if lacks_any(security_strong_terms) and not (
            _has_any(prompt_norm, ("invisible", "readonly"))
            and _has_any(prompt_norm, security_actor_terms)
        ):
            deselect("odoo_inspect_security", "pruned:view-focus")
        if lacks_any(data_action_terms):
            for name in ("odoo_query_records", "odoo_count_records", "odoo_aggregate_records"):
                deselect(name, "pruned:view-focus")
            if lacks_any(("champ", "champs", "field", "fields", "relation", "many2one", "one2many", "many2many", "x_", "x_studio")):
                deselect("odoo_inspect_fields", "pruned:view-focus")
        if lacks_any((
            "source odoo", "standard odoo", "code odoo",
            "méthode", "methode", "method", "class", "_name", "_inherit", "orm", "@api",
            "community", "enterprise", "dans les sources", "in sources",
            "xml id", "xmlid", "external id",
        )):
            for name in ("source_search_odoo", "source_read_odoo_file"):
                deselect(name, "pruned:view-focus")

    # ACL/record-rule questions should not drag record reads/counts unless the
    # user explicitly asks to measure visible records.
    if selected("odoo_inspect_security") and _has_any(prompt_norm, security_strong_terms):
        if lacks_any(navigation_terms):
            deselect("odoo_inspect_navigation", "pruned:security-focus")
        if lacks_any(data_action_terms):
            for name in ("odoo_query_records", "odoo_count_records", "odoo_aggregate_records", "odoo_inspect_fields"):
                deselect(name, "pruned:security-focus")

    # Count-only intent dominates: when the user explicitly asks "combien"
    # / "how many", they want the number, not the rows. ``query_records``
    # would still match on business nouns ("factures", "commandes") and pull
    # in a useless playbook. Suppress unless the user also asks to list.
    list_action_terms = (
        "liste", "lister", "list ", "montre", "montrer", "show", "affiche",
        "afficher", "détail", "detail", "fiche", "export",
    )
    count_intent_terms = (
        "combien", "how many", "nombre de", "number of", "volume",
        "volumétrie", "volumetrie",
    )
    aggregate_intent_terms = (
        "par mois", "par trimestre", "par année", "par annee", "par statut",
        "par commercial", "par journal", "par société", "par societe",
        "per month", "per quarter", "per status", "per salesperson", "per company",
        "grouped by", "group by", "groupé par", "groupe par", "kpi", "dashboard",
        "chiffre d'affaires", "revenue", "ca par", "marge par",
    )
    if selected("odoo_count_records") and _has_any(prompt_norm, count_intent_terms):
        if lacks_any(list_action_terms):
            deselect("odoo_query_records", "pruned:count-focus")
            # Keep aggregate when the user pairs the count with a grouping
            # ("nombre par statut" / "how many per journal") — that is an
            # aggregate intent, not a plain count.
            if lacks_any(aggregate_intent_terms):
                deselect("odoo_aggregate_records", "pruned:count-focus")
        # When the count is paired with grouping, count itself becomes
        # redundant: the aggregate already returns the per-group totals.
        if _has_any(prompt_norm, aggregate_intent_terms) and selected("odoo_aggregate_records"):
            deselect("odoo_count_records", "pruned:aggregate-dominates")
    # Even when the count never carries its own intent terms, the ``kpi``
    # bundle pulls it in whenever aggregate fires. Drop count whenever the
    # prompt clearly carries an aggregate signal AND no explicit count term.
    elif (selected("odoo_count_records")
            and selected("odoo_aggregate_records")
            and _has_any(prompt_norm, aggregate_intent_terms)):
        deselect("odoo_count_records", "pruned:aggregate-dominates")

    # Schema-inspection intent: "quels champs", "what fields", "structure du
    # modèle" — the user wants the model metadata, not the records. Business
    # nouns like "sale.order" otherwise drag in ``query_records``.
    schema_intent_terms = (
        "quels champs", "quel champ", "what fields", "which fields",
        "champs du modèle", "champs du modele", "champs de", "fields of",
        "structure du modèle", "structure du modele", "model structure",
        "schema du modèle", "schema du modele", "type de champ", "types de champ",
    )
    if selected("odoo_inspect_fields") and _has_any(prompt_norm, schema_intent_terms):
        if lacks_any(list_action_terms + data_action_terms):
            for name in ("odoo_query_records", "odoo_count_records", "odoo_aggregate_records"):
                deselect(name, "pruned:schema-focus")

    # List-modules intent: the user wants the catalog of modules in a cloned
    # project repo. Ad-hoc grep (``repo_search_code``) and single-file read
    # (``repo_read_file``) are wrong tools here — pruned unless the user also
    # mentions an override / inherit / explicit code search.
    list_modules_intent_terms = (
        "__manifest__", "manifest.py", "liste des modules", "lister les modules",
        "liste les modules", "lister modules", "liste modules",
        "list modules", "list of modules", "list the modules", "list all modules",
        "modules du dépôt", "modules du depot", "modules du repo",
        "périmètre installable", "perimetre installable", "modules installables",
    )
    code_search_terms = (
        "override", "_inherit", "surcharge", "cherche dans", "search in",
        "grep", "regex", "ligne", "line", "trouve la", "trouve le",
    )
    single_file_read_terms = (
        "lis le fichier", "lit le fichier", "lire le fichier",
        "read the file", "open the file", "ouvre le fichier",
        "contenu de", "content of",
    )
    if selected("repo_list_modules") and _has_any(prompt_norm, list_modules_intent_terms):
        if lacks_any(code_search_terms):
            deselect("repo_search_code", "pruned:list-modules-focus")
        # Keep ``repo_read_file`` whenever the user clearly asks to read one
        # specific file — that is a different intent from listing the catalog.
        if lacks_any(code_search_terms + single_file_read_terms):
            deselect("repo_read_file", "pruned:list-modules-focus")

    # User-uploaded attachment: when ``runtime_attachment_handler`` matches
    # via upload/extract/joindre, the prompt is about a *file the user sent*,
    # not an Odoo-generated report. Suppress report/view unless the prompt
    # also references Odoo-side report internals.
    attachment_focus_terms = (
        "upload", "uploaded", "uploadé", "uploade", "joindre", "joint en",
        "extrais", "extraire", "extract", "pdf scanné", "pdf scanne",
        "pièce jointe", "piece jointe", "capture", "screenshot",
        "comparer ce", "compare this",
    )
    report_internal_terms = (
        "rapport odoo", "external_layout", "qweb", "paperformat",
        "report_invoice", "wkhtmltopdf", "report_action",
    )
    if selected("runtime_attachment_handler") and _has_any(prompt_norm, attachment_focus_terms):
        if lacks_any(report_internal_terms):
            deselect("odoo_inspect_report", "pruned:attachment-focus")
            deselect("odoo_inspect_view", "pruned:attachment-focus")

    # Deliverable-focus: when the prompt explicitly asks for a *formatted
    # deliverable* on top of an attachment, the response shape is owned by
    # ``output_report_writer`` (template-driven). ``runtime_attachment_handler``
    # tools are still callable, but the playbook injection adds noise.
    deliverable_terms = (
        "livrable", "deliverable", "rédige un rapport", "redige un rapport",
        "rédige une note", "redige une note", "rédige un email",
        "rédige un livrable", "redige un livrable", "génère un rapport",
        "genere un rapport", "generate a report", "formal report",
        "produire un document", "produce a document", "format formel",
        "formal deliverable", "client report",
    )
    if (selected("runtime_attachment_handler")
            and _has_any(prompt_norm, deliverable_terms)):
        # Tools remain callable; only the playbook injection is pruned so the
        # response shape stays owned by the deliverable intent.
        deselect("runtime_attachment_handler", "pruned:deliverable-focus")

    # Navigation-pattern is one of the strongest single signals (score 75) —
    # the user literally asks where to click / which menu opens a screen.
    # Sibling skills should stay out unless they bring an own strong term.
    nav_candidate = route_candidates.get("odoo_inspect_navigation")
    if (selected("odoo_inspect_navigation") and nav_candidate
            and _candidate_reason_has(nav_candidate, "navigation-pattern")):
        view_arch_terms = (
            "xpath", "attrs", "states", "readonly", "invisible",
            "héritage vue", "heritage vue", "inherit_id", "view inheritance",
        )
        if lacks_any(view_arch_terms):
            deselect("odoo_inspect_view", "pruned:navigation-focus")
        # Security needs strong terms — ACL / record rule / explicit access
        # denial. A plain mention of "groupes utilisateurs" inside a "where do
        # I click for groups settings" prompt is a navigation request.
        explicit_security_audit = (
            "acl", "ir.model.access", "record rule", "ir.rule", "security rule",
            "audit security", "audit sécurité", "audit securite",
            "access denied", "accès refusé", "acces refuse", "ne voit pas",
        )
        if lacks_any(explicit_security_audit):
            deselect("odoo_inspect_security", "pruned:navigation-focus")
        if lacks_any(data_action_terms):
            for name in ("odoo_query_records", "odoo_count_records", "odoo_aggregate_records", "odoo_inspect_fields"):
                deselect(name, "pruned:navigation-focus")

    # Query-dominates: when the user explicitly asks to LIST / SHOW records
    # of a model ("liste-moi les factures", "montre les enregistrements"),
    # the count + fields siblings that were added by the ``record_analysis`` /
    # ``live_data`` bundles are not what the user wants. They survive only if
    # the prompt also carries a count or schema signal.
    explicit_list_terms = (
        "liste-moi", "liste moi", "lister", "list me", "montre-moi", "montre moi",
        "montre les", "montrer les", "show me", "show the", "show all",
        "affiche-moi", "affiche les", "afficher les", "display me", "display the",
        "donne-moi les", "donne moi les", "give me the", "give me all",
        "voir les", "see the", "fiche du", "fiche de la", "fiche des",
        "détail de", "detail de", "details of", "détails de", "details du",
    )
    fields_signal_terms = (
        "champ", "champs", "field", "fields", "relation", "many2one",
        "one2many", "many2many", "x_", "x_studio", "schema", "schéma",
        "structure du modèle", "structure du modele",
    )
    if (selected("odoo_query_records")
            and _has_any(prompt_norm, explicit_list_terms)
            and lacks_any(count_intent_terms)
            and lacks_any(aggregate_intent_terms)
            and lacks_any(schema_intent_terms)):
        deselect("odoo_count_records", "pruned:query-focus")
        # Keep ``odoo_inspect_fields`` when the prompt carries an explicit
        # schema/fields signal (plain "fields"/"champs"/"x_*"). Otherwise the
        # bundle leak from ``record_analysis`` is just noise.
        if lacks_any(fields_signal_terms):
            deselect("odoo_inspect_fields", "pruned:query-focus")

    # Volume-focus: "lignes de code", "lines of code", "LOC", "lignes python"
    # — the user wants source-code volumetry. ``odoo_count_records`` is the
    # wrong tool (DB rows, not LOC). Same for ``repo_read_file`` and
    # ``repo_search_code`` (read or grep, not measure).
    volume_focus_terms = (
        "ligne de code", "lignes de code", "line of code", "lines of code",
        " loc ", "loc total", "loc par", "loc dans",
        "ligne python", "lignes python", "line python", "lines python",
        "volumétrie code", "volumetrie code", "size of the codebase",
    )
    # Pad with spaces to make " loc " catch the bare token without matching
    # words like "block" or "blockchain".
    if selected("repo_count_source_lines") and _has_any(f" {prompt_norm} ", volume_focus_terms):
        deselect("odoo_count_records", "pruned:volume-focus")
        deselect("odoo_query_records", "pruned:volume-focus")
        deselect("odoo_inspect_fields", "pruned:volume-focus")
        deselect("repo_read_file", "pruned:volume-focus")
        deselect("repo_search_code", "pruned:volume-focus")
        # Suppress list-modules unless the user also mentions modules — the
        # ``project_source`` bundle adds list-modules whenever "repo" is present.
        if lacks_any(("module ", "modules ", "manifest", "__manifest__")):
            deselect("repo_list_modules", "pruned:volume-focus")

    # Search-focus: "cherche", "search", "grep", "rechercher" — the user
    # wants ad-hoc lookup, not a single-file read or a manifest catalog.
    # Applies in BOTH repo and source contexts.
    code_search_intent_terms = (
        "cherche", "chercher", "rechercher", "recherche dans",
        "grep ", " grep", "search for", "find all", "find the",
        "find any", "find every", "trouve tous", "trouve toutes",
        "trouve les ", "trouve la ", "trouve le ",
    )
    if (_has_any(prompt_norm, code_search_intent_terms)
            and (selected("repo_search_code") or selected("source_search_odoo"))):
        if not _has_any(prompt_norm, single_file_read_terms):
            deselect("repo_read_file", "pruned:search-focus")
            deselect("source_read_odoo_file", "pruned:search-focus")
        # Catalog listing also unwanted when the user explicitly searches.
        deselect("repo_list_modules", "pruned:search-focus")

    # Repo-context-focus: prompt clearly anchors to the client project repo
    # ("repo", "dépôt projet", "code custom", "module custom"). The two
    # ``source_*`` skills (Odoo standard sources) are wrong unless the user
    # ALSO references Odoo source code.
    repo_anchor_terms = (
        "dépôt projet", "depot projet", "dépôt client", "depot client",
        "repo projet", "repo client", "project repo", "client repo",
        "module custom", "modules custom", "code custom", "custom module",
        "custom modules", "module client", "modules sur mesure",
    )
    odoo_source_anchor_terms = (
        "source odoo", "sources odoo", "standard odoo", "code standard odoo",
        "community", "enterprise", "odoo standard",
        "dans les sources", "in odoo sources",
    )
    if (_has_any(prompt_norm, repo_anchor_terms)
            and not _has_any(prompt_norm, odoo_source_anchor_terms)):
        deselect("source_read_odoo_file", "pruned:repo-focus")
        deselect("source_search_odoo", "pruned:repo-focus")

    # List-modules cleanup pass: when the user explicitly asks for module
    # catalog ("liste les modules"), the live-data bundle leaks
    # (odoo_inspect_view, odoo_query_records, ...) on the noun "modules" are
    # noise. Drop them unless they have an independent strong signal.
    if (selected("repo_list_modules")
            and _has_any(prompt_norm, ("liste les modules", "lister les modules", "list modules", "list of modules", "liste des modules"))):
        for name in (
            "odoo_inspect_view", "odoo_inspect_fields", "odoo_inspect_navigation",
            "odoo_inspect_security", "odoo_query_records", "odoo_count_records",
            "odoo_aggregate_records",
        ):
            deselect(name, "pruned:list-modules-focus")

    # Migration-search vs migration-read disambiguation. Both skills are
    # routed by the same ``migration_target`` bundle / "version cible"
    # keyword. When the user clearly searches (cherche / search), suppress
    # the read sibling; when the user clearly reads/compares one file,
    # suppress the search sibling.
    if (selected("migration_search_target_source")
            and _has_any(prompt_norm, code_search_intent_terms)
            and not _has_any(prompt_norm, single_file_read_terms)):
        deselect("migration_read_target_file", "pruned:migration-search-focus")
    migration_read_intent_terms = single_file_read_terms + (
        "compare", "comparer", "comparison", "comparaison",
        "source vs cible", "source→cible", "source -> cible",
        "before/after", "avant/après", "avant apres",
    )
    if (selected("migration_read_target_file")
            and _has_any(prompt_norm, migration_read_intent_terms)
            and not _has_any(prompt_norm, code_search_intent_terms)):
        deselect("migration_search_target_source", "pruned:migration-read-focus")

    # A SHA is a very strong source/commit intent. Avoid live-data playbooks
    # caused by generic words like "analyse" unless another explicit live-data
    # request is present in the same prompt.
    if selected("source_show_commit") and _candidate_reason_has(route_candidates["source_show_commit"], "sha-pattern"):
        if lacks_any(data_action_terms + security_strong_terms + navigation_terms):
            for name in (
                "odoo_query_records", "odoo_count_records", "odoo_aggregate_records",
                "odoo_inspect_fields", "odoo_inspect_modules", "odoo_inspect_security",
                "odoo_inspect_navigation", "odoo_inspect_view", "odoo_inspect_report",
            ):
                deselect(name, "pruned:commit-focus")

    return [name for name in selected_skills if name in keep]


def _select_skill_playbooks(
    prompt: str,
    *,
    migration: bool = False,
    creation: bool = False,
    disabled_tools: Optional[list[str]] = None,
    locale: Optional[str] = None,
) -> str:
    """Select short per-tool playbooks relevant to the current turn.

    Tool schemas explain the API shape; these playbooks explain operational
    sequencing and common pitfalls. Do not cap the number of selected skills:
    a single diagnostic question can legitimately need a chain of live, source
    and project tools.
    """
    lang = normalize_locale(locale)
    disabled = _canonical_disabled(disabled_tools)
    mode = "creator" if creation else ("migration" if migration else "assistant")
    prompt_norm = _normalize_text(prompt)
    selected_skills: list[str] = []
    route_candidates: dict[str, SkillRouteCandidate] = {}
    output_selection = DEFAULT_OUTPUT_RENDERER.select_template(prompt, disabled_tools)

    def add_candidate(name: str, score: int, reason: str, *, selected: bool = True) -> None:
        existing = route_candidates.get(name)
        if existing is None:
            route_candidates[name] = {
                "name": name,
                "score": score,
                "reason": reason,
                "selected": selected,
            }
            return
        existing["score"] += score
        if reason not in existing["reason"]:
            existing["reason"] = f"{existing['reason']}, {reason}"
        existing["selected"] = existing["selected"] or selected

    def add(name: str, score: int = 10, reason: str = "matched") -> None:
        for skill in SKILL_DEFINITIONS:
            if skill.name == name and skill.name not in disabled and mode in skill.modes:
                if not skill.allow_implicit_invocation and not _is_explicit_invocation_reason(reason):
                    add_candidate(name, score, f"{reason}, implicit-invocation-disabled", selected=False)
                    return
                add_candidate(name, score, reason, selected=True)
                if skill.name not in selected_skills:
                    selected_skills.append(skill.name)
                return

    # Mode-level defaults: tiny, high-value reminders for workflows where the
    # same mistakes are costly.
    if creation:
        for name in ("odoo_inspect_studio", "odoo_inspect_fields", "odoo_inspect_view", "odoo_inspect_report"):
            add(name, 25, "creator-default")
    elif migration:
        for name in ("odoo_inspect_modules", "odoo_inspect_studio", "migration_search_target_source"):
            add(name, 25, "migration-default")
    if output_selection is not None:
        add(output_selection.skill_name, output_selection.score, f"template:{output_selection.template_name}")

    for skill in SKILL_DEFINITIONS:
        if skill.name in disabled or mode not in skill.modes:
            continue
        if skill.name in prompt_norm:
            add(skill.name, 100, "explicit-skill-name")
            continue
        if skill.name == "output_report_writer":
            continue
        if skill.keywords and _has_any(prompt_norm, tuple(k.casefold() for k in skill.keywords)):
            add(skill.name, 60, "skill-keywords")

    # Intent bundles: route complementary skills together from user phrasing,
    # not only from exact tool names. This avoids multi-prompt clarification
    # loops for common Odoo work such as "analyse cette commande avec ses
    # lignes" or "pourquoi l'utilisateur ne voit pas le menu".
    for _intent, terms, skills in _SKILL_INTENT_BUNDLES:
        if _has_any(prompt_norm, tuple(t.casefold() for t in terms)):
            for name in skills:
                add(name, 40, f"intent:{_intent}")

    # Explicit trigger patterns that are stronger than generic domain keywords.
    if re.search(r"\b[0-9a-f]{7,40}\b", prompt_norm):
        add("source_show_commit", 90, "sha-pattern")
    if _has_any(prompt_norm, ("où cliquer", "ou cliquer", "where click", "menu", "navigation")):
        add("odoo_inspect_navigation", 75, "navigation-pattern")
    if _has_any(prompt_norm, ("compare", "comparer", "comparaison")) and _has_any(
        prompt_norm, ("cible", "target", "version cible", "target version", "v18", "v19", "odoo 18", "odoo 19")
    ):
        add("migration_read_target_file", 75, "migration-compare-pattern")
    if _has_any(prompt_norm, ("kpi", "par mois", "par statut", "read_group", "chiffre d'affaires", "ca par")):
        add("odoo_aggregate_records", 75, "kpi-pattern")
    if _has_any(prompt_norm, (
        "règle de sécurité", "règles de sécurité", "regle de securite", "regles de securite",
        "security rule", "security rules", "record rule", "ir.rule", "acl", "access right",
        "access rights", "droit d'accès", "droits d'accès", "ir.model.access",
    )):
        add("odoo_inspect_security", 75, "security-pattern")
        if _has_any(prompt_norm, (
            "module custom", "modules custom", "custom module", "custom modules",
            "dépôt client", "depot client", "repo client", "project repo", "code projet",
            "code custom", "spécifique client", "specifique client",
        )):
            for name in ("repo_list_modules", "repo_search_code", "repo_read_file"):
                add(name, 65, "custom-security-pattern")

    selected_skills = _prune_skill_routes(prompt_norm, selected_skills, route_candidates)

    # Apply minimum-score floor. Explicit invocations (named skill / mode
    # default / template selection) keep their selection regardless: they are
    # already authoritative signals. Anything else below the floor is recorded
    # as a candidate but removed from the injected playbook list so the LLM
    # is not biased by weak signals.
    floored: list[str] = []
    for name in selected_skills:
        candidate = route_candidates.get(name)
        if candidate is None:
            floored.append(name)
            continue
        if candidate["score"] >= _MIN_SKILL_SCORE or _is_explicit_invocation_reason(candidate["reason"]):
            floored.append(name)
            continue
        candidate["selected"] = False
        _append_route_reason(candidate, "below-threshold")
    selected_skills = floored

    skill_by_name = {s.name: s for s in SKILL_DEFINITIONS}

    chunks: list[str] = []
    matched_skill_names: list[str] = []
    for name in selected_skills:
        skill = skill_by_name.get(name)
        if skill is None:
            continue
        content = (skill.body or "").strip()
        if not content:
            continue
        enriched = _enrich_skill_chunk(skill, content)
        if skill.name not in matched_skill_names:
            matched_skill_names.append(skill.name)
        enriched = _redact_disabled_skill_mentions(enriched, disabled)
        chunks.append(enriched)
    # Expose matched names on the function via a module-level side channel
    # consumed by ``_load_context_for_prompt_impl``. Keeping the return type
    # backward-compatible (still a string) avoids touching every caller.
    _select_skill_playbooks._last_matched = matched_skill_names  # type: ignore[attr-defined]
    _select_skill_playbooks._last_candidates = sorted(  # type: ignore[attr-defined]
        route_candidates.values(),
        key=lambda item: (-item["score"], item["name"]),
    )
    return "\n\n".join(dict.fromkeys(chunks)).strip()


def _enrich_skill_chunk(skill, body: str) -> str:
    """Append per-skill metadata (references list + script list) after the body.

    Examples are NOT injected here — they go through ``select_examples_block``
    which applies a global budget (top-3, max 4k chars) across all matching
    skills. Auto-loadable references are handled by ``select_auto_load_refs``
    and injected as a separate priority block."""
    parts = [body]
    if skill.references:
        items = "\n".join(
            f'- `load_skill_reference(skill="{skill.name}", filename="{ref}")` — référence disponible'
            for ref in skill.references
        )
        parts.append(f"### Références disponibles\n{items}")
    if skill.scripts and skill.permissions.scripts:
        items = "\n".join(
            f'- `run_skill_script(skill="{skill.name}", filename="{sc}")` — script exécutable'
            for sc in skill.scripts
        )
        parts.append(f"### Scripts exécutables\n{items}")
    return "\n\n".join(parts)


def _redact_disabled_skill_mentions(content: str, disabled: set[str]) -> str:
    """Remove playbook lines that promote disabled skills.

    A skill can legitimately mention related skills in its "Combinaisons"
    section. When the user disables one of those skills, the injected context
    must not keep nudging the model toward it.
    """
    if not disabled or not content:
        return content
    lines = []
    for line in content.splitlines():
        if any(name in line for name in disabled):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


# Budget constants — kept generous so the assembled context stays under the
# 36k-char ceiling even when multiple skills match a single prompt.
_EXAMPLE_MAX_TOTAL_CHARS = 4_000
_EXAMPLE_MAX_COUNT = 3
_EXAMPLE_MAX_PER_FILE = 1_500
_AUTO_LOAD_REF_MAX_COUNT = 2
_AUTO_LOAD_REF_MAX_PER_FILE = 2_600
# The auto-loaded references block lands in a priority slot whose hard cap is
# ``_MAX_PRIORITY_BLOCK_CHARS``. Keep the count × per-file product under it.


def select_examples_block(
    prompt: str,
    matching_skill_names: list[str],
    *,
    disabled_tools: Optional[list[str]] = None,
    locale: Optional[str] = None,
) -> Optional[str]:
    """Pick the most relevant examples across all matched skills, under a
    global budget. Returns a single Markdown block ready to inject, or None.

    Ranking heuristic: an example is more relevant when its first 200 chars
    contain more words from the user prompt. Stable tie-break on the skill
    name (deterministic ordering)."""
    from ..skills.registry import skill_by_name, read_skill_example

    disabled = _canonical_disabled(disabled_tools)
    prompt_norm = _normalize_text(prompt)
    prompt_words = {w for w in re.split(r"[^a-z0-9_]+", prompt_norm) if len(w) >= 4}

    candidates: list[tuple[int, str, str, str]] = []
    for name in matching_skill_names:
        if name in disabled:
            continue
        skill = skill_by_name(name)
        if not skill:
            continue
        for ex in skill.examples:
            if ex.startswith("bad_"):
                continue
            content = read_skill_example(name, ex)
            if not content:
                continue
            score = sum(1 for w in prompt_words if w in content[:200].casefold())
            candidates.append((score, name, ex, content))

    if not candidates:
        return None

    candidates.sort(key=lambda t: (-t[0], t[1]))
    selected: list[str] = []
    total = 0
    for score, name, fname, content in candidates[: _EXAMPLE_MAX_COUNT * 2]:
        body = content.strip()
        if len(body) > _EXAMPLE_MAX_PER_FILE:
            body = body[:_EXAMPLE_MAX_PER_FILE].rstrip() + "\n\n[…]"
        block = f"#### `{name}` — exemple\n\n{body}"
        if total + len(block) > _EXAMPLE_MAX_TOTAL_CHARS:
            continue
        selected.append(block)
        total += len(block)
        if len(selected) >= _EXAMPLE_MAX_COUNT:
            break

    if not selected:
        return None
    return "## Exemples de tools en situation\n\n" + "\n\n---\n\n".join(selected)


def select_auto_load_refs(
    prompt: str,
    disabled_tools: Optional[list[str]] = None,
) -> Optional[str]:
    """Eager-load references whose triggers match the prompt. Capped at
    ``_AUTO_LOAD_REF_MAX_COUNT`` to keep the priority block bounded.

    Returns a Markdown block ready to inject as a priority block (so it
    survives budget pressure on routed sections)."""
    from ..skills.registry import SKILL_DEFINITIONS, read_skill_reference

    disabled = _canonical_disabled(disabled_tools)
    prompt_norm = _normalize_text(prompt)
    matches: list[tuple[str, str]] = []  # (skill_name, ref_file)
    seen: set[tuple[str, str]] = set()

    for skill in SKILL_DEFINITIONS:
        if skill.name in disabled:
            continue
        for ref in skill.references_meta:
            if not ref.triggers:
                continue
            for trig in ref.triggers:
                if trig and trig.casefold() in prompt_norm:
                    key = (skill.name, ref.file)
                    if key not in seen:
                        seen.add(key)
                        matches.append(key)
                    break
        if len(matches) >= _AUTO_LOAD_REF_MAX_COUNT:
            break

    if not matches:
        return None

    parts: list[str] = []
    for skill_name, fname in matches[:_AUTO_LOAD_REF_MAX_COUNT]:
        content = read_skill_reference(skill_name, fname)
        if not content:
            continue
        body = content.strip()
        original_len = len(body)
        if len(body) > _AUTO_LOAD_REF_MAX_PER_FILE:
            body = body[:_AUTO_LOAD_REF_MAX_PER_FILE].rstrip() + "\n\n[…]"
        _record_context_trace({
            "type": "reference_auto_loaded",
            "skill": skill_name,
            "filename": fname,
            "chars": len(body),
            "original_chars": original_len,
            "capped_chars": _AUTO_LOAD_REF_MAX_PER_FILE,
        })
        parts.append(f"### Référence : `{skill_name}/{fname}`\n\n{body}")

    if not parts:
        return None
    return ("## Références chargées (pertinentes pour ce prompt)\n\n"
            + "\n\n---\n\n".join(parts))


def select_output_template_details(
    prompt: str,
    disabled_tools: Optional[list[str]] = None,
) -> Optional[OutputTemplateSelection]:
    """Pick a structured output template selection for observability."""
    selection = DEFAULT_OUTPUT_RENDERER.select_template(prompt, disabled_tools)
    select_output_template_details._last_selection = selection  # type: ignore[attr-defined]
    return selection


def select_output_template(prompt: str, disabled_tools: Optional[list[str]] = None) -> Optional[tuple[str, str]]:
    """Backward-compatible output-template selector.

    Returns ``(skill_name, template_body)`` or None.
    """
    selection = select_output_template_details(prompt, disabled_tools)
    if selection is None:
        return None
    return selection.skill_name, selection.body


def _maybe_section(title: str, content: str, sections: list[tuple[str, str]]) -> None:
    cleaned = content.strip()
    if cleaned:
        sections.append((title, cleaned))


def _fit_context_budget(
    sections: list[tuple[str, str]],
    budget: int = _CONTEXT_BUDGET_CHARS,
    *,
    core_sections: Optional[set] = None,
) -> list[tuple[str, str]]:
    """Pack sections into the char budget.

    If *core_sections* is provided (set of title strings), those sections are
    treated as high-priority: they are injected first regardless of their
    position in the input list, and they are never crowded out by domain or
    contextual sections. Non-core sections fill the remaining budget in order.
    """
    if core_sections:
        ordered = ([s for s in sections if s[0] in core_sections] +
                   [s for s in sections if s[0] not in core_sections])
    else:
        ordered = list(sections)

    fitted: list[tuple[str, str]] = []
    used = 0
    separator_len = len("\n\n---\n\n")
    for title, content in ordered:
        rendered_len = len(f"## {title}\n\n{content.strip()}") + (separator_len if fitted else 0)
        if used + rendered_len <= budget:
            fitted.append((title, content))
            used += rendered_len
            continue
        remaining = budget - used - len(f"## {title}\n\n") - (separator_len if fitted else 0)
        suffix = "\n\n[...section de contexte tronquée par le routeur...]"
        if remaining > len(suffix) + 500:
            fitted.append((title, content[: remaining - len(suffix)].rstrip() + suffix))
        break
    return fitted


# Per-call cache for load_context_for_prompt. Multi-turn chats re-run this
# function with the same arguments — caching avoids repeating ~6-8 file reads,
# arch parsing, and budget fitting on every turn. Key includes everything that
# can change the output. LRU eviction so we don't grow forever.
_CONTEXT_CACHE: "OrderedDict[tuple, str]" = OrderedDict()
_CONTEXT_CACHE_MAX = 64

# Plafond per priority_block. Priority blocks bypass the routed-context
# packer; without an individual cap a runaway block (huge technical complexity
# JSON, a misformatted localization snippet) could starve the routed sections.
_MAX_PRIORITY_BLOCK_CHARS = 6_000


def _truncate_priority_block(block: str) -> str:
    """Trim a priority block that overflows the per-block budget. Logged as a
    warning so the upstream caller learns about the regression."""
    if len(block) <= _MAX_PRIORITY_BLOCK_CHARS:
        return block
    head = block[:_MAX_PRIORITY_BLOCK_CHARS - 80].rstrip()
    _logger.warning(
        "Priority context block truncated: %s chars > %s — first heading kept: %r",
        len(block), _MAX_PRIORITY_BLOCK_CHARS, block.split("\n", 1)[0][:120],
    )
    _record_context_trace({
        "type": "priority_block_truncated",
        "heading": block.split("\n", 1)[0][:120],
        "original_chars": len(block),
        "capped_chars": _MAX_PRIORITY_BLOCK_CHARS,
    })
    return head + "\n\n[…bloc tronqué — voir log…]"


def load_context_for_prompt(
    odoo_version: Optional[str] = None,
    migration: bool = False,
    user_prompt: Optional[str] = None,
    perspective: Optional[str] = None,
    locale: Optional[str] = None,
    target_version: Optional[str] = None,
    priority_blocks: Optional[list[str]] = None,
    creation: bool = False,
    country_code: Optional[str] = None,
    force_localization: bool = False,
    complexity_mode: Optional[str] = None,
    disabled_tools: Optional[list[str]] = None,
    run_id: Optional[str] = None,
) -> str:
    """Return routed markdown context to inject into the AI system prompt.

    *priority_blocks* are pre-formatted markdown strings (localization,
    technical complexity, source-version warnings). They are injected before
    the routed sections and count against the budget so the total stays bounded.
    """
    # Cache lookup: build a hashable key from the inputs. Per-block content
    # influences the budget left for the routed sections, so it is part of
    # the key (truncate to keep keys small).
    blocks_key = tuple(
        (b or "")[:_MAX_PRIORITY_BLOCK_CHARS]
        for b in (priority_blocks or [])
    )
    cache_key = (
        odoo_version, migration, (user_prompt or "")[:512],
        perspective, locale, target_version,
        blocks_key, creation, country_code, force_localization, complexity_mode,
        tuple(sorted(_canonical_disabled(disabled_tools))),
    )
    cached = _CONTEXT_CACHE.get(cache_key)
    if cached is not None:
        _begin_context_trace(run_id)
        if run_id:
            _record_context_trace({"type": "context_cache_hit", "cached": True})
        if "runtime_skill_dispatcher" in _canonical_disabled(disabled_tools):
            _select_skill_playbooks._last_matched = []  # type: ignore[attr-defined]
            _select_skill_playbooks._last_candidates = []  # type: ignore[attr-defined]
        else:
            _select_skill_playbooks(
                user_prompt or "",
                migration=migration,
                creation=creation,
                disabled_tools=disabled_tools,
                locale=locale,
            )
        select_output_template_details(user_prompt or "", disabled_tools)
        _CONTEXT_CACHE.move_to_end(cache_key)
        return cached
    result = _load_context_for_prompt_impl(
        odoo_version=odoo_version, migration=migration, user_prompt=user_prompt,
        perspective=perspective, locale=locale, target_version=target_version,
        priority_blocks=priority_blocks, creation=creation,
        country_code=country_code, force_localization=force_localization,
        complexity_mode=complexity_mode, disabled_tools=disabled_tools,
        run_id=run_id,
    )
    _CONTEXT_CACHE[cache_key] = result
    if len(_CONTEXT_CACHE) > _CONTEXT_CACHE_MAX:
        _CONTEXT_CACHE.popitem(last=False)
    return result


def last_selected_skill_names() -> list[str]:
    """Return the tool-skill playbooks selected during the last context build.

    This is a lightweight observability hook for SSE/UI display; it does not
    affect prompt construction.
    """
    return list(getattr(_select_skill_playbooks, "_last_matched", []))


def last_skill_route_candidates() -> list[SkillRouteCandidate]:
    """Return scored skill-route candidates from the last context build."""
    return list(getattr(_select_skill_playbooks, "_last_candidates", []))


def last_output_template_selection() -> Optional[dict]:
    """Return the last selected output template without the template body."""
    selection = getattr(select_output_template_details, "_last_selection", None)
    if selection is None:
        return None
    return selection.to_public_dict()


def clear_context_cache() -> None:
    """Reset the memoization cache. Tests may call this between scenarios."""
    _CONTEXT_CACHE.clear()
    _begin_context_trace(None)
    select_output_template_details._last_selection = None  # type: ignore[attr-defined]


def _load_context_for_prompt_impl(
    odoo_version: Optional[str] = None,
    migration: bool = False,
    user_prompt: Optional[str] = None,
    perspective: Optional[str] = None,
    locale: Optional[str] = None,
    target_version: Optional[str] = None,
    priority_blocks: Optional[list[str]] = None,
    creation: bool = False,
    country_code: Optional[str] = None,
    force_localization: bool = False,
    complexity_mode: Optional[str] = None,
    disabled_tools: Optional[list[str]] = None,
    run_id: Optional[str] = None,
) -> str:
    _begin_context_trace(run_id)
    lang = normalize_locale(locale)
    titles = _SECTION_TITLES[lang]
    prompt = _normalize_text(user_prompt)
    blocks = [
        _truncate_priority_block(b.strip())
        for b in (priority_blocks or []) if b and b.strip()
    ]
    # Core-skill gating: the disabled list mixes tool and core skill names.
    # Sub-contributors of the aggregator (release notes, skill dispatcher,
    # perspective profile) honour their own flag and short-circuit cleanly.
    _disabled_set = _canonical_disabled(disabled_tools)
    _perspective_active = "runtime_perspective_router" not in _disabled_set
    _dispatcher_active = "runtime_skill_dispatcher" not in _disabled_set
    _release_notes_active = "runtime_release_notes_injector" not in _disabled_set

    sections = []
    _skills_title = titles["skills"]
    try:
        _maybe_section(_skills_title, _select_skills_context(prompt, perspective, lang), sections)
    except FileNotFoundError:
        _skills_title = None  # type: ignore[assignment]

    _skill_playbooks_title = None
    _skill_playbooks = _select_skill_playbooks(
        prompt,
        migration=migration,
        creation=creation,
        disabled_tools=disabled_tools,
        locale=lang,
    ) if _dispatcher_active else ""
    if not _dispatcher_active:
        _select_skill_playbooks._last_matched = []  # type: ignore[attr-defined]
        _select_skill_playbooks._last_candidates = []  # type: ignore[attr-defined]
    _matched_skills: list[str] = getattr(_select_skill_playbooks, "_last_matched", []) if _dispatcher_active else []
    if _skill_playbooks:
        _skill_playbooks_title = titles["skill_playbooks"]
        sections.append((_skill_playbooks_title, _skill_playbooks))

    # Auto-loaded references — eager-loaded into a priority block (never trimmed)
    # when the prompt matches an explicit trigger declared in the skill SKILL.md
    # under ``references_auto_load:``. Cap is enforced inside the selector.
    _auto_refs_block = select_auto_load_refs(prompt, disabled_tools) if _dispatcher_active else None
    if _auto_refs_block:
        blocks.append(_truncate_priority_block(_auto_refs_block))

    # Tool examples — top-3 across all matched skills, ranked by relevance
    # to the prompt, capped at 4 000 chars total. Routed (can be trimmed if
    # budget is tight) rather than priority — examples are nice-to-have.
    _examples_block = (
        select_examples_block(prompt, _matched_skills, disabled_tools=disabled_tools, locale=lang)
        if _dispatcher_active and _matched_skills else None
    )
    if _examples_block:
        sections.append((titles.get("examples", "Exemples de tools en situation"), _examples_block))

    # Role-specific profile file (support / BA / architect / developer).
    # Treated as a core section so the role guidance is never crowded out.
    # Skipped in Creator mode: the Creator profile (profile-creator.md, loaded
    # below) is the locked authority — adding a second role profile underneath
    # is both redundant and conceptually inconsistent with the locked badge.
    _profile_title = None
    if not creation and _perspective_active:
        profile_filename = _PROFILE_FILES.get(perspective or "")
        if profile_filename:
            try:
                _profile_content = read_file(profile_filename, lang)
                _profile_title = titles["profile"]
                sections.append((_profile_title, _profile_content))
            except FileNotFoundError:
                pass

    if not migration and _has_any(prompt, _MEETING_TERMS):
        try:
            sections.append((titles["meeting"], read_file("meeting-minute.md", lang)))
        except FileNotFoundError:
            pass

    # Studio guide: load when (a) creation mode (always relevant — the
    # consultant is about to write Studio-style ops), (b) the project's
    # technical complexity flags Studio use, or (c) the prompt is *about*
    # Studio (not just incidentally mentions it — stricter `_is_topic_of`).
    studio_project = (complexity_mode or "").lower() in {"studio", "studio_dev"}
    _studio_title = None
    if creation or studio_project or _is_topic_of(prompt, _STUDIO_TERMS):
        try:
            _studio_title = titles["studio"]
            sections.append((_studio_title, read_file("studio.md", lang)))
        except FileNotFoundError:
            pass
    # Custom-dev guide: same OR logic but driven by `dev` / `studio_dev`
    # complexity or by dev-specific vocabulary in the prompt.
    dev_project = (complexity_mode or "").lower() in {"dev", "studio_dev"}
    if dev_project or _is_topic_of(prompt, _DEV_TERMS):
        try:
            sections.append((titles["dev"], read_file("dev.md", lang)))
        except FileNotFoundError:
            pass

    # Version release notes are heavy and only useful for version-sensitive
    # questions (migration, breaking changes, "what's new"). Gate them on
    # _VERSION_TERMS so a routine functional question keeps its budget. When
    # included, route by domain to trim 40-70% of irrelevant sections.
    _version_sensitive = migration or _has_any(prompt, _VERSION_TERMS)
    _version_titles: list[str] = []
    if odoo_version and _version_sensitive and _release_notes_active:
        try:
            content = _filter_version_note_by_domain(
                read_file(f"odoo-{odoo_version}.md", lang), prompt)
            _title = titles["version"].format(version=odoo_version)
            sections.append((_title, content))
            _version_titles.append(_title)
        except FileNotFoundError:
            pass
    if target_version and target_version != odoo_version and _version_sensitive and _release_notes_active:
        try:
            content = _filter_version_note_by_domain(
                read_file(f"odoo-{target_version}.md", lang), prompt)
            _title = titles["version"].format(version=target_version)
            sections.append((_title, content))
            _version_titles.append(_title)
        except FileNotFoundError:
            pass
    # Curated fiscal-localization knowledge (l10n_<cc>.md) for the active /
    # selected country — gated on a fiscally relevant prompt so it only spends
    # budget when the country actually matters.
    _localization_title = None
    cc = (country_code or "").strip().lower()
    if len(cc) == 2 and cc.isalpha() and (force_localization or _has_any(prompt, _FISCAL_TERMS)):
        try:
            _loc_content = read_file(f"l10n_{cc}.md", lang)
            _localization_title = titles["localization"].format(country=cc.upper())
            sections.append((_localization_title, _loc_content))
        except FileNotFoundError:
            pass
    _migration_title = None
    if migration:
        try:
            _migration_content = read_file("migration.md", lang)
            _migration_title = titles["migration"]
            sections.append((_migration_title, _migration_content))
        except FileNotFoundError:
            pass
    # Creation methodology — core section for the Creator tool, always injected
    # so the Studio-creation conventions are never crowded out of the budget.
    _creation_title = None
    _creator_profile_title = None
    if creation:
        try:
            _creation_content = read_file("creation.md", lang)
            _creation_title = titles["creation"]
            sections.append((_creation_title, _creation_content))
        except FileNotFoundError:
            pass
        # Studio conventions profile — editable by the consultant from
        # Settings, loaded as core so the Studio limits and naming rules
        # always reach the LLM in Creator mode.
        try:
            _creator_profile_content = read_file("profile-creator.md", lang)
            _creator_profile_title = titles["creator_profile"]
            sections.append((_creator_profile_title, _creator_profile_content))
        except FileNotFoundError:
            pass
    # Output template selection — picks one template (deliverable format) if a
    # trigger matches the prompt. Stored as a priority block so it's NEVER
    # trimmed by budget logic and lands at the very end of the system prompt.
    template_choice = select_output_template_details(prompt, disabled_tools)
    if template_choice is not None:
        blocks.append(_truncate_priority_block(DEFAULT_OUTPUT_RENDERER.render_priority_block(template_choice)))

    if not sections and not blocks:
        return ""
    # Skills, role profile and (in migration mode) the migration methodology are
    # core — injected first so they are never pushed out of the budget by
    # lower-priority content.
    core: set[str] = set()
    if _skills_title:
        core.add(_skills_title)
    if _profile_title:
        core.add(_profile_title)
    if _migration_title:
        core.add(_migration_title)
    for _title in _version_titles:
        core.add(_title)
    if _creation_title:
        core.add(_creation_title)
    if _creator_profile_title:
        core.add(_creator_profile_title)
    if _studio_title and creation:
        core.add(_studio_title)
    if _localization_title:
        core.add(_localization_title)
    # Priority blocks consume the budget first; the routed sections fit in what
    # remains, so the assembled context never overflows MAX_CONTEXT_CHARS.
    separator = "\n\n---\n\n"
    blocks_len = sum(len(b) for b in blocks) + len(separator) * len(blocks)
    routed_budget = max(0, _CONTEXT_BUDGET_CHARS - blocks_len)
    fitted = _fit_context_budget(sections, budget=routed_budget, core_sections=core or None)
    routed = separator.join(f"## {title}\n\n{content.strip()}" for title, content in fitted)
    assembled = separator.join(blocks + ([routed] if routed else []))
    if _logger.isEnabledFor(logging.DEBUG):
        # Observability — without this it is impossible to diagnose "why did
        # the AI miss this point?". Each section listed with its char size.
        section_summary = ", ".join(f"{title}={len(content)}" for title, content in fitted)
        _logger.debug(
            "context assembled: total=%d budget=%d priority_blocks=%d sections=[%s]",
            len(assembled), _CONTEXT_BUDGET_CHARS, len(blocks), section_summary,
        )
    return assembled


# ── Default content ───────────────────────────────────────────────

def _default_content(name: str, locale: Optional[str] = None) -> Optional[str]:
    lang = normalize_locale(locale)
    if lang == "en":
        if name == "skills.md":
            return _SKILLS_MD_EN
        if name == "meeting-minute.md":
            return _MEETING_MINUTE_MD_EN
        if name == "migration.md":
            return _MIGRATION_MD_EN
        if name == "studio.md":
            return _STUDIO_MD_EN
        if name == "dev.md":
            return _DEV_MD_EN
        if name == "creation.md":
            return _CREATION_MD_EN
        if name == "profile-creator.md":
            return _PROFILE_CREATOR_MD_EN
        if name in _PROFILE_DEFAULTS_EN:
            return _PROFILE_DEFAULTS_EN[name]
        m_en = re.match(r'^odoo-([\d\.]+)\.md$', name)
        if m_en:
            return _VERSION_NOTES_EN.get(m_en.group(1))
        m_l10n_en = _L10N_FILE_RE.match(name)
        if m_l10n_en:
            return _L10N_NOTES_EN.get(m_l10n_en.group(1))
    if name == "skills.md":
        return _SKILLS_MD
    if name == "meeting-minute.md":
        return _MEETING_MINUTE_MD
    if name == "migration.md":
        return _MIGRATION_MD
    if name == "studio.md":
        return _STUDIO_MD
    if name == "dev.md":
        return _DEV_MD
    if name == "creation.md":
        return _CREATION_MD
    if name == "profile-creator.md":
        return _PROFILE_CREATOR_MD
    if name in _PROFILE_DEFAULTS:
        return _PROFILE_DEFAULTS[name]
    m = re.match(r'^odoo-([\d\.]+)\.md$', name)
    if m:
        return _VERSION_NOTES.get(m.group(1))
    m_l10n = _L10N_FILE_RE.match(name)
    if m_l10n:
        return _L10N_NOTES.get(m_l10n.group(1))
    return None
