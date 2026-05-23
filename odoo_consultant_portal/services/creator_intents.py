"""Detect the *kind* of Creator operation a user prompt is asking for, and
return a focused snippet to inject into the LLM context.

The general profile-creator.md already carries the full Studio conventions.
This module zooms in: when the user explicitly mentions a cron, a computed
field, an automation, etc., we add a short snippet that surfaces the
gotchas and patterns specific to *that* operation type. It keeps the rest
of the prompt slim while reinforcing the right reflexes at the right time.

Detection is keyword-based on the lower-cased prompt — same logic as the
existing context router (_STUDIO_TERMS etc. in context_service).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional


def _normalize(text: Optional[str]) -> str:
    if not text:
        return ""
    folded = unicodedata.normalize("NFKD", text)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return folded.lower()


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    for term in terms:
        if term and term in text:
            return True
    return False


# Each entry: (intent_key, FR terms, EN terms, FR snippet, EN snippet).
# Snippets are short, focused — they reinforce profile-creator.md, never replace
# it. Wording matches the user's likely vocabulary in each language.
_INTENTS: tuple[tuple[str, tuple[str, ...], tuple[str, ...], str, str], ...] = (
    (
        "compute",
        ("champ calcule", "champ compute", "champ calcule store", "calcule depuis",
         "automatique calcule", "@api.depends"),
        ("computed field", "compute field", "@api.depends"),
        # FR
        "Champ calculé — rappels critiques :\n"
        "- contexte safe_eval restreint : seuls `self`, `datetime`, `dateutil`, `time` ;\n"
        "- date du jour = `datetime.date.today()` (pas `fields.Date.today()`) ;\n"
        "- accès env = `self.env`, pas `env` ;\n"
        "- assignation = `record['x_field'] = value` (STORE_ATTR interdit) ;\n"
        "- toujours fournir `depends` (chaîne séparée par virgules) — sinon le "
        "champ n'est jamais recalculé ;\n"
        "- si le calcul lit un many2one, dépends du champ entier (`partner_id`), "
        "pas d'un sous-attribut.",
        # EN
        "Computed field — critical reminders:\n"
        "- restricted safe_eval context: only `self`, `datetime`, `dateutil`, `time`;\n"
        "- today's date = `datetime.date.today()` (not `fields.Date.today()`);\n"
        "- env access = `self.env`, not `env`;\n"
        "- assignment = `record['x_field'] = value` (STORE_ATTR forbidden);\n"
        "- always set `depends` (comma-separated) — otherwise the field is never "
        "recomputed.",
    ),
    (
        "cron",
        ("cron", "tache planifiee", "action planifiee", "scheduler", "planification",
         "tous les jours", "chaque jour", "chaque nuit", "tous les soirs"),
        ("cron", "scheduled action", "scheduler", "scheduled task", "every night",
         "every day"),
        # FR
        "Action planifiée (`create_cron`) — points clés :\n"
        "- Studio n'expose PAS la création de cron dans son éditeur visuel ; "
        "l'opération est techniquement faisable mais sort du périmètre Studio "
        "(à signaler explicitement dans `technical_analysis`) ;\n"
        "- `interval_number` > 0, `interval_type` ∈ {minutes, hours, days, weeks, months} ;\n"
        "- le `code` tourne dans le contexte serveur (env, model, records disponibles) ;\n"
        "- pour les longs traitements, jalonner avec "
        "`env['ir.cron']._notify_progress(done=n, remaining=m)` ;\n"
        "- toujours encadrer par un `try/except` qui log via `_logger` plutôt que "
        "laisser le cron planter silencieusement.",
        # EN
        "Scheduled action (`create_cron`) — key points:\n"
        "- Studio does NOT expose cron creation in its visual editor; the "
        "operation is technically doable but sits outside the Studio scope "
        "(flag it explicitly in `technical_analysis`);\n"
        "- `interval_number` > 0, `interval_type` ∈ {minutes, hours, days, weeks, months};\n"
        "- the `code` runs in the server context (env, model, records available);\n"
        "- for long runs, checkpoint with "
        "`env['ir.cron']._notify_progress(done=n, remaining=m)`;\n"
        "- always wrap in `try/except` that logs via `_logger`.",
    ),
    (
        "automation",
        ("automatisation", "automatise", "automation", "base.automation",
         "declenche automatiquement", "se declenche quand", "trigger sur",
         "action automatique"),
        ("automation", "automated action", "base.automation",
         "trigger when", "trigger on", "automatic action"),
        # FR
        "Automatisation (`create_automation`) — rappels :\n"
        "- `trigger` ∈ {on_create, on_write, on_create_or_write, on_unlink, on_time} ;\n"
        "- `filter_domain` (optionnel) restreint les enregistrements qui déclenchent — "
        "préfère un domaine précis à un trigger sans filtre ;\n"
        "- contexte du `code` riche : `env`, `record`, `records`, `user`, `UserError` ;\n"
        "- évite les boucles : si tu modifies un champ qui déclenche l'automation, "
        "garde-toi avec un flag (`context.get('skip_x_recursion')`) ou un domaine "
        "qui exclut l'état déjà appliqué.",
        # EN
        "Automation (`create_automation`) — reminders:\n"
        "- `trigger` ∈ {on_create, on_write, on_create_or_write, on_unlink, on_time};\n"
        "- `filter_domain` (optional) restricts the records that fire it — prefer a "
        "precise domain over a trigger without filter;\n"
        "- rich `code` context: `env`, `record`, `records`, `user`, `UserError`;\n"
        "- avoid loops: guard with a context flag or a domain that excludes the "
        "already-applied state.",
    ),
    (
        "server_action",
        ("action serveur", "server action", "bouton action", "ir.actions.server",
         "menu action"),
        ("server action", "action button", "ir.actions.server"),
        # FR
        "Action serveur (`create_server_action`) — rappels :\n"
        "- `state` = `code` par défaut ; le `code` Python est exécuté en contexte "
        "riche (env, record(s), user, UserError, log, _logger) ;\n"
        "- pour qu'elle apparaisse dans le menu Action de la vue, mettre "
        "`binding=true` (sinon elle est invisible côté utilisateur) ;\n"
        "- pour retourner une action client (notification, ouvrir un wizard…), "
        "termine par `action = {...}` ;\n"
        "- valider d'abord avec `UserError` avant toute écriture irréversible.",
        # EN
        "Server action (`create_server_action`) — reminders:\n"
        "- `state` = `code` by default; the Python `code` runs in a rich context "
        "(env, record(s), user, UserError, log, _logger);\n"
        "- to expose it in the view's Action menu, set `binding=true` (otherwise "
        "the user cannot see it);\n"
        "- to return a client action (notification, wizard…), end with "
        "`action = {...}`;\n"
        "- validate with `UserError` before any irreversible write.",
    ),
    (
        "report",
        ("rapport", "report", "pdf", "qweb", "facture imprime", "bon de commande imprime",
         "modele d'impression", "modele d impression", "mise en page", "en-tete",
         "pied de page", "footer", "header"),
        ("report", "pdf", "qweb", "print template", "invoice layout",
         "header", "footer", "page layout"),
        # FR
        "Rapport QWeb — règles spécifiques :\n"
        "- avant tout `modify_report`, appelle `inspect_odoo_report` et lis "
        "`qweb_archs` (arch RÉELLE du template / document / mise en page) ;\n"
        "- pour modifier EN-TÊTE / PIED DE PAGE, hérite du template de MISE EN "
        "PAGE actif (`document_layout.external_report_layout_id`), pas du template "
        "du document ;\n"
        "- pour modifier le CONTENU du document, hérite bien du template du document ;\n"
        "- dans le PDF, n'utilise JAMAIS `<field name='x_y'/>` — utilise "
        "`<span t-field='o.x_y'/>` ou `<span t-out='o.x_y'/>` ;\n"
        "- si la demande crée un nouveau champ ET l'affiche, émets deux ops dans "
        "l'ordre : `create_field` puis `modify_report` qui le référence.",
        # EN
        "QWeb report — specific rules:\n"
        "- before any `modify_report`, call `inspect_odoo_report` and read "
        "`qweb_archs`;\n"
        "- to edit HEADER / FOOTER, inherit the active LAYOUT template "
        "(`document_layout.external_report_layout_id`), not the document template;\n"
        "- to edit the document CONTENT, inherit the document template;\n"
        "- in the PDF, never use `<field name='x_y'/>` — use "
        "`<span t-field='o.x_y'/>` or `<span t-out='o.x_y'/>`;\n"
        "- if the request creates a new field AND displays it, emit two ops in "
        "order: `create_field` then `modify_report` referencing it.",
    ),
    (
        "selection_field",
        ("selection", "liste deroulante", "menu deroulant", "choix predefinis"),
        ("selection", "dropdown", "picklist", "predefined choices"),
        # FR
        "Champ selection — points clés :\n"
        "- `selection` doit être une liste `[[valeur_technique, libellé], …]` ;\n"
        "- valeurs techniques courtes, ASCII, sans espace (ex. `draft`, `to_validate`) — "
        "elles serviront en domaine ou en condition ;\n"
        "- libellés en français (ou langue par défaut de l'instance) ;\n"
        "- si la liste est susceptible d'évoluer, ajouter un `help` qui décrit chaque cas.",
        # EN
        "Selection field — key points:\n"
        "- `selection` must be `[[technical_value, label], …]`;\n"
        "- technical values short, ASCII, no space — used in domain / conditions;\n"
        "- labels in the instance's default language;\n"
        "- if the list may evolve, add `help` describing each case.",
    ),
    (
        "relational_field",
        ("many2one", "one2many", "many2many", "relation vers", "lien vers",
         "rattacher a", "rattache a", "champ relationnel"),
        ("many2one", "one2many", "many2many", "relation to", "link to",
         "relational field"),
        # FR
        "Champ relationnel — rappels :\n"
        "- `relation` (modèle cible) OBLIGATOIRE pour many2one / one2many / many2many ;\n"
        "- `relation_field` (champ inverse) OBLIGATOIRE pour one2many — sans lui, "
        "le many2one symétrique n'existe pas et Odoo refuse ;\n"
        "- pour modifier le contenu d'une one2many (lignes), n'agis JAMAIS sur le "
        "champ du parent : crée / modifie / supprime les enregistrements du modèle "
        "ENFANT directement.",
        # EN
        "Relational field — reminders:\n"
        "- `relation` (target model) MANDATORY for many2one / one2many / many2many;\n"
        "- `relation_field` (inverse field) MANDATORY for one2many — without it, "
        "the symmetric many2one does not exist and Odoo refuses;\n"
        "- to change the content of a one2many (lines), never act on the parent's "
        "field: create / update / delete records on the CHILD model directly.",
    ),
    (
        "modify_view",
        # FR triggers — vocabulary the consultant uses to ask for a view
        # tweak (adding a field, hiding one, moving to a tab, etc.).
        ("ajoute le champ", "ajouter le champ", "afficher le champ",
         "place le champ", "deplace le champ", "deplacer le champ",
         "dans l'onglet", "dans la page", "dans le notebook",
         "masque le champ", "cache le champ", "rendre invisible",
         "bouton dans la vue", "menu action", "modifie la vue", "modifier la vue"),
        # EN
        ("add the field", "show the field", "hide the field",
         "move the field", "in the tab", "in the notebook page",
         "make invisible", "button in the view", "action menu",
         "edit the view", "modify the view"),
        # FR
        "Modification de vue (`modify_view`) — règles xpath OBLIGATOIRES :\n"
        "- Studio produit TOUJOURS des xpath simples sur un seul ancrage nommé : "
        "`//page[@name='other_information']`, `//field[@name='partner_id']`, "
        "`//group[@name='sales_info']`. JAMAIS de chemin absolu avec "
        "/form/sheet/notebook/... — l'executor rejette avec « XPath sans cible » ;\n"
        "- avant d'écrire un xpath, appelle `inspect_odoo_view` et utilise les "
        "noms exacts (attribut `name` ou `string`) trouvés dans le squelette ;\n"
        "- positions autorisées : `inside` (ajouter à l'intérieur), `after`, "
        "`before`, `attributes` (modifier un attribut). Éviter `replace` sauf "
        "demande explicite de remplacement d'un nœud entier ;\n"
        "- pour ajouter un champ dans un onglet : "
        "`<xpath expr=\"//page[@name='other_information']\" position=\"inside\">"
        "<field name=\"x_anniversaire\"/></xpath>` — UNE seule expression simple, "
        "pas de chemin profond.",
        # EN
        "View modification (`modify_view`) — MANDATORY xpath rules:\n"
        "- Studio ALWAYS produces simple xpaths on a single named anchor: "
        "`//page[@name='other_information']`, `//field[@name='partner_id']`. "
        "NEVER an absolute path with /form/sheet/notebook/... — the executor "
        "rejects with « XPath without target »;\n"
        "- before writing an xpath, call `inspect_odoo_view` and use the exact "
        "names (attribute `name` or `string`) found in the skeleton;\n"
        "- allowed positions: `inside`, `after`, `before`, `attributes`. Avoid "
        "`replace` unless explicitly required;\n"
        "- to add a field in a tab: `<xpath expr=\"//page[@name='other_information']\" "
        "position=\"inside\"><field name=\"x_birthday\"/></xpath>` — ONE simple "
        "expression, no deep path.",
    ),
    (
        "records_bulk",
        ("mettre a jour les fiches", "mettre a jour les produits", "import csv",
         "rapprocher", "mise en coherence", "synchroniser les fiches", "deduplication",
         "dedupliquer"),
        ("update the records", "update products", "csv import", "reconcile",
         "synchronize records", "deduplicate"),
        # FR
        "Lot d'enregistrements à mettre à jour — règles strictes :\n"
        "- avant tout `update_record` / `delete_record`, résous les fiches via "
        "`query_odoo` : tu DOIS avoir `id` ET `display_name` de chaque cible ;\n"
        "- exhaustivité : si tu interroges un lot, utilise `count_odoo` puis pagine "
        "avec `offset` / `limit` (≤ 500 par appel) — jamais d'échantillon ;\n"
        "- ne crée jamais une fiche qui pourrait exister : vérifie d'abord et "
        "réutilise l'id ;\n"
        "- modèles transactionnels (sale.order, account.move, stock.move, payment, "
        "pos.order, bank statement) STRICTEMENT INTERDITS en create / update.",
        # EN
        "Bulk record update — strict rules:\n"
        "- before any `update_record` / `delete_record`, resolve targets via "
        "`query_odoo`: you MUST have each `id` AND `display_name`;\n"
        "- exhaustiveness: for a batch, use `count_odoo` then paginate with "
        "`offset` / `limit` (≤ 500 per call) — never a sample;\n"
        "- never create a record that may exist: check first and reuse the id;\n"
        "- transactional models (sale.order, account.move, stock.move, payment, "
        "pos.order, bank statement) STRICTLY FORBIDDEN for create / update.",
    ),
)


def detect_creator_intents(prompt: str, locale: str = "fr") -> list[str]:
    """Return the matching intent keys for *prompt*. Order matches _INTENTS."""
    text = _normalize(prompt)
    if not text:
        return []
    hits: list[str] = []
    for key, fr_terms, en_terms, _fr, _en in _INTENTS:
        terms = en_terms if locale == "en" else fr_terms
        if _has_any(text, terms):
            hits.append(key)
    return hits


def build_creator_intent_block(prompt: str, locale: str = "fr") -> str:
    """Build a focused markdown block of op-type-specific reminders for a
    Creator prompt. Returns an empty string when no intent is detected — the
    caller can simply skip injection in that case."""
    hits = detect_creator_intents(prompt, locale=locale)
    if not hits:
        return ""
    parts: list[str] = []
    for key, _fr_terms, _en_terms, fr_snippet, en_snippet in _INTENTS:
        if key in hits:
            parts.append((en_snippet if locale == "en" else fr_snippet).strip())
    if not parts:
        return ""
    return "\n\n".join(parts)
