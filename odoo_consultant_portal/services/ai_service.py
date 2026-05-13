import asyncio
import json
import logging
import os
from typing import AsyncIterator, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..services.odoo_client import OdooClient

log = logging.getLogger(__name__)

# ── Tool definitions ─────────────────────────────────────────────

_TOOL_QUERY = {
    "name": "query_odoo",
    "description": "Rechercher des enregistrements dans Odoo (search_read). "
                   "Utilise cet outil pour répondre à toute question sur les données.",
}
_TOOL_COUNT = {
    "name": "count_odoo",
    "description": "Compter les enregistrements Odoo correspondant à un domaine.",
}
_TOOL_FIELDS = {
    "name": "get_odoo_fields",
    "description": "Lister les champs disponibles d'un modèle Odoo (pour découvrir quoi requêter).",
}
_TOOL_SEARCH_SRC = {
    "name": "search_odoo_source",
    "description": (
        "Rechercher dans le code source Odoo local (grep). "
        "Utilise pour trouver des modèles, méthodes, champs, modules, noms corrects de modèles. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne."
    ),
}
_TOOL_READ_SRC = {
    "name": "read_odoo_file",
    "description": (
        "Lire le contenu d'un fichier du code source Odoo local. "
        "Utilise après search_odoo_source pour voir l'implémentation complète."
    ),
}
_TOOL_SEARCH_REPO = {
    "name": "search_project_source",
    "description": (
        "Rechercher dans le code source du projet client (modules custom, overrides, configurations). "
        "Utilise pour trouver des modèles custom, des surcharges de méthodes Odoo, des vues modifiées, ou toute logique métier spécifique au client. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne.\n"
        "IMPORTANT — pour lister les modules custom du projet, utilise file_types=['__manifest__.py'] avec pattern='name' : "
        "cela cherche les lignes contenant 'name' DANS les fichiers __manifest__.py (un par module).\n"
        "Exemples :\n"
        "- Lister tous les modules custom : search_project_source(pattern='name', file_types=['__manifest__.py'])\n"
        "- Trouver un override : search_project_source(pattern='_inherit', file_types=['*.py'])\n"
        "- Chercher un modèle : search_project_source(pattern=\"_name = 'sale.order'\", file_types=['*.py'])"
    ),
}
_TOOL_READ_REPO = {
    "name": "read_project_file",
    "description": (
        "Lire le contenu d'un fichier du code source du projet client (module custom). "
        "Utilise après search_project_source pour voir l'implémentation complète d'un override ou d'un module custom. "
        "Le chemin est relatif depuis la racine du dépôt cloné."
    ),
}

_TOOL_INSPECT_STUDIO = {
    "name": "inspect_studio",
    "description": (
        "Inspecter les personnalisations Odoo Studio de l'instance connectée : "
        "modèles custom (x_*), champs custom (x_*), vues modifiées, menus, actions serveur, "
        "actions planifiées (ir.cron), automatisations métier (base.automation) et règles d'accès.\n"
        "Utilise cet outil quand l'utilisateur demande :\n"
        "- Ce qui a été fait / configuré via Studio\n"
        "- Quels modèles, champs, vues ou menus ont été créés\n"
        "- L'inventaire des personnalisations de l'instance\n"
        "- L'impact Studio avant une migration de version\n"
        "Paramètres :\n"
        "- sections : liste parmi ['models','fields','views','menus','server_actions','cron','automations','rules','all'] — défaut ['all']\n"
        "- model_filter : filtre optionnel sur le nom de modèle (ex: 'x_' pour les modèles Studio, 'sale.' pour filtrer par app)\n"
        "Exemples :\n"
        "- Tout inspecter : inspect_studio(sections=['all'])\n"
        "- Seulement les champs custom : inspect_studio(sections=['fields'])\n"
        "- Modèles + vues : inspect_studio(sections=['models','views'])\n"
        "- Filtrer par modèle : inspect_studio(sections=['fields'], model_filter='sale.')"
    ),
}

_TOOL_COUNT_LINES = {
    "name": "count_source_lines",
    "description": (
        "Compter exhaustivement les lignes de code dans un dépôt (Odoo source, version cible, ou projet client). "
        "Utilise cet outil quand tu dois donner un chiffre fiable de lignes/fichiers, par module, par extension ou par dossier — "
        "au lieu de te fier au nombre de matches d'une recherche grep (qui n'est PAS un comptage exhaustif).\n"
        "Paramètres :\n"
        "- scope : 'odoo' (sources Odoo source / general), 'target' (sources de la version cible en migration), 'project' (repo client cloné)\n"
        "- path : sous-dossier optionnel pour restreindre, ex 'addons/sale' ou 'mon_module'\n"
        "- file_types : liste de globs, ex ['*.py'], ['*.xml'], ['*.py','*.xml','*.js']\n"
        "- group_by : 'extension' (par .py, .xml, .js…), 'module' (par module Odoo, déduit du chemin addons/<module>/), 'directory' (par dossier)\n"
        "Exemples :\n"
        "- Total Python du projet client : count_source_lines(scope='project', file_types=['*.py'], group_by='module')\n"
        "- Volumétrie par extension du repo : count_source_lines(scope='project', file_types=['*.py','*.xml','*.js','*.scss'], group_by='extension')\n"
        "- LOC d'un module précis : count_source_lines(scope='project', path='mon_module', file_types=['*.py'], group_by='directory')"
    ),
}

# ── Claude tool schemas ───────────────────────────────────────────

TOOLS_CLAUDE = [
    {**_TOOL_QUERY, "input_schema": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string", "description": "Modèle Odoo (ex: account.move, sale.order, res.partner)"},
        "domain": {"type": "array",  "description": "Domaine Odoo, ex: [[\"state\",\"=\",\"posted\"]]", "default": []},
        "fields": {"type": "array",  "items": {"type": "string"}, "description": "Champs à récupérer"},
        "limit":  {"type": "integer", "description": "Nombre max de résultats (défaut 20)", "default": 20},
        "order":  {"type": "string",  "description": "Tri, ex: 'date desc'", "default": ""},
    }}},
    {**_TOOL_COUNT, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "default": []},
    }}},
    {**_TOOL_FIELDS, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}},
    {**_TOOL_SEARCH_SRC, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher (ex: 'sale_line_id', 'class AccountMove', '_name = ')"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/stock', 'addons/sale')", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + 150)", "default": 0},
    }}},
]

# ── OpenAI tool schemas ───────────────────────────────────────────

TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_QUERY, "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array",   "items": {}, "default": []},
        "fields": {"type": "array",   "items": {"type": "string"}},
        "limit":  {"type": "integer", "default": 20},
        "order":  {"type": "string",  "default": ""},
    }}}},
    {"type": "function", "function": {**_TOOL_COUNT, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "items": {}, "default": []},
    }}}},
    {"type": "function", "function": {**_TOOL_FIELDS, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}}},
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
    }}}},
]

# ── Gemini tool schemas ───────────────────────────────────────────

