"""Prompt building and changeset parsing for the Creator tool.

The Creator reuses the project-mode AI pipeline (``stream_chat``) so the model
investigates the live instance with the existing read-only tools (inspect_studio,
inspect_odoo_view, get_odoo_fields, query_odoo, search_odoo_source…). The only
Creator-specific parts live here:

- the instruction that turns a functional request into a strict JSON changeset;
- the parser that extracts that changeset from the model's final answer;
- the prompt that turns an applied changeset into end-user documentation.
"""

import json
import re
from typing import Any, Optional

# Operation types the executor knows how to apply.
_OP_TYPES = (
    "create_field", "modify_view", "create_server_action",
    "create_automation", "create_cron", "modify_report",
    "create_record", "update_record", "delete_record",
)

CHANGESET_INSTRUCTIONS = """\
# Mode CRÉATION — préparation d'une modification de type Odoo Studio

Tu prépares une modification qui sera appliquée EN ÉCRITURE sur l'instance Odoo \
connectée (production ou test). C'est une opération sensible : sois rigoureux et \
exhaustif.

Les conventions Studio (périmètre, nommage, safe_eval, modèles protégés, \
relations one2many, règles records) sont détaillées dans la section \
« Conventions Studio » de ton contexte — elles font autorité. \
Ce document décrit uniquement le format de sortie attendu.

## Étape 1 — Investigation
Avant de proposer quoi que ce soit, inspecte l'instance réelle avec tes outils :
- `inspect_studio` pour les personnalisations existantes,
- `inspect_odoo_view` pour l'arch assemblée des vues concernées (récupère le \
`view_db_id` du parent à hériter),
- `get_odoo_fields` / `query_odoo` pour les modèles et champs existants,
- `search_odoo_source` pour vérifier les noms exacts côté code Odoo.
N'invente jamais un nom de modèle, de champ, de vue, d'xpath ou de méthode : \
vérifie-le. Pour toute opération `modify_view`, tu dois avoir inspecté la vue \
réelle et vérifier que chaque cible xpath existe dans l'architecture assemblée. \
Le champ `structural_skeleton` retourné par `inspect_odoo_view` contient le \
squelette XML complet de la vue (balises, attributs name/string) : utilise-le \
pour identifier les cibles xpath valides. Si une page notebook apparaît dans le \
squelette avec son attribut `string` ou `name`, c'est une cible xpath fiable. \
Ne renvoie `operations: []` QUE si tu ne trouves réellement aucune ancre xpath \
exploitable dans le squelette.

## Étape 2 — Réponse
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ni après, \
sans bloc de code markdown. Structure exacte :

{
  "functional_analysis": "<contenu Markdown structuré : ce que veut l'utilisateur, \
comportement attendu, impacts métier, limites>",
  "technical_analysis": "<contenu Markdown structuré. COMMENCE par une section \
« Faisabilité Odoo Studio » : verdict explicite (réalisable / réalisable avec \
réserves / non réalisable en Studio) et sa justification — confirme notamment \
qu'aucune opération ne dépend d'une classe CSS, d'un JS ou d'un code Python \
inexistant. Puis : modèles/vues/champs concernés, version Odoo ciblée, éléments \
inspectés, choix d'implémentation, héritages utilisés, risques>",
  "operations": [ ...liste ordonnée des opérations... ]
}

Les valeurs de `functional_analysis` et `technical_analysis` sont du Markdown pur \
(titres, listes, code inline…). Ne commence JAMAIS par « Analyse fonctionnelle : » \
ou « Analyse technique : » — le titre est déjà affiché par l'interface.

Si la demande est impossible, hors périmètre Studio, ou trop ambiguë pour être \
exécutée sans risque, renvoie `"operations": []` et explique pourquoi dans \
`functional_analysis`.

### Schéma des opérations
Chaque opération : `{"type": <type>, "summary": <résumé FR court et précis>, \
"params": { ... }}`.

- **create_field** — nouveau champ custom.
  params : `model`, `name` (préfixe `x_`), `field_description` (libellé), \
`ttype` (char|text|html|integer|float|monetary|boolean|date|datetime|\
selection|many2one|one2many|many2many|binary), \
`relation` (modèle cible si relationnel), `relation_field` (champ inverse si \
one2many), `selection` ([[valeur,libellé], …] si selection), \
`required`/`help`/`store` (optionnels). Pour un champ calculé, ajoute \
`compute` (code Python) et `depends` (dépendances séparées par virgules) afin \
que le consultant voie et valide explicitement la logique.

- **modify_view** — vue héritée (ajout d'onglet, de champ, de bouton, de groupe…).
  params : `model`, `view_type` (form|list|kanban|search|…), \
`inherit_id` (id numérique de la vue parente, depuis `inspect_odoo_view`) OU \
`inherit_xmlid`, \
`arch` (le CORPS d'héritage NU : un `<data>` contenant des `<xpath …>`).
  Le `arch` ne doit JAMAIS être enveloppé dans `<template>`, `<odoo>`, \
`<openerp>` ni `<record>` : le Creator crée lui-même l'enregistrement \
`ir.ui.view` et fixe `inherit_id`. Donne directement `<data><xpath …>…</xpath></data>`.
  Ne fournis PAS de `name` : le nom de la vue héritée est généré automatiquement \
de façon cohérente (« <vue parente> (Creator) »), pour rester propre et \
identifiable côté Studio.

- **modify_report** — rapport QWeb hérité.
  params : `template_key` (clé du template QWeb à hériter) OU `inherit_xmlid`, \
`arch` (le CORPS d'héritage QWeb NU : un `<data>` contenant des `<xpath>`), \
`report_name` (le `report_name` de l'`ir.actions.report` concerné, ex. \
`account.report_invoice` — recommandé : il permet de générer un aperçu PDF \
avant/après du rapport). Ne fournis PAS de `name` (généré automatiquement).
  Le `arch` ne doit JAMAIS être enveloppé dans `<template id=… inherit_id=…>`, \
`<odoo>` ni `<openerp>` : le Creator crée lui-même l'`ir.ui.view` QWeb et fixe \
`inherit_id`. Donne directement `<data><xpath …>…</xpath></data>`.
  CIBLAGE XPATH — OBLIGATOIRE : avant d'écrire un xpath de rapport, appelle \
`inspect_odoo_report` et lis le champ `qweb_archs` — l'arch XML RÉELLE du \
template du rapport, du template document et de la mise en page. Chaque `expr` \
xpath doit cibler un élément, une classe ou un attribut qui EXISTE réellement \
dans cette arch. N'invente JAMAIS un nom de classe (ex. `o_line_table`) ni une \
balise : si l'ancre voulue n'y figure pas, choisis-en une voisine réellement \
présente.
  RENDU DES CHAMPS — dans un rapport PDF QWeb, n'utilise JAMAIS `<field \
name="x_champ"/>` : cette syntaxe est celle des vues formulaire/liste et peut \
être acceptée sans rien afficher. Utilise `<span t-field="o.x_champ"/>` ou \
`<span t-out="o.x_champ"/>` selon le contexte (`o`, `doc`, `line`, etc.).
  Si la demande consiste à créer un NOUVEAU champ puis à l'afficher dans le PDF, \
produis obligatoirement deux opérations dans cet ordre : `create_field` d'abord, \
puis `modify_report` avec un `t-field`/`t-out` qui référence ce champ nouvellement \
créé (ex. `<span t-field="o.x_champ"/>`). Ne bloque pas sous prétexte que le champ \
n'existe pas encore avant application : il existera grâce à l'opération précédente.
  CHOIX DU TEMPLATE PARENT — déterminant pour un héritage propre :
  ◦ Pour modifier l'EN-TÊTE ou le PIED DE PAGE d'un document (logo, coordonnées \
société, pagination, mentions légales), n'hérite PAS du template du document \
(ex. `account.report_invoice_document`). Hérite du template de MISE EN PAGE \
actif de la société : appelle `inspect_odoo_report` et lis \
`document_layout.external_report_layout_id` — c'est la variante active \
(`web.external_layout_standard`, `web.external_layout_boxed`, \
`web.external_layout_bold` ou `web.external_layout_striped`). Pose ton xpath sur \
cette variante précise.
  ◦ Pour modifier le CONTENU du document (lignes, totaux, champs, blocs), hérite \
bien du template du document lui-même.

- **create_server_action** — action serveur.
  params : `model`, `name`, `state` (`code` par défaut), `code` (Python si \
state=code), `binding` (true pour l'afficher dans le menu Action du modèle).

- **create_automation** — action automatisée (base.automation).
  params : `model`, `name`, `trigger` (on_create|on_write|on_create_or_write|\
on_unlink|on_time), `code` (Python exécuté), `filter_domain` (domaine optionnel).

- **create_cron** — action planifiée (ir.cron).
  params : `model`, `name`, `code` (Python), `interval_number`, \
`interval_type` (minutes|hours|days|weeks|months).

### Opérations sur les données (records)
En plus des personnalisations Studio, tu peux créer ou mettre à jour des \
enregistrements Odoo ordinaires (contacts, produits, catégories…). \
Les règles métier (modèles protégés, one2many, prérequis `query_odoo`, \
exhaustivité) sont dans la section « Conventions Studio » de ton contexte — \
respecte-les strictement.

- **create_record** — créer UN enregistrement.
  params : `model`, `values` (objet `{champ: valeur}` NON VIDE, valeurs \
concrètes), `label` (libellé court et lisible de la fiche créée).

- **update_record** — mettre à jour des enregistrements existants.
  params : `model`, `targets` (liste `[{"id": <id>, "display_name": <nom>}]` \
des fiches résolues via `query_odoo`), `values` (objet `{champ: nouvelle \
valeur}`). Pour un champ `many2one`, donne l'`id` numérique de la cible. Les \
champs `one2many` et `many2many` ne sont PAS pris en charge en mise à jour.

- **delete_record** — supprimer des enregistrements existants.
  params : `model`, `targets` (liste `[{"id": <id>, "display_name": <nom>}]`). \
Opération destructive : ne l'emploie que si la demande exige explicitement de \
retirer une fiche (par exemple nettoyer une ligne fournisseur erronée). En cas \
d'échec d'une autre opération du changeset, les fiches supprimées sont \
recréées au mieux, mais avec de nouveaux identifiants.

Les `arch` doivent être du XML valide et bien formé. Sois précis : la liste des \
opérations EST ce qui sera exécuté littéralement.\
"""


