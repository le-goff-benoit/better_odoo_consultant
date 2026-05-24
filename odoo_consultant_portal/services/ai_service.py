import asyncio
import json
import logging
import os
import re
from typing import AsyncIterator, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..services.odoo_client import OdooClient

from .attachment_service import apply_provider_attachments
from ..core.context_constants import (
    MAX_CONTEXT_CHARS as _MAX_CONTEXT_CHARS,
    MAX_PROJECT_CONTEXT_CHARS as _MAX_PROJECT_CONTEXT_CHARS,
    MAX_HISTORY_TURNS as _MAX_HISTORY_TURNS,
    MAX_TOOL_RESULT_HISTORY_CHARS as _MAX_TOOL_RESULT_HISTORY_CHARS,
    MAX_DATA_TOOL_RESULT_HISTORY_CHARS as _MAX_DATA_TOOL_RESULT_HISTORY_CHARS,
    CLAUDE_MAX_OUTPUT_TOKENS as _CLAUDE_MAX_OUTPUT_TOKENS,
    GEMINI_MAX_OUTPUT_TOKENS as _GEMINI_MAX_OUTPUT_TOKENS,
)

log = logging.getLogger(__name__)

# ── Tool definitions ─────────────────────────────────────────────

_TOOL_QUERY = {
    "name": "query_odoo",
    "description": (
        "Rechercher des enregistrements dans Odoo (search_read) avec pagination automatique. "
        "Utilise cet outil pour répondre à toute question sur les données. Par défaut "
        "`limit=0` récupère tous les enregistrements visibles jusqu'à `max_records` "
        "(défaut 5000) en pages de `page_size` (défaut 500). Le résultat retourne "
        "toujours total_count/truncated/warning : ne présente jamais un résultat "
        "truncated comme exhaustif."
    ),
}
_TOOL_COUNT = {
    "name": "count_odoo",
    "description": "Compter les enregistrements Odoo correspondant à un domaine.",
}
_TOOL_READ_GROUP = {
    "name": "read_group_odoo",
    "description": (
        "Calculer des agrégats Odoo avec read_group : sommes, moyennes et comptages "
        "groupés par statut, date, commercial, journal, projet, etc. Utilise cet outil "
        "pour les KPI fiables au lieu d'additionner un échantillon search_read.\n"
        "Paramètres : model, domain, fields (ex: ['amount_total:sum','state']), "
        "groupby (ex: ['state'] ou ['date_order:month']), limit, orderby, lazy."
    ),
}
_TOOL_FIELDS = {
    "name": "get_odoo_fields",
    "description": (
        "Lister les champs d'un modèle Odoo — à appeler AVANT toute requête sur un "
        "modèle dont la structure n'est pas certaine, surtout si le client a des "
        "personnalisations Studio (champs `x_*`).\n"
        "Sans `field_names` : retourne un index condensé (label, type, relation) en "
        "priorisant les champs custom `x_*` et les relations (many2one, one2many, "
        "many2many) — c'est ce qu'il faut pour découvrir les jointures.\n"
        "Avec `field_names` : retourne le détail complet (relation, relation_field, "
        "store, required, help) UNIQUEMENT pour ces champs — utilise-le pour confirmer "
        "le nom exact d'un champ deviné ou pour comprendre une relation inverse."
    ),
}
_TOOL_INSTALLED_MODULES = {
    "name": "inspect_installed_modules",
    "description": (
        "Lister les modules installés sur l'instance connectée : applications, modules "
        "techniques, version installée, auteur et modules custom probables. Utilise-le "
        "pour cadrer le périmètre réel d'une instance, surtout en migration."
    ),
}
_TOOL_INSPECT_SECURITY = {
    "name": "inspect_security",
    "description": (
        "Inspecter la sécurité d'un modèle Odoo : entrée ir.model, ACL (ir.model.access), "
        "record rules (ir.rule) et groupes associés. Utilise cet outil pour diagnostiquer "
        "droits d'accès, visibilité partielle, multi-société ou boutons/actions absents. "
        "Si la question porte sur la sécurité de modules custom sans modèle exact, découvre "
        "d'abord les modules/fichiers avec list_project_modules et search_project_source, "
        "puis appelle inspect_security pour chaque modèle métier identifié."
    ),
}
_TOOL_INSPECT_MENUS = {
    "name": "inspect_menus_actions",
    "description": (
        "Retrouver les menus et actions fenêtre qui exposent un modèle ou un écran. "
        "Utilise cet outil pour répondre à 'où cliquer', valider une navigation ou "
        "identifier les vues rattachées à une action."
    ),
}
_TOOL_SEARCH_SRC = {
    "name": "search_odoo_source",
    "description": (
        "Rechercher dans le code source Odoo local (grep). "
        "Utilise pour trouver des modèles, méthodes, champs, modules, noms corrects de modèles. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne.\n"
        "STRUCTURE DES SOURCES : la plupart des modules Community sont sous addons/<module>/, "
        "MAIS le module `base` est sous odoo/addons/base/ et le cœur du framework "
        "(ORM, champs, API) est sous odoo/ (odoo/models.py, odoo/fields.py, odoo/api.py). "
        "Les modules Enterprise sont directement à la racine enterprise/<module>/ (PAS sous addons/). "
        "Exemples : community/addons/sale/, community/odoo/addons/base/, community/odoo/models.py, "
        "enterprise/helpdesk/. "
        "Pour chercher dans un module enterprise, utilise path='enterprise/helpdesk' (pas 'addons/helpdesk')."
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
_TOOL_LIST_PROJECT_MODULES = {
    "name": "list_project_modules",
    "description": (
        "Parser les fichiers __manifest__.py / __openerp__.py du dépôt client pour "
        "lister les modules custom, dépendances, fichiers data/demo, assets, licence "
        "et statut installable. Préfère cet outil à un grep quand tu dois inventorier "
        "le dépôt projet."
    ),
}

_TOOL_GIT_SHOW = {
    "name": "git_show_commit",
    "description": (
        "Afficher le contenu réel d'un commit Git : auteur, date, message, fichiers modifiés "
        "et patch (diff unifié). À utiliser CHAQUE FOIS que l'utilisateur référence un commit "
        "par son SHA (ex: `fa2bfa97`, `abc123`) — n'invente JAMAIS le contenu d'un commit, "
        "appelle cet outil pour le lire dans les sources locales.\n"
        "Le clone est `shallow` par défaut : si le SHA n'est pas dans l'historique téléchargé, "
        "l'outil tente automatiquement un fetch deepen progressif (jusqu'à 3 fois 500 commits) "
        "avant d'abandonner.\n"
        "Paramètres :\n"
        "- `sha` (obligatoire) : SHA court (7+ caractères) ou complet (40 caractères).\n"
        "- `scope` (obligatoire) : où chercher le commit.\n"
        "    * `odoo`       — sources Odoo Community de la version courante\n"
        "    * `enterprise` — sources Odoo Enterprise de la version courante\n"
        "    * `target`     — sources Odoo de la version cible (mode migration)\n"
        "    * `project`    — dépôt custom du projet client\n"
        "- `max_lines` (optionnel, défaut 2000, max 10000) : limite du diff (le résumé `stats` et "
        "la liste `files` ne sont jamais tronqués).\n"
        "Retourne : sha complet, auteur, date, message, stats (nb fichiers, insertions, suppressions), "
        "liste des fichiers avec +/-, et le diff unifié."
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
        "Retour : chaque section expose count, total_count, pages_fetched, truncated et warning. "
        "Si truncated=false, tu peux considérer la section comme exhaustive pour les records visibles.\n"
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

_TOOL_INSPECT_VIEW = {
    "name": "inspect_odoo_view",
    "description": (
        "Inspecter une vue de l'instance Odoo connectée. Retourne : les types de vues "
        "disponibles pour le modèle (form, list, kanban, activity, calendar, pivot, graph, "
        "search), l'arch ASSEMBLÉE après héritage (standard + modules + Studio + custom), "
        "la configuration de chaque champ DANS la vue (readonly, required, invisible, "
        "domain, widget) et le chemin d'accès menu → action.\n"
        "Utilise cet outil quand l'utilisateur demande : comment accéder à un écran, quels "
        "champs sont visibles ou modifiables dans une vue, le nom correct d'une vue selon "
        "la version Odoo, ou le paramétrage d'un champ tel qu'il apparaît à l'écran.\n"
        "Paramètres : model (obligatoire, ex 'sale.order') ; view_type (optionnel : form, "
        "list, kanban, activity, calendar, pivot, graph, search) ; view_id (optionnel)."
    ),
}

_TOOL_LOAD_REFERENCE = {
    "name": "load_skill_reference",
    "description": (
        "Charger une référence longue d'un skill (fichier markdown sous "
        "skills/<skill>/references/<filename>). N'utiliser que si le contexte initial "
        "mentionne explicitement une référence disponible — la liste apparaît avec "
        "chaque skill sélectionné. Évite de charger plusieurs références par tour : "
        "préfère cibler celle qui répond à la question. "
        "Paramètres : skill (nom technique du skill, ex 'inspect_studio'), filename "
        "(nom de fichier, ex 'studio_limits.md')."
    ),
}

_TOOL_RUN_SCRIPT = {
    "name": "run_skill_script",
    "description": (
        "Exécuter un script Python d'un skill (fichier sous skills/<skill>/scripts/<filename>). "
        "Le script est lancé en subprocess, sans shell, avec un timeout dur de 30s ; "
        "stdout (JSON ou Markdown), stderr et exit code sont retournés. Utiliser quand "
        "un script déterministe peut remplacer plusieurs tours de raisonnement (ex. "
        "scan_studio_customizations, explain_domain, check_manifest). "
        "Paramètres : skill, filename, args (liste d'arguments CLI, optionnelle)."
    ),
}

_TOOL_INSPECT_REPORT = {
    "name": "inspect_odoo_report",
    "description": (
        "Inspecter les rapports PDF / QWeb de l'instance Odoo connectée. Retourne : "
        "l'action de rapport (ir.actions.report), le template QWeb et son arbre "
        "d'héritage, l'ARCH XML RÉELLE des templates (champ `qweb_archs` : rapport + "
        "template document + mise en page — indispensable pour écrire des xpath "
        "valides), `qweb_arch_meta` et `qweb_summaries` (inventaire extrait depuis "
        "l'arch complète : textes visibles, t-field/t-out, t-foreach, t-call, tables), "
        "le format papier (paperformat) et la mise en page document de la société "
        "(layout, police, couleurs).\n"
        "Utilise cet outil quand l'utilisateur demande comment un rapport PDF est "
        "construit, pourquoi il a une certaine apparence, quel template ou layout est "
        "utilisé, ou la liste des rapports d'un modèle.\n"
        "Paramètres : report_name (optionnel, ex 'account.report_invoice' — mode détail) ; "
        "model (optionnel, ex 'sale.order' — liste les rapports du modèle). Sans paramètre, "
        "liste les rapports de l'instance."
    ),
}

# ── Claude tool schemas ───────────────────────────────────────────

TOOLS_CLAUDE = [
    {**_TOOL_QUERY, "input_schema": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string", "description": "Modèle Odoo (ex: account.move, sale.order, res.partner)"},
        "domain": {"type": "array",  "description": "Domaine Odoo, ex: [[\"state\",\"=\",\"posted\"]]", "default": []},
        "fields": {"type": "array",  "items": {"type": "string"}, "description": "Champs à récupérer"},
        "limit":  {"type": "integer", "description": "Nombre max de résultats. 0 ou absent = exhaustif borné par max_records.", "default": 0},
        "offset": {"type": "integer", "description": "Décalage pour paginer un grand ensemble (défaut 0)", "default": 0},
        "order":  {"type": "string",  "description": "Tri, ex: 'date desc'", "default": ""},
        "page_size": {"type": "integer", "description": "Taille de page XML-RPC (défaut 500, max 1000)", "default": 500},
        "max_records": {"type": "integer", "description": "Plafond quand limit=0 (défaut 5000, max 20000)", "default": 5000},
    }}},
    {**_TOOL_COUNT, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "default": []},
    }}},
    {**_TOOL_READ_GROUP, "input_schema": {"type": "object", "required": ["model", "fields", "groupby"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "default": []},
        "fields": {"type": "array", "items": {"type": "string"}, "description": "Mesures et champs, ex ['amount_total:sum','state']"},
        "groupby": {"type": "array", "items": {"type": "string"}, "description": "Groupements, ex ['state'] ou ['date_order:month']"},
        "limit": {"type": "integer", "description": "0 ou absent = tous les groupes retournés par Odoo.", "default": 0},
        "offset": {"type": "integer", "default": 0},
        "orderby": {"type": "string", "default": ""},
        "lazy": {"type": "boolean", "default": True},
    }}},
    {**_TOOL_FIELDS, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
        "field_names": {"type": "array", "items": {"type": "string"},
            "description": "Si fourni : détail complet uniquement de ces champs. Sinon : index condensé du modèle.",
            "default": []},
        "max_fields": {"type": "integer", "description": "Nombre max de champs dans l'index condensé (défaut 150, max 1000)", "default": 150},
    }}},
    {**_TOOL_INSTALLED_MODULES, "input_schema": {"type": "object", "properties": {
        "filter": {"type": "string", "description": "Filtre optionnel sur le nom technique, libellé ou auteur", "default": ""},
        "apps_only": {"type": "boolean", "description": "Limiter aux applications Odoo", "default": False},
        "limit": {"type": "integer", "description": "0 ou absent = exhaustif borné par max_records.", "default": 0},
        "max_records": {"type": "integer", "default": 5000},
    }}},
    {**_TOOL_INSPECT_SECURITY, "input_schema": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string", "description": "Modèle Odoo, ex 'sale.order'"},
    }}},
    {**_TOOL_INSPECT_MENUS, "input_schema": {"type": "object", "properties": {
        "model": {"type": "string", "description": "Modèle Odoo ciblé, ex 'sale.order'", "default": ""},
        "query": {"type": "string", "description": "Texte optionnel à chercher dans les noms de menus/actions", "default": ""},
        "limit": {"type": "integer", "description": "0 ou absent = exhaustif borné par max_records.", "default": 0},
        "max_records": {"type": "integer", "default": 1000},
    }}},
    {**_TOOL_SEARCH_SRC, "input_schema": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string", "description": "Texte ou regex à chercher (ex: 'sale_line_id', 'class AccountMove', '_name = ')"},
        "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/stock', 'addons/sale')", "default": ""},
        "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
        "case_sensitive": {"type": "boolean", "description": "Recherche sensible à la casse (défaut: true — recommandé pour les patterns de code).", "default": True},
        "max_matches": {"type": "integer", "default": 500},
        "max_matches": {"type": "integer", "description": "Nombre max de lignes de résultat retournées (défaut 500, max 5000)", "default": 500},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + max_lines)", "default": 0},
        "max_lines":  {"type": "integer", "description": "Nombre max de lignes lues si end_line=0 ou trop large (défaut 1000, max 5000)", "default": 1000},
    }}},
    {**_TOOL_GIT_SHOW, "input_schema": {"type": "object", "required": ["sha", "scope"], "properties": {
        "sha":       {"type": "string",  "description": "SHA court (≥7 caractères hex) ou complet (40 caractères hex)."},
        "scope":     {"type": "string",  "enum": ["odoo", "enterprise", "target", "project"],
                       "description": "Repo cible : 'odoo' = Community courant, 'enterprise' = Enterprise courant, 'target' = version cible, 'project' = dépôt client."},
        "max_lines": {"type": "integer", "description": "Nombre max de lignes du diff (défaut 2000, max 10000).", "default": 2000},
    }}},
    {**_TOOL_LOAD_REFERENCE, "input_schema": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string", "description": "Nom technique du skill (ex 'inspect_studio')"},
        "filename": {"type": "string", "description": "Nom de fichier de référence (ex 'studio_limits.md')"},
    }}},
    {**_TOOL_RUN_SCRIPT, "input_schema": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string", "description": "Nom technique du skill"},
        "filename": {"type": "string", "description": "Nom du script (ex 'scan_studio_customizations.py')"},
        "args":     {"type": "array",  "items": {"type": "string"}, "description": "Arguments CLI", "default": []},
    }}},
]