TOOLS_GEMINI = [
    {
        "function_declarations": [
            {"name": "query_odoo",    "description": _TOOL_QUERY["description"],
             "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
                 "model":  {"type": "string"},  "domain": {"type": "array"},
                 "fields": {"type": "array"},   "limit":  {"type": "integer"},
                 "order":  {"type": "string"},
             }}},
            {"name": "count_odoo",   "description": _TOOL_COUNT["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model":  {"type": "string"}, "domain": {"type": "array"},
             }}},
            {"name": "get_odoo_fields", "description": _TOOL_FIELDS["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
             }}},
            {"name": "search_odoo_source", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
        ]
    }
]

# ── Source-only tool schemas (general mode, no Odoo data) ────────

TOOLS_CLAUDE_SRC = [
    {**_TOOL_SEARCH_SRC, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher (ex: 'sale_line_id', 'class AccountMove', '_name = ')"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/stock', 'addons/sale')", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + 150)", "default": 0},
    }}},
]

TOOLS_OPENAI_SRC = [
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
    }}}},
]

TOOLS_GEMINI_SRC = [
    {
        "function_declarations": [
            {"name": "search_odoo_source", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
        ]
    }
]

# ── Repository tool schemas (appended when repo_path is set) ─────

_REPO_INPUT_SCHEMA_SEARCH = {"type": "object", "required": ["pattern"], "properties": {
    "pattern":    {"type": "string", "description": "Texte ou regex à chercher"},
    "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/mon_module')", "default": ""},
    "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
}}
_REPO_INPUT_SCHEMA_READ = {"type": "object", "required": ["path"], "properties": {
    "path":       {"type": "string",  "description": "Chemin relatif depuis la racine du dépôt"},
    "start_line": {"type": "integer", "description": "Première ligne à lire", "default": 1},
    "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + 150)", "default": 0},
}}

REPO_TOOLS_CLAUDE = [
    {**_TOOL_SEARCH_REPO, "input_schema": _REPO_INPUT_SCHEMA_SEARCH},
    {**_TOOL_READ_REPO,   "input_schema": _REPO_INPUT_SCHEMA_READ},
]
REPO_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_SEARCH_REPO, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern": {"type": "string"}, "path": {"type": "string", "default": ""},
        "file_types": {"type": "array", "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_REPO, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path": {"type": "string"}, "start_line": {"type": "integer", "default": 1}, "end_line": {"type": "integer", "default": 0},
    }}}},
]
REPO_FUNCTION_DECLARATIONS = [
    {"name": "search_project_source", "description": _TOOL_SEARCH_REPO["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
     }}},
    {"name": "read_project_file", "description": _TOOL_READ_REPO["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"},
     }}},
]

# ── Migration target tool schemas ─────────────────────────────────

_TOOL_SEARCH_TARGET = {
    "name": "search_target_source",
    "description": (
        "Rechercher dans le code source Odoo de la VERSION CIBLE de la migration. "
        "Utilise cet outil pour comparer l'implémentation dans la version d'arrivée : "
        "vérifier si un modèle/champ/méthode a changé, été supprimé ou renommé. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne."
    ),
}
_TOOL_READ_TARGET = {
    "name": "read_target_file",
    "description": (
        "Lire le contenu d'un fichier du code source de la VERSION CIBLE de la migration. "
        "Utilise après search_target_source pour voir l'implémentation complète dans la version d'arrivée."
    ),
}

TARGET_TOOLS_CLAUDE = [
    {**_TOOL_SEARCH_TARGET, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher dans la version cible"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "default": ["*.py"]},
    }}},
    {**_TOOL_READ_TARGET, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources cibles"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
    }}},
]
TARGET_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_SEARCH_TARGET, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern": {"type": "string"}, "path": {"type": "string", "default": ""},
        "file_types": {"type": "array", "items": {"type": "string"}, "default": ["*.py"]},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_TARGET, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path": {"type": "string"}, "start_line": {"type": "integer", "default": 1}, "end_line": {"type": "integer", "default": 0},
    }}}},
]
TARGET_FUNCTION_DECLARATIONS = [
    {"name": "search_target_source", "description": _TOOL_SEARCH_TARGET["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
     }}},
    {"name": "read_target_file", "description": _TOOL_READ_TARGET["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"},
     }}},
]

# ── Count-lines tool schemas ─────────────────────────────────────

_COUNT_PROPS = {
    "scope":      {"type": "string", "enum": ["odoo", "target", "project"], "description": "Dépôt cible : 'odoo' (sources version source), 'target' (version cible migration), 'project' (repo client)"},
    "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/sale' ou 'mon_module')", "default": ""},
    "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Globs des extensions, ex ['*.py'] ou ['*.py','*.xml']", "default": ["*.py"]},
    "group_by":   {"type": "string", "enum": ["extension", "module", "directory", "none"], "description": "Comment regrouper le décompte", "default": "extension"},
}

COUNT_TOOLS_CLAUDE = [
    {**_TOOL_COUNT_LINES, "input_schema": {"type": "object", "required": ["scope"], "properties": _COUNT_PROPS}},
]
COUNT_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_COUNT_LINES, "parameters": {"type": "object", "required": ["scope"], "properties": _COUNT_PROPS}}},
]
COUNT_FUNCTION_DECLARATIONS = [
    {"name": "count_source_lines", "description": _TOOL_COUNT_LINES["description"],
     "parameters": {"type": "object", "required": ["scope"], "properties": {
         "scope": {"type": "string"}, "path": {"type": "string"},
         "file_types": {"type": "array"}, "group_by": {"type": "string"},
     }}},
]

# ── Studio inspection tool schemas ───────────────────────────────

_STUDIO_PROPS = {
    "sections":     {"type": "array",  "items": {"type": "string"}, "description": "Sections : models, fields, views, menus, server_actions, cron, automations, rules, all", "default": ["all"]},
    "model_filter": {"type": "string", "description": "Filtre sur le nom de modèle, ex: 'x_' ou 'sale.'", "default": ""},
}

STUDIO_TOOLS_CLAUDE = [
    {**_TOOL_INSPECT_STUDIO, "input_schema": {"type": "object", "properties": _STUDIO_PROPS}},
]
STUDIO_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_INSPECT_STUDIO, "parameters": {"type": "object", "properties": _STUDIO_PROPS}}},
]
STUDIO_FUNCTION_DECLARATIONS = [
    {"name": "inspect_studio", "description": _TOOL_INSPECT_STUDIO["description"],
     "parameters": {"type": "object", "properties": {
         "sections": {"type": "array"}, "model_filter": {"type": "string"},
     }}},
]

DEFAULT_MODELS = {
    "claude":   "claude-sonnet-4-6",
    "openai":   "gpt-4o",
    "gemini":   "gemini-2.0-flash",
    "github":   "gpt-4o",
    "copilot":  "gpt-4o",
}

GITHUB_MODELS_BASE_URL  = "https://models.inference.ai.azure.com"
COPILOT_BASE_URL        = "https://api.githubcopilot.com"
COPILOT_HEADERS         = {
    "editor-version":        "vscode/1.95.0",
    "editor-plugin-version": "copilot-chat/0.22.4",
    "copilot-integration-id": "vscode-chat",
}


