"""Manage editable markdown context files used to enrich AI prompts."""

import logging
import re
from collections import OrderedDict
from pathlib import Path
from typing import Optional

_logger = logging.getLogger(__name__)

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
from ..skills.default_contexts import SKILL_CONTEXT_DEFAULTS, SKILL_CONTEXT_DEFAULTS_EN
from ..skills.registry import SKILL_DEFINITIONS

_CONTEXT_DIR = Path.home() / ".odoo-consultant" / "context"
_SUPPORTED_LOCALES = {"fr", "en"}
_DEFAULT_LOCALE = "fr"

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
_STUDIO_TERMS = ("studio", "x_studio", "personnalisation", "customisation", "champ custom", "modèle custom", "modele custom", "inspect_studio")
# Custom-development vocabulary: triggers loading dev.md when the prompt
# explicitly references custom code patterns or the project repo.
_DEV_TERMS = (
    "module custom", "custom module", "dev custom", "custom dev",
    "_inherit", "_inherits", "@api.depends", "@api.constrains", "@api.onchange",
    "search_project_source", "read_project_file", "code custom",
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
    "custom", "right", "group",
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

# Short profile-shaping snippets injected as priority blocks when the project
# complexity tells us the role should adapt. They are intentionally tiny
# (~300-500 chars) so the budget cost is negligible while the LLM gets the
# *attitude* right for the kind of project at hand.
_COMPLEXITY_PROFILE_FR = {
    "studio": (
        "Adaptation profil — projet Studio.\n"
        "Avant toute proposition technique, vérifie ce qui a été fait via Studio "
        "(`inspect_studio`, `x_*`, `studio_customization.*`). Beaucoup de "
        "comportements « inexplicables » viennent de là. Ne suggère un module "
        "custom qu'après avoir confirmé que Studio ne couvre pas le besoin."
    ),
    "dev": (
        "Adaptation profil — projet avec dev custom.\n"
        "Le code custom du dépôt client peut surcharger n'importe quel modèle / "
        "vue / action standard. Avant de répondre « comportement standard » ou "
        "« champ inexistant », vérifie avec `search_project_source` et "
        "`read_project_file`. La vue assemblée (`inspect_odoo_view`) reste la "
        "vérité finale."
    ),
    "studio_dev": (
        "Adaptation profil — projet Studio + dev custom.\n"
        "Studio ET dev cohabitent. Ordre d'investigation : (1) instance live, "
        "(2) Studio (`inspect_studio`), (3) code custom (`search_project_source`), "
        "(4) standard Odoo. Toujours déterminer d'où vient un comportement avant "
        "de proposer une correction — Studio peut surcharger un héritage custom "
        "et inversement."
    ),
}

_COMPLEXITY_PROFILE_EN = {
    "studio": (
        "Profile tuning — Studio project.\n"
        "Before any technical proposal, check what was done via Studio "
        "(`inspect_studio`, `x_*`, `studio_customization.*`). Many « unexplained » "
        "behaviours come from there. Suggest a custom module only after "
        "confirming Studio cannot cover the need."
    ),
    "dev": (
        "Profile tuning — project with custom dev.\n"
        "The client repo's custom code can override any standard model / view / "
        "action. Before answering « standard behaviour » or « field does not exist », "
        "check with `search_project_source` and `read_project_file`. The assembled "
        "view (`inspect_odoo_view`) is the final truth."
    ),
    "studio_dev": (
        "Profile tuning — Studio + custom dev project.\n"
        "Studio AND custom dev coexist. Investigation order: (1) live instance, "
        "(2) Studio (`inspect_studio`), (3) custom code (`search_project_source`), "
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
    disabled = set(disabled_tools or [])
    mode = "creator" if creation else ("migration" if migration else "assistant")
    prompt_norm = _normalize_text(prompt)
    selected_files: list[str] = []

    def add(name: str) -> None:
        for skill in SKILL_DEFINITIONS:
            if skill.name == name and skill.name not in disabled and mode in skill.modes:
                if skill.context_file not in selected_files:
                    selected_files.append(skill.context_file)
                return

    # Mode-level defaults: tiny, high-value reminders for workflows where the
    # same mistakes are costly.
    if creation:
        for name in ("inspect_studio", "get_odoo_fields", "inspect_odoo_view", "inspect_odoo_report"):
            add(name)
    elif migration:
        for name in ("inspect_installed_modules", "inspect_studio", "search_target_source"):
            add(name)

    for skill in SKILL_DEFINITIONS:
        if skill.name in disabled or mode not in skill.modes:
            continue
        if skill.name in prompt_norm:
            add(skill.name)
            continue
        if skill.keywords and _has_any(prompt_norm, tuple(k.casefold() for k in skill.keywords)):
            add(skill.name)

    # Explicit trigger patterns that are stronger than generic domain keywords.
    if re.search(r"\b[0-9a-f]{7,40}\b", prompt_norm):
        add("git_show_commit")
    if _has_any(prompt_norm, ("où cliquer", "ou cliquer", "where click", "menu", "navigation")):
        add("inspect_menus_actions")
    if _has_any(prompt_norm, ("kpi", "par mois", "par statut", "read_group", "chiffre d'affaires", "ca par")):
        add("read_group_odoo")
    if _has_any(prompt_norm, (
        "règle de sécurité", "règles de sécurité", "regle de securite", "regles de securite",
        "security rule", "security rules", "record rule", "ir.rule", "acl", "access right",
        "access rights", "droit d'accès", "droits d'accès", "ir.model.access",
    )):
        add("inspect_security")
        if _has_any(prompt_norm, (
            "module custom", "modules custom", "custom module", "custom modules",
            "dépôt client", "depot client", "repo client", "project repo", "code projet",
            "code custom", "spécifique client", "specifique client",
        )):
            for name in ("list_project_modules", "search_project_source", "read_project_file"):
                add(name)

    chunks: list[str] = []
    for filename in selected_files:
        try:
            content = read_file(filename, lang).strip()
        except FileNotFoundError:
            continue
        if content:
            chunks.append(content)
    return "\n\n".join(dict.fromkeys(chunks)).strip()


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
_MAX_PRIORITY_BLOCK_CHARS = 4000


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
        tuple(sorted(disabled_tools or [])),
    )
    cached = _CONTEXT_CACHE.get(cache_key)
    if cached is not None:
        _CONTEXT_CACHE.move_to_end(cache_key)
        return cached
    result = _load_context_for_prompt_impl(
        odoo_version=odoo_version, migration=migration, user_prompt=user_prompt,
        perspective=perspective, locale=locale, target_version=target_version,
        priority_blocks=priority_blocks, creation=creation,
        country_code=country_code, force_localization=force_localization,
        complexity_mode=complexity_mode, disabled_tools=disabled_tools,
    )
    _CONTEXT_CACHE[cache_key] = result
    if len(_CONTEXT_CACHE) > _CONTEXT_CACHE_MAX:
        _CONTEXT_CACHE.popitem(last=False)
    return result


def clear_context_cache() -> None:
    """Reset the memoization cache. Tests may call this between scenarios."""
    _CONTEXT_CACHE.clear()


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
) -> str:
    lang = normalize_locale(locale)
    titles = _SECTION_TITLES[lang]
    prompt = _normalize_text(user_prompt)
    blocks = [
        _truncate_priority_block(b.strip())
        for b in (priority_blocks or []) if b and b.strip()
    ]
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
    )
    if _skill_playbooks:
        _skill_playbooks_title = titles["skill_playbooks"]
        sections.append((_skill_playbooks_title, _skill_playbooks))

    # Role-specific profile file (support / BA / architect / developer).
    # Treated as a core section so the role guidance is never crowded out.
    # Skipped in Creator mode: the Creator profile (profile-creator.md, loaded
    # below) is the locked authority — adding a second role profile underneath
    # is both redundant and conceptually inconsistent with the locked badge.
    _profile_title = None
    if not creation:
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
    if creation or studio_project or _is_topic_of(prompt, _STUDIO_TERMS):
        try:
            sections.append((titles["studio"], read_file("studio.md", lang)))
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
    if odoo_version and _version_sensitive:
        try:
            content = _filter_version_note_by_domain(
                read_file(f"odoo-{odoo_version}.md", lang), prompt)
            sections.append((titles["version"].format(version=odoo_version), content))
        except FileNotFoundError:
            pass
    if target_version and target_version != odoo_version and _version_sensitive:
        try:
            content = _filter_version_note_by_domain(
                read_file(f"odoo-{target_version}.md", lang), prompt)
            sections.append((titles["version"].format(version=target_version), content))
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
    if _skill_playbooks_title:
        core.add(_skill_playbooks_title)
    if _migration_title:
        core.add(_migration_title)
    if _creation_title:
        core.add(_creation_title)
    if _creator_profile_title:
        core.add(_creator_profile_title)
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
        if name in SKILL_CONTEXT_DEFAULTS_EN:
            return SKILL_CONTEXT_DEFAULTS_EN[name]
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
    if name in SKILL_CONTEXT_DEFAULTS:
        return SKILL_CONTEXT_DEFAULTS[name]
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