# ── OpenAI tool schemas ───────────────────────────────────────────

TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_QUERY, "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array",   "items": {}, "default": []},
        "fields": {"type": "array",   "items": {"type": "string"}},
        "limit":  {"type": "integer", "description": "0 ou absent = exhaustif borné par max_records.", "default": 0},
        "offset": {"type": "integer", "default": 0},
        "order":  {"type": "string",  "default": ""},
        "page_size": {"type": "integer", "default": 500},
        "max_records": {"type": "integer", "default": 5000},
    }}}},
    {"type": "function", "function": {**_TOOL_COUNT, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "items": {}, "default": []},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_GROUP, "parameters": {"type": "object", "required": ["model", "fields", "groupby"], "properties": {
        "model":  {"type": "string"},
        "domain": {"type": "array", "items": {}, "default": []},
        "fields": {"type": "array", "items": {"type": "string"}},
        "groupby": {"type": "array", "items": {"type": "string"}},
        "limit": {"type": "integer", "default": 0},
        "offset": {"type": "integer", "default": 0},
        "orderby": {"type": "string", "default": ""},
        "lazy": {"type": "boolean", "default": True},
    }}}},
    {"type": "function", "function": {**_TOOL_FIELDS, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
        "field_names": {"type": "array", "items": {"type": "string"}, "default": []},
        "max_fields": {"type": "integer", "default": 150},
    }}}},
    {"type": "function", "function": {**_TOOL_INSTALLED_MODULES, "parameters": {"type": "object", "properties": {
        "filter": {"type": "string", "default": ""},
        "apps_only": {"type": "boolean", "default": False},
        "limit": {"type": "integer", "default": 0},
        "max_records": {"type": "integer", "default": 5000},
    }}}},
    {"type": "function", "function": {**_TOOL_INSPECT_SECURITY, "parameters": {"type": "object", "required": ["model"], "properties": {
        "model": {"type": "string"},
    }}}},
    {"type": "function", "function": {**_TOOL_INSPECT_MENUS, "parameters": {"type": "object", "properties": {
        "model": {"type": "string", "default": ""},
        "query": {"type": "string", "default": ""},
        "limit": {"type": "integer", "default": 0},
        "max_records": {"type": "integer", "default": 1000},
    }}}},
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
        "case_sensitive": {"type": "boolean", "default": True},
        "max_matches": {"type": "integer", "default": 500},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
        "max_lines":  {"type": "integer", "default": 1000},
    }}}},
    {"type": "function", "function": {**_TOOL_GIT_SHOW, "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
        "sha":       {"type": "string"},
        "scope":     {"type": "string", "enum": ["odoo", "enterprise", "target", "project"]},
        "max_lines": {"type": "integer", "default": 2000},
    }}}},
    {"type": "function", "function": {**_TOOL_LOAD_REFERENCE, "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string"},
        "filename": {"type": "string"},
    }}}},
    {"type": "function", "function": {**_TOOL_RUN_SCRIPT, "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string"},
        "filename": {"type": "string"},
        "args":     {"type": "array",  "items": {"type": "string"}, "default": []},
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
                 "offset": {"type": "integer"}, "order":  {"type": "string"},
                 "page_size": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "count_odoo",   "description": _TOOL_COUNT["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model":  {"type": "string"}, "domain": {"type": "array"},
             }}},
            {"name": "read_group_odoo", "description": _TOOL_READ_GROUP["description"],
             "parameters": {"type": "object", "required": ["model", "fields", "groupby"], "properties": {
                 "model": {"type": "string"}, "domain": {"type": "array"},
                 "fields": {"type": "array"}, "groupby": {"type": "array"},
                 "limit": {"type": "integer"}, "offset": {"type": "integer"},
                 "orderby": {"type": "string"}, "lazy": {"type": "boolean"},
             }}},
            {"name": "get_odoo_fields", "description": _TOOL_FIELDS["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
                 "field_names": {"type": "array"},
                 "max_fields": {"type": "integer"},
             }}},
            {"name": "inspect_installed_modules", "description": _TOOL_INSTALLED_MODULES["description"],
             "parameters": {"type": "object", "properties": {
                 "filter": {"type": "string"}, "apps_only": {"type": "boolean"},
                 "limit": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "inspect_security", "description": _TOOL_INSPECT_SECURITY["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
             }}},
            {"name": "inspect_menus_actions", "description": _TOOL_INSPECT_MENUS["description"],
             "parameters": {"type": "object", "properties": {
                 "model": {"type": "string"}, "query": {"type": "string"},
                 "limit": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "search_odoo_source", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
                 "case_sensitive": {"type": "boolean"},
                 "max_matches": {"type": "integer"},
                 "max_matches": {"type": "integer"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
                 "max_lines":  {"type": "integer"},
                 "max_lines":  {"type": "integer"},
             }}},
            {"name": "git_show_commit", "description": _TOOL_GIT_SHOW["description"],
             "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
                 "sha":       {"type": "string"},
                 "scope":     {"type": "string"},
                 "max_lines": {"type": "integer"},
             }}},
            {"name": "load_skill_reference", "description": _TOOL_LOAD_REFERENCE["description"],
             "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
                 "skill":    {"type": "string"},
                 "filename": {"type": "string"},
             }}},
            {"name": "run_skill_script", "description": _TOOL_RUN_SCRIPT["description"],
             "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
                 "skill":    {"type": "string"},
                 "filename": {"type": "string"},
                 "args":     {"type": "array"},
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
        "case_sensitive": {"type": "boolean", "description": "Recherche sensible à la casse (défaut: true — recommandé pour les patterns de code).", "default": True},
    }}},
    {**_TOOL_READ_SRC, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources (ex: 'addons/stock/models/stock_route.py')"},
        "start_line": {"type": "integer", "description": "Première ligne à lire (défaut: 1)", "default": 1},
        "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + max_lines)", "default": 0},
        "max_lines":  {"type": "integer", "default": 1000},
    }}},
    {**_TOOL_GIT_SHOW, "input_schema": {"type": "object", "required": ["sha", "scope"], "properties": {
        "sha":       {"type": "string"},
        "scope":     {"type": "string", "enum": ["odoo", "enterprise", "target", "project"]},
        "max_lines": {"type": "integer", "default": 2000},
    }}},
]