# ── System prompt ────────────────────────────────────────────────

_MAX_CONTEXT_CHARS = 40_000  # ~10k tokens — prevents hitting model limits
_MAX_PROJECT_CONTEXT_CHARS = 12_000


def _trim_context(ctx: str) -> str:
    if len(ctx) <= _MAX_CONTEXT_CHARS:
        return ctx
    return ctx[:_MAX_CONTEXT_CHARS] + "\n\n[...contexte tronqué — trop long pour le modèle...]"


def _trim_project_context(ctx: str) -> str:
    if len(ctx) <= _MAX_PROJECT_CONTEXT_CHARS:
        return ctx
    return ctx[:_MAX_PROJECT_CONTEXT_CHARS] + "\n\n[...contexte projet tronqué — trop long pour le modèle...]"


# ── Perspective (functional / technical) ─────────────────────────

PERSPECTIVE_TECHNICAL = "technical"
PERSPECTIVE_FUNCTIONAL = "functional"
_VALID_PERSPECTIVES = {PERSPECTIVE_TECHNICAL, PERSPECTIVE_FUNCTIONAL}


def _normalize_perspective(p: Optional[str]) -> str:
    if p in _VALID_PERSPECTIVES:
        return p  # type: ignore[return-value]
    return PERSPECTIVE_TECHNICAL


def _perspective_block(perspective: str, *, migration: bool = False) -> str:
    """Return a markdown block injected at the top of the system prompt
    to bias the assistant's reasoning, vocabulary and output format."""
    perspective = _normalize_perspective(perspective)

    if perspective == PERSPECTIVE_FUNCTIONAL:
        common = """## Perspective : FONCTIONNELLE (AM / Business Analyst)

Tu réponds comme un **Application Manager / Business Analyst Odoo**, pas comme un développeur.
Cette perspective est active pour la requête en cours : si l'utilisateur vient de basculer depuis le mode technique, adapte immédiatement la réponse au vocabulaire métier.

### Public cible de tes réponses
- Consultants fonctionnels, key users, sponsors métier, chefs de projet.
- Ils ne lisent pas de code Python ni de XML brut.
- La réponse doit rester exploitable sans connaître l'ORM Odoo.

### Ce sur quoi tu dois te concentrer
- **Parcours utilisateur** : qui clique où, dans quel écran, pour obtenir quoi.
- **Processus métier** : ventes, achats, stock, finance, RH, projet… end-to-end.
- **Configuration fonctionnelle** : modules à activer, paramètres clés, règles, automatisations standard.
- **Impact sur les rôles** (commercial, comptable, magasinier, manager…) et sur les KPI.
- **Cas d'usage et limites** du standard avant de parler personnalisation.
- **Décisions à prendre** : arbitrage standard vs adaptation, effort, risque, dépendances métier.

### Ce que tu dois éviter
- Détails d'implémentation (ORM, compute, decorators, héritage de classes Python).
- Diff de code ligne à ligne, signatures de méthodes internes.
- Jargon framework (`_inherit`, `api.depends`, `super()`, ir.model…) sauf si absolument nécessaire pour expliquer un comportement métier.
- Snippets de code, sauf si l'utilisateur les demande explicitement.

### Comment utiliser les outils de recherche
- Cherche d'abord dans **les vues, menus, wizards, rapports et données de démo** (`*.xml`, `views/`, `wizard/`, `report/`, `data/`).
- Lis les **`__manifest__.py`** pour comprendre la promesse fonctionnelle d'un module (description, category, dépendances).
- Le code Python ne sert qu'à **valider** un comportement métier, pas à le décrire.

### Format de sortie
- Tableaux Markdown orientés métier : `Cas d'usage | Avant | Après | Bénéfice utilisateur | Effort`.
- Listes à puces courtes, vocabulaire métier (workflow, processus, écran, rôle, validation).
- Captures de la navigation type : *Ventes → Configuration → Équipes commerciales*.
- Si un point technique peut bloquer le métier, ajoute une section courte **Point à valider techniquement** au lieu de détailler l'implémentation.
- Termine par **3 prochaines actions maximum**, formulées pour un AM / BA.
"""
        if migration:
            common += """
### Spécifique migration (mode fonctionnel)
- Mets en avant les **nouvelles fonctionnalités du standard** dans la version cible : qu'est-ce qui rend le client plus efficace ?
- Identifie les **modules à activer/désactiver/remplacer** (ex : remplacement de `account_*` par `accountant`, etc.).
- Signale les **changements UX visibles** : menus déplacés, écrans refondus, wizards remplacés.
- Évalue l'**impact formation** des key users (faible / moyen / fort) et propose les sujets à couvrir.
- Format de comparaison conseillé :
  `Domaine fonctionnel | Avant (vSource) | Après (vCible) | Impact utilisateur | Action AM`
"""
        return common.strip() + "\n\n---\n"

    # Technical perspective (default)
    common = """## Perspective : TECHNIQUE (Architecte / Développeur)

Tu réponds comme un **architecte ou développeur Odoo senior**.
Cette perspective est active pour la requête en cours : si l'utilisateur vient de basculer depuis le mode fonctionnel, descends immédiatement au niveau modèle, champ, fichier et méthode.

### Public cible de tes réponses
- Développeurs, tech leads, intégrateurs.
- Ils lisent du Python, de l'XML, des migrations SQL et savent ce qu'est l'ORM.

### Ce sur quoi tu dois te concentrer
- Modèles, champs, méthodes, héritage, decorators, contraintes, index.
- Vues XML, hooks, wizards, ACL, record rules, security.
- Performance, transactions, ORM, SQL généré, compatibilité de version.
- Impact sur les **modules custom** et stratégie de refactor.
- Preuves vérifiables : fichier, ligne, modèle, champ, domain ou commande quand disponible.

### Format de sortie
- Tableaux techniques : `Élément | Avant | Après | Action requise`.
- Extraits de code Python / XML avec chemins de fichiers et numéros de ligne quand possible.
- Vocabulaire : `_inherit`, `compute`, `depends`, `api.model_create_multi`, override, etc.
- Si l'impact métier est important, ajoute une section courte **Impact fonctionnel** après l'analyse technique.
- Termine par **3 prochaines actions maximum**, formulées pour un archi / dev.
"""
    return common.strip() + "\n\n---\n"