def build_analysis_message(request: str, instructions: Optional[list[str]] = None) -> str:
    """Assemble the user turn: the functional request plus any follow-up
    instructions the consultant added when asking for a revised proposal."""
    parts = [CHANGESET_INSTRUCTIONS, "", "## Demande fonctionnelle", request.strip()]
    if instructions:
        parts.append("")
        parts.append("## Instructions complémentaires de l'utilisateur")
        for i, instruction in enumerate(instructions, start=1):
            text = (instruction or "").strip()
            if text:
                parts.append(f"{i}. {text}")
        parts.append("")
        parts.append(
            "Reprends ton analyse en intégrant ces instructions et produis un "
            "nouveau changeset complet."
        )
    return "\n".join(parts)


def _extract_json_object(text: str) -> Optional[str]:
    """Pull the first balanced top-level JSON object out of *text*.

    Tolerant of ```json fences and of leading/trailing prose, since models
    occasionally wrap the object despite the instruction not to."""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return None


def parse_analysis(text: str) -> dict[str, Any]:
    """Parse the model's final answer into a structured analysis.

    Returns ``{"ok": bool, ...}``. On success: ``functional_analysis``,
    ``technical_analysis`` and ``operations`` (validated). On failure: ``error``
    and the ``raw`` text so the caller can surface it.
    """
    raw = (text or "").strip()
    blob = _extract_json_object(raw)
    if not blob:
        return {"ok": False, "error": "Aucun changeset JSON trouvé dans la réponse de l'IA.",
                "raw": raw}
    try:
        data = json.loads(blob)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"Changeset JSON invalide : {exc}", "raw": raw}
    if not isinstance(data, dict):
        return {"ok": False, "error": "Le changeset n'est pas un objet JSON.", "raw": raw}

    operations = data.get("operations")
    if not isinstance(operations, list):
        operations = []
    clean_ops: list[dict] = []
    for idx, op in enumerate(operations):
        if not isinstance(op, dict):
            return {"ok": False, "error": f"Opération #{idx + 1} mal formée.", "raw": raw}
        op_type = (op.get("type") or "").strip()
        if op_type not in _OP_TYPES:
            return {"ok": False,
                    "error": f"Opération #{idx + 1} : type inconnu « {op_type} ».",
                    "raw": raw}
        if not isinstance(op.get("params"), dict):
            return {"ok": False,
                    "error": f"Opération #{idx + 1} : 'params' manquant ou invalide.",
                    "raw": raw}
        clean_ops.append({
            "type": op_type,
            "summary": (op.get("summary") or op_type).strip(),
            "params": op["params"],
        })

    return {
        "ok": True,
        "functional_analysis": (data.get("functional_analysis") or "").strip(),
        "technical_analysis": (data.get("technical_analysis") or "").strip(),
        "operations": clean_ops,
    }


