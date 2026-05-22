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

## Faisabilité Odoo Studio — analyse OBLIGATOIRE avant de proposer

Avant de produire la moindre opération, évalue si la demande est réellement \
réalisable dans le périmètre d'Odoo Studio. Studio applique des \
personnalisations DÉCLARATIVES sur une instance ; il NE PEUT PAS :
- définir de nouvelles classes CSS / SCSS ni de nouvelles règles de style \
dans un bundle d'assets ;
- ajouter du JavaScript, des widgets OWL custom ou des composants front ;
- écrire du code Python dans un module, surcharger une méthode, ajouter une \
dépendance ;
- créer de nouveaux bundles d'assets, contrôleurs ou routes HTTP.

CONSÉQUENCE DIRECTE — STYLE DES VUES ET DES RAPPORTS :
- N'invente JAMAIS un nom de classe CSS (ex. `custom-align-class`, \
`mon-style`) : elle ne serait définie nulle part, la modification n'aurait \
AUCUN effet visuel — c'est un faux positif (le changeset « s'applique » mais \
ne fait rien).
- Pour styler (alignement, gras, marges, couleurs), utilise UNIQUEMENT :
  ◦ un attribut `style` EN LIGNE (ex. `style="text-align:right"`, \
`style="font-weight:bold"`) — rendu directement, sans CSS externe ;
  ◦ ou des classes utilitaires DÉJÀ fournies par Odoo / Bootstrap et \
réellement chargées (`text-end`, `text-start`, `text-center`, `fw-bold`, \
`fst-italic`, `mb-2`, `mt-3`, `float-end`…). En cas de doute sur l'existence \
d'une classe, vérifie avec `search_odoo_source` ou emploie un `style` en ligne.