def build_system(profile, source_path: Optional[str] = None, context_md: str = "", repo_path: Optional[str] = None, perspective: str = PERSPECTIVE_TECHNICAL) -> str:
    perspective_md = _perspective_block(perspective, migration=False)
    source_section = ""
    if source_path:
        source_section = f"""
Code source Odoo disponible localement : {source_path}
IMPORTANT : Pour toute question sur des modèles, champs, méthodes ou comportements Odoo, utilise SYSTÉMATIQUEMENT search_odoo_source avant de répondre. Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.
Exemples d'utilisation :
- Trouver un modèle : search_odoo_source(pattern="_name = 'sale.order'")
- Trouver une méthode : search_odoo_source(pattern="def action_confirm", path="addons/sale")
- Lire un fichier : read_odoo_file(path="addons/account/models/account_move.py", start_line=1, end_line=100)
"""
    else:
        source_section = "\nCode source non disponible (sources non installées pour cette version).\n"

    repo_section = ""
    if repo_path:
        repo_section = f"""
Code source du projet client disponible localement : {repo_path}
Ce dépôt contient les modules custom et configurations spécifiques à ce client.
IMPORTANT — pour découvrir les modules custom, commence TOUJOURS par :
  search_project_source(pattern="name", file_types=["__manifest__.py"])
Cela liste tous les modules du dépôt en cherchant "name" dans les fichiers __manifest__.py.
Ensuite utilise read_project_file pour lire les fichiers pertinents.
Ne cherche PAS "__manifest__.py" comme pattern — c'est un nom de fichier, pas du contenu.

Pour toute question de **volumétrie** (nombre de lignes Python/XML, taille des modules, répartition par extension),
utilise **count_source_lines(scope='project', ...)** — il scanne le dépôt entièrement.
Ne déduis JAMAIS un nombre total de lignes à partir de search_project_source : cet outil retourne les *occurrences* d'un pattern, pas un comptage exhaustif.
"""

    return f"""{perspective_md}Tu es un assistant expert Odoo qui aide les consultants à analyser les données et le code source de leurs clients.

Instance connectée :
- URL : {profile.db_url}
- Version : {profile.odoo_version or "inconnue"}
- Base : {profile.db_name}
- Société : {profile.company_name or "inconnue"}
{source_section}{repo_section}
Instructions :
- Utilise les outils pour interroger Odoo directement et répondre avec des données réelles
- Quand un modèle n'existe pas sur l'instance, cherche son nom correct dans le code source avant d'abandonner
- Si le contexte Markdown contredit les données live ou le code source, les données live et le code source gagnent
- Sépare clairement les faits vérifiés, les hypothèses et les actions recommandées quand le sujet est ambigu
- Présente les listes sous forme de tableaux Markdown
- Si tu ne connais pas les champs d'un modèle, utilise get_odoo_fields d'abord
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
- Sois concis et orienté résultats

Modèles Odoo fréquents (noms peuvent varier selon la version) :
- Factures clients     : account.move, domain [["move_type","in",["out_invoice","out_refund"]]]
- Factures fournisseurs: account.move, domain [["move_type","in",["in_invoice","in_refund"]]]
- Commandes ventes     : sale.order
- Lignes de commande   : sale.order.line
- Commandes achats     : purchase.order
- Clients              : res.partner, domain [["customer_rank",">",0]]
- Fournisseurs         : res.partner, domain [["supplier_rank",">",0]]
- Produits             : product.template
- Variantes produit    : product.product
- Employés             : hr.employee
- Congés               : hr.leave
- CRM/Opportunités     : crm.lead
- Tâches projet        : project.task
- Routes stock         : stock.route (anciennement stock.location.route avant v16)
- Règles de réapprovisionnement : stock.warehouse.orderpoint
- Mouvements de stock  : stock.move
{chr(10) + "---" + chr(10) + chr(10) + _trim_context(context_md.strip()) if context_md.strip() else ""}
"""


def build_system_migration(
    source_version: str,
    target_version: str,
    source_path: Optional[str] = None,
    target_path: Optional[str] = None,
    context_md: str = "",
    repo_path: Optional[str] = None,
    perspective: str = PERSPECTIVE_TECHNICAL,
) -> str:
    perspective_md = _perspective_block(perspective, migration=True)
    src_section = (
        f"Sources Odoo VERSION SOURCE ({source_version}) disponibles : {source_path}\n"
        "→ Utilise search_odoo_source / read_odoo_file pour explorer le code de la version source."
    ) if source_path else f"Sources Odoo VERSION SOURCE ({source_version}) : non disponibles (téléchargez-les depuis la page Sources)."

    tgt_section = (
        f"Sources Odoo VERSION CIBLE ({target_version}) disponibles : {target_path}\n"
        "→ Utilise search_target_source / read_target_file pour explorer le code de la version cible."
    ) if target_path else f"Sources Odoo VERSION CIBLE ({target_version}) : non disponibles (téléchargez-les depuis la page Sources)."

    repo_section = (
        f"\nCode source du projet client disponible : {repo_path}\n"
        "→ Utilise search_project_source / read_project_file pour explorer les modules custom.\n"
        "Pour lister les modules custom : search_project_source(pattern='name', file_types=['__manifest__.py'])\n"
    ) if repo_path else ""

    count_section = (
        "\nPour toute question impliquant un **comptage exhaustif de lignes/fichiers** (volumétrie, taille d'un module, répartition par extension), "
        "utilise l'outil **count_source_lines** — il scanne tout le dépôt. Ne jamais déduire un nombre de lignes à partir de search_project_source / search_odoo_source : "
        "ces outils retournent les *occurrences* d'un pattern, pas le nombre total de lignes.\n"
    )

    return f"""{perspective_md}Tu es un expert Odoo spécialisé dans les migrations de version. Tu aides le consultant à préparer, analyser et exécuter une migration Odoo.

## Contexte de migration
- Version SOURCE : {source_version}
- Version CIBLE  : {target_version}

## Sources disponibles
{src_section}

{tgt_section}
{repo_section}{count_section}
## Ton rôle
- Comparer les implémentations source et cible pour identifier les changements breaking
- Analyser l'impact sur les modules custom du projet (si fournis)
- Identifier les champs, méthodes et modèles supprimés, renommés ou modifiés entre les deux versions
- Proposer les adaptations nécessaires (scripts de migration, modifications de code)
- Expliquer les nouvelles fonctionnalités disponibles dans la version cible

## Méthode de travail
1. Pour chaque point analysé, cherche d'abord dans la VERSION SOURCE avec search_odoo_source
2. Cherche ensuite le même élément dans la VERSION CIBLE avec search_target_source
3. Compare et explique les différences
4. Si des modules custom sont disponibles, vérifie leur compatibilité avec la version cible

## Instructions
- Utilise SYSTÉMATIQUEMENT les outils de recherche avant de répondre — ne suppose jamais un comportement
- Si le contexte Markdown contredit le code source ou les données client, le code source et les données client gagnent
- Présente les comparaisons sous forme de tableaux (Source | Cible | Impact)
- Signale clairement les breaking changes avec ⚠️
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
{chr(10) + "---" + chr(10) + chr(10) + _trim_context(context_md.strip()) if context_md.strip() else ""}
"""