TOOLS_OPENAI_SRC = [
    {"type": "function", "function": {**_TOOL_SEARCH_SRC, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern":    {"type": "string"},
        "path":       {"type": "string",  "default": ""},
        "file_types": {"type": "array",   "items": {"type": "string"}, "default": ["*.py"]},
        "case_sensitive": {"type": "boolean", "default": True},
        "max_matches": {"type": "integer", "default": 500},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_SRC, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
        "max_lines":  {"type": "integer", "default": 1000},
    }}}},
    {"type": "function", "function": {**_TOOL_GIT_SHOW, "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
        "sha":       {"type": "string"},
        "scope":     {"type": "string", "enum": ["odoo", "enterprise", "target", "project"]},
        "max_lines": {"type": "integer", "default": 2000},
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
                 "case_sensitive": {"type": "boolean"},
             }}},
            {"name": "read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
            {"name": "git_show_commit", "description": _TOOL_GIT_SHOW["description"],
             "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
                 "sha":       {"type": "string"},
                 "scope":     {"type": "string"},
                 "max_lines": {"type": "integer"},
             }}},
        ]
    }
]

# ── Repository tool schemas (appended when repo_path is set) ─────

_REPO_INPUT_SCHEMA_SEARCH = {"type": "object", "required": ["pattern"], "properties": {
    "pattern":    {"type": "string", "description": "Texte ou regex à chercher"},
    "path":       {"type": "string", "description": "Sous-dossier optionnel (ex: 'addons/mon_module')", "default": ""},
    "file_types": {"type": "array",  "items": {"type": "string"}, "description": "Extensions, ex: ['*.py'] ou ['*.xml']", "default": ["*.py"]},
    "max_matches": {"type": "integer", "description": "Nombre max de lignes de résultat retournées", "default": 500},
}}
_REPO_INPUT_SCHEMA_READ = {"type": "object", "required": ["path"], "properties": {
    "path":       {"type": "string",  "description": "Chemin relatif depuis la racine du dépôt"},
    "start_line": {"type": "integer", "description": "Première ligne à lire", "default": 1},
    "end_line":   {"type": "integer", "description": "Dernière ligne à lire (défaut: start_line + max_lines)", "default": 0},
    "max_lines":  {"type": "integer", "default": 1000},
}}
_REPO_INPUT_SCHEMA_MODULES = {"type": "object", "properties": {
    "path": {"type": "string", "description": "Sous-dossier optionnel à scanner", "default": ""},
    "include_invalid": {"type": "boolean", "description": "Inclure les manifests invalides dans le résultat", "default": True},
    "limit": {"type": "integer", "description": "Nombre max de modules retournés", "default": 300},
}}

REPO_TOOLS_CLAUDE = [
    {**_TOOL_SEARCH_REPO, "input_schema": _REPO_INPUT_SCHEMA_SEARCH},
    {**_TOOL_READ_REPO,   "input_schema": _REPO_INPUT_SCHEMA_READ},
    {**_TOOL_LIST_PROJECT_MODULES, "input_schema": _REPO_INPUT_SCHEMA_MODULES},
]
REPO_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_SEARCH_REPO, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern": {"type": "string"}, "path": {"type": "string", "default": ""},
        "file_types": {"type": "array", "items": {"type": "string"}, "default": ["*.py"]},
        "case_sensitive": {"type": "boolean", "default": True},
        "max_matches": {"type": "integer", "default": 500},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_REPO, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path": {"type": "string"}, "start_line": {"type": "integer", "default": 1}, "end_line": {"type": "integer", "default": 0}, "max_lines": {"type": "integer", "default": 1000},
    }}}},
    {"type": "function", "function": {**_TOOL_LIST_PROJECT_MODULES, "parameters": {"type": "object", "properties": {
        "path": {"type": "string", "default": ""},
        "include_invalid": {"type": "boolean", "default": True},
        "limit": {"type": "integer", "default": 300},
    }}}},
]
REPO_FUNCTION_DECLARATIONS = [
    {"name": "search_project_source", "description": _TOOL_SEARCH_REPO["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
         "case_sensitive": {"type": "boolean"}, "max_matches": {"type": "integer"},
     }}},
    {"name": "read_project_file", "description": _TOOL_READ_REPO["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}, "max_lines": {"type": "integer"},
     }}},
    {"name": "list_project_modules", "description": _TOOL_LIST_PROJECT_MODULES["description"],
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string"}, "include_invalid": {"type": "boolean"}, "limit": {"type": "integer"},
     }}},
]

# ── Migration target tool schemas ─────────────────────────────────