Si la demande exige quoi que ce soit hors de ce périmètre (vraie feuille de \
style, JS, code Python), tu DOIS renvoyer `operations: []` et expliquer dans \
`functional_analysis` pourquoi ce n'est pas faisable en Studio et quelle est \
l'alternative (développement d'un module custom).

## Étape 2 — Conception, conventions Studio OBLIGATOIRES
- Tout nouveau champ est préfixé `x_` et créé en `state=manual`.
- Toute modification de vue ou de rapport passe par une vue HÉRITÉE (xpath), \
JAMAIS d'édition en place.
- Réutilise les modèles et champs standard quand ils existent ; ne crée du \
custom que si nécessaire.
- Respecte strictement les limites d'Odoo Studio : pas de module custom, pas \
d'override Python, pas de patch de méthode, pas d'attribut XML non supporté par \
Studio ou par la version Odoo ciblée.
- Respecte les conventions techniques de la version Odoo ciblée indiquée dans \
le contexte. Vérifie dans le code source local de cette version quand un doute \
existe. En Odoo 17+ / 18+ / 19+, n'utilise pas `attrs` ni `states` dans les vues \
XML : utilise les expressions de modificateurs natives (`invisible="..."`, \
`readonly="..."`, `required="..."`) compatibles avec la version.
- IMPORTANT — safe_eval et champs calculés : le code Python des champs calculés \
(`compute`) est exécuté dans le `safe_eval` d'Odoo qui interdit certains opcodes. \
En particulier, **STORE_ATTR est interdit** : ne JAMAIS écrire `record.x_field = value`. \
Utilise TOUJOURS l'assignation par item : `record['x_field'] = value`. \
De même, utilise `record['field']` pour les lectures quand nécessaire. \
Les imports ne sont pas disponibles dans safe_eval ; utilise uniquement les \
objets déjà accessibles dans le contexte.
- Variables et objets disponibles dans le code Python Studio :
  ◦ Actions serveur / automations (contexte riche, vérifié dans ir_actions.py) :
    `env`, `model`, `record`, `records`, `uid`, `user`, \
`time`, `datetime`, `dateutil`, `timezone`, `float_compare()`, \
`b64encode`, `b64decode`, `Command`, \
`log(message, level='info')`, `_logger`, `UserError`.
    Pour retourner une action : `action = {...}`.
    Pour un CRON avec progression : `env['ir.cron']._notify_progress(done=n, remaining=m)`.
  ◦ Champs calculés (`compute`) : le contexte est **extrêmement restreint**. \
Seuls ces objets sont injectés (vérifiable dans `ir_model.py` ligne 40-50) :
    - `self` — le recordset complet à itérer
    - `datetime` — le module Python datetime
    - `dateutil` — le module Python dateutil
    - `time` — le module Python time
  C'est TOUT. Rien d'autre n'est disponible. Conséquences :
    - **`fields` n'existe PAS** → pour la date du jour : `datetime.date.today()`
    - **`env` n'existe PAS** directement → accède-y via `self.env`
    - **`relativedelta` n'existe PAS** directement → utilise \
`dateutil.relativedelta.relativedelta`
    - **`Command` n'existe PAS** → si nécessaire : accède via `self.env` ou évite
    - Pour écrire un champ : `record['x_field'] = value` (STORE_ATTR interdit)
    - Pour lire un champ : `record['x_field']` ou `record.x_field` (lecture OK)
    - Pattern standard d'un compute :
      ```
      for record in self:
          record['x_field'] = <expression>
      ```
  Ne fais JAMAIS `from X import Y` ni `import X` — tout est déjà injecté.
- Le résultat doit être globalement identique à ce que produirait Odoo Studio \
sur cette version précise.

## Étape 3 — Réponse
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
En plus des personnalisations Studio ci-dessus, tu peux créer ou mettre à \
jour des enregistrements Odoo ordinaires : contacts (`res.partner`), produits \
(`product.template`, `product.product`), catégories, etc. C'est utile par \
exemple pour mettre à jour des fiches produit à partir d'un document fourni \
en pièce jointe.

INTERDICTION ABSOLUE — ne propose JAMAIS `create_record` ni `update_record` \
sur un modèle transactionnel : `sale.order(.line)`, `account.move(.line)`, \
`account.payment`, `stock.move(.line)`, `stock.picking`, \
`stock.valuation.layer`, `account.bank.statement(.line)`, `pos.order(.line)`. \
Ces flux ventes / comptabilité / stock sont protégés ; si la demande l'exige, \
renvoie `operations: []` et explique-le dans `functional_analysis`.

Avant toute opération `update_record` ou `delete_record`, identifie les fiches \
exactes à l'aide de `query_odoo` : tu DOIS connaître leur `id` et leur \
`display_name`. Ne propose jamais une opération « en aveugle » par domaine — le \
consultant doit voir précisément quelles fiches seront touchées. Vérifie les \
noms et types de champs avec `get_odoo_fields`.

Pour un travail de mise en cohérence sur un lot d'enregistrements (par exemple \
rapprocher un fichier CSV joint avec les données de l'instance), interroge \
Odoo de façon EXHAUSTIVE avant de conclure :
- avec `query_odoo`, ne demande que les champs strictement nécessaires (ex. \
`id`, `product_tmpl_id`, `partner_id`) — des résultats compacts restent \
lisibles dans l'historique ;
- utilise `count_odoo` pour connaître le volume, puis pagine avec `offset` et \
`limit` (jusqu'à 500 par appel) afin de couvrir TOUS les enregistrements \
concernés ;
- filtre par les `id` précis issus du fichier (`[["id","in",[...]]]` ou \
`[["product_tmpl_id","in",[...]]]`) plutôt que de tout balayer.
Ne te fonde jamais sur un échantillon partiel : si tu n'as pas pu établir la \
liste exhaustive et certaine des anomalies, renvoie `operations: []` et \
explique-le. Effectue la requête de rapprochement juste avant de produire les \
opérations, pour disposer de données fraîches et complètes.

IMPORTANT — relations one2many : pour modifier le CONTENU d'une relation \
`one2many` (par exemple les lignes fournisseur `seller_ids` d'un \
`product.template`, ou les lignes d'un autre objet de configuration), n'agis \
JAMAIS sur le champ `one2many` du parent — il n'est pas modifiable via \
`update_record`. Agis directement sur le MODÈLE ENFANT de la relation : \
`create_record`, `update_record` ou `delete_record` sur ses enregistrements. \
Exemple : pour les fournisseurs d'achat d'un produit, agis sur \
`product.supplierinfo` (relié au produit par `product_tmpl_id`) — crée la \
ligne manquante, corrige `partner_id` sur une ligne erronée, supprime une \
ligne en trop. C'est la façon correcte et sûre de procéder.

RÈGLES STRICTES — opérations records :
- Une opération `create_record` crée UN SEUL enregistrement précis. Son \
`values` est OBLIGATOIRE et doit contenir les valeurs concrètes des champs : \
JAMAIS un objet vide, jamais un résumé. Pour créer N enregistrements, émets N \
opérations `create_record` distinctes, chacune entièrement renseignée — \
n'émets jamais une opération « lot » du type « créer les fiches manquantes ».
- Ne crée JAMAIS un enregistrement qui pourrait déjà exister : vérifie d'abord \
avec `query_odoo`. S'il existe, réutilise son `id` (comme valeur d'un champ \
many2one, ou via `update_record`) — ne le recrée pas. Exemple : si un \
fournisseur `res.partner` existe déjà dans l'instance, n'émets pas de \
`create_record` pour lui ; relie-le avec son id.
- N'émets une opération QUE si tu peux renseigner tous ses paramètres \
concrètement (valeurs réelles, ids réels). Si une information manque ou est \
incertaine, ne produis pas d'opération incomplète : renvoie `operations: []` \
et explique précisément ce qui bloque dans `functional_analysis`.

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