def build_system_general(version: str, source_path: Optional[str] = None, context_md: str = "", repo_path: Optional[str] = None, perspective: str = PERSPECTIVE_TECHNICAL) -> str:
    perspective_md = _perspective_block(perspective, migration=False)
    source_section = (
        f"Code source Odoo disponible localement : {source_path}\n"
        "IMPORTANT : Pour toute question sur des modèles, champs, méthodes ou comportements Odoo, utilise SYSTÉMATIQUEMENT search_odoo_source avant de répondre. Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.\n"
        "Exemples d'utilisation :\n"
        "- Trouver un modèle : search_odoo_source(pattern=\"_name = 'sale.order'\")\n"
        "- Trouver une méthode : search_odoo_source(pattern=\"def action_confirm\", path=\"addons/sale\")\n"
        "- Lire un fichier : read_odoo_file(path=\"addons/account/models/account_move.py\", start_line=1, end_line=100)\n"
    ) if source_path else "Code source non disponible pour cette version.\n"

    return f"""{perspective_md}Tu es un expert Odoo qui répond à des questions générales sur l'ERP, indépendamment de tout projet client.

Version Odoo : {version}
{source_section}
Instructions :
- Réponds à toutes questions sur l'architecture Odoo, les modèles de données, les modules, les migrations
- Utilise le code source pour illustrer ou vérifier tes réponses quand c'est pertinent
- Si le contexte Markdown contredit le code source local, le code source local gagne
- Présente les listes sous forme de tableaux Markdown
- Réponds dans la langue de l'utilisateur (français si l'utilisateur écrit en français)
- Sois précis, pédagogique, orienté consultant
- Tu n'as pas accès aux données d'une instance Odoo (mode général sans connexion client)
{chr(10) + "---" + chr(10) + chr(10) + _trim_context(context_md.strip()) if context_md.strip() else ""}
"""


# ── Source code tools ────────────────────────────────────────────

def _safe_source_path(source_path: str, sub_path: str) -> Optional[str]:
    """Return an absolute path only if it stays within source_path."""
    base = os.path.realpath(source_path)
    full = os.path.realpath(os.path.join(source_path, sub_path)) if sub_path else base
    return full if full.startswith(base) else None


