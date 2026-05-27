import asyncio
import json
import logging
import os
import re
from typing import AsyncIterator, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..services.odoo_client import OdooClient

from .attachment_service import apply_provider_attachments
from .provider_adapters import get_provider_adapter
from .skill_runtime import (
    SkillRuntimeEvent,
    drain_runtime_events,
    log_runtime_event,
    monotonic_ms,
    reset_runtime_event_buffer,
    start_runtime_event_buffer,
)
from .execution_engine import run_tool as _run_tool
from .toolset_builder import ToolSetInputs, build_provider_toolsets
from ..skills.registry import canonical_skill_name
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
    "name": "odoo_query_records",
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
    "name": "odoo_count_records",
    "description": "Compter les enregistrements Odoo correspondant à un domaine.",
}
_TOOL_READ_GROUP = {
    "name": "odoo_aggregate_records",
    "description": (
        "Calculer des agrégats Odoo avec read_group : sommes, moyennes et comptages "
        "groupés par statut, date, commercial, journal, projet, etc. Utilise cet outil "
        "pour les KPI fiables au lieu d'additionner un échantillon search_read.\n"
        "Paramètres : model, domain, fields (ex: ['amount_total:sum','state']), "
        "groupby (ex: ['state'] ou ['date_order:month']), limit, orderby, lazy."
    ),
}
_TOOL_FIELDS = {
    "name": "odoo_inspect_fields",
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
    "name": "odoo_inspect_modules",
    "description": (
        "Lister les modules installés sur l'instance connectée : applications, modules "
        "techniques, version installée, auteur et modules custom probables. Utilise-le "
        "pour cadrer le périmètre réel d'une instance, surtout en migration."
    ),
}
_TOOL_INSPECT_SECURITY = {
    "name": "odoo_inspect_security",
    "description": (
        "Inspecter la sécurité d'un modèle Odoo : entrée ir.model, ACL (ir.model.access), "
        "record rules (ir.rule) et groupes associés. Utilise cet outil pour diagnostiquer "
        "droits d'accès, visibilité partielle, multi-société ou boutons/actions absents. "
        "Si la question porte sur la sécurité de modules custom sans modèle exact, découvre "
        "d'abord les modules/fichiers avec repo_list_modules et repo_search_code, "
        "puis appelle odoo_inspect_security pour chaque modèle métier identifié."
    ),
}
_TOOL_INSPECT_MENUS = {
    "name": "odoo_inspect_navigation",
    "description": (
        "Retrouver les menus et actions fenêtre qui exposent un modèle ou un écran. "
        "Utilise cet outil pour répondre à 'où cliquer', valider une navigation ou "
        "identifier les vues rattachées à une action."
    ),
}
_TOOL_SEARCH_SRC = {
    "name": "source_search_odoo",
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
    "name": "source_read_odoo_file",
    "description": (
        "Lire le contenu d'un fichier du code source Odoo local. "
        "Utilise après source_search_odoo pour voir l'implémentation complète."
    ),
}
_TOOL_SEARCH_REPO = {
    "name": "repo_search_code",
    "description": (
        "Rechercher dans le code source du projet client (modules custom, overrides, configurations). "
        "Utilise pour trouver des modèles custom, des surcharges de méthodes Odoo, des vues modifiées, ou toute logique métier spécifique au client. "
        "Retourne les lignes correspondantes avec fichier et numéro de ligne.\n"
        "IMPORTANT — pour lister les modules custom du projet, utilise file_types=['__manifest__.py'] avec pattern='name' : "
        "cela cherche les lignes contenant 'name' DANS les fichiers __manifest__.py (un par module).\n"
        "Exemples :\n"
        "- Lister tous les modules custom : repo_search_code(pattern='name', file_types=['__manifest__.py'])\n"
        "- Trouver un override : repo_search_code(pattern='_inherit', file_types=['*.py'])\n"
        "- Chercher un modèle : repo_search_code(pattern=\"_name = 'sale.order'\", file_types=['*.py'])"
    ),
}
_TOOL_READ_REPO = {
    "name": "repo_read_file",
    "description": (
        "Lire le contenu d'un fichier du code source du projet client (module custom). "
        "Utilise après repo_search_code pour voir l'implémentation complète d'un override ou d'un module custom. "
        "Le chemin est relatif depuis la racine du dépôt cloné."
    ),
}
_TOOL_LIST_PROJECT_MODULES = {
    "name": "repo_list_modules",
    "description": (
        "Parser les fichiers __manifest__.py / __openerp__.py du dépôt client pour "
        "lister les modules custom, dépendances, fichiers data/demo, assets, licence "
        "et statut installable. Préfère cet outil à un grep quand tu dois inventorier "
        "le dépôt projet."
    ),
}

_TOOL_GIT_SHOW = {
    "name": "source_show_commit",
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
    "name": "odoo_inspect_studio",
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
        "- Tout inspecter : odoo_inspect_studio(sections=['all'])\n"
        "- Seulement les champs custom : odoo_inspect_studio(sections=['fields'])\n"
        "- Modèles + vues : odoo_inspect_studio(sections=['models','views'])\n"
        "- Filtrer par modèle : odoo_inspect_studio(sections=['fields'], model_filter='sale.')"
    ),
}

_TOOL_COUNT_LINES = {
    "name": "repo_count_source_lines",
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
        "- Total Python du projet client : repo_count_source_lines(scope='project', file_types=['*.py'], group_by='module')\n"
        "- Volumétrie par extension du repo : repo_count_source_lines(scope='project', file_types=['*.py','*.xml','*.js','*.scss'], group_by='extension')\n"
        "- LOC d'un module précis : repo_count_source_lines(scope='project', path='mon_module', file_types=['*.py'], group_by='directory')"
    ),
}

