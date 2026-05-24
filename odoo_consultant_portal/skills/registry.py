"""Single registry for AI tools exposed as application skills.

The provider-specific JSON schemas still live in ``ai_service`` because they are
adapter code, but product metadata, grouping and context-file names are kept
here so Settings, prompt routing and backend validation do not drift.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

SkillGroup = Literal["live", "src", "target", "repo"]
SkillMode = Literal["assistant", "migration", "creator"]


@dataclass(frozen=True)
class SkillDefinition:
    name: str
    label: str
    label_en: str
    group: SkillGroup
    description: str
    description_en: str
    requirement: str
    requirement_en: str
    context_file: str
    modes: tuple[SkillMode, ...]
    read_only: bool = True
    risk_level: Literal["low", "medium", "high"] = "low"
    keywords: tuple[str, ...] = ()


SKILL_DEFINITIONS: tuple[SkillDefinition, ...] = (
    SkillDefinition(
        "query_odoo", "Requêter Odoo", "Query Odoo", "live",
        "Rechercher des enregistrements via search_read (commandes, factures, contacts...).",
        "Fetch records via search_read (orders, invoices, contacts...).",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-query-odoo.md", ("assistant", "migration", "creator"),
        keywords=("donnée", "data", "records", "search_read", "liste", "facture", "commande", "contact"),
    ),
    SkillDefinition(
        "count_odoo", "Compter enregistrements", "Count records", "live",
        "Compter les enregistrements correspondant à un domaine de filtrage.",
        "Count records matching a filter domain.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-count-odoo.md", ("assistant", "migration", "creator"),
        keywords=("combien", "count", "nombre", "volume", "total", "domain"),
    ),
    SkillDefinition(
        "read_group_odoo", "Agréger des données", "Aggregate data", "live",
        "Calculer des agrégats Odoo fiables par période, statut, commercial, journal ou autre groupement.",
        "Compute reliable Odoo aggregates by period, status, salesperson, journal or another grouping.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-read-group-odoo.md", ("assistant", "migration", "creator"),
        keywords=("kpi", "agrég", "aggregate", "group", "par mois", "par statut", "read_group", "somme"),
    ),
    SkillDefinition(
        "get_odoo_fields", "Inspecter les champs", "Inspect fields", "live",
        "Lister les champs d'un modèle, y compris les champs custom Studio (x_*).",
        "List model fields, including Studio custom fields (x_*).",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-get-odoo-fields.md", ("assistant", "migration", "creator"),
        keywords=("champ", "field", "relation", "many2one", "x_", "structure", "invalid field"),
    ),
    SkillDefinition(
        "inspect_installed_modules", "Modules installés", "Installed modules", "live",
        "Lister les modules installés et distinguer applications, modules techniques et modules custom probables.",
        "List installed modules and distinguish apps, technical modules and likely custom modules.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-installed-modules.md", ("assistant", "migration", "creator"),
        keywords=("module installé", "installed module", "apps", "application", "dépendance", "stack"),
    ),
    SkillDefinition(
        "inspect_security", "Inspecter la sécurité", "Inspect security", "live",
        "Lire ACL, record rules et groupes liés à un modèle pour diagnostiquer les droits d'accès.",
        "Read ACLs, record rules and groups for a model to diagnose access rights.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-security.md", ("assistant", "migration", "creator"),
        keywords=(
            "droits", "droit d'accès", "droits d'accès", "access", "access right", "access rights",
            "acl", "ir.model.access", "record rule", "security rule", "ir.rule",
            "sécurité", "securite", "règle de sécurité", "regle de securite",
            "permission", "groupe",
        ),
    ),
    SkillDefinition(
        "inspect_menus_actions", "Menus et actions", "Menus and actions", "live",
        "Retrouver les menus, actions et vues d'entrée qui exposent un modèle ou un écran.",
        "Find menus, actions and entry views exposing a model or screen.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-menus-actions.md", ("assistant", "migration", "creator"),
        keywords=("menu", "navigation", "action", "écran", "screen", "où cliquer", "accéder"),
    ),
    SkillDefinition(
        "inspect_studio", "Audit Studio", "Studio audit", "live",
        "Inventorier les personnalisations Odoo Studio : modèles, champs, vues, menus, automatisations.",
        "Inventory Odoo Studio customizations: models, fields, views, menus, automations.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-studio.md", ("assistant", "migration", "creator"),
        keywords=("studio", "x_studio", "personnalisation", "customization", "automation", "migration studio"),
    ),
    SkillDefinition(
        "inspect_odoo_view", "Inspecter une vue", "Inspect a view", "live",
        "Lire l'arch XML assemblée d'une vue après héritage complet.",
        "Read the assembled XML arch of a view after full inheritance.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-odoo-view.md", ("assistant", "migration", "creator"),
        keywords=("vue", "view", "form", "list", "kanban", "xpath", "readonly", "invisible", "creator"),
    ),
    SkillDefinition(
        "inspect_odoo_report", "Inspecter un rapport", "Inspect a report", "live",
        "Lire le template QWeb, l'héritage et la mise en page d'un rapport PDF.",
        "Read the QWeb template, inheritance tree and layout of a PDF report.",
        "Connexion Odoo active", "Active Odoo connection",
        "skill-inspect-odoo-report.md", ("assistant", "migration", "creator"),
        keywords=("rapport", "report", "pdf", "qweb", "template", "xpath", "facture pdf"),
    ),
    SkillDefinition(
        "search_odoo_source", "Chercher dans les sources", "Search source code", "src",
        "Grep dans le code source Odoo Community/Enterprise téléchargé localement.",
        "Grep in locally downloaded Odoo Community/Enterprise source code.",
        "Sources Odoo téléchargées", "Downloaded Odoo sources",
        "skill-search-odoo-source.md", ("assistant", "migration", "creator"),
        keywords=("source", "code odoo", "grep", "méthode", "model", "class", "standard"),
    ),
    SkillDefinition(
        "read_odoo_file", "Lire un fichier source", "Read a source file", "src",
        "Lire le contenu d'un fichier des sources Odoo.",
        "Read the content of an Odoo source file.",
        "Sources Odoo téléchargées", "Downloaded Odoo sources",
        "skill-read-odoo-file.md", ("assistant", "migration", "creator"),
        keywords=("fichier", "file", "implémentation", "implementation", "ligne", "read"),
    ),
    SkillDefinition(
        "git_show_commit", "Voir un commit", "Show a commit", "src",
        "Afficher le diff complet d'un commit Odoo ou projet par son SHA.",
        "Display the full diff of an Odoo or project commit by its SHA.",
        "Sources ou dépôt Git disponible", "Sources or Git repository available",
        "skill-git-show-commit.md", ("assistant", "migration", "creator"),
        keywords=("commit", "sha", "diff", "patch", "git", "changement"),
    ),
    SkillDefinition(
        "search_target_source", "Chercher dans la cible", "Search target source", "target",
        "Rechercher dans les sources Odoo de la version cible d'une migration.",
        "Search Odoo source code for the migration target version.",
        "Sources cible téléchargées", "Downloaded target sources",
        "skill-search-target-source.md", ("migration",),
        keywords=("migration", "version cible", "target", "breaking", "compatibilité"),
    ),
    SkillDefinition(
        "read_target_file", "Lire un fichier cible", "Read target file", "target",
        "Lire un fichier des sources Odoo de la version cible d'une migration.",
        "Read a source file from the migration target version.",
        "Sources cible téléchargées", "Downloaded target sources",
        "skill-read-target-file.md", ("migration",),
        keywords=("migration", "target", "version cible", "fichier cible"),
    ),
    SkillDefinition(
        "search_project_source", "Chercher dans le projet", "Search project code", "repo",
        "Grep dans le dépôt custom du client.",
        "Grep in the client's custom repository.",
        "Dépôt GitHub cloné", "Cloned GitHub repository",
        "skill-search-project-source.md", ("assistant", "migration", "creator"),
        keywords=("repo", "dépôt", "custom", "override", "_inherit", "module client"),
    ),
    SkillDefinition(
        "read_project_file", "Lire un fichier projet", "Read a project file", "repo",
        "Lire un fichier du dépôt custom client.",
        "Read a file from the client's custom repository.",
        "Dépôt GitHub cloné", "Cloned GitHub repository",
        "skill-read-project-file.md", ("assistant", "migration", "creator"),
        keywords=("repo", "fichier custom", "read_project_file", "override", "manifest"),
    ),
    SkillDefinition(
        "list_project_modules", "Modules projet", "Project modules", "repo",
        "Parser les manifests du dépôt client pour lister modules, dépendances et fichiers déclarés.",
        "Parse client repository manifests to list modules, dependencies and declared files.",
        "Dépôt GitHub cloné", "Cloned GitHub repository",
        "skill-list-project-modules.md", ("assistant", "migration", "creator"),
        keywords=("manifest", "__manifest__", "modules custom", "depends", "data files", "liste modules"),
    ),
    SkillDefinition(
        "count_source_lines", "Compter les lignes", "Count lines", "repo",
        "Comptage exhaustif des LOC par module, extension ou dossier.",
        "Exhaustive LOC count by module, extension or directory.",
        "Sources ou dépôt disponible", "Sources or repository available",
        "skill-count-source-lines.md", ("assistant", "migration", "creator"),
        keywords=("loc", "ligne", "lines", "volumétrie", "taille", "effort"),
    ),
)


def skill_names() -> set[str]:
    return {skill.name for skill in SKILL_DEFINITIONS}


def skill_catalog() -> list[dict]:
    return [asdict(skill) for skill in SKILL_DEFINITIONS]


def skill_by_name(name: str) -> SkillDefinition | None:
    for skill in SKILL_DEFINITIONS:
        if skill.name == name:
            return skill
    return None