async def _search_odoo_source(args: dict, source_path: str) -> dict:
    pattern    = args.get("pattern", "")
    sub_path   = args.get("path", "") or ""
    file_types = args.get("file_types") or ["*.py"]

    search_dir = _safe_source_path(source_path, sub_path)
    if not search_dir:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}
    if not os.path.isdir(search_dir):
        return {"ok": False, "error": f"Dossier introuvable : {sub_path or source_path}"}

    includes = []
    for ft in file_types[:4]:  # max 4 types
        includes += ["--include", ft]

    try:
        proc = await asyncio.create_subprocess_exec(
            "grep", "-r", "-n", "-i", "-m", "200",
            *includes,
            pattern, search_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
    except asyncio.TimeoutError:
        return {"ok": False, "error": "Timeout — pattern trop large, affinez la recherche"}

    raw_lines = stdout.decode("utf-8", errors="replace").splitlines()
    base_real = os.path.realpath(source_path) + os.sep

    by_file: dict = {}
    for line in raw_lines[:200]:
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        file_abs, linenum, content = parts[0], parts[1], parts[2]
        rel = file_abs.replace(base_real, "")
        if rel not in by_file:
            by_file[rel] = []
        by_file[rel].append({"line": int(linenum), "content": content.strip()})

    if not by_file:
        return {"ok": True, "matches": 0, "files": {}, "note": "Aucune correspondance — essayez un autre pattern ou chemin"}

    return {"ok": True, "matches": len(raw_lines), "files": by_file}


async def _read_odoo_file(args: dict, source_path: str) -> dict:
    rel_path   = args.get("path", "")
    start_line = max(1, int(args.get("start_line") or 1))
    end_line   = int(args.get("end_line") or 0)

    file_abs = _safe_source_path(source_path, rel_path)
    if not file_abs:
        return {"ok": False, "error": "Chemin invalide"}
    if not os.path.isfile(file_abs):
        return {"ok": False, "error": f"Fichier introuvable : {rel_path}"}

    try:
        with open(file_abs, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
    except OSError as exc:
        return {"ok": False, "error": str(exc)}

    total = len(all_lines)
    s = start_line - 1
    e = end_line if end_line > 0 else s + 150
    e = min(e, s + 200, total)   # hard cap: 200 lines

    content = "".join(all_lines[s:e])
    return {
        "ok":         True,
        "path":       rel_path,
        "start_line": s + 1,
        "end_line":   e,
        "total_lines": total,
        "content":    content,
    }


# ── Line-counting tool ───────────────────────────────────────────

_COUNT_MAX_FILES = 50_000
_COUNT_TIMEOUT_SECS = 45
_EXCLUDE_DIRS = ("/.git/", "/node_modules/", "/__pycache__/", "/.venv/", "/venv/", "/.tox/", "/dist/", "/build/")


def _count_group_key(rel: str, group_by: str) -> str:
    if group_by == "module":
        parts = rel.split(os.sep)
        # Detect "addons/<module>/..." (any depth before "addons")
        if "addons" in parts:
            idx = parts.index("addons")
            return parts[idx + 1] if idx + 1 < len(parts) else "(root)"
        # Else: top-level dir is treated as the module (typical client repos)
        return parts[0] if parts and parts[0] else "(root)"
    if group_by == "directory":
        return os.path.dirname(rel) or "(root)"
    if group_by == "extension":
        return os.path.splitext(rel)[1].lower() or "(no ext)"
    return "all"


async def _count_lines(args: dict, base_dir: str) -> dict:
    """Exhaustively count files and lines under base_dir/<sub_path>, grouped."""
    sub_path   = args.get("path", "") or ""
    file_types = args.get("file_types") or ["*.py"]
    group_by   = args.get("group_by") or "extension"
    if group_by not in ("extension", "module", "directory", "none"):
        group_by = "extension"

    target_dir = _safe_source_path(base_dir, sub_path)
    if not target_dir:
        return {"ok": False, "error": "Chemin invalide (traversal détecté)"}
    if not os.path.isdir(target_dir):
        return {"ok": False, "error": f"Dossier introuvable : {sub_path or base_dir}"}

    # Build find command
    find_cmd = ["find", target_dir, "-type", "f"]
    types = file_types[:10]
    if types:
        find_cmd.append("(")
        for i, ft in enumerate(types):
            if i > 0:
                find_cmd.append("-o")
            find_cmd += ["-name", ft]
        find_cmd.append(")")
    find_cmd += ["-print0"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *find_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        files_blob, _ = await asyncio.wait_for(proc.communicate(), timeout=_COUNT_TIMEOUT_SECS)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"Timeout (>{_COUNT_TIMEOUT_SECS}s) — restreignez via path ou file_types"}

    raw_files = [f.decode("utf-8", errors="replace") for f in files_blob.split(b"\x00") if f]
    # Filter excluded directories
    files = [f for f in raw_files if not any(ex in f for ex in _EXCLUDE_DIRS)]

    if not files:
        return {
            "ok": True, "scope_path": base_dir, "sub_path": sub_path or ".",
            "file_types": types, "group_by": group_by,
            "total_files": 0, "total_lines": 0, "by_group": {},
            "note": "Aucun fichier trouvé",
        }
    if len(files) > _COUNT_MAX_FILES:
        return {"ok": False, "error": f"Trop de fichiers ({len(files)} > {_COUNT_MAX_FILES}). Restreins via path ou file_types."}

    base_real = os.path.realpath(base_dir) + os.sep

    def _do_count() -> tuple[int, dict]:
        total = 0
        groups: dict = {}
        for fp in files:
            try:
                with open(fp, "rb") as fh:
                    buf = fh.read()
                n = buf.count(b"\n")
                if buf and not buf.endswith(b"\n"):
                    n += 1
            except OSError:
                n = 0
            total += n
            rel = fp.replace(base_real, "")
            key = _count_group_key(rel, group_by)
            g = groups.get(key)
            if g is None:
                groups[key] = {"files": 1, "lines": n}
            else:
                g["files"] += 1
                g["lines"] += n
        return total, groups

    loop = asyncio.get_event_loop()
    total_lines, by_group = await loop.run_in_executor(None, _do_count)

    # Sort by lines desc, cap at 50 groups
    sorted_groups = sorted(by_group.items(), key=lambda kv: -kv[1]["lines"])
    truncated = len(sorted_groups) > 50
    capped = dict(sorted_groups[:50])

    return {
        "ok":              True,
        "scope_path":      base_dir,
        "sub_path":        sub_path or ".",
        "file_types":      types,
        "group_by":        group_by,
        "total_files":     len(files),
        "total_lines":     total_lines,
        "by_group":        capped,
        "groups_truncated": truncated,
    }


# ── Studio inspection tool ────────────────────────────────────────

async def _inspect_studio(args: dict, odoo: "OdooClient") -> dict:
    """Query the connected Odoo instance for all Studio customizations."""
    sections_req = [s.lower() for s in (args.get("sections") or ["all"])]
    model_filter = (args.get("model_filter") or "").strip()
    do_all = "all" in sections_req

    loop = asyncio.get_event_loop()
    result: dict = {"ok": True}

    # Helper: fetch res_ids created by Studio in ir.model.data
    async def _xids(model_name: str) -> list:
        xids = await loop.run_in_executor(None, lambda: odoo.search_read(
            "ir.model.data",
            [["module", "in", ["studio_customization", "web_studio"]], ["model", "=", model_name]],
            ["res_id"],
            limit=500,
        ))
        return [x["res_id"] for x in xids if x.get("res_id")]

    # ── Custom models ──────────────────────────────────────────────
    if do_all or "models" in sections_req:
        try:
            domain: list = [["state", "=", "manual"]]
            if model_filter:
                domain.append(["model", "ilike", model_filter])
            models = await loop.run_in_executor(None, lambda: odoo.search_read(
                "ir.model", domain,
                ["name", "model", "transient", "info"],
                limit=300,
            ))
            result["custom_models"] = {"count": len(models), "items": models}
        except Exception as exc:
            result["custom_models"] = {"count": 0, "error": str(exc)}

    # ── Custom fields ──────────────────────────────────────────────
    if do_all or "fields" in sections_req:
        try:
            domain_f: list = [["state", "=", "manual"]]
            if model_filter:
                domain_f.append(["model", "ilike", model_filter])
            fields = await loop.run_in_executor(None, lambda: odoo.search_read(
                "ir.model.fields", domain_f,
                ["name", "field_description", "ttype", "model_id", "required",
                 "store", "index", "compute", "related", "selection"],
                limit=1000,
            ))
            # Group by model
            by_model: dict = {}
            for f in fields:
                mid = f.get("model_id")
                m_label = mid[1] if isinstance(mid, list) and len(mid) > 1 else str(mid or "?")
                if m_label not in by_model:
                    by_model[m_label] = []
                by_model[m_label].append({
                    "name": f.get("name"), "label": f.get("field_description"),
                    "type": f.get("ttype"), "required": f.get("required"),
                    "store": f.get("store"), "index": f.get("index"),
                    "compute": f.get("compute") or None, "related": f.get("related") or None,
                })
            result["custom_fields"] = {"count": len(fields), "by_model": by_model}
        except Exception as exc:
            result["custom_fields"] = {"count": 0, "error": str(exc)}

    # ── Studio views ───────────────────────────────────────────────
    if do_all or "views" in sections_req:
        try:
            view_ids = await _xids("ir.ui.view")
            views = []
            if view_ids:
                dom_v: list = [["id", "in", view_ids]]
                if model_filter:
                    dom_v.append(["model", "ilike", model_filter])
                views = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.ui.view", dom_v,
                    ["name", "model", "type", "key", "priority", "active"],
                    limit=500,
                ))
            result["studio_views"] = {"count": len(views), "items": views}
        except Exception as exc:
            result["studio_views"] = {"count": 0, "error": str(exc)}

    # ── Studio menus ───────────────────────────────────────────────
    if do_all or "menus" in sections_req:
        try:
            menu_ids = await _xids("ir.ui.menu")
            menus = []
            if menu_ids:
                menus = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.ui.menu", [["id", "in", menu_ids]],
                    ["name", "complete_name", "active", "sequence"],
                    limit=200,
                ))
            result["studio_menus"] = {"count": len(menus), "items": menus}
        except Exception as exc:
            result["studio_menus"] = {"count": 0, "error": str(exc)}

    # ── Server actions ─────────────────────────────────────────────
    if do_all or "server_actions" in sections_req:
        try:
            sa_ids = await _xids("ir.actions.server")
            actions = []
            if sa_ids:
                actions = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.actions.server", [["id", "in", sa_ids]],
                    ["name", "model_id", "state", "binding_model_id", "binding_type"],
                    limit=200,
                ))
            result["studio_server_actions"] = {"count": len(actions), "items": actions}
        except Exception as exc:
            result["studio_server_actions"] = {"count": 0, "error": str(exc)}

    # ── Scheduled actions (ir.cron) ────────────────────────────────
    if do_all or "cron" in sections_req:
        try:
            cron_ids = await _xids("ir.cron")
            if cron_ids:
                crons = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.cron", [["id", "in", cron_ids]],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    limit=100,
                ))
            else:
                # Fallback: all crons (no Studio filter possible)
                crons = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.cron", [],
                    ["name", "model_id", "active", "interval_number", "interval_type", "nextcall"],
                    limit=100,
                ))
            result["cron_actions"] = {"count": len(crons), "items": crons}
        except Exception as exc:
            result["cron_actions"] = {"count": 0, "error": str(exc)}

    # ── Automated actions (base.automation) ───────────────────────
    if do_all or "automations" in sections_req:
        try:
            dom_a: list = []
            if model_filter:
                dom_a.append(["model_id.model", "ilike", model_filter])
            automations = await loop.run_in_executor(None, lambda: odoo.search_read(
                "base.automation", dom_a,
                ["name", "model_id", "trigger", "active"],
                limit=200,
            ))
            result["automated_actions"] = {"count": len(automations), "items": automations}
        except Exception:
            result["automated_actions"] = {"count": 0, "note": "Module d'automatisation non disponible sur cette instance"}

    # ── Access & record rules ──────────────────────────────────────
    if do_all or "rules" in sections_req:
        try:
            access_ids = await _xids("ir.model.access")
            accesses = []
            if access_ids:
                accesses = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.model.access", [["id", "in", access_ids]],
                    ["name", "model_id", "group_id", "perm_read", "perm_write", "perm_create", "perm_unlink"],
                    limit=200,
                ))
            result["studio_access_rules"] = {"count": len(accesses), "items": accesses}
        except Exception as exc:
            result["studio_access_rules"] = {"count": 0, "error": str(exc)}

        try:
            rule_ids = await _xids("ir.rule")
            rules = []
            if rule_ids:
                rules = await loop.run_in_executor(None, lambda: odoo.search_read(
                    "ir.rule", [["id", "in", rule_ids]],
                    ["name", "model_id", "global", "groups", "domain_force"],
                    limit=200,
                ))
            result["studio_record_rules"] = {"count": len(rules), "items": rules}
        except Exception as exc:
            result["studio_record_rules"] = {"count": 0, "error": str(exc)}

    return result