_TOOL_INSPECT_VIEW = {
    "name": "odoo_inspect_view",
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
        "Paramètres : skill (nom technique du skill, ex 'odoo_inspect_studio'), filename "
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

_TOOL_EXTRACT_PDF_TEXT = {
    "name": "extract_pdf_text",
    "description": (
        "Extraire le texte d'un PDF uploadé par le consultant dans cette conversation. "
        "Utiliser quand l'utilisateur demande explicitement le contenu textuel, ou pour "
        "parser des données structurées d'une facture/devis. Le `attachment_name` doit "
        "être exactement le nom du fichier visible dans la dernière requête utilisateur. "
        "Sur Claude/Gemini qui voient déjà le PDF nativement, ce tool reste utile pour "
        "obtenir une version texte propre et citable."
    ),
}

_TOOL_PDF_TO_IMAGES = {
    "name": "pdf_to_images",
    "description": (
        "Convertir certaines pages d'un PDF uploadé en images PNG (via pdf2image). "
        "Utile pour cibler une page précise (« montre-moi la page 3 »), pour relire "
        "visuellement un PDF scanné dont l'extraction texte est faible, ou pour zoomer "
        "sur un détail de mise en page. Cap à 10 pages par appel. "
        "Paramètres : attachment_name, pages (optionnel, liste ou range '1-3,5'), dpi (défaut 120)."
    ),
}

_TOOL_COMPARE_DOCUMENTS = {
    "name": "compare_documents",
    "description": (
        "Comparer deux PDFs uploadés. mode='text' produit un diff unifié ligne par ligne "
        "(rapide, déterministe, bon sur des documents textuels comme des devis générés). "
        "mode='structure' détecte les sections (headings, numérotation) et compare section "
        "par section (meilleur sur des rapports / contrats). Retourne similarity + diff. "
        "Pour une comparaison visuelle (mise en page, logos), demander plutôt `pdf_to_images` "
        "sur chaque document et laisser la vision du LLM faire le diff."
    ),
}

_TOOL_INSPECT_REPORT = {
    "name": "odoo_inspect_report",
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

_TOOL_COMPARE_VERSIONS = {
    "name": "compare_odoo_versions",
    "description": (
        "Comparer statiquement deux versions Odoo locales pour un modèle, une vue XML ou un module. "
        "Utilise cet outil pour un cadrage migration quand l'utilisateur demande ce qui change entre versions "
        "(ex 17.0 vers 18.0). Paramètres : target ('model:sale.order', 'view:xml_id', 'module:sale'), "
        "from_version, to_version, scope ('odoo' ou 'enterprise')."
    ),
}

_TOOL_INSPECT_AUTOMATIONS = {
    "name": "inspect_automations",
    "description": (
        "Auditer les automatismes serveur de l'instance connectée : ir.cron, base.automation, "
        "ir.actions.server et mail.template. Utilise cet outil pour lister crons, actions serveur, "
        "automated actions et templates mail, avec filtres module, modèle et actif. Paramètres : "
        "kind ('cron','automation','server_action','mail_template','all'), module, model, active_only."
    ),
}

_TOOL_INSPECT_MODULE_GRAPH = {
    "name": "inspect_module_graph",
    "description": (
        "Construire le graphe d'architecture d'un module Odoo : dépendances manifest depends, cycles, "
        "classes modèles et héritages _inherit/_inherits, avec sortie Mermaid. Paramètres : module, "
        "scope ('odoo','enterprise','project'), depth, include_inheritance."
    ),
}

_TOOL_GENERATE_DIAGRAM = {
    "name": "generate_diagram",
    "description": (
        "Générer un diagramme Mermaid affichable dans la réponse : flowchart, classDiagram, héritage "
        "de modèle, héritage de vue live ou graphe de module. Utilise cet outil quand l'utilisateur "
        "demande de dessiner, visualiser, montrer un schéma, flowchart ou graphe. Paramètres : kind, "
        "target, scope, description, max_nodes."
    ),
}

_TOOL_INSPECT_FINANCIAL_REPORTS = {
    "name": "inspect_financial_reports",
    "description": (
        "Lister, recommander, décrire, exécuter ou exporter les rapports financiers Enterprise account.report : "
        "bilan, compte de résultat/P&L, grand livre, tax report/TVA, aged receivable/payable. "
        "Utilise cet outil pour les états financiers avec filtres période, partenaire, analytique, société ou journal."
    ),
}

_TOOL_INSPECT_SPREADSHEET = {
    "name": "inspect_spreadsheet",
    "description": (
        "Lister et inspecter les Odoo Spreadsheets et dashboards, lire le payload JSON/XLSX, inventorier les "
        "formules ODOO.PIVOT / ODOO.LIST / ODOO.FILTER.VALUE, expliquer ou suggérer une formule Odoo Spreadsheet."
    ),
}

_COMPARE_VERSION_PROPS = {
    "target": {"type": "string", "description": "model:sale.order, view:xml_id ou module:sale"},
    "from_version": {"type": "string", "description": "Version source locale, ex 17.0"},
    "to_version": {"type": "string", "description": "Version cible locale, ex 18.0"},
    "scope": {"type": "string", "enum": ["odoo", "enterprise"], "default": "odoo"},
}

_AUTOMATION_PROPS = {
    "kind": {"type": "string", "enum": ["cron", "automation", "server_action", "mail_template", "all"], "default": "all"},
    "module": {"type": "string", "default": ""},
    "model": {"type": "string", "default": ""},
    "active_only": {"type": "boolean", "default": True},
}

_MODULE_GRAPH_PROPS = {
    "module": {"type": "string"},
    "scope": {"type": "string", "enum": ["odoo", "enterprise", "project"], "default": "odoo"},
    "depth": {"type": "integer", "default": 2},
    "include_inheritance": {"type": "boolean", "default": True},
}

_DIAGRAM_PROPS = {
    "kind": {"type": "string", "enum": ["flow", "class", "model-inheritance", "view-inheritance", "module-graph"]},
    "target": {"type": "string", "default": ""},
    "scope": {"type": "string", "enum": ["odoo", "enterprise", "project", "live"], "default": "odoo"},
    "description": {"type": "string", "default": ""},
    "max_nodes": {"type": "integer", "default": 25},
}

_FINANCIAL_REPORT_PROPS = {
    "action": {"type": "string", "enum": ["list", "recommend", "describe", "run", "export"], "default": "list"},
    "report": {"type": "string", "description": "ID ou nom du rapport account.report", "default": ""},
    "query": {"type": "string", "description": "Demande libre pour recommend", "default": ""},
    "options": {"type": "object", "description": "date_from, date_to, partner_ids, analytic_account_ids, company_ids, journal_ids, unfold_all, comparison", "default": {}},
}

_SPREADSHEET_PROPS = {
    "action": {"type": "string", "enum": ["list", "inspect", "explain_formula", "suggest_formula"], "default": "list"},
    "document_id": {"type": "integer", "default": 0},
    "model": {"type": "string", "enum": ["documents.document", "spreadsheet.dashboard"], "default": "documents.document"},
    "formula": {"type": "string", "default": ""},
    "query": {"type": "string", "default": ""},
    "model_hint": {"type": "string", "default": ""},
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
    {**_TOOL_COMPARE_VERSIONS, "input_schema": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
    {**_TOOL_INSPECT_AUTOMATIONS, "input_schema": {"type": "object", "properties": _AUTOMATION_PROPS}},
    {**_TOOL_INSPECT_MODULE_GRAPH, "input_schema": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
    {**_TOOL_GENERATE_DIAGRAM, "input_schema": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
    {**_TOOL_INSPECT_FINANCIAL_REPORTS, "input_schema": {"type": "object", "properties": _FINANCIAL_REPORT_PROPS}},
    {**_TOOL_INSPECT_SPREADSHEET, "input_schema": {"type": "object", "properties": _SPREADSHEET_PROPS}},
    {**_TOOL_LOAD_REFERENCE, "input_schema": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string", "description": "Nom technique du skill (ex 'odoo_inspect_studio')"},
        "filename": {"type": "string", "description": "Nom de fichier de référence (ex 'studio_limits.md')"},
    }}},
    {**_TOOL_RUN_SCRIPT, "input_schema": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string", "description": "Nom technique du skill"},
        "filename": {"type": "string", "description": "Nom du script (ex 'scan_studio_customizations.py')"},
        "args":     {"type": "array",  "items": {"type": "string"}, "description": "Arguments CLI", "default": []},
    }}},
    {**_TOOL_EXTRACT_PDF_TEXT, "input_schema": {"type": "object", "required": ["attachment_name"], "properties": {
        "attachment_name": {"type": "string", "description": "Nom exact du PDF uploadé (ex 'facture-acme.pdf')"},
        "pages":           {"type": "string", "description": "Pages à extraire (ex '1,2,5-7'). Vide = toutes.", "default": ""},
    }}},
    {**_TOOL_PDF_TO_IMAGES, "input_schema": {"type": "object", "required": ["attachment_name"], "properties": {
        "attachment_name": {"type": "string"},
        "pages":           {"type": "string", "description": "Pages à convertir. Vide = toutes (cap 10).", "default": ""},
        "dpi":             {"type": "integer", "description": "DPI (60-240, défaut 120).", "default": 120},
    }}},
    {**_TOOL_COMPARE_DOCUMENTS, "input_schema": {"type": "object", "required": ["name_a", "name_b"], "properties": {
        "name_a": {"type": "string"},
        "name_b": {"type": "string"},
        "mode":   {"type": "string", "enum": ["text", "structure"], "default": "text"},
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
    {"type": "function", "function": {**_TOOL_COMPARE_VERSIONS, "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_AUTOMATIONS, "parameters": {"type": "object", "properties": _AUTOMATION_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_MODULE_GRAPH, "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}}},
    {"type": "function", "function": {**_TOOL_GENERATE_DIAGRAM, "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_FINANCIAL_REPORTS, "parameters": {"type": "object", "properties": _FINANCIAL_REPORT_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_SPREADSHEET, "parameters": {"type": "object", "properties": _SPREADSHEET_PROPS}}},
    {"type": "function", "function": {**_TOOL_LOAD_REFERENCE, "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string"},
        "filename": {"type": "string"},
    }}}},
    {"type": "function", "function": {**_TOOL_RUN_SCRIPT, "parameters": {"type": "object", "required": ["skill", "filename"], "properties": {
        "skill":    {"type": "string"},
        "filename": {"type": "string"},
        "args":     {"type": "array",  "items": {"type": "string"}, "default": []},
    }}}},
    {"type": "function", "function": {**_TOOL_EXTRACT_PDF_TEXT, "parameters": {"type": "object", "required": ["attachment_name"], "properties": {
        "attachment_name": {"type": "string"},
        "pages":           {"type": "string", "default": ""},
    }}}},
    {"type": "function", "function": {**_TOOL_PDF_TO_IMAGES, "parameters": {"type": "object", "required": ["attachment_name"], "properties": {
        "attachment_name": {"type": "string"},
        "pages":           {"type": "string", "default": ""},
        "dpi":             {"type": "integer", "default": 120},
    }}}},
    {"type": "function", "function": {**_TOOL_COMPARE_DOCUMENTS, "parameters": {"type": "object", "required": ["name_a", "name_b"], "properties": {
        "name_a": {"type": "string"},
        "name_b": {"type": "string"},
        "mode":   {"type": "string", "enum": ["text", "structure"], "default": "text"},
    }}}},
]

# ── Gemini tool schemas ───────────────────────────────────────────

TOOLS_GEMINI = [
    {
        "function_declarations": [
            {"name": "odoo_query_records",    "description": _TOOL_QUERY["description"],
             "parameters": {"type": "object", "required": ["model", "fields"], "properties": {
                 "model":  {"type": "string"},  "domain": {"type": "array"},
                 "fields": {"type": "array"},   "limit":  {"type": "integer"},
                 "offset": {"type": "integer"}, "order":  {"type": "string"},
                 "page_size": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "odoo_count_records",   "description": _TOOL_COUNT["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model":  {"type": "string"}, "domain": {"type": "array"},
             }}},
            {"name": "odoo_aggregate_records", "description": _TOOL_READ_GROUP["description"],
             "parameters": {"type": "object", "required": ["model", "fields", "groupby"], "properties": {
                 "model": {"type": "string"}, "domain": {"type": "array"},
                 "fields": {"type": "array"}, "groupby": {"type": "array"},
                 "limit": {"type": "integer"}, "offset": {"type": "integer"},
                 "orderby": {"type": "string"}, "lazy": {"type": "boolean"},
             }}},
            {"name": "odoo_inspect_fields", "description": _TOOL_FIELDS["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
                 "field_names": {"type": "array"},
                 "max_fields": {"type": "integer"},
             }}},
            {"name": "odoo_inspect_modules", "description": _TOOL_INSTALLED_MODULES["description"],
             "parameters": {"type": "object", "properties": {
                 "filter": {"type": "string"}, "apps_only": {"type": "boolean"},
                 "limit": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "odoo_inspect_security", "description": _TOOL_INSPECT_SECURITY["description"],
             "parameters": {"type": "object", "required": ["model"], "properties": {
                 "model": {"type": "string"},
             }}},
            {"name": "odoo_inspect_navigation", "description": _TOOL_INSPECT_MENUS["description"],
             "parameters": {"type": "object", "properties": {
                 "model": {"type": "string"}, "query": {"type": "string"},
                 "limit": {"type": "integer"}, "max_records": {"type": "integer"},
             }}},
            {"name": "source_search_odoo", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
                 "case_sensitive": {"type": "boolean"},
                 "max_matches": {"type": "integer"},
                 "max_matches": {"type": "integer"},
             }}},
            {"name": "source_read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
                 "max_lines":  {"type": "integer"},
                 "max_lines":  {"type": "integer"},
             }}},
            {"name": "source_show_commit", "description": _TOOL_GIT_SHOW["description"],
             "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
                 "sha":       {"type": "string"},
                 "scope":     {"type": "string"},
                 "max_lines": {"type": "integer"},
             }}},
            {"name": "compare_odoo_versions", "description": _TOOL_COMPARE_VERSIONS["description"],
             "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
            {"name": "inspect_automations", "description": _TOOL_INSPECT_AUTOMATIONS["description"],
             "parameters": {"type": "object", "properties": _AUTOMATION_PROPS}},
            {"name": "inspect_module_graph", "description": _TOOL_INSPECT_MODULE_GRAPH["description"],
             "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
            {"name": "generate_diagram", "description": _TOOL_GENERATE_DIAGRAM["description"],
             "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
            {"name": "inspect_financial_reports", "description": _TOOL_INSPECT_FINANCIAL_REPORTS["description"],
             "parameters": {"type": "object", "properties": _FINANCIAL_REPORT_PROPS}},
            {"name": "inspect_spreadsheet", "description": _TOOL_INSPECT_SPREADSHEET["description"],
             "parameters": {"type": "object", "properties": _SPREADSHEET_PROPS}},
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
            {"name": "extract_pdf_text", "description": _TOOL_EXTRACT_PDF_TEXT["description"],
             "parameters": {"type": "object", "required": ["attachment_name"], "properties": {
                 "attachment_name": {"type": "string"},
                 "pages":           {"type": "string"},
             }}},
            {"name": "pdf_to_images", "description": _TOOL_PDF_TO_IMAGES["description"],
             "parameters": {"type": "object", "required": ["attachment_name"], "properties": {
                 "attachment_name": {"type": "string"},
                 "pages":           {"type": "string"},
                 "dpi":             {"type": "integer"},
             }}},
            {"name": "compare_documents", "description": _TOOL_COMPARE_DOCUMENTS["description"],
             "parameters": {"type": "object", "required": ["name_a", "name_b"], "properties": {
                 "name_a": {"type": "string"},
                 "name_b": {"type": "string"},
                 "mode":   {"type": "string"},
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
    {**_TOOL_COMPARE_VERSIONS, "input_schema": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
    {**_TOOL_INSPECT_MODULE_GRAPH, "input_schema": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
    {**_TOOL_GENERATE_DIAGRAM, "input_schema": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
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
    {"type": "function", "function": {**_TOOL_COMPARE_VERSIONS, "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}}},
    {"type": "function", "function": {**_TOOL_INSPECT_MODULE_GRAPH, "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}}},
    {"type": "function", "function": {**_TOOL_GENERATE_DIAGRAM, "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}}},
]

TOOLS_GEMINI_SRC = [
    {
        "function_declarations": [
            {"name": "source_search_odoo", "description": _TOOL_SEARCH_SRC["description"],
             "parameters": {"type": "object", "required": ["pattern"], "properties": {
                 "pattern":    {"type": "string"},
                 "path":       {"type": "string"},
                 "file_types": {"type": "array"},
                 "case_sensitive": {"type": "boolean"},
             }}},
            {"name": "source_read_odoo_file", "description": _TOOL_READ_SRC["description"],
             "parameters": {"type": "object", "required": ["path"], "properties": {
                 "path":       {"type": "string"},
                 "start_line": {"type": "integer"},
                 "end_line":   {"type": "integer"},
             }}},
            {"name": "source_show_commit", "description": _TOOL_GIT_SHOW["description"],
             "parameters": {"type": "object", "required": ["sha", "scope"], "properties": {
                 "sha":       {"type": "string"},
                 "scope":     {"type": "string"},
                 "max_lines": {"type": "integer"},
             }}},
            {"name": "compare_odoo_versions", "description": _TOOL_COMPARE_VERSIONS["description"],
             "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
            {"name": "inspect_module_graph", "description": _TOOL_INSPECT_MODULE_GRAPH["description"],
             "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
            {"name": "generate_diagram", "description": _TOOL_GENERATE_DIAGRAM["description"],
             "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
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
    {**_TOOL_INSPECT_MODULE_GRAPH, "input_schema": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
    {**_TOOL_GENERATE_DIAGRAM, "input_schema": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
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
    {"type": "function", "function": {**_TOOL_INSPECT_MODULE_GRAPH, "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}}},
    {"type": "function", "function": {**_TOOL_GENERATE_DIAGRAM, "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}}},
]
REPO_FUNCTION_DECLARATIONS = [
    {"name": "repo_search_code", "description": _TOOL_SEARCH_REPO["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
         "case_sensitive": {"type": "boolean"}, "max_matches": {"type": "integer"},
     }}},
    {"name": "repo_read_file", "description": _TOOL_READ_REPO["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}, "max_lines": {"type": "integer"},
     }}},
    {"name": "repo_list_modules", "description": _TOOL_LIST_PROJECT_MODULES["description"],
     "parameters": {"type": "object", "properties": {
         "path": {"type": "string"}, "include_invalid": {"type": "boolean"}, "limit": {"type": "integer"},
     }}},
    {"name": "inspect_module_graph", "description": _TOOL_INSPECT_MODULE_GRAPH["description"],
     "parameters": {"type": "object", "required": ["module"], "properties": _MODULE_GRAPH_PROPS}},
    {"name": "generate_diagram", "description": _TOOL_GENERATE_DIAGRAM["description"],
     "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
]

# ── Migration target tool schemas ─────────────────────────────────

_TOOL_SEARCH_TARGET = {
    "name": "migration_search_target_source",
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
    "name": "migration_read_target_file",
    "description": (
        "Lire le contenu d'un fichier du code source de la VERSION CIBLE de la migration. "
        "Utilise après migration_search_target_source pour voir l'implémentation complète dans la version d'arrivée."
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
    {**_TOOL_COMPARE_VERSIONS, "input_schema": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
    {**_TOOL_GENERATE_DIAGRAM, "input_schema": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
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
    {"type": "function", "function": {**_TOOL_COMPARE_VERSIONS, "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}}},
    {"type": "function", "function": {**_TOOL_GENERATE_DIAGRAM, "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}}},
]
TARGET_FUNCTION_DECLARATIONS = [
    {"name": "migration_search_target_source", "description": _TOOL_SEARCH_TARGET["description"],
     "parameters": {"type": "object", "required": ["pattern"], "properties": {
         "pattern": {"type": "string"}, "path": {"type": "string"}, "file_types": {"type": "array"},
         "case_sensitive": {"type": "boolean"}, "max_matches": {"type": "integer"},
     }}},
    {"name": "migration_read_target_file", "description": _TOOL_READ_TARGET["description"],
     "parameters": {"type": "object", "required": ["path"], "properties": {
         "path": {"type": "string"}, "start_line": {"type": "integer"}, "end_line": {"type": "integer"}, "max_lines": {"type": "integer"},
     }}},
    {"name": "compare_odoo_versions", "description": _TOOL_COMPARE_VERSIONS["description"],
     "parameters": {"type": "object", "required": ["target", "from_version", "to_version"], "properties": _COMPARE_VERSION_PROPS}},
    {"name": "generate_diagram", "description": _TOOL_GENERATE_DIAGRAM["description"],
     "parameters": {"type": "object", "required": ["kind"], "properties": _DIAGRAM_PROPS}},
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
    {"name": "repo_count_source_lines", "description": _TOOL_COUNT_LINES["description"],
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
    {"name": "odoo_inspect_studio", "description": _TOOL_INSPECT_STUDIO["description"],
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
    {"name": "odoo_inspect_view", "description": _TOOL_INSPECT_VIEW["description"],
     "parameters": {"type": "object", "required": ["model"], "properties": {
         "model": {"type": "string"}, "view_type": {"type": "string"}, "view_id": {"type": "integer"},
     }}},
    {"name": "odoo_inspect_report", "description": _TOOL_INSPECT_REPORT["description"],
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


def _toolset_inputs(base_claude, base_openai, base_gemini) -> ToolSetInputs:
    return ToolSetInputs(
        base_claude=base_claude,
        base_openai=base_openai,
        base_gemini=base_gemini,
        repo_claude=REPO_TOOLS_CLAUDE,
        repo_openai=REPO_TOOLS_OPENAI,
        repo_gemini_declarations=REPO_FUNCTION_DECLARATIONS,
        target_claude=TARGET_TOOLS_CLAUDE,
        target_openai=TARGET_TOOLS_OPENAI,
        target_gemini_declarations=TARGET_FUNCTION_DECLARATIONS,
        count_claude=COUNT_TOOLS_CLAUDE,
        count_openai=COUNT_TOOLS_OPENAI,
        count_gemini_declarations=COUNT_FUNCTION_DECLARATIONS,
        studio_claude=STUDIO_TOOLS_CLAUDE,
        studio_openai=STUDIO_TOOLS_OPENAI,
        studio_gemini_declarations=STUDIO_FUNCTION_DECLARATIONS,
        view_claude=VIEW_TOOLS_CLAUDE,
        view_openai=VIEW_TOOLS_OPENAI,
        view_gemini_declarations=VIEW_FUNCTION_DECLARATIONS,
    )


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
    """Resolve a perspective string to a known agent name.

    Sources, in order:
    1. The agent registry (folder-backed personas with aliases).
    2. The legacy hardcoded ``_VALID_PERSPECTIVES`` / ``_LEGACY_PERSPECTIVE_ALIASES``
       constants — kept as a fallback so tests stay green even if the catalog
       directory is unavailable.
    Defaults to ``developer`` when nothing matches."""
    if p:
        try:
            from ..agents import get_agent as _get_agent
            ag = _get_agent(p)
            if ag is not None:
                return ag.name
        except Exception:
            pass
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


def _term_matches(text: str, term: str) -> bool:
    """Substring match for multi-word phrases, word-boundary match for short
    single-word tokens (≤4 chars or any pure alphanumeric short word).

    The boundary guard avoids classic false positives like ``adr`` matching
    inside ``cadrer`` or ``pra`` matching inside ``rapprochement`` while
    keeping the cheap substring behaviour for longer / multi-word terms
    such as ``"stratégie de migration"`` or ``"_inherit"``."""
    if not term:
        return False
    needs_boundary = len(term) <= 4 and term.isalnum()
    if not needs_boundary:
        return term in text
    import re as _re
    return _re.search(rf"(?<!\w){_re.escape(term)}(?!\w)", text) is not None


def _score_terms(text: str, weak: tuple[str, ...], strong: tuple[str, ...]) -> int:
    n = 0
    for t in weak:
        if _term_matches(text, t):
            n += 1
    for t in strong:
        if _term_matches(text, t):
            n += 3
    return n


# Incident-framing tokens that are *behaviour* descriptors of a production
# problem rather than business-domain nouns. They survive paraphrase (real
# tickets use this vocabulary) and don't appear in the business analyst
# strong/weak lists, so detecting ≥2 of them is a high-precision signal that
# the prompt is a support / run incident — even when the prompt also mentions
# heavy BA nouns like "factures" or "comptable".
_INCIDENT_FRAMING_TERMS: tuple[str, ...] = (
    "erreur 500", "erreur 404", "erreur 403", "internal server error",
    "page blanche", "écran blanc", "login impossible", "connexion impossible",
    "ne fonctionne pas", "ne marche pas", "plante", "crashe", "freeze",
    "timeout", "renvoie une erreur", "renvoie une 404", "renvoie une 403",
    "renvoie 404", "renvoie 403", "tombent sur une 404", "tombent sur une 403",
    "tourne en boucle", "ne se synchronise", "ne récupère plus", "ne recupere plus",
    "ne reçoivent", "ne recoivent", "ne reçoit pas", "ne recoit pas",
    "bouton grisé", "n'apparaissent pas", "a disparu", "ne voit pas",
    "ne reprend pas", "invalid field", "external id not found",
    "est faux", "sont faux", "affiche une erreur", "affichent une erreur",
    "depuis ce matin", "depuis hier", "depuis vendredi", "après l'update",
    "apres l'update", "après la mise à jour", "apres la mise a jour",
    "après migration", "apres migration", "depuis l'update", "depuis le déploiement",
    "hors service", "inaccessible", "panne", "sla", "lenteur",
    "tombent sur", "n'arrive plus", "narrive plus", "reste bloqué",
    "restent bloquées", "restent bloquees", "n'arrive pas à", "narrive pas a",
    "bloque avec", "bloque sur", "ne plus pouvoir", "erreur de capture",
    "échoue avec", "echoue avec",
)


# Strategy / trade-off framing tokens. These describe an *architectural*
# decision shape (compare options, define a strategy, draw a blueprint) and
# don't appear in the BA strong lists. They map a prompt to Architect even
# when it also mentions BA-flavoured nouns (factures, client, processus, …).
_STRATEGY_FRAMING_TERMS: tuple[str, ...] = (
    "adr", "trade-off", "tradeoff", "blueprint", "feuille de route", "roadmap",
    "stratégie de migration", "strategie de migration", "stratégie edi",
    "strategie edi", "stratégie performance", "strategie performance",
    "stratégie de tests", "strategie de tests", "stratégie backup",
    "strategie backup", "frontière entre studio", "frontiere entre studio",
    "frontière studio", "frontiere studio", "frontière entre", "frontiere entre",
    "ownership", "graphe de dépendances", "graphe de dependances",
    "stack reporting", "comparer odoo", "comparer entre", "choisir entre",
    "rester en community", "passer enterprise", "community vs enterprise",
    "community ou enterprise", "oca vs", "on-premise", "on premise",
    "odoo.sh", "hébergement", "hebergement", "haute disponibilité",
    "haute disponibilite", "multi-société", "multi-societe", "multi-pays",
    "multi pays", "registre des risques", "orchestrer ba", "reporting consolidé",
    "reporting consolide", "dessine un diagramme", "diagramme du flux",
    "blueprint odoo", "cutover", "rollout", "consolidation",
)


# Code-artefact framing tokens. These describe a code-level *deliverable* (a
# controller, a CSV, an ORM method, a formula) rather than a business
# question about a feature. Used to route developer-coded asks that would
# otherwise look BA-shaped because they mention "facture" or "client".
_CODE_ARTEFACT_FRAMING_TERMS: tuple[str, ...] = (
    "controller", "controllers", "controller portal", "ir.model.access",
    "ir.model.access.csv", "record rule", "modifiers", "onchange",
    "compute stocké", "compute stocke", "_compute", "_inherit", "_inherits",
    "@api.depends", "@api.constrains", "@api.model", "@api.onchange",
    "post_init_hook", "queue_job", "with_company", "safe_eval", "xpath",
    "qweb", "read_group", "search_read", "search dans chaque", "boucle qui fait search",
    "script de migration", "odoo.pivot", "odoo.read_group", "=odoo",
    "template mail", "mail.template", "external id not found", "xmlid",
    "prefetch", "self.env", "env[", "browse(", "recordset",
    "psycopg", "@api", "__manifest__",
)


def _count_framing(text: str, terms: tuple[str, ...]) -> int:
    if not text:
        return 0
    return sum(1 for t in terms if _term_matches(text, t))


def _count_incident_framing(text: str) -> int:
    """Return how many incident-framing tokens are present in ``text``.

    Used as a high-precision tie-breaker in ``_infer_perspective``: a prompt
    with ≥2 incident-framing hits should route to the Support agent even when
    it mentions business-domain nouns (factures, stock, comptable, …) that
    would otherwise pull the Business Analyst agent.
    """
    if not text:
        return 0
    return sum(1 for t in _INCIDENT_FRAMING_TERMS if _term_matches(text, t))


# ── Explicit-prompt agent detection ──────────────────────────
# Patterns FR + EN that should short-circuit the keyword scoring loop and
# pick the named agent with confidence=high (BETTER §4.2). Matches phrases
# like "réponds comme un architecte", "passe en mode developer",
# "answer as a business analyst", "switch to support mode".
_EXPLICIT_AGENT_PATTERNS: tuple[tuple[str, str], ...] = (
    # FR — "réponds/réagis/parle comme un[e] <rôle>"
    (PERSPECTIVE_SUPPORT,    r"comme\s+un[e]?\s+(?:agent\s+)?support"),
    (PERSPECTIVE_BA,         r"comme\s+un[e]?\s+(?:business[\s-]?analyst|analyste\s+m[ée]tier|application\s+manager|consultant[e]?\s+fonctionnel)"),
    (PERSPECTIVE_ARCHITECT,  r"comme\s+un[e]?\s+architecte"),
    (PERSPECTIVE_DEVELOPER,  r"comme\s+un[e]?\s+(?:d[ée]veloppeur|developer|dev)\b"),
    # FR — "passe/passons en mode <rôle>" / "mode <rôle>"
    (PERSPECTIVE_SUPPORT,    r"\bmode\s+support\b"),
    (PERSPECTIVE_BA,         r"\bmode\s+(?:business[\s-]?analyst|analyste\s+m[ée]tier|ba|am)\b"),
    (PERSPECTIVE_ARCHITECT,  r"\bmode\s+(?:architect|architecte)\b"),
    (PERSPECTIVE_DEVELOPER,  r"\bmode\s+(?:developer|d[ée]veloppeur|dev)\b"),
    # EN — "answer as a <role>" / "respond as a <role>" / "switch to <role> mode"
    (PERSPECTIVE_SUPPORT,    r"\bas\s+(?:an?\s+)?support\b"),
    (PERSPECTIVE_BA,         r"\bas\s+(?:an?\s+)?business[\s-]?analyst\b"),
    (PERSPECTIVE_ARCHITECT,  r"\bas\s+(?:an?\s+)?architect\b"),
    (PERSPECTIVE_DEVELOPER,  r"\bas\s+(?:an?\s+)?(?:developer|dev)\b"),
    (PERSPECTIVE_SUPPORT,    r"\bsupport\s+mode\b"),
    (PERSPECTIVE_BA,         r"\b(?:business[\s-]?analyst|ba)\s+mode\b"),
    (PERSPECTIVE_ARCHITECT,  r"\barchitect\s+mode\b"),
    (PERSPECTIVE_DEVELOPER,  r"\b(?:developer|dev)\s+mode\b"),
)


def _detect_explicit_prompt_agent(text: str) -> Optional[str]:
    """Return the canonical agent name if the user explicitly named a role
    in the prompt (FR or EN), else None. Case-insensitive."""
    if not text:
        return None
    lowered = text.lower()
    for agent_name, pattern in _EXPLICIT_AGENT_PATTERNS:
        if re.search(pattern, lowered):
            return agent_name
    return None


def _infer_perspective(text: str, fallback: str = PERSPECTIVE_BA) -> str:
    """Best-effort fallback for clients sending ``perspective="auto"``.

    Priority chain (BETTER §4):
      1. Explicit prompt (regex FR/EN) — confidence=high, mode=explicit_prompt
      2. Strong dev signals (code block, ORM tokens, traceback) — confidence=high
      3. Keyword scoring across registered agents — confidence=high if
         best>=3 and margin>=2, medium if best>=3, low otherwise → fallback.

    Side-channel ``_infer_perspective.last_result`` exposes the full routing
    decision (selected, mode, confidence, reason, candidates) so the SSE
    layer can emit an ``agent_selected`` event without changing this
    function's public string return type."""
    candidates_log: list[dict[str, object]] = []

    def _record(selected: str, mode: str, confidence: str, reason: str) -> None:
        _infer_perspective.last_result = {  # type: ignore[attr-defined]
            "selected": selected,
            "mode": mode,
            "confidence": confidence,
            "reason": reason,
            "candidates": candidates_log,
        }

    if not text or not text.strip():
        _record(fallback, "fallback", "low", "empty-prompt")
        return fallback

    t = text.lower()

    # 1) Explicit prompt detection — highest priority.
    explicit = _detect_explicit_prompt_agent(t)
    if explicit is not None:
        _record(explicit, "explicit_prompt", "high", f"matched explicit pattern for '{explicit}'")
        return explicit

    # 2) Heuristic strong dev signals. A bare traceback can be a support
    # triage request; only force developer when code/debug vocabulary is also
    # present.
    traceback_dev = "traceback" in t and any(term in t for term in (
        "debug", "self.env", "_inherit", "@api.", "browse", "recordset",
        "méthode", "methode", "method", "python", "orm",
    ))
    if "```" in t or "_inherit" in t or "@api." in t or "self.env" in t or traceback_dev:
        _record(PERSPECTIVE_DEVELOPER, "auto_scored", "high", "strong-dev-signal (code/orm/traceback)")
        return PERSPECTIVE_DEVELOPER

    # 3) Keyword scoring across registered agents.
    scores: dict[str, int] = {}
    try:
        from ..agents import list_agents as _list_agents
        for ag in _list_agents():
            scores[ag.name] = _score_terms(t, ag.auto_keywords.weak, ag.auto_keywords.strong)
    except Exception:
        scores = {
            PERSPECTIVE_SUPPORT: _score_terms(t, _SUPPORT_WEAK, _SUPPORT_STRONG),
            PERSPECTIVE_ARCHITECT: _score_terms(t, _ARCH_WEAK, _ARCH_STRONG),
            PERSPECTIVE_DEVELOPER: _score_terms(t, _DEV_WEAK, _DEV_STRONG),
            PERSPECTIVE_BA: _score_terms(t, _BA_WEAK, _BA_STRONG),
        }

    # Incident-framing boost: a production-incident phrasing reliably maps to
    # the Support agent even when business-domain nouns push BA. Apply a
    # bounded bonus rather than overriding, so genuinely BA-only prompts that
    # happen to contain one incident token (eg. "sla" alone) are not flipped.
    # Framing boosts (BETTER §4.3): three high-precision detectors that
    # surface the *intent shape* of a prompt, orthogonal to its domain
    # vocabulary. Each fires only when ≥1 dedicated token is present and is
    # capped so a single mention doesn't override an otherwise strong agent.
    #
    # - Incident framing → Support (resolves support↔BA collision).
    # - Strategy framing → Architect (resolves architect↔BA collision).
    # - Code-artefact framing → Developer (resolves developer↔BA collision).
    for agent_name, hits, boost_per_hit, cap in (
        (PERSPECTIVE_SUPPORT, _count_incident_framing(t), 4, 10),
        (PERSPECTIVE_ARCHITECT, _count_framing(t, _STRATEGY_FRAMING_TERMS), 4, 10),
        (PERSPECTIVE_DEVELOPER, _count_framing(t, _CODE_ARTEFACT_FRAMING_TERMS), 4, 10),
    ):
        if hits >= 1 and agent_name in scores:
            boost = min(boost_per_hit * hits, cap)
            scores[agent_name] += boost
            candidates_log.append({"name": f"_framing_boost:{agent_name}", "hits": hits, "boost": boost})

    # Stable ordering: support → architect → developer → BA first (matches
    # historical tie-break), then any extra agent in registration order.
    preferred_order = [PERSPECTIVE_SUPPORT, PERSPECTIVE_ARCHITECT, PERSPECTIVE_DEVELOPER, PERSPECTIVE_BA]
    order = [p for p in preferred_order if p in scores] + [p for p in scores if p not in preferred_order]

    candidates_log[:] = [
        {"name": p, "score": scores.get(p, 0)}
        for p in sorted(order, key=lambda x: (-scores.get(x, 0), x))
    ]

    best = fallback
    best_score = 0
    second_score = 0
    for p in order:
        s = scores.get(p, 0)
        if s > best_score:
            second_score = best_score
            best_score = s
            best = p
        elif s > second_score:
            second_score = s

    if best_score >= 3 and best_score - second_score >= 2:
        _record(best, "auto_scored", "high",
                f"top score {best_score} with margin {best_score - second_score}")
        return best

    # Semantic agent vote (BETTER §4.4): when lexical is undecided (below
    # threshold) or low-margin, ask the TF-IDF index over agent corpora.
    # The index is built from agent descriptions + auto_keywords, so it
    # generalises across paraphrases the explicit keyword lists missed.
    semantic_pick: Optional[str] = None
    semantic_cos: float = 0.0
    try:
        from . import semantic_router as _semrouter
        hit = _semrouter.semantic_agent_vote(t)
        if hit and hit.name in scores:
            semantic_pick = hit.name
            semantic_cos = hit.cosine
            candidates_log.append({
                "name": "_semantic_agent_vote", "selected": hit.name, "cosine": hit.cosine,
            })
    except Exception:
        pass

    if best_score >= 3:
        # Above threshold but low margin. Trust lexical, but if semantic
        # agrees with strong cosine, promote to high confidence.
        confidence = "high" if (semantic_pick == best and semantic_cos >= 0.18) else "medium"
        _record(best, "auto_scored", confidence,
                f"top score {best_score} margin {best_score - second_score}; semantic={semantic_pick} ({semantic_cos:.2f})")
        return best

    # Lexical below threshold: prefer semantic vote (≥0.15 cosine) over the
    # blind BA fallback. This is the path that catches "Les techniciens
    # terrain ont une erreur sur l'app mobile" style support prompts that
    # don't surface any of the explicit incident-framing tokens.
    if semantic_pick and semantic_cos >= 0.15:
        _record(semantic_pick, "semantic_fallback", "medium",
                f"lexical below threshold (best={best_score}); semantic={semantic_pick} cos={semantic_cos:.2f}")
        return semantic_pick

    _record(fallback, "fallback", "low",
            f"best score {best_score} below threshold (>=3); semantic_cos={semantic_cos:.2f}")
    return fallback


# Initialise the side-channel so callers can always read the attribute.
_infer_perspective.last_result = {  # type: ignore[attr-defined]
    "selected": PERSPECTIVE_DEVELOPER,
    "mode": "uninitialized",
    "confidence": "low",
    "reason": "no inference yet",
    "candidates": [],
}


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
    "odoo_query_records",
    "odoo_aggregate_records",
    "odoo_inspect_fields",
    "odoo_inspect_modules",
    "odoo_inspect_navigation",
    "odoo_inspect_security",
    "odoo_inspect_studio",
    "odoo_inspect_view",
    "odoo_inspect_report",
    "source_search_odoo",
    "source_read_odoo_file",
    "repo_search_code",
    "repo_read_file",
    "migration_search_target_source",
    "migration_read_target_file",
    "repo_list_modules",
    "repo_count_source_lines",
    "source_show_commit",
}


def _compress_tool_result(result: dict, tool_name: str | None = None) -> str:
    """Serialize a tool result for storage in the messages array.

    The returned string is capped so large tool outputs don’t bloat the context
    window across many turns. Data-heavy results the model must reason on
    directly (odoo_query_records, Studio/view/report inspection) get a larger budget.
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
    to bias the assistant's reasoning, vocabulary and output format.

    The content lives in ``agents/<slug>/AGENT.md`` (body) and the optional
    ``migration.md`` add-on. Falls back to the in-code ``_PERSPECTIVE_BLOCKS``
    constants if the agent registry is unavailable (defensive — should not
    happen in production)."""
    from ..agents import resolve_agent as _resolve_agent
    perspective = _normalize_perspective(perspective)
    block: str = ""
    try:
        ag = _resolve_agent(perspective)
        block = ag.body or ""
        if migration and ag.migration_fr_file:
            try:
                from pathlib import Path as _P
                block = block + "\n\n" + _P(ag.migration_fr_file).read_text(encoding="utf-8")
            except Exception:
                pass
    except Exception:
        block = ""
    if not block:
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
            "utilise SYSTÉMATIQUEMENT `source_search_odoo` avant de répondre. "
            "Ne suppose jamais un nom de modèle ou de champ — vérifie dans le code source.\n"
            "STRUCTURE :\n"
            "- Community : la plupart des modules sous `community/addons/<module>/` ; MAIS le module "
            "`base` est sous `community/odoo/addons/base/`, et le cœur du framework (ORM, champs, API, "
            "http) sous `community/odoo/` (ex. `community/odoo/models.py`, `community/odoo/fields.py`, "
            "`community/odoo/api.py`).\n"
            "- Enterprise : modules directement sous `enterprise/<module>/` (PAS sous addons/).\n"
            "OUTILS : commence par `source_search_odoo`; lis ensuite les fichiers pertinents avec "
            "`source_read_odoo_file`. Sans `path`, la recherche couvre Community + Enterprise. "
            "Pour cibler Enterprise, utilise un chemin `enterprise/<module>` ; pour le cœur ORM, "
            "lis sous `community/odoo/`.\n"
            "GIT — quand l'utilisateur référence un commit par SHA (ex `fa2bfa97`), appelle "
            "TOUJOURS `source_show_commit(sha=..., scope='odoo'|'enterprise')` au lieu de spéculer "
            "sur le contenu. Le clone shallow est deepené automatiquement si besoin."
        )
    else:
        parts.append("### Code source Odoo\nNon disponible pour cette version (téléchargez-les depuis la page Sources).")

    if target_path:
        parts.append(
            f"### Code source Odoo (version cible)\n"
            f"Disponible : `{target_path}`.\n"
            "→ Utilise `migration_search_target_source` / `migration_read_target_file` pour la version cible. "
            "Pour un commit précis : `source_show_commit(sha=..., scope='target')`."
        )

    if repo_path:
        parts.append(
            f"### Code source du projet client\n"
            f"Disponible : `{repo_path}`. Modules custom et configurations spécifiques au client.\n"
            "→ Pour découvrir les modules custom, commence par `repo_list_modules` "
            "(manifests parsés proprement), puis `repo_read_file` pour lire les fichiers pertinents. "
            "Si tu utilises la recherche brute, ne cherche PAS `__manifest__.py` comme pattern — "
            "c'est un nom de fichier, pas du contenu.\n"
            "SÉCURITÉ — si la question mentionne droits, ACL, record rules, groupes ou sécurité "
            "dans les modules custom, utilise `repo_list_modules`, puis cherche `ir.model.access`, "
            "`ir.rule`, `groups_id`, `security/` ou les CSV/XML de sécurité avec "
            "`repo_search_code`, lis les fichiers avec `repo_read_file`, et complète avec "
            "`odoo_inspect_security` sur les modèles concernés lorsque l'instance live est connectée.\n"
            "Pour inspecter un commit précis du dépôt projet : `source_show_commit(sha=..., scope='project')`."
        )

    if source_path or repo_path or target_path:
        parts.append(
            "### Volumétrie / comptage de lignes\n"
            "Pour toute question de **volumétrie** (nombre de lignes Python/XML, taille des modules, "
            "répartition par extension), utilise **`repo_count_source_lines`** — il scanne le dépôt entièrement.\n"
            "Ne déduis JAMAIS un nombre total de lignes à partir de `search_*_source` : ces outils retournent "
            "les *occurrences* d'un pattern, pas un comptage exhaustif."
        )
    return "<source_context>\n" + "\n\n".join(parts) + "\n</source_context>"


_DATA_PLAYBOOK = """## Exploration des données — méthode

### Introspection avant de deviner
- Avant d'écrire un domain sur un modèle dont la structure n'est pas certaine (surtout en présence de Studio ou de modules custom), appelle `odoo_inspect_fields(model)` pour cartographier les relations, puis `odoo_inspect_fields(model, field_names=[...])` pour confirmer les champs précis. Ne fabrique pas un nom de champ — vérifie-le.
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
- **Champs custom (`x_*`)** : toujours possibles sur les modèles standards. Si une question parle de "lien projet/commande", appelle `odoo_inspect_fields` sur les deux modèles concernés et cherche des `x_*` qui font le pont, en plus des champs standards.

### Boucle d'exploration
- Pour une question d'exploration de données, enchaîne plusieurs appels d'outils (introspecter → essayer → corriger → conclure) AVANT de rendre la main. Ne demande pas la permission de continuer entre deux requêtes en lecture seule — explore, puis réponds avec le récap final.
- Pour un KPI ou une synthèse par période/statut/responsable, utilise `odoo_aggregate_records` plutôt que de télécharger un échantillon avec `odoo_query_records` et additionner toi-même.
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
    # v0.96.2 — fix version/locale drift. When the user has switched to a
    # non-primary environment (test/staging) with a different Odoo version,
    # ``profile.odoo_version`` would otherwise mismatch the version we
    # actually query against. ``country_code``/``country_name`` are pinned
    # at the top of the stable block so they survive any context-budget
    # pressure on the priority blocks below.
    version_override: Optional[str] = None,
    country_code: Optional[str] = None,
    country_name: Optional[str] = None,
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
    _effective_version = version_override or profile.odoo_version or "inconnue"
    instance_block = (
        f"## Instance connectée\n"
        f"- URL : {profile.db_url}\n"
        f"- Version : {_effective_version}\n"
        f"- Base : {profile.db_name}\n"
        f"{society_line}"
    )
    # Pin the fiscal country at the top of the stable prompt — the routed
    # localization block (priority_blocks) covers the modules/template
    # details, but a single source of truth at the header lets the model
    # answer "where is this base set up" without paging through the routed
    # context.
    if country_code or country_name:
        label = country_name or "?"
        if country_code:
            label = f"{label} ({country_code.upper()})" if country_name else country_code.upper()
        instance_block += f"\n- Pays fiscal : {label}"
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
        "- **Cite la preuve de toute affirmation technique** : fichier:ligne, nom de champ/modèle (`sale.order`, `x_studio_*`, `_compute_*`), ID/nom de vue, SHA de commit, ligne de traceback. Si la preuve n'est pas vérifiable avec les tools, dis-le explicitement plutôt qu'affirmer.\n"
        "- **Layout** : alterner texte fluide, bullet lists et 1-2 tableaux structurants quand le sujet croise deux dimensions (flux × impact, version source × cible, module × type de personnalisation, option × pro/con). Le tableau aide à comparer, le texte aide à comprendre — utilise les deux. Évite seulement le chaînage de tableaux uniformes ou redondants. Soigne titres, sous-titres et bullets : une réponse bien hiérarchisée est plus lisible qu'un mur de texte. Un diagramme Mermaid est bienvenu pour un flux ou une dépendance, pas pour ce qu'une phrase suffirait à dire.\n"
        "- Si tu ne connais pas les champs d'un modèle, utilise `odoo_inspect_fields` d'abord.\n"
        "- Pour une question sur un écran ou une vue (champs visibles, lecture seule, accès), utilise `odoo_inspect_view` ; "
        "pour un rapport PDF, utilise `odoo_inspect_report`.\n"
        "- Sois concis et orienté résultats."
    )
    stable_parts.append(_DATA_PLAYBOOK.strip())
    if project_context:
        stable_parts.append(
            "<project_context>\n"
            f"## Notes projet (consultant)\n{_trim_project_context(project_context.strip())}\n"
            "</project_context>"
        )

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
        parts.append(f"---\n\n<routed_context>\n{_trim_context(ctx)}\n</routed_context>")
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
    country_code: Optional[str] = None,
    country_name: Optional[str] = None,
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
        # Migration mode: `source_version` is the version we explicitly
        # work against (resolved from the active environment). Prefer it
        # over the profile's primary `odoo_version`, which may belong to a
        # different env (production vs staging).
        _effective_source = source_version or profile.odoo_version or "inconnue"
        instance_block = (
            f"## Instance source connectée\n"
            f"- URL : {profile.db_url}\n"
            f"- Version : {_effective_source}\n"
            f"- Base : {profile.db_name}\n"
            f"{society_line}"
        )
        if country_code or country_name:
            label = country_name or "?"
            if country_code:
                label = f"{label} ({country_code.upper()})" if country_name else country_code.upper()
            instance_block += f"\n- Pays fiscal : {label}"
        access_line = _format_access_context(getattr(profile, "user_access_info", None))
        if access_line:
            instance_block += f"\n{access_line}"
        stable_parts.append(instance_block)

    stable_parts.append(_source_instructions(source_path=source_path, repo_path=repo_path, target_path=target_path))
    if has_instance:
        stable_parts.append(
            "## Méthode de travail\n"
            "1. Inspecte d'abord l'INSTANCE SOURCE réelle : customisations Studio (`odoo_inspect_studio`), "
            "vues et rapports (`odoo_inspect_view` / `odoo_inspect_report`), modules installés et "
            "volumétrie (`odoo_query_records` / `odoo_count_records`) — c'est ce qui détermine l'effort de migration.\n"
            "2. Cherche l'élément concerné dans la VERSION SOURCE avec `source_search_odoo`.\n"
            "3. Cherche le même élément dans la VERSION CIBLE avec `migration_search_target_source`.\n"
            "4. Compare, explique les différences, et vérifie la compatibilité des modules custom du repo avec la version cible."
        )
    else:
        stable_parts.append(
            "## Méthode de travail\n"
            "1. Cherche d'abord dans la VERSION SOURCE avec `source_search_odoo`.\n"
            "2. Cherche ensuite le même élément dans la VERSION CIBLE avec `migration_search_target_source`.\n"
            "3. Compare et explique les différences.\n"
            "4. Si des modules custom sont fournis, vérifie leur compatibilité avec la version cible."
        )
    stable_parts.append(
        "## Instructions\n"
        "- Utilise SYSTÉMATIQUEMENT les outils de recherche avant de répondre — ne suppose jamais un comportement.\n"
        "- Si le contexte Markdown contredit le code source ou les données client, le code source et les données client gagnent.\n"
        "- Sépare clairement les faits vérifiés, les hypothèses et les actions recommandées.\n"
        "- **Cite la preuve** pour chaque différence : fichier:ligne dans la version source ET dans la cible, SHA de commit du breaking change si tu le connais.\n"
        "- Pour les comparaisons version source vs cible, un tableau (Source | Cible | Impact) est le bon format — c'est précisément le cas où le tableau est utile. Garde-le à un seul tableau structurant par réponse, pas une cascade.\n"
        "- Signale clairement les breaking changes avec ⚠️."
    )
    if has_instance:
        stable_parts.append(_DATA_PLAYBOOK.strip())
    if project_context:
        stable_parts.append(
            "<project_context>\n"
            f"## Notes projet (consultant)\n{_trim_project_context(project_context.strip())}\n"
            "</project_context>"
        )

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
    country_code: Optional[str] = None,
    country_name: Optional[str] = None,
) -> tuple[str, str]:
    stable_parts: list[str] = []
    if user_ctx:
        stable_parts.append(user_ctx.strip())
    stable_parts.append(
        "Tu es un expert Odoo qui répond à des questions générales sur l'ERP, "
        "indépendamment de tout projet client."
    )
    # Always pin the version. Pin the country too when the user has
    # selected one — this is the single source of truth for the AI even
    # if the routed l10n_<cc>.md reference doesn't fire because the prompt
    # doesn't mention fiscal terms.
    ref_block = f"## Version Odoo de référence\n{version}"
    if country_code or country_name:
        label = country_name or "?"
        if country_code:
            label = f"{label} ({country_code.upper()})" if country_name else country_code.upper()
        ref_block += f"\n\n## Pays / localisation fiscale\n{label}"
    stable_parts.append(ref_block)
    stable_parts.append(_source_instructions(source_path=source_path, repo_path=repo_path))
    stable_parts.append(
        "## Instructions\n"
        "- Réponds à toutes questions sur l'architecture Odoo, les modèles de données, les modules, les migrations.\n"
        "- Utilise le code source pour illustrer ou vérifier tes réponses quand c'est pertinent.\n"
        "- Si le contexte Markdown contredit le code source local, le code source local gagne.\n"
        "- **Cite la preuve de toute affirmation technique** : fichier:ligne du code source, nom de modèle/champ, ID de vue, SHA de commit. Si la preuve n'est pas vérifiable, dis-le explicitement.\n"
        "- **Layout** : alterner texte fluide, bullet lists et 1-2 tableaux structurants quand le sujet croise deux dimensions (flux × impact, version × écran, module × statut). Soigne titres et sous-titres. Évite uniquement le chaînage de tableaux uniformes.\n"
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



# ── Tool executor ────────────────────────────────────────────────
#
# Tool execution lives in ``execution_engine.py``. ``_run_tool`` is imported
# above as a compatibility alias for tests and older internal callers.


async def _source_search_odoo(args: dict, source_path: str) -> dict:
    """Backward-compatible wrapper for tests/legacy callers.

    Runtime tool execution now goes through `skills/search-odoo-source`, but
    older tests import this helper from ai_service directly.
    """
    from backend.skills._shared.source_search import search
    return await search(args, source_path, include_enterprise=True)


async def _source_read_odoo_file(args: dict, source_path: str) -> dict:
    """Backward-compatible wrapper for tests/legacy callers."""
    from backend.skills._shared.source_search import read_file
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
    run_id: Optional[str] = None,
    # v0.96.2 — propagated by ai.py so the system prompt header reflects
    # the *active environment's* version (not the profile primary) and
    # the *active company's* country.
    country_code: Optional[str] = None,
    country_name: Optional[str] = None,
) -> AsyncIterator[dict]:
    model = model_id or DEFAULT_MODELS.get(provider, "")
    adapter = get_provider_adapter(provider)
    execution_mode = adapter.execution_mode if adapter else "backend_emulated"
    _chat_started_ms = monotonic_ms()
    _runtime_token = start_runtime_event_buffer(run_id)

    def _runtime_events() -> list[dict]:
        return [
            {"type": "runtime_event", "event": event.to_dict()}
            for event in drain_runtime_events()
        ]

    async def _forward_provider_events(events: AsyncIterator[dict]) -> AsyncIterator[dict]:
        async for evt in events:
            if evt.get("type") == "done":
                evt.setdefault("execution_mode", execution_mode)
                log_runtime_event(log, SkillRuntimeEvent(
                    type="execution_done",
                    provider=provider,
                    model=model,
                    execution_mode=execution_mode,
                    duration_ms=monotonic_ms() - _chat_started_ms,
                    ok=True,
                    input_tokens=evt.get("input_tokens"),
                    output_tokens=evt.get("output_tokens"),
                ))
            for runtime_evt in _runtime_events():
                yield runtime_evt
            yield evt

    if adapter:
        log_runtime_event(log, SkillRuntimeEvent(
            type="provider_called",
            provider=provider,
            model=model,
            execution_mode=execution_mode,
            extra={"tool_format": adapter.tool_format},
        ))
    # If client sent "auto", infer server-side from the last user message
    # (mirrors the frontend resolver — useful for CLI / mobile clients).
    _last_user = _last_user_text(messages)
    if perspective == "auto" or perspective is None:
        perspective = _infer_perspective(_last_user)
    perspective = _normalize_perspective(perspective)
    response_language = _normalize_response_language(response_language)

    # P1.3 — Reformulation detection: when the user explicitly disagrees
    # with the previous answer's direction, mark the most recent routing
    # log entry as ``reformulated=True`` so the self-audit skill can
    # surface the weak routing pattern. Never raises.
    try:
        from . import routing_feedback as _rfb
        if _rfb.is_reformulation(_last_user):
            _rfb.mark_previous_as_reformulated()
    except Exception:
        pass

    # P1.4 — Agent drift detection across the last two user turns. We
    # compare the inferred agent for the current and the previous user
    # message; if both point to a different role than the active agent
    # AND the inference confidence is high, surface an ``agent_drift``
    # SSE event so the frontend can offer a switch chip. Never silently
    # changes the active perspective — opt-in only.
    _drift_suggestion: Optional[dict] = None
    try:
        cur_inferred = _infer_perspective(_last_user, fallback=perspective)
        prev_user_text = ""
        # Walk history backwards: skip the most recent user message, find
        # the previous one.
        seen_user = 0
        for msg in reversed(messages):
            if msg.get("role") == "user":
                seen_user += 1
                if seen_user == 2:
                    content = msg.get("content")
                    if isinstance(content, str):
                        prev_user_text = content
                    elif isinstance(content, list):
                        for blk in content:
                            if isinstance(blk, dict) and blk.get("type") == "text":
                                prev_user_text = str(blk.get("text") or "")
                                break
                    break
        if (
            cur_inferred
            and cur_inferred != perspective
            and prev_user_text
        ):
            prev_inferred = _infer_perspective(prev_user_text, fallback=perspective)
            cur_conf = getattr(_infer_perspective, "last_result", {})
            # Reading last_result twice is racy in concurrent calls but the
            # stream_chat path is single-task; safe enough for a hint.
            if (
                prev_inferred == cur_inferred
                and prev_inferred != perspective
                and cur_conf.get("confidence") == "high"
            ):
                try:
                    from ..agents import get_agent as _get_drift_agent
                    target_def = _get_drift_agent(cur_inferred)
                except Exception:
                    target_def = None
                _drift_suggestion = {
                    "from": perspective,
                    "to": cur_inferred,
                    "to_label": getattr(target_def, "label", cur_inferred) if target_def else cur_inferred,
                    "reason": cur_conf.get("reason", "auto-inferred drift"),
                }
    except Exception:
        _drift_suggestion = None

    # Merge agent-level ``denied_skills`` into the per-request disabled_tools
    # list. This is the only real backend gate on which skills are exposed
    # to the LLM for this turn — agent body text is not a security
    # boundary (BETTER §6). Idempotent and order-preserving.
    try:
        from ..agents import get_agent as _get_agent_for_deny
        _agent_def_deny = _get_agent_for_deny(perspective)
    except Exception:
        _agent_def_deny = None
    if _agent_def_deny and _agent_def_deny.denied_skills:
        _merged = list(disabled_tools or [])
        for sk in _agent_def_deny.denied_skills:
            if sk not in _merged:
                _merged.append(sk)
        disabled_tools = _merged

    # Trim conversation history to avoid context-window overflow on long sessions.
    messages = _trim_history(messages)

    # Capture the binary attachments BEFORE apply_provider_attachments strips
    # them — the runtime_attachment_handler skill tools (extract_pdf_text, pdf_to_images,
    # compare_documents) read them by filename from the per-task store.
    import uuid as _uuid
    from . import attachment_store as _att_store
    _attachment_session_id: Optional[str] = None
    if messages and isinstance(messages[-1], dict):
        _att_payload = messages[-1].get("_attachments") or []
        if _att_payload:
            _attachment_session_id = f"chat-{_uuid.uuid4().hex[:12]}"
            _att_store.publish(_attachment_session_id, _att_payload)
            _att_store.set_current_session(_attachment_session_id)

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
            country_code=country_code,
            country_name=country_name,
        )
        if profile is not None:
            base_tools = (TOOLS_CLAUDE, TOOLS_OPENAI, TOOLS_GEMINI)
        else:
            base_tools = (TOOLS_CLAUDE_SRC, TOOLS_OPENAI_SRC, TOOLS_GEMINI_SRC)
    elif profile is not None:
        stable, variable = build_system(
            profile, source_path, context_md, repo_path, perspective, response_language,
            user_ctx=user_ctx,
            active_company_name=active_company_name,
            project_context=getattr(profile, "project_context", None),
            version_override=version,
            country_code=country_code,
            country_name=country_name,
        )
        base_tools = (TOOLS_CLAUDE, TOOLS_OPENAI, TOOLS_GEMINI)
    else:
        stable, variable = build_system_general(
            version or "?", source_path, context_md, repo_path, perspective, response_language,
            user_ctx=user_ctx,
            country_code=country_code,
            country_name=country_name,
        )
        base_tools = (TOOLS_CLAUDE_SRC, TOOLS_OPENAI_SRC, TOOLS_GEMINI_SRC)

    system: object = (
        adapter.format_system(stable, variable)
        if adapter else f"{stable}\n\n{variable}".strip()
    )

    toolsets = build_provider_toolsets(
        _toolset_inputs(*base_tools),
        repo_available=bool(repo_path),
        source_available=bool(source_path),
        target_available=bool(target_path),
        live_odoo_available=profile is not None,
        disabled_tools=disabled_tools,
    )
    selected_tools = adapter.select_toolset(toolsets) if adapter else []

    # ── Filtrage des skills désactivés par l'utilisateur ─────────────
    _disabled = {canonical_skill_name(name) or name for name in (disabled_tools or [])}
    if _disabled:
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

    # P1.2 / P1.4 — surface routing-quality signals to the frontend BEFORE
    # streaming starts so the chip layer can render in parallel with the
    # first tokens. Both events are best-effort and never block streaming.
    try:
        from .context_service import (
            last_selected_skill_names as _last_skills,
            last_skill_route_confidence as _last_conf,
            last_skill_route_candidates as _last_cands,
        )
        _conf = _last_conf()
        _skills_now = _last_skills()
        if _conf:
            yield {
                "type": "routing_confidence",
                "level": _conf.get("level"),
                "top_score": _conf.get("top_score"),
                "skills": _skills_now,
            }
        if _drift_suggestion:
            yield {"type": "agent_drift", **_drift_suggestion}
        # P1.3 — persist the routing decision for offline self-audit.
        try:
            from . import routing_feedback as _rfb
            _rfb.log_turn(
                prompt=_last_user,
                agent=perspective,
                mode=("creator" if False else ("migration" if migration_mode else "assistant")),
                locale=response_language,
                skills=_skills_now,
                confidence=_conf,
                candidates=_last_cands(),
                extra={"drift": _drift_suggestion} if _drift_suggestion else None,
            )
        except Exception:
            pass
    except Exception:
        pass

    try:
        for runtime_evt in _runtime_events():
            yield runtime_evt
        if adapter is None:
            yield {"type": "error", "msg": f"Fournisseur inconnu : {provider}"}
        else:
            streamers = {
                "claude": _chat_claude,
                "openai": _chat_openai,
                "gemini": _chat_gemini,
                "github": _chat_github,
                "copilot": _chat_copilot,
            }
            stream = adapter.stream(
                streamers,
                api_key, model, system, messages, odoo, source_path,
                selected_tools, repo_path, target_path,
            )
            async for evt in _forward_provider_events(stream):
                yield evt
    finally:
        # Clear the per-task attachment store entry so a new chat doesn't
        # accidentally see stale binaries (the contextvar resets naturally).
        if _attachment_session_id:
            _att_store.clear(_attachment_session_id)
            _att_store.set_current_session(None)
        reset_runtime_event_buffer(_runtime_token)