def build_documentation_message(
    request: str,
    functional_analysis: str,
    technical_analysis: str,
    apply_result: dict,
) -> str:
    """Prompt asking the AI to write end-user documentation for a change that
    has just been applied to the instance."""
    applied = [
        f"- [{o.get('type')}] {o.get('summary')}"
        for o in (apply_result.get("operations") or [])
        if o.get("status") == "success"
    ]
    detail = "\n".join(applied) if applied else "(aucune opération appliquée)"
    return (
        "Une modification de type Studio vient d'être APPLIQUÉE avec succès sur "
        "l'instance Odoo. Rédige une documentation claire, en Markdown, destinée "
        "à l'équipe et au client.\n\n"
        "Structure attendue : un titre, un résumé fonctionnel, la liste des "
        "modifications techniques réellement effectuées, l'impact pour les "
        "utilisateurs, et les éventuelles précautions ou étapes de vérification.\n"
        "Réponds uniquement avec la documentation Markdown, sans préambule.\n\n"
        f"## Demande initiale\n{request.strip()}\n\n"
        f"## Analyse fonctionnelle\n{functional_analysis.strip()}\n\n"
        f"## Analyse technique\n{technical_analysis.strip()}\n\n"
        f"## Opérations appliquées\n{detail}\n"
    )