# ── Tool executor ────────────────────────────────────────────────

async def _run_tool(name: str, args: dict, odoo: "OdooClient", source_path: Optional[str] = None, repo_path: Optional[str] = None, target_path: Optional[str] = None) -> dict:
    loop = asyncio.get_event_loop()
    try:
        if name == "query_odoo":
            records = await loop.run_in_executor(None, lambda: odoo.search_read(
                args["model"],
                args.get("domain", []),
                args.get("fields", []),
                min(int(args.get("limit", 20)), 100),
                0,
                args.get("order", ""),
            ))
            return {"ok": True, "count": len(records), "records": records}

        elif name == "count_odoo":
            count = await loop.run_in_executor(None, lambda: odoo.search_count(
                args["model"], args.get("domain", [])
            ))
            return {"ok": True, "count": count}

        elif name == "get_odoo_fields":
            raw = await loop.run_in_executor(None, lambda: odoo.fields_get(
                args["model"], ["string", "type"]
            ))
            condensed = {k: {"label": v.get("string"), "type": v.get("type")}
                         for k, v in list(raw.items())[:80]}
            return {"ok": True, "fields": condensed}

        elif name == "search_odoo_source":
            if not source_path:
                return {"ok": False, "error": "Code source non disponible — installez les sources depuis la page Sources"}
            return await _search_odoo_source(args, source_path)

        elif name == "read_odoo_file":
            if not source_path:
                return {"ok": False, "error": "Code source non disponible"}
            return await _read_odoo_file(args, source_path)

        elif name == "search_project_source":
            if not repo_path:
                return {"ok": False, "error": "Code source du projet non disponible — clonez le dépôt depuis la fiche projet"}
            return await _search_odoo_source(args, repo_path)

        elif name == "read_project_file":
            if not repo_path:
                return {"ok": False, "error": "Code source du projet non disponible"}
            return await _read_odoo_file(args, repo_path)

        elif name == "search_target_source":
            if not target_path:
                return {"ok": False, "error": "Sources de la version cible non disponibles — téléchargez-les depuis la page Sources"}
            return await _search_odoo_source(args, target_path)

        elif name == "read_target_file":
            if not target_path:
                return {"ok": False, "error": "Sources de la version cible non disponibles"}
            return await _read_odoo_file(args, target_path)

        elif name == "count_source_lines":
            scope = (args.get("scope") or "").lower()
            scope_map = {"odoo": source_path, "target": target_path, "project": repo_path}
            if scope not in scope_map:
                return {"ok": False, "error": "scope doit être 'odoo', 'target' ou 'project'"}
            base = scope_map[scope]
            if not base:
                labels = {"odoo": "Sources Odoo", "target": "Sources de la version cible", "project": "Repo projet client"}
                return {"ok": False, "error": f"{labels[scope]} non disponible"}
            return await _count_lines(args, base)

        elif name == "inspect_studio":
            if odoo is None:
                return {"ok": False, "error": "Connexion Odoo requise pour inspecter Studio — ouvrez un projet depuis la page Projets"}
            return await _inspect_studio(args, odoo)

        return {"ok": False, "error": f"Outil inconnu: {name}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Claude ───────────────────────────────────────────────────────

async def _chat_claude(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import anthropic
    except ImportError:
        yield {"type": "error", "msg": "Package 'anthropic' non installé. Lancez : pip install anthropic"}
        return

    if tools is None:
        tools = TOOLS_CLAUDE
    client = anthropic.AsyncAnthropic(api_key=api_key)
    loop_msgs = list(messages)

    total_in = total_out = 0
    for _ in range(10):
        response = await client.messages.create(
            model=model_id,
            max_tokens=4096,
            system=system,
            messages=loop_msgs,
            tools=tools,
        )
        if hasattr(response, "usage") and response.usage:
            total_in  += getattr(response.usage, "input_tokens",  0) or 0
            total_out += getattr(response.usage, "output_tokens", 0) or 0

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    yield {"type": "tool_call", "name": block.name, "args": block.input}
                    result = await _run_tool(block.name, block.input, odoo, source_path, repo_path, target_path)
                    yield {"type": "tool_result", "name": block.name, **result}
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False, default=str),
                    })
            loop_msgs.append({"role": "assistant", "content": response.content})
            loop_msgs.append({"role": "user", "content": tool_results})
        else:
            text = "".join(getattr(b, "text", "") for b in response.content)
            yield {"type": "text", "content": text}
            yield {"type": "done", "model": model_id, "input_tokens": total_in, "output_tokens": total_out}
            return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── OpenAI (shared logic for OpenAI + GitHub Models + Copilot) ───