_TOOL_SEARCH_TARGET = {
    "name": "search_target_source",
    "description": (
        "Rechercher dans le code source Odoo de la VERSION CIBLE de la migration. "
        "Utilise cet outil pour comparer l'implémentation dans la version d'arrivée : "
        "vérifier si un modèle/champ/méthode a changé, été supprimé ou renommé. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne.\n"
        "STRUCTURE DES SOURCES : modules Community sous addons/<module>/, "
        "modules Enterprise directement sous enterprise/<module>/ (pas sous addons/). "
        "Ex : path='enterprise/helpdesk' pour le module Helpdesk enterprise."
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
        "max_matches": {"type": "integer", "default": 500},
    }}},
    {**_TOOL_READ_TARGET, "input_schema": {"type": "object", "required": ["path"], "properties": {
        "path":       {"type": "string",  "description": "Chemin relatif depuis la racine des sources cibles"},
        "start_line": {"type": "integer", "default": 1},
        "end_line":   {"type": "integer", "default": 0},
        "max_lines":  {"type": "integer", "default": 1000},
    }}},
]
TARGET_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_SEARCH_TARGET, "parameters": {"type": "object", "required": ["pattern"], "properties": {
        "pattern": {"type": "string"}, "path": {"type": "string", "default": ""},
        "file_types": {"type": "array", "items": {"type": "string"}, "default": ["*.py"]},
        "case_sensitive": {"type": "boolean", "default": True},
        "max_matches": {"type": "integer", "default": 500},
    }}}},
    {"type": "function", "function": {**_TOOL_READ_TARGET, "parameters": {"type": "object", "required": ["path"], "properties": {
        "path": {"type": "string"}, "start_line": {"type": "integer", "default": 1}, "end_line": {"type": "integer", "default": 0}, "max_lines": {"type": "integer", "default": 1000},
    }}}},
]
TARGET_FUNCTION_DECLARATIONS = [
    {"name": "search_target_source", "description": _TOOL_SEARCH_TARGET["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
         "case_sensitive": {"type": "boolean"}, "max_matches": {"type": "integer"},
     }}},
    {"name": "read_target_file", "description": _TOOL_READ_TARGET["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}, "max_lines": {"type": "integer"},
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

# ── View & report inspection tool schemas ────────────────────────

_VIEW_PROPS = {
    "model":     {"type": "string", "description": "Modèle Odoo, ex 'sale.order'"},
    "view_type": {"type": "string", "description": "Type de vue : form, list, kanban, activity, calendar, pivot, graph, search", "default": ""},
    "view_id":   {"type": "integer", "description": "ID d'une vue précise (optionnel)"},
}
_REPORT_PROPS = {
    "report_name": {"type": "string", "description": "Nom technique du rapport, ex 'account.report_invoice' (mode détail)", "default": ""},
    "model":       {"type": "string", "description": "Modèle pour lister ses rapports, ex 'sale.order'", "default": ""},
}

VIEW_TOOLS_CLAUDE = [
    {**_TOOL_INSPECT_VIEW, "input_schema": {"type": "object", "required": ["model"], "properties": _VIEW_PROPS}},
    {**_TOOL_INSPECT_REPORT, "input_schema": {"type": "object", "properties": _REPORT_PROPS}},
]
VIEW_TOOLS_OPENAI = [
    {"type": "function", "function": {**_TOOL_INSPECT_VIEW, "parameters": {"type": "object", "required": ["model"], "properties": _VIEW_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_REPORT, "parameters": {"type": "object", "properties": _REPORT_PROPS}}},
]
VIEW_FUNCTION_DECLARATIONS = [
    {"name": "inspect_odoo_view", "description": _TOOL_INSPECT_VIEW["description"],
     "parameters": {"type": "object", "required": ["model"], "properties": {
         "model": {"type": "string"}, "view_type": {"type": "string"}, "view_id": {"type": "integer"},
     }}},
    {"name": "inspect_odoo_report", "description": _TOOL_INSPECT_REPORT["description"],
     "parameters": {"type": "object", "properties": {
         "report_name": {"type": "string"}, "model": {"type": "string"},
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


def _trim_context(ctx: str) -> str:
    """Safety net only — context_service.load_context_for_prompt already fits
    routed markdown into CONTEXT_BUDGET_CHARS (36k). This second pass at
    MAX_CONTEXT_CHARS (40k) catches edge cases (concatenated localization,
    multiple appended sections) without changing the typical flow.
    """
    if len(ctx) <= _MAX_CONTEXT_CHARS:
        return ctx
    return ctx[:_MAX_CONTEXT_CHARS] + "\n\n[...contexte tronqué — trop long pour le modèle...]"


def _trim_project_context(ctx: str) -> str:
    if len(ctx) <= _MAX_PROJECT_CONTEXT_CHARS:
        return ctx
    return ctx[:_MAX_PROJECT_CONTEXT_CHARS] + "\n\n[...contexte projet tronqué — trop long pour le modèle...]"


# ── Perspective (4 roles: support / BA / architect / developer) ──
#
# Legacy values "technical" and "functional" remain accepted for
# backwards compatibility (older clients, stored prompts) and are
# mapped to the closest new role.

PERSPECTIVE_SUPPORT = "support"
PERSPECTIVE_BA = "business_analyst"
PERSPECTIVE_ARCHITECT = "architect"
PERSPECTIVE_DEVELOPER = "developer"

# Kept for backwards-compat in call sites and tests.
PERSPECTIVE_TECHNICAL = PERSPECTIVE_DEVELOPER
PERSPECTIVE_FUNCTIONAL = PERSPECTIVE_BA

_VALID_PERSPECTIVES = {
    PERSPECTIVE_SUPPORT, PERSPECTIVE_BA, PERSPECTIVE_ARCHITECT, PERSPECTIVE_DEVELOPER,
}
_LEGACY_PERSPECTIVE_ALIASES = {
    "technical": PERSPECTIVE_DEVELOPER,
    "functional": PERSPECTIVE_BA,
}
_VALID_RESPONSE_LANGUAGES = {"auto", "fr", "en"}


def _normalize_perspective(p: Optional[str]) -> str:
    if p in _VALID_PERSPECTIVES:
        return p  # type: ignore[return-value]
    if p in _LEGACY_PERSPECTIVE_ALIASES:
        return _LEGACY_PERSPECTIVE_ALIASES[p]
    return PERSPECTIVE_DEVELOPER


# ── Server-side perspective inference (mirror of frontend inferPerspective) ──
# Used when a client sends `perspective="auto"` or omits it. The frontend
# already resolves auto → concrete role via useResolvedPerspective(), so this
# is mainly a fallback for non-browser clients (CLI, future mobile).

_SUPPORT_WEAK = (
    "incident", "bug", "crash", "plante", "crashe", "workaround", "contournement",
    "ticket", "sla", "reproduire", "panne", "hors service",
    "urgence", "urgent", "critique", "p1", "p2",
    "lenteur", "freeze", "timeout",
    "ne fonctionne pas", "n'arrive pas", "ne marche pas", "ne charge pas",
    "résoudre", "fix", "corriger",
    "erreur", "planté", "plantée", "bloqué", "bloque", "bloquée",
    "connexion", "impossible",
)
_SUPPORT_STRONG = (
    "incident", "workaround", "ticket", "sla", "panne", "p1", "p2",
    "ne fonctionne pas", "ne marche pas",
    "bug",
    "plante", "planté", "plantée",
    "inaccessible",
    "lenteur",
    "page blanche", "écran blanc",
    "erreur 500", "erreur 404", "erreur 403", "internal server error",
    "connexion impossible", "impossible de se connecter", "login impossible",
)
_BA_WEAK = (
    "process", "processus", "métier", "metier", "fonctionnel",
    "as-is", "to-be", "workflow", "parcours utilisateur",
    "recette", "uat", "besoin", "requirement",
    "règle de gestion", "regle de gestion", "kpi",
    "compte-rendu", "compte rendu", "réunion", "reunion",
    "configurer", "paramétrer", "parametrer",
    "comment faire", "how to", "cas d'usage", "use case",
    "qu'est-ce que", "what is", "à quoi sert",
    "point de vente", "note de frais", "feuille de temps",
    # ── Odoo business domain vocabulary ────────────────────────────────────
    # Accounting & Finance
    "avoir", "avoirs", "acompte", "comptable",
    "rapprochement", "lettrage", "trésorerie", "tresorerie",
    "recouvrement", "encaissement", "relance",
    "solde client", "solde fournisseur",
    # Sales & CRM
    "devis", "opportunité", "opportunite",
    "commande client", "commandes client",
    # Purchase
    "fournisseur", "fournisseurs",
    "bon de réception", "bon de reception",
    # Inventory
    "inventaire", "mouvement de stock",
    # HR & Payroll
    "congé", "conge", "absence", "employé", "employe",
    "fiche de salaire", "bulletin de salaire",
)
_BA_STRONG = (
    "métier", "fonctionnel", "as-is", "to-be", "cas d'usage",
    "règle de gestion", "compte-rendu", "recette", "uat", "parcours utilisateur",
    # Accounting domain — single mention is a reliable BA signal
    "facture", "factures", "invoice", "invoices",
    "comptabilité", "accounting",
    "rapprochement bancaire", "plan comptable",
)
_ARCH_WEAK = (
    "architecture", "architecte", "scalabilité", "scalability",
    "urbanisation", "dépendance", "dependance",
    "stratégie de migration", "strategie de migration",
    "choix technique", "adr", "risque", "risques",
    "multi-société", "multi-societe", "multi-company",
    "pattern", "patterns", "volumétrie",
    "haute disponibilité", "pra", "rto", "rpo",
    "indexation", "cluster", "load balanc",
    "community vs enterprise", "community ou enterprise", "oca vs",
    "roadmap", "feuille de route", "gouvernance",
    "hébergement", "hébergeur", "héberger",
    "infrastructure", "on-premise", "on premise",
    "déploiement", "deploiement",
    "saas", "cloud", "dimensionnement",
    "multi-pays", "multicompany", "multi pays",
    "oca", "développement interne", "developpement interne",
    "trajectoire",
)
_ARCH_STRONG = (
    "architecture", "architecte", "adr", "haute disponibilité",
    "multi-société", "multi-company", "stratégie de migration",
    "community vs enterprise", "oca vs", "scalabilité", "gouvernance",
    "community ou enterprise",
    "hébergeur",
    "roadmap",
    "trajectoire",
    "choix technique",
    "multi-pays",
)
_DEV_WEAK = (
    "snippet", "python", "xml", "javascript", "typescript", "sql",
    "_inherit", "_inherits", "_name", "_description",
    "api.", "@api", "override", "surcharge",
    "__manifest__", "traceback", "stack trace", "exception",
    "@depends", "compute", "related", "onchange", "constrains",
    "command.create", "command.update", "browse", "recordset",
    "env[", "self.env", "cron", "wizard", "controller",
    "orm", "requête sql", "psycopg", "cursor",
    "pdb", "breakpoint", "logger",
    "odoo-bin", "odoo.conf", "web_studio",
    "unittest", "transactioncase", "pytest",
)
_DEV_STRONG = (
    "_inherit", "_inherits", "_name", "_description", "@api",
    "__manifest__", "traceback", "stack trace", "self.env", "env[",
    "transactioncase", "recordset", "psycopg",
    # Programming language mentions are unambiguous dev signals
    "python", "javascript", "typescript", "sql",
    # Override/inheritance vocabulary — always dev in French Odoo context
    "surcharger", "hériter", "heriter",
)


def _score_terms(text: str, weak: tuple[str, ...], strong: tuple[str, ...]) -> int:
    n = 0
    for t in weak:
        if t in text:
            n += 1
    for t in strong:
        if t in text:
            n += 3
    return n


def _infer_perspective(text: str, fallback: str = PERSPECTIVE_BA) -> str:
    """Python mirror of frontend inferPerspective(). Best-effort fallback for
    clients sending `perspective="auto"`. Returns *fallback* below confidence."""
    if not text or not text.strip():
        return fallback
    t = text.lower()
    # Strong dev signals: code block, ORM tokens, traceback.
    if "```" in t or "_inherit" in t or "@api." in t or "self.env" in t or "traceback" in t:
        return PERSPECTIVE_DEVELOPER
    scores = {
        PERSPECTIVE_SUPPORT: _score_terms(t, _SUPPORT_WEAK, _SUPPORT_STRONG),
        PERSPECTIVE_ARCHITECT: _score_terms(t, _ARCH_WEAK, _ARCH_STRONG),
        PERSPECTIVE_DEVELOPER: _score_terms(t, _DEV_WEAK, _DEV_STRONG),
        PERSPECTIVE_BA: _score_terms(t, _BA_WEAK, _BA_STRONG),
    }
    order = [PERSPECTIVE_SUPPORT, PERSPECTIVE_ARCHITECT, PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA]
    best = fallback
    best_score = 0
    second_score = 0
    for p in order:
        s = scores[p]
        if s > best_score:
            second_score = best_score
            best_score = s
            best = p
        elif s > second_score:
            second_score = s
    # Require min confidence + margin over runner-up, matching the frontend.
    if best_score >= 3 and best_score - second_score >= 2:
        return best
    return fallback


def _last_user_text(messages: list) -> str:
    """Extract plain text from the most recent user message (string content or
    Anthropic-style content list)."""
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for blk in content:
                if isinstance(blk, dict):
                    if blk.get("type") == "text" and blk.get("text"):
                        parts.append(str(blk["text"]))
            if parts:
                return "\n".join(parts)
    return ""


def _normalize_response_language(language: Optional[str]) -> str:
    if language in _VALID_RESPONSE_LANGUAGES:
        return language  # type: ignore[return-value]
    return "auto"


# ── History trimming ─────────────────────────────────────────

def _is_orphan_tool_message(msg: dict) -> bool:
    """Return True if *msg* is a tool_result/tool message that cannot stand
    alone — its matching assistant `tool_use` block was dropped by trimming,
    and providers will reject the request with a 400 if we keep it.

    Handles both message shapes:
    - Anthropic: `{"role": "user", "content": [{"type": "tool_result", ...}]}`
    - OpenAI:    `{"role": "tool", "tool_call_id": "..."}`
    """
    role = msg.get("role")
    if role == "tool":
        return True
    if role == "user":
        content = msg.get("content")
        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, dict) and first.get("type") == "tool_result":
                return True
    return False


def _trim_history(messages: list) -> list:
    """Drop oldest conversation turns to stay within _MAX_HISTORY_TURNS pairs.

    Always keeps the most recent turns. After trimming, ensures the first
    retained message is a genuine user turn — not an orphan tool_result whose
    matching `tool_use` block has been dropped, which would otherwise trigger
    a 400 from Anthropic / OpenAI.
    """
    if len(messages) <= _MAX_HISTORY_TURNS * 2:
        return messages
    trimmed = messages[-(_MAX_HISTORY_TURNS * 2):]
    # Drop leading non-user turns AND orphan tool_result user turns.
    while trimmed and (trimmed[0].get("role") != "user" or _is_orphan_tool_message(trimmed[0])):
        trimmed = trimmed[1:]
    return trimmed


_LARGE_RESULT_TOOL_NAMES = {
    "query_odoo",
    "read_group_odoo",
    "get_odoo_fields",
    "inspect_installed_modules",
    "inspect_menus_actions",
    "inspect_security",
    "inspect_studio",
    "inspect_odoo_view",
    "inspect_odoo_report",
    "search_odoo_source",
    "read_odoo_file",
    "search_project_source",
    "read_project_file",
    "search_target_source",
    "read_target_file",
    "list_project_modules",
    "count_source_lines",
    "git_show_commit",
}


def _compress_tool_result(result: dict, tool_name: str | None = None) -> str:
    """Serialize a tool result for storage in the messages array.

    The returned string is capped so large tool outputs don’t bloat the context
    window across many turns. Data-heavy results the model must reason on
    directly (query_odoo, Studio/view/report inspection) get a larger budget.
    The full result is still streamed to the frontend via the SSE 'tool_result'
    event before this compressed copy is stored.
    """
    raw = json.dumps(result, ensure_ascii=False, default=str)
    needs_data_budget = (
        tool_name in _LARGE_RESULT_TOOL_NAMES
        or (isinstance(result, dict) and isinstance(result.get("records"), list))
    )
    cap = _MAX_DATA_TOOL_RESULT_HISTORY_CHARS if needs_data_budget else _MAX_TOOL_RESULT_HISTORY_CHARS
    if len(raw) <= cap:
        return raw
    suffix = (
        "...[résultat tronqué/compressé avant renvoi au modèle — le résultat complet a été "
        "streamé à l'interface ; ne conclus pas que les records absents n'existent pas]"
    )
    return raw[: cap - len(suffix)] + suffix


def _language_block(response_language: Optional[str]) -> str:
    language = _normalize_response_language(response_language)
    if language == "fr":
        return """## Langue de réponse
- Réponds toujours en français, même si le prompt utilisateur est dans une autre langue.
- Ne traduis jamais les identifiants techniques Odoo : modèles, champs, XML IDs, chemins de fichiers, domains, noms de méthodes.

---
"""
    elif language == "en":
        return """## Response language
- Always answer in English, even if the user prompt is in another language.
- Never translate Odoo technical identifiers: models, fields, XML IDs, file paths, domains or method names.

---
"""
    return """## Langue de réponse / Response language
- Réponds dans la langue du dernier message utilisateur. If the user writes in English, answer in English; if they write in French, answer in French.
- Ne traduis jamais les identifiants techniques Odoo / Never translate Odoo technical identifiers: modèles/models, champs/fields, XML IDs, chemins de fichiers/file paths, domains, noms de méthodes/method names.

---
"""


_PERSPECTIVE_BLOCKS: dict[str, str] = {
    PERSPECTIVE_SUPPORT: """## Perspective : SUPPORT (Run / Incident)

Tu réponds comme un **consultant support Odoo expérimenté** chargé de débloquer un utilisateur ou de diagnostiquer un incident en production.

### Public cible
- Key users bloqués, équipe support N1/N2, oncall.
- Ils ont besoin d'une réponse **immédiatement actionnable**, pas d'une analyse théorique.

### Priorités
- **Diagnostic rapide** : symptômes → hypothèses → vérifications concrètes.
- **Workaround temporaire** avant la correction de fond si l'utilisateur est bloqué.
- **Logs, traceback, requêtes SQL** de vérification.
- **Reproduction** : étapes minimales pour reproduire.
- **Impact** : combien d'utilisateurs / quel processus est bloqué.

### Format de sortie
- Démarrer par **Diagnostic probable** (1-3 hypothèses ordonnées).
- Suivre par **Vérifications à faire** (checklist actionnable).
- Donner un **Workaround** si possible, puis la **Correction durable**.
- Terminer par **Prochaines actions** courtes.
""",
    PERSPECTIVE_BA: """## Perspective : BUSINESS ANALYST / AM

Tu réponds comme un **Application Manager / Business Analyst Odoo**, pas comme un développeur.

### Public cible
- Consultants fonctionnels, key users, sponsors métier, chefs de projet.
- Ils ne lisent pas de code Python ni de XML brut.

### Priorités
- **Parcours utilisateur** : qui clique où, dans quel écran, pour obtenir quoi.
- **Processus métier end-to-end** : ventes, achats, stock, finance, RH, projet.
- **Configuration fonctionnelle** : modules à activer, paramètres clés, règles, automatisations standard.
- **Impact rôles & KPI**, cas d'usage et limites du standard avant toute personnalisation.

### Ce que tu dois éviter
- Détails d'implémentation (ORM, compute, decorators, héritage Python).
- Jargon framework (`_inherit`, `api.depends`, `super()`…) sauf nécessaire pour le métier.
- Snippets de code sauf demande explicite.

### Format de sortie
- Tableaux métier : `Cas d'usage | Avant | Après | Bénéfice | Effort`.
- Captures de navigation : *Ventes → Configuration → Équipes commerciales*.
- Si un point technique peut bloquer, courte section **Point à valider techniquement**.
- Terminer par **3 prochaines actions maximum** pour un AM / BA.
""",
    PERSPECTIVE_ARCHITECT: """## Perspective : ARCHITECTE Odoo

Tu réponds comme un **architecte Odoo / tech lead** chargé de décisions structurantes (sécurité, performance, multi-société, intégration, migration).

### Public cible
- Architectes, tech leads, CTO, sponsors techniques.
- Ils veulent **des décisions argumentées**, pas du tutoriel.

### Priorités
- **Décisions et trade-offs** : standard vs custom, Community vs Enterprise, OCA vs spécifique.
- **Risques** : sécurité, performance, scalabilité, dépendances, dette technique.
- **Patterns** : héritage de modèles, design d'extensions, multi-company, multi-currency, multi-warehouse.
- **Migration / intégration** : stratégie haut niveau, dépendances inter-modules, ordonnancement.
- **Volumétrie & infra** : indexation, partitionnement, lecture/écriture, jobs longs, queue_job.

### Format de sortie
- **Décision recommandée** en tête, avec **alternatives écartées** et la **raison**.
- Tableau `Option | Pro | Con | Risque | Effort`.
- Schémas en pseudo-mermaid ou ASCII si pertinent.
- Pointeurs vers modules/standards OCA quand ils existent.
- Terminer par **3 prochaines actions** orientées décision (POC, ADR, audit ciblé).
""",
    PERSPECTIVE_DEVELOPER: """## Perspective : DÉVELOPPEUR Odoo

Tu réponds comme un **développeur Odoo senior**.

### Public cible
- Développeurs, intégrateurs, tech leads.
- Ils lisent du Python, XML, SQL et connaissent l'ORM Odoo.

### Priorités
- Modèles, champs, méthodes, héritage, decorators, contraintes, index.
- Vues XML, hooks, wizards, ACL, record rules, security.
- Performance, transactions, ORM, SQL généré, compatibilité de version.
- Impact sur les **modules custom** et stratégie de refactor.
- Preuves vérifiables : fichier, ligne, modèle, champ, domain ou commande.

### Format de sortie
- Tableaux techniques : `Élément | Avant | Après | Action requise`.
- Extraits de code Python / XML avec chemins de fichiers et numéros de ligne quand possible.
- Vocabulaire : `_inherit`, `compute`, `depends`, `api.model_create_multi`, override, etc.
- Si l'impact métier est important, courte section **Impact fonctionnel** après l'analyse technique.
- Terminer par **3 prochaines actions maximum** pour un archi / dev.
""",
}

_PERSPECTIVE_MIGRATION_ADDONS: dict[str, str] = {
    PERSPECTIVE_BA: """
### Spécifique migration (mode BA)
- Mets en avant les **nouvelles fonctionnalités du standard** dans la version cible.
- Identifie les **modules à activer/désactiver/remplacer**.
- Signale les **changements UX visibles** : menus, écrans, wizards.
- Évalue l'**impact formation** (faible / moyen / fort) et les sujets à couvrir.
- Format conseillé : `Domaine | Avant (vSource) | Après (vCible) | Impact utilisateur | Action AM`.
""",
    PERSPECTIVE_SUPPORT: """
### Spécifique migration (mode Support)
- Concentre-toi sur les **erreurs récurrentes post-migration** et leurs workarounds connus.
- Identifie les **modules tiers susceptibles de casser** et les vérifications de fumée prioritaires.
""",
    PERSPECTIVE_ARCHITECT: """
### Spécifique migration (mode Architecte)
- Stratégie d'ordonnancement : modules natifs → OCA → custom.
- Risques de rupture API, breaking changes, dépendances Python/JS.
- Décision Community vs Enterprise, OCA vs reécriture custom.
- Format conseillé : `Risque | Probabilité | Impact | Mitigation | Décision`.
""",
    PERSPECTIVE_DEVELOPER: """
### Spécifique migration (mode Développeur)
- Liste des **breaking changes ORM/XML** entre versions source et cible.
- Méthodes / champs renommés ou supprimés, decorators dépréciés.
- Scripts de migration (pre/post) et tests de non-régression à prévoir.
- Format conseillé : `Élément | vSource | vCible | Action de migration`.
""",
}


def _perspective_block(perspective: str, *, migration: bool = False) -> str:
    """Return a markdown block injected at the top of the system prompt
    to bias the assistant's reasoning, vocabulary and output format."""
    perspective = _normalize_perspective(perspective)
    block = _PERSPECTIVE_BLOCKS.get(perspective, _PERSPECTIVE_BLOCKS[PERSPECTIVE_DEVELOPER])
    if migration:
        block = block + _PERSPECTIVE_MIGRATION_ADDONS.get(perspective, "")
    return block.strip() + "\n\n---\n"


def _source_instructions(source_path: Optional[str] = None, repo_path: Optional[str] = None, target_path: Optional[str] = None) -> str:
    """Single source-of-truth block listing the available source roots and the
    tools the assistant must use to query them. Centralized so every build_*
    function emits the same wording (better for prompt caching and reviewers).
    """
    parts: list[str] = []
    if source_path:
        parts.append(
            f"### Code source Odoo (version courante)\n"
            f"Disponible localement : `{source_path}`.\n"
            "→ Pour toute question sur des modèles, champs, méthodes ou comportements Odoo, "
            "utilise SYSTÉMATIQUEMENT `search_odoo_source` avant de répondre. "
            "Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.\n"
            "STRUCTURE :\n"
            "- Community : la plupart des modules sous `community/addons/<module>/` ; MAIS le module "
            "`base` est sous `community/odoo/addons/base/`, et le cœur du framework (ORM, champs, API, "
            "http) sous `community/odoo/` (ex. `community/odoo/models.py`, `community/odoo/fields.py`, "
            "`community/odoo/api.py`).\n"
            "- Enterprise : modules directement sous `enterprise/<module>/` (PAS sous addons/).\n"
            "Exemples :\n"
            "- `search_odoo_source(pattern=\"_name = 'sale.order'\")`  ← sans path = cherche partout (C+E)\n"
            "- `search_odoo_source(pattern=\"def action_confirm\", path=\"addons/sale\")`  ← module Community\n"
            "- `search_odoo_source(pattern=\"_name = 'helpdesk.ticket'\", path=\"enterprise/helpdesk\")`  ← module Enterprise\n"
            "- `read_odoo_file(path=\"community/addons/account/models/account_move.py\", start_line=1, end_line=100)`\n"
            "- `read_odoo_file(path=\"community/odoo/addons/base/models/ir_model.py\")`  ← module base\n"
            "- `read_odoo_file(path=\"community/odoo/fields.py\")`  ← cœur ORM\n"
            "GIT — quand l'utilisateur référence un commit par SHA (ex `fa2bfa97`), appelle "
            "TOUJOURS `git_show_commit(sha=..., scope='odoo'|'enterprise')` au lieu de spéculer "
            "sur le contenu. Le clone shallow est deepené automatiquement si besoin."
        )
    else:
        parts.append("### Code source Odoo\nNon disponible pour cette version (téléchargez-les depuis la page Sources).")

    if target_path:
        parts.append(
            f"### Code source Odoo (version cible)\n"
            f"Disponible : `{target_path}`.\n"
            "→ Utilise `search_target_source` / `read_target_file` pour la version cible. "
            "Pour un commit précis : `git_show_commit(sha=..., scope='target')`."
        )

    if repo_path:
        parts.append(
            f"### Code source du projet client\n"
            f"Disponible : `{repo_path}`. Modules custom et configurations spécifiques au client.\n"
            "→ Pour découvrir les modules custom, commence par `list_project_modules` "
            "(manifests parsés proprement), puis `read_project_file` pour lire les fichiers pertinents. "
            "Si tu utilises la recherche brute, ne cherche PAS `__manifest__.py` comme pattern — "
            "c'est un nom de fichier, pas du contenu.\n"
            "SÉCURITÉ — si la question mentionne droits, ACL, record rules, groupes ou sécurité "
            "dans les modules custom, utilise `list_project_modules`, puis cherche `ir.model.access`, "
            "`ir.rule`, `groups_id`, `security/` ou les CSV/XML de sécurité avec "
            "`search_project_source`, lis les fichiers avec `read_project_file`, et complète avec "
            "`inspect_security` sur les modèles concernés lorsque l'instance live est connectée.\n"
            "Pour inspecter un commit précis du dépôt projet : `git_show_commit(sha=..., scope='project')`."
        )

    if source_path or repo_path or target_path:
        parts.append(
            "### Volumétrie / comptage de lignes\n"
            "Pour toute question de **volumétrie** (nombre de lignes Python/XML, taille des modules, "
            "répartition par extension), utilise **`count_source_lines`** — il scanne le dépôt entièrement.\n"
            "Ne déduis JAMAIS un nombre total de lignes à partir de `search_*_source` : ces outils retournent "
            "les *occurrences* d'un pattern, pas un comptage exhaustif."
        )
    return "\n\n".join(parts)


_DATA_PLAYBOOK = """## Exploration des données — méthode

### Introspection avant de deviner
- Avant d'écrire un domain sur un modèle dont la structure n'est pas certaine (surtout en présence de Studio ou de modules custom), appelle `get_odoo_fields(model)` pour cartographier les relations, puis `get_odoo_fields(model, field_names=[...])` pour confirmer les champs précis. Ne fabrique pas un nom de champ — vérifie-le.
- Si un champ deviné n'existe pas (erreur "Invalid field"), n'abandonne pas la piste : ré-introspect, cherche le bon nom (variantes `x_*`, renommé entre versions), et ré-essaye.

### Cartes de relations Odoo (raccourcis utiles)
- **Projet ↔ Comptabilité** : `project.project.analytic_account_id` ↔ `account.analytic.account`. La consommation comptable d'un projet se lit sur `account.analytic.line` (champs `account_id` = compte analytique, `move_line_id` = ligne comptable d'origine, `general_account_id`, `amount`, `date`). Pour remonter aux factures : `account.analytic.line.move_line_id.move_id` (modèle `account.move`).
- **Projet ↔ Ventes / Achats** : selon les modules installés, `sale.order.project_id` / `sale.order.analytic_account_id` ; `purchase.order.line.analytic_distribution`. La distribution analytique peut aussi être directement sur les lignes (`sale.order.line` / `purchase.order.line` / `account.move.line`).
- **Commande ↔ Facture** : `sale.order.invoice_ids` (many2many vers `account.move`) et `sale.order.invoice_status` ; côté achat `purchase.order.invoice_ids`. Sur la facture, `account.move.invoice_origin` (texte = numéro de commande) et `account.move.line.sale_line_ids` / `purchase_line_id` pour la traçabilité ligne à ligne.
- **Timesheets** : `account.analytic.line` (mêmes lignes que la compta analytique — différenciées par `project_id` / `task_id` renseignés).

### Pièges connus et contournements
- **`analytic_distribution` est un JSON `{account_id: pourcentage}`, NON filtrable par domaine** (`like`, `=`, `in` échouent sur ce champ). Pour trouver toutes les pièces liées à un compte analytique, requête `account.analytic.line` avec `[("account_id", "=", <id>)]` — chaque distribution y est matérialisée en lignes, et `move_line_id`/`move_id` donnent la facture ou l'écriture associée.
- **Pas de `project_id` direct sur `account.move`** : passer par (a) `account.move.line.analytic_distribution` ↔ `project.analytic_account_id`, ou (b) `account.move.invoice_origin` ↔ `sale.order.name`, ou (c) `account.move.line.sale_line_ids.order_id.project_id`.
- **Variations de version** : `analytic_account_id` (singulier, Odoo ≤15 sur les lignes) a été remplacé par `analytic_distribution` (dict, Odoo 16+). Vérifie avant de filtrer.
- **Champs custom (`x_*`)** : toujours possibles sur les modèles standards. Si une question parle de "lien projet/commande", appelle `get_odoo_fields` sur les deux modèles concernés et cherche des `x_*` qui font le pont, en plus des champs standards.

### Boucle d'exploration
- Pour une question d'exploration de données, enchaîne plusieurs appels d'outils (introspecter → essayer → corriger → conclure) AVANT de rendre la main. Ne demande pas la permission de continuer entre deux requêtes en lecture seule — explore, puis réponds avec le récap final.
- Pour un KPI ou une synthèse par période/statut/responsable, utilise `read_group_odoo` plutôt que de télécharger un échantillon avec `query_odoo` et additionner toi-même.
- Si après ~6 tentatives la piste reste bloquée, alors signale honnêtement ce qui a été tenté et ce qui manque, plutôt que d'inventer.
"""


def _format_access_context(raw: Optional[str]) -> str:
    """One-line summary of the connected Odoo user's rights.

    Affects how the AI must read query results: a restricted user only sees a
    subset of records, so a count can be partial. Empty string when unknown.
    """
    if not raw:
        return ""
    try:
        info = json.loads(raw)
    except Exception:
        return ""
    if not isinstance(info, dict):
        return ""
    name = str(info.get("user_name") or "").strip()
    who = f" ({name})" if name else ""
    if info.get("is_system"):
        return (f"- Droits Odoo{who} : administrateur système — accès total, "
                "les requêtes voient tous les enregistrements (règles d'accès ignorées).")
    if info.get("is_admin"):
        return (f"- Droits Odoo{who} : administrateur ERP — droits étendus ; "
                "quelques modèles techniques peuvent rester hors de portée.")
    return (f"- Droits Odoo{who} : utilisateur standard — règles d'accès et multi-sociétés "
            "restreignent ce qui est visible ; un comptage peut être partiel.")


def build_system(
    profile,
    source_path: Optional[str] = None,
    context_md: str = "",
    repo_path: Optional[str] = None,
    perspective: str = PERSPECTIVE_TECHNICAL,
    response_language: str = "auto",
    *,
    user_ctx: str = "",
    active_company_name: Optional[str] = None,
    project_context: Optional[str] = None,
) -> tuple[str, str]:
    """Build the system prompt for project mode.

    Returns (stable, variable). The stable part is identical across turns in
    the same conversation (identity, sources, instructions, project context)
    and is cached by the provider. The variable part (language, perspective,
    routed markdown) changes per turn and is appended after the cache breakpoint.
    """
    # ── STABLE PART ───────────────────────────────────────────────
    society_line = f"- Société : {profile.company_name or 'inconnue'}"
    if active_company_name:
        society_line += f"\n- Société active (filtre) : {active_company_name}"

    stable_parts: list[str] = []
    if user_ctx:
        stable_parts.append(user_ctx.strip())

    stable_parts.append(
        "Tu es un assistant expert Odoo qui aide les consultants à analyser les données "
        "et le code source de leurs clients."
    )
    instance_block = (
        f"## Instance connectée\n"
        f"- URL : {profile.db_url}\n"
        f"- Version : {profile.odoo_version or 'inconnue'}\n"
        f"- Base : {profile.db_name}\n"
        f"{society_line}"
    )
    access_line = _format_access_context(getattr(profile, "user_access_info", None))
    if access_line:
        instance_block += f"\n{access_line}"
    stable_parts.append(instance_block)
    stable_parts.append(_source_instructions(source_path=source_path, repo_path=repo_path))
    stable_parts.append(
        "## Instructions générales\n"
        "- Utilise les outils pour interroger Odoo directement et répondre avec des données réelles.\n"
        "- Quand un modèle n'existe pas sur l'instance, cherche son nom correct dans le code source avant d'abandonner.\n"
        "- Si le contexte Markdown contredit les données live ou le code source, les données live et le code source gagnent.\n"
        "- Sépare clairement les faits vérifiés, les hypothèses et les actions recommandées quand le sujet est ambigu.\n"
        "- Présente les listes sous forme de tableaux Markdown.\n"
        "- Si tu ne connais pas les champs d'un modèle, utilise `get_odoo_fields` d'abord.\n"
        "- Pour une question sur un écran ou une vue (champs visibles, lecture seule, accès), utilise `inspect_odoo_view` ; "
        "pour un rapport PDF, utilise `inspect_odoo_report`.\n"
        "- Sois concis et orienté résultats."
    )
    stable_parts.append(_DATA_PLAYBOOK.strip())
    if project_context:
        stable_parts.append(f"## Contexte projet\n{_trim_project_context(project_context.strip())}")

    stable = "\n\n".join(stable_parts).strip()

    # ── VARIABLE PART ─────────────────────────────────────────────
    variable = _build_variable_block(
        response_language=response_language,
        perspective=perspective,
        migration=False,
        context_md=context_md,
    )
    return stable, variable


def _build_variable_block(
    *,
    response_language: str,
    perspective: str,
    migration: bool,
    context_md: str,
) -> str:
    """Per-turn variable block: language directive, role perspective, routed
    markdown context. Placed AFTER the stable cache breakpoint."""
    parts: list[str] = []
    parts.append(_language_block(response_language).rstrip())
    parts.append(_perspective_block(perspective, migration=migration).rstrip())
    ctx = context_md.strip() if context_md else ""
    if ctx:
        parts.append(f"---\n\n{_trim_context(ctx)}")
    return "\n\n".join(p for p in parts if p)


def build_system_migration(
    source_version: str,
    target_version: str,
    source_path: Optional[str] = None,
    target_path: Optional[str] = None,
    context_md: str = "",
    repo_path: Optional[str] = None,
    perspective: str = PERSPECTIVE_TECHNICAL,
    response_language: str = "auto",
    *,
    user_ctx: str = "",
    profile=None,
    active_company_name: Optional[str] = None,
    project_context: Optional[str] = None,
) -> tuple[str, str]:
    """Build the migration system prompt.

    When *profile* is set (the source side is a real project environment), the
    connected source instance, its access rights and the free-text project
    context are injected too — a project migration must not be blind to the
    project it migrates.
    """
    has_instance = profile is not None
    stable_parts: list[str] = []
    if user_ctx:
        stable_parts.append(user_ctx.strip())

    stable_parts.append(
        "Tu es un expert Odoo spécialisé dans les migrations de version. "
        "Tu aides le consultant à préparer, analyser et exécuter une migration Odoo."
    )
    stable_parts.append(
        f"## Contexte de migration\n"
        f"- Version SOURCE : {source_version}\n"
        f"- Version CIBLE  : {target_version}"
    )
    if has_instance:
        society_line = f"- Société : {profile.company_name or 'inconnue'}"
        if active_company_name:
            society_line += f"\n- Société active (filtre) : {active_company_name}"
        instance_block = (
            f"## Instance source connectée\n"
            f"- URL : {profile.db_url}\n"
            f"- Version : {profile.odoo_version or source_version}\n"
            f"- Base : {profile.db_name}\n"
            f"{society_line}"
        )
        access_line = _format_access_context(getattr(profile, "user_access_info", None))
        if access_line:
            instance_block += f"\n{access_line}"
        stable_parts.append(instance_block)

    stable_parts.append(_source_instructions(source_path=source_path, repo_path=repo_path, target_path=target_path))
    if has_instance:
        stable_parts.append(
            "## Méthode de travail\n"
            "1. Inspecte d'abord l'INSTANCE SOURCE réelle : customisations Studio (`inspect_studio`), "
            "vues et rapports (`inspect_odoo_view` / `inspect_odoo_report`), modules installés et "
            "volumétrie (`query_odoo` / `count_odoo`) — c'est ce qui détermine l'effort de migration.\n"
            "2. Cherche l'élément concerné dans la VERSION SOURCE avec `search_odoo_source`.\n"
            "3. Cherche le même élément dans la VERSION CIBLE avec `search_target_source`.\n"
            "4. Compare, explique les différences, et vérifie la compatibilité des modules custom du repo avec la version cible."
        )
    else:
        stable_parts.append(
            "## Méthode de travail\n"
            "1. Cherche d'abord dans la VERSION SOURCE avec `search_odoo_source`.\n"
            "2. Cherche ensuite le même élément dans la VERSION CIBLE avec `search_target_source`.\n"
            "3. Compare et explique les différences.\n"
            "4. Si des modules custom sont fournis, vérifie leur compatibilité avec la version cible."
        )
    stable_parts.append(
        "## Instructions\n"
        "- Utilise SYSTÉMATIQUEMENT les outils de recherche avant de répondre — ne suppose jamais un comportement.\n"
        "- Si le contexte Markdown contredit le code source ou les données client, le code source et les données client gagnent.\n"
        "- Sépare clairement les faits vérifiés, les hypothèses et les actions recommandées.\n"
        "- Présente les comparaisons sous forme de tableaux (Source | Cible | Impact).\n"
        "- Signale clairement les breaking changes avec ⚠️."
    )
    if has_instance:
        stable_parts.append(_DATA_PLAYBOOK.strip())
    if project_context:
        stable_parts.append(f"## Contexte projet\n{_trim_project_context(project_context.strip())}")

    stable = "\n\n".join(stable_parts).strip()
    variable = _build_variable_block(
        response_language=response_language,
        perspective=perspective,
        migration=True,
        context_md=context_md,
    )
    return stable, variable


def build_system_general(
    version: str,
    source_path: Optional[str] = None,
    context_md: str = "",
    repo_path: Optional[str] = None,
    perspective: str = PERSPECTIVE_TECHNICAL,
    response_language: str = "auto",
    *,
    user_ctx: str = "",
) -> tuple[str, str]:
    stable_parts: list[str] = []
    if user_ctx:
        stable_parts.append(user_ctx.strip())
    stable_parts.append(
        "Tu es un expert Odoo qui répond à des questions générales sur l'ERP, "
        "indépendamment de tout projet client."
    )
    stable_parts.append(f"## Version Odoo de référence\n{version}")
    stable_parts.append(_source_instructions(source_path=source_path, repo_path=repo_path))
    stable_parts.append(
        "## Instructions\n"
        "- Réponds à toutes questions sur l'architecture Odoo, les modèles de données, les modules, les migrations.\n"
        "- Utilise le code source pour illustrer ou vérifier tes réponses quand c'est pertinent.\n"
        "- Si le contexte Markdown contredit le code source local, le code source local gagne.\n"
        "- Présente les listes sous forme de tableaux Markdown.\n"
        "- Sois précis, pédagogique, orienté consultant.\n"
        "- Tu n'as pas accès aux données d'une instance Odoo (mode général sans connexion client)."
    )

    stable = "\n\n".join(stable_parts).strip()
    variable = _build_variable_block(
        response_language=response_language,
        perspective=perspective,
        migration=False,
        context_md=context_md,
    )
    return stable, variable



# ── Skill script runner ──────────────────────────────────────────

_SCRIPT_TIMEOUT_SECONDS = 30
_SCRIPT_MAX_STDOUT_CHARS = 32_000
_SCRIPT_MAX_STDERR_CHARS = 4_000


async def _run_skill_script_subprocess(script_path, script_args, skill) -> dict:
    """Run a skill script in an isolated subprocess.

    Safety choices:
    - No shell (``shell=False``), arg list passed verbatim.
    - cwd locked to the skill folder so the script sees its own assets only.
    - Env minimal (PATH + PYTHONIOENCODING + LC_ALL) — no inherited secrets.
    - Hard 30s timeout; stdout/stderr truncated for the LLM.
    - Network blocked via ``unshare -n`` when ``permissions.network`` is False
      and we are on Linux with unshare available.
    """
    import asyncio as _asyncio
    import shutil as _shutil
    import os as _os
    from pathlib import Path as _Path

    cmd = ["python3", str(script_path), *script_args]
    # Best-effort network isolation: prepend `unshare -n` when permitted.
    if not skill.permissions.network and _shutil.which("unshare"):
        cmd = ["unshare", "-r", "-n", *cmd]

    env = {
        "PATH": _os.environ.get("PATH", "/usr/bin:/bin"),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUNBUFFERED": "1",
        "LC_ALL": _os.environ.get("LC_ALL", "C.UTF-8"),
        "LANG": _os.environ.get("LANG", "C.UTF-8"),
    }
    cwd = str(_Path(script_path).parent.parent)  # skill folder root

    try:
        proc = await _asyncio.create_subprocess_exec(
            *cmd,
            stdout=_asyncio.subprocess.PIPE,
            stderr=_asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )
        try:
            stdout_b, stderr_b = await _asyncio.wait_for(
                proc.communicate(), timeout=_SCRIPT_TIMEOUT_SECONDS)
        except _asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return {"ok": False, "error": f"Timeout — script tué après {_SCRIPT_TIMEOUT_SECONDS}s"}
        stdout = stdout_b.decode("utf-8", errors="replace")[:_SCRIPT_MAX_STDOUT_CHARS]
        stderr = stderr_b.decode("utf-8", errors="replace")[:_SCRIPT_MAX_STDERR_CHARS]
        return {
            "ok": proc.returncode == 0,
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "script": str(script_path.name) if hasattr(script_path, "name") else str(script_path),
        }
    except Exception as exc:
        return {"ok": False, "error": f"Échec lancement subprocess : {exc}"}


# ── Tool executor ────────────────────────────────────────────────
#
# Generic dispatch: each skill ships a ``scripts/handler.py`` with an
# ``async def run(args, ctx)``. The dispatcher resolves the handler module
# via ``importlib.util.spec_from_file_location`` (folder names contain
# hyphens, which Python's normal import system can't handle) and caches the
# module. The 2 meta-tools that touch the registry itself (load_skill_reference,
# run_skill_script) are kept inline because they live above the skills.

import importlib.util as _importlib_util
from pathlib import Path
from .tool_context import ToolContext as _ToolContext

_HANDLER_CACHE: dict = {}
_HANDLER_MISS: set = set()


def _resolve_handler(tool_name: str):
    if tool_name in _HANDLER_CACHE:
        return _HANDLER_CACHE[tool_name]
    if tool_name in _HANDLER_MISS:
        return None
    from ..skills.registry import skill_by_name
    skill = skill_by_name(tool_name)
    if skill is None or not skill.folder:
        _HANDLER_MISS.add(tool_name)
        return None
    handler_path = Path(skill.folder) / "scripts" / "handler.py"
    if not handler_path.is_file():
        _HANDLER_MISS.add(tool_name)
        return None
    # Load the module from its absolute path so the folder's hyphen-containing
    # slug doesn't break Python's import system. The module name is synthetic
    # but unique per tool — sys.modules pickup is harmless.
    mod_name = f"_skill_handler_{tool_name}"
    spec = _importlib_util.spec_from_file_location(mod_name, str(handler_path))
    if spec is None or spec.loader is None:
        _HANDLER_MISS.add(tool_name)
        return None
    module = _importlib_util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        logging.getLogger(__name__).error("Skill handler import failed for %s: %s", tool_name, exc)
        _HANDLER_MISS.add(tool_name)
        return None
    _HANDLER_CACHE[tool_name] = module
    return module


_RESOURCE_CHECKS = (
    ("REQUIRES_ODOO", "odoo", "Connexion Odoo requise pour ce skill — ouvre un projet depuis la page Projets"),
    ("REQUIRES_SOURCE", "source_path", "Sources Odoo non disponibles — installe-les depuis la page Sources"),
    ("REQUIRES_REPO", "repo_path", "Dépôt projet non disponible — clone-le depuis la fiche projet"),
    ("REQUIRES_TARGET", "target_path", "Sources de la version cible non disponibles"),
)


async def _run_tool(name: str, args: dict, odoo: "OdooClient", source_path: Optional[str] = None, repo_path: Optional[str] = None, target_path: Optional[str] = None) -> dict:
    loop = asyncio.get_event_loop()
    try:
        # Meta-tools: kept inline (they touch the skill registry itself, not a skill).
        if name == "load_skill_reference":
            from ..skills.registry import read_skill_reference, skill_by_name
            sk = args.get("skill", "")
            fn = args.get("filename", "")
            target = skill_by_name(sk)
            if target is None:
                return {"ok": False, "error": f"Skill inconnu : {sk}"}
            content = await loop.run_in_executor(None, lambda: read_skill_reference(sk, fn))
            if content is None:
                return {"ok": False, "error": f"Référence introuvable : {sk}/references/{fn}"}
            return {"ok": True, "skill": sk, "filename": fn, "content": content}

        if name == "run_skill_script":
            from ..skills.registry import resolve_skill_script, skill_by_name
            sk = args.get("skill", "")
            fn = args.get("filename", "")
            script_args = [str(a) for a in (args.get("args") or [])]
            target = skill_by_name(sk)
            if target is None:
                return {"ok": False, "error": f"Skill inconnu : {sk}"}
            if not target.permissions.scripts:
                return {"ok": False, "error": (
                    f"Le skill '{sk}' n'accorde pas la permission d'exécuter des scripts. "
                    "Ajoutez `scripts: true` dans le bloc `permissions` de son SKILL.md.")}
            script_path = await loop.run_in_executor(None, lambda: resolve_skill_script(sk, fn))
            if script_path is None:
                return {"ok": False, "error": f"Script introuvable : {sk}/scripts/{fn}"}
            return await _run_skill_script_subprocess(script_path, script_args, target)

        # Generic skill dispatch.
        handler = _resolve_handler(name)
        if handler is None:
            return {"ok": False, "error": f"Outil inconnu: {name}"}

        ctx = _ToolContext(
            odoo=odoo, source_path=source_path, repo_path=repo_path,
            target_path=target_path, loop=loop,
        )
        for flag, attr, error_msg in _RESOURCE_CHECKS:
            if getattr(handler, flag, False) and getattr(ctx, attr) is None:
                return {"ok": False, "error": error_msg}

        return await handler.run(args, ctx)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


async def _search_odoo_source(args: dict, source_path: str) -> dict:
    """Backward-compatible wrapper for tests/legacy callers.

    Runtime tool execution now goes through `skills/search-odoo-source`, but
    older tests import this helper from ai_service directly.
    """
    from odoo_consultant_portal.skills._shared.source_search import search
    return await search(args, source_path, include_enterprise=True)


async def _read_odoo_file(args: dict, source_path: str) -> dict:
    """Backward-compatible wrapper for tests/legacy callers."""
    from odoo_consultant_portal.skills._shared.source_search import read_file
    return await read_file(args, source_path, include_enterprise=True)


# ── Claude ───────────────────────────────────────────────────────

def _strip_cache_control_from_messages(messages: list) -> None:
    """Remove any pre-existing cache_control entries from tool_result blocks
    in *messages* (in place). We re-apply cache_control only on the LAST
    tool_result each iteration; Anthropic supports max 4 breakpoints total."""
    for msg in messages:
        content = msg.get("content") if isinstance(msg, dict) else None
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and "cache_control" in block:
                    block.pop("cache_control", None)


async def _chat_claude(api_key: str, model_id: str, system, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    try:
        import anthropic
    except ImportError:
        yield {"type": "error", "msg": "Package 'anthropic' non installé. Lancez : pip install anthropic"}
        return

    if tools is None:
        tools = TOOLS_CLAUDE
    client = anthropic.AsyncAnthropic(api_key=api_key)
    loop_msgs = list(messages)

    # Build the system payload:
    # - If we received a (stable, variable) tuple, use 2 blocks with an
    #   ephemeral cache breakpoint at the end of the stable half. The variable
    #   half (language, perspective, routed markdown) follows uncached.
    # - Legacy string callers still work (whole system cached as one block).
    if isinstance(system, tuple) and len(system) == 2:
        stable, variable = system
        system_payload = [
            {"type": "text", "text": stable, "cache_control": {"type": "ephemeral"}},
        ]
        if variable.strip():
            system_payload.append({"type": "text", "text": variable})
    else:
        system_payload = [{"type": "text", "text": str(system), "cache_control": {"type": "ephemeral"}}]

    total_in = total_out = 0
    cache_create = cache_read = 0

    _seen_calls: list[tuple[str, str]] = []  # (name, args_json) — loop guard
    for _ in range(25):
        response = await client.messages.create(
            model=model_id,
            max_tokens=_CLAUDE_MAX_OUTPUT_TOKENS,
            system=system_payload,
            messages=loop_msgs,
            tools=tools,
        )
        if hasattr(response, "usage") and response.usage:
            total_in     += getattr(response.usage, "input_tokens",  0) or 0
            total_out    += getattr(response.usage, "output_tokens", 0) or 0
            cache_create += getattr(response.usage, "cache_creation_input_tokens", 0) or 0
            cache_read   += getattr(response.usage, "cache_read_input_tokens",     0) or 0

        stop_reason = response.stop_reason

        if stop_reason == "tool_use":
            # Strip any previous cache_control on tool_results — we only keep
            # the breakpoint on the LATEST batch so the cache extends as the
            # conversation grows (max 4 breakpoints total including system).
            _strip_cache_control_from_messages(loop_msgs)

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    call_sig = (block.name, json.dumps(block.input, sort_keys=True, ensure_ascii=False))
                    _seen_calls.append(call_sig)
                    if _seen_calls.count(call_sig) >= 3:
                        yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}
                        return
                    yield {"type": "tool_call", "name": block.name, "args": block.input}
                    result = await _run_tool(block.name, block.input, odoo, source_path, repo_path, target_path)
                    yield {"type": "tool_result", "name": block.name, **result}
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": _compress_tool_result(result, block.name),
                    })
            # Cache breakpoint on the LAST tool_result so the next iteration
            # caches everything up to here (system + earlier turns + tool calls).
            if tool_results:
                tool_results[-1]["cache_control"] = {"type": "ephemeral"}

            loop_msgs.append({"role": "assistant", "content": response.content})
            loop_msgs.append({"role": "user", "content": tool_results})
            continue

        # Terminal response.
        text = "".join(getattr(b, "text", "") for b in response.content)
        if text:
            yield {"type": "text", "content": text}

        if stop_reason == "max_tokens":
            yield {
                "type": "warning",
                "msg": "Réponse tronquée — limite de tokens atteinte. Demandez la suite ou réduisez le périmètre de la question.",
            }
        elif stop_reason == "refusal":
            yield {
                "type": "warning",
                "msg": "Le modèle a refusé de répondre à cette requête. Reformulez ou changez de contexte.",
            }
        elif stop_reason not in ("end_turn", "stop_sequence", None):
            yield {"type": "warning", "msg": f"Arrêt inattendu : stop_reason={stop_reason}"}

        yield {
            "type": "done",
            "model": model_id,
            "input_tokens": total_in,
            "output_tokens": total_out,
            "cache_creation_input_tokens": cache_create,
            "cache_read_input_tokens": cache_read,
        }
        return

    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}


# ── OpenAI (shared logic for OpenAI + GitHub Models + Copilot) ───

async def _chat_openai_client(client, model_id: str, system: str, messages: list, odoo, source_path, tools=None, repo_path=None, target_path=None) -> AsyncIterator[dict]:
    if tools is None:
        tools = TOOLS_OPENAI
    oai_msgs = [{"role": "system", "content": system}] + messages
    total_in = total_out = 0
    _seen_calls_oai: list[tuple[str, str]] = []
    for _ in range(25):
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
                call_sig = (tc.function.name, json.dumps(args, sort_keys=True, ensure_ascii=False))
                _seen_calls_oai.append(call_sig)
                if _seen_calls_oai.count(call_sig) >= 3:
                    yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}
                    return
                yield {"type": "tool_call", "name": tc.function.name, "args": args}
                result = await _run_tool(tc.function.name, args, odoo, source_path, repo_path, target_path)
                yield {"type": "tool_result", "name": tc.function.name, **result}
                oai_msgs.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": _compress_tool_result(result, tc.function.name),
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
        generation_config={"max_output_tokens": _GEMINI_MAX_OUTPUT_TOKENS},
    )

    history = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})
    last_msg = messages[-1]["content"] if messages else ""

    chat = model.start_chat(history=history)
    total_in = total_out = 0

    _seen_calls_gem: list[tuple[str, str]] = []
    for _ in range(25):
        response = await loop.run_in_executor(None, lambda: chat.send_message(last_msg))
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            total_in  += getattr(response.usage_metadata, "prompt_token_count",     0) or 0
            total_out += getattr(response.usage_metadata, "candidates_token_count", 0) or 0
        part = response.candidates[0].content.parts[0]

        if hasattr(part, "function_call") and part.function_call.name:
            fc = part.function_call
            args = dict(fc.args)
            call_sig = (fc.name, json.dumps(args, sort_keys=True, ensure_ascii=False))
            _seen_calls_gem.append(call_sig)
            if _seen_calls_gem.count(call_sig) >= 3:
                yield {"type": "error", "msg": "Trop d'appels d'outils en boucle."}
                return
            yield {"type": "tool_call", "name": fc.name, "args": args}
            result = await _run_tool(fc.name, args, odoo, source_path, repo_path, target_path)
            yield {"type": "tool_result", "name": fc.name, **result}
            last_msg = genai.protos.Content(parts=[genai.protos.Part(
                function_response=genai.protos.FunctionResponse(
                    name=fc.name,
                    response={"result": _compress_tool_result(result, fc.name)},
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
    response_language: str = "auto",
    disabled_tools: Optional[list] = None,
) -> AsyncIterator[dict]:
    model = model_id or DEFAULT_MODELS.get(provider, "")
    # If client sent "auto", infer server-side from the last user message
    # (mirrors the frontend resolver — useful for CLI / mobile clients).
    if perspective == "auto" or perspective is None:
        perspective = _infer_perspective(_last_user_text(messages))
    perspective = _normalize_perspective(perspective)
    response_language = _normalize_response_language(response_language)

    # Trim conversation history to avoid context-window overflow on long sessions.
    messages = _trim_history(messages)

    # Rewrite the last user turn into the provider's native multimodal format
    # when it carries image / PDF attachments (no-op for text-only turns).
    messages = apply_provider_attachments(messages, provider)

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
            user_ctx = "\n".join(parts)

    if migration_mode:
        src_ver = version or (profile.odoo_version if profile else "?")
        tgt_ver = target_version or "?"
        stable, variable = build_system_migration(
            src_ver, tgt_ver, source_path, target_path, context_md, repo_path,
            perspective, response_language, user_ctx=user_ctx,
            profile=profile,
            active_company_name=active_company_name,
            project_context=getattr(profile, "project_context", None) if profile else None,
        )
        # Project-mode migration: the SOURCE side is a live instance — expose
        # the live-data tools so the AI can inspect what it actually migrates.
        if profile is not None:
            tools_c, tools_o, tools_g = TOOLS_CLAUDE, TOOLS_OPENAI, TOOLS_GEMINI
        else:
            tools_c, tools_o, tools_g = TOOLS_CLAUDE_SRC, TOOLS_OPENAI_SRC, TOOLS_GEMINI_SRC
    elif profile is not None:
        stable, variable = build_system(
            profile, source_path, context_md, repo_path, perspective, response_language,
            user_ctx=user_ctx,
            active_company_name=active_company_name,
            project_context=getattr(profile, "project_context", None),
        )
        tools_c  = TOOLS_CLAUDE
        tools_o  = TOOLS_OPENAI
        tools_g  = TOOLS_GEMINI
    else:
        stable, variable = build_system_general(
            version or "?", source_path, context_md, repo_path, perspective, response_language,
            user_ctx=user_ctx,
        )
        tools_c  = TOOLS_CLAUDE_SRC
        tools_o  = TOOLS_OPENAI_SRC
        tools_g  = TOOLS_GEMINI_SRC

    # For non-Claude providers (no explicit cache_control), concatenate the
    # two halves. _chat_claude receives them as a tuple and assembles a
    # 2-block system with an ephemeral cache_control on the stable half.
    system: object = (stable, variable) if provider == "claude" else f"{stable}\n\n{variable}".strip()

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

    # Append the live-instance inspection tools (Studio, views, reports) whenever
    # a live Odoo connection is available — both project assistance and
    # project-mode migration, where they drive the migration-effort analysis.
    if profile is not None:
        tools_c = tools_c + STUDIO_TOOLS_CLAUDE + VIEW_TOOLS_CLAUDE
        tools_o = tools_o + STUDIO_TOOLS_OPENAI + VIEW_TOOLS_OPENAI
        tools_g = [{"function_declarations": (
            tools_g[0]["function_declarations"]
            + STUDIO_FUNCTION_DECLARATIONS + VIEW_FUNCTION_DECLARATIONS
        )}]

    # ── Filtrage des skills désactivés par l'utilisateur ─────────────
    _disabled = set(disabled_tools or [])
    if _disabled:
        tools_c = [t for t in tools_c if t.get("name") not in _disabled]
        tools_o = [t for t in tools_o if t.get("function", {}).get("name") not in _disabled]
        if tools_g and tools_g[0].get("function_declarations"):
            tools_g = [{"function_declarations": [
                fd for fd in tools_g[0]["function_declarations"]
                if fd.get("name") not in _disabled
            ]}]

        # Ajouter un rappel dans le prompt système pour que l'IA suggère
        # de réactiver les skills désactivés quand cela améliorerait la réponse.
        _disabled_labels = ", ".join(sorted(_disabled))
        _hint = (
            f"\n\n## Skills désactivés par l'utilisateur\n"
            f"Les outils suivants ont été désactivés : {_disabled_labels}. "
            "Si la question de l'utilisateur bénéficierait d'un de ces outils, "
            "mentionne-le brièvement et invite-le à les réactiver dans "
            "Paramètres → Skills."
        )
        if isinstance(system, tuple):
            # Claude : (stable, variable) — on ajoute au bloc variable (ephémère)
            system = (system[0], system[1] + _hint)
        else:
            system = system + _hint

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