async def _chat_openai_client(client, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    if tools is None:
        tools = TOOLS_OPENAI
    oai_msgs = [{"role": "system", "content": system}] + messages
    total_in = total_out = 0
    for _ in range(10):
        response = await client.chat.completions.create(
            model=model_id, messages=oai_msgs, tools=tools,
        )
        if hasattr(response, "usage") and response.usage:
            total_in  += getattr(response.usage, "prompt_tokens",     0) or 0
            total_out += getattr(response.usage, "completion_tokens",  0) or 0
        choice = response.choices[0]
        if choice.finish_reason == "tool_calls":
            oai_msgs.append(choice.message)
            for tc in choice.message.tool_calls:
                args = json.loads(tc.function.arguments)
                yield {"type": "tool_call", "name": tc.function.name, "args": args}
                result = await _run_tool(tc.function.name, args, odoo, source_path, repo_path, target_path)
                yield {"type": "tool_result", "name": tc.function.name, **result}
                oai_msgs.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
        else:
            yield {"type": "text", "content": choice.message.content or ""}
            yield {"type": "done", "model": model_id, "input_tokens": total_in, "output_tokens": total_out}
            return
    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


async def _chat_openai(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé. Lancez : pip install openai"}
        return
    client = openai.AsyncOpenAI(api_key=api_key)
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools, repo_path, target_path):
        yield evt


async def _chat_github(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé."}
        return
    client = openai.AsyncOpenAI(api_key=api_key, base_url=GITHUB_MODELS_BASE_URL)
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools, repo_path, target_path):
        yield evt


async def _chat_copilot(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import openai
    except ImportError:
        yield {"type": "error", "msg": "Package 'openai' non installé."}
        return
    client = openai.AsyncOpenAI(
        api_key=api_key,
        base_url=COPILOT_BASE_URL,
        default_headers=COPILOT_HEADERS,
    )
    async for evt in _chat_openai_client(client, model_id, system, messages, odoo, source_path, tools, repo_path, target_path):
        yield evt


# ── Gemini ───────────────────────────────────────────────────────

async def _chat_gemini(api_key: str, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import google.generativeai as genai
    except ImportError:
        yield {"type": "error", "msg": "Package 'google-generativeai' non installé. Lancez : pip install google-generativeai"}
        return

    if tools is None:
        tools = TOOLS_GEMINI
    loop = asyncio.get_event_loop()
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=model_id,
        system_instruction=system,
        tools=tools,
    )

    history = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})
    last_msg = messages[-1]["content"] if messages else ""

    chat = model.start_chat(history=history)
    total_in = total_out = 0

    for _ in range(10):
        response = await loop.run_in_executor(None, lambda: chat.send_message(last_msg))
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            total_in  += getattr(response.usage_metadata, "prompt_token_count",     0) or 0
            total_out += getattr(response.usage_metadata, "candidates_token_count", 0) or 0
        part = response.candidates[0].content.parts[0]

        if hasattr(part, "function_call") and part.function_call.name:
            fc = part.function_call
            args = dict(fc.args)
            yield {"type": "tool_call", "name": fc.name, "args": args}
            result = await _run_tool(fc.name, args, odoo, source_path, repo_path, target_path)
            yield {"type": "tool_result", "name": fc.name, **result}
            last_msg = genai.protos.Content(parts=[genai.protos.Part(
                function_response=genai.protos.FunctionResponse(
                    name=fc.name,
                    response={"result": json.dumps(result, ensure_ascii=False, default=str)},
                )
            )], role="user")
        else:
            text = response.text if hasattr(response, "text") else ""
            yield {"type": "text", "content": text}
            yield {"type": "done", "model": model_id, "input_tokens": total_in, "output_tokens": total_out}
            return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── Public entry point ───────────────────────────────────────────

async def stream_chat(
    provider: str,
    api_key: str,
    model_id: Optional[str],
    odoo,          # None → general mode (source-only, no Odoo data)
    profile,       # None → general mode
    messages: list,
    source_path: Optional[str] = None,
    context_md: str = "",
    version: Optional[str] = None,  # used when profile is None
    user_profile: Optional[dict] = None,
    active_company_name: Optional[str] = None,
    repo_path: Optional[str] = None,
    target_path: Optional[str] = None,
    migration_mode: bool = False,
    target_version: Optional[str] = None,
    perspective: str = PERSPECTIVE_TECHNICAL,
) -> AsyncIterator[dict]:
    model = model_id or DEFAULT_MODELS.get(provider, "")
    perspective = _normalize_perspective(perspective)

    user_ctx = ""
    if user_profile:
        parts = []
        if user_profile.get("name"):
            parts.append(f"Consultant : {user_profile['name']}")
        if user_profile.get("title"):
            parts.append(f"Poste : {user_profile['title']}")
        if user_profile.get("team"):
            parts.append(f"Équipe : {user_profile['team']}")
        if parts:
            user_ctx = "\n".join(parts) + "\n"

    if migration_mode:
        src_ver = version or (profile.odoo_version if profile else "?")
        tgt_ver = target_version or "?"
        system  = build_system_migration(src_ver, tgt_ver, source_path, target_path, context_md, repo_path, perspective)
        if user_ctx:
            system = user_ctx + system
        tools_c = TOOLS_CLAUDE_SRC
        tools_o = TOOLS_OPENAI_SRC
        tools_g = TOOLS_GEMINI_SRC
    elif profile is not None:
        system   = build_system(profile, source_path, context_md, repo_path, perspective)
        if active_company_name:
            system = system.replace(
                f"- Société : {profile.company_name or 'inconnue'}",
                f"- Société : {profile.company_name or 'inconnue'}\n- Société active (filtre) : {active_company_name}"
            )
        if getattr(profile, "project_context", None):
            system += f"\n\n---\n## Contexte projet\n{_trim_project_context(profile.project_context.strip())}\n"
        if user_ctx:
            system = user_ctx + system
        tools_c  = TOOLS_CLAUDE
        tools_o  = TOOLS_OPENAI
        tools_g  = TOOLS_GEMINI
    else:
        system   = build_system_general(version or "?", source_path, context_md, repo_path, perspective)
        if user_ctx:
            system = user_ctx + system
        tools_c  = TOOLS_CLAUDE_SRC
        tools_o  = TOOLS_OPENAI_SRC
        tools_g  = TOOLS_GEMINI_SRC

    # Append repo tools when a cloned repo is available
    if repo_path:
        tools_c = tools_c + REPO_TOOLS_CLAUDE
        tools_o = tools_o + REPO_TOOLS_OPENAI
        tools_g = [{"function_declarations": tools_g[0]["function_declarations"] + REPO_FUNCTION_DECLARATIONS}]

    # Append target source tools in migration mode
    if target_path:
        tools_c = tools_c + TARGET_TOOLS_CLAUDE
        tools_o = tools_o + TARGET_TOOLS_OPENAI
        tools_g = [{"function_declarations": tools_g[0]["function_declarations"] + TARGET_FUNCTION_DECLARATIONS}]

    # Append count-lines tool whenever at least one source/repo path is available
    if source_path or repo_path or target_path:
        tools_c = tools_c + COUNT_TOOLS_CLAUDE
        tools_o = tools_o + COUNT_TOOLS_OPENAI
        tools_g = [{"function_declarations": tools_g[0]["function_declarations"] + COUNT_FUNCTION_DECLARATIONS}]

    # Append Studio inspection tool when a live Odoo connection is available (profile mode)
    if profile is not None and not migration_mode:
        tools_c = tools_c + STUDIO_TOOLS_CLAUDE
        tools_o = tools_o + STUDIO_TOOLS_OPENAI
        tools_g = [{"function_declarations": tools_g[0]["function_declarations"] + STUDIO_FUNCTION_DECLARATIONS}]

    if provider == "claude":
        async for evt in _chat_claude(api_key, model, system, messages, odoo, source_path, tools_c, repo_path, target_path):
            yield evt
    elif provider == "openai":
        async for evt in _chat_openai(api_key, model, system, messages, odoo, source_path, tools_o, repo_path, target_path):
            yield evt
    elif provider == "gemini":
        async for evt in _chat_gemini(api_key, model, system, messages, odoo, source_path, tools_g, repo_path, target_path):
            yield evt
    elif provider == "github":
        async for evt in _chat_github(api_key, model, system, messages, odoo, source_path, tools_o, repo_path, target_path):
            yield evt
    elif provider == "copilot":
        async for evt in _chat_copilot(api_key, model, system, messages, odoo, source_path, tools_o, repo_path, target_path):
            yield evt
    else:
        yield {"type": "error", "msg": f"Fournisseur inconnu : {provider}"}
