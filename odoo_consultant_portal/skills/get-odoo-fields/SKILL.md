---
name: get_odoo_fields
label: Inspecter les champs
label_en: Inspect fields
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lister les champs d'un modèle, y compris les champs custom Studio (x_*)."
description_en: "List model fields, including Studio custom fields (x_*)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [champ, champs, field, fields, relation, many2one, one2many, many2many, x_, x_studio, structure, schema, invalid field, relation inverse, store, readonly]
code_path: odoo_consultant_portal/skills/get-odoo-fields/scripts/handler.py
references_auto_load:
  - file: field_types_guide.md
    triggers: [type de champ, compute, store=true, related, héritage de champ, many2one, one2many, many2many, selection, _inherit, _inherits, champ calculé]
---

## Principes communs
- Skill en lecture seule : utilise-le pour éviter d'inventer un champ.
- Le résultat décrit l'instance réelle, y compris les champs Studio et modules custom.

## get_odoo_fields
Utilise `get_odoo_fields` pour inspecter les champs d'un modèle Odoo.

## Quand l'utiliser
- Tu ne connais pas le nom exact d'un champ, d'une relation ou d'un champ `x_*`.
- Une requête échoue avec "Invalid field".
- Le Creator doit créer une vue, un rapport ou une modification liée à des champs existants.

## Bonnes pratiques
- Sans `field_names`, lis l'index condensé pour repérer relations et champs custom.
- Avec `field_names`, confirme le détail complet de quelques champs candidats.
- Vérifie les relations many2one/one2many/many2many avant de composer un domain traversant.
- En cas de doute de version, croise avec `search_odoo_source`.

## Déclencheurs
- Nom de champ incertain, relation à traverser, champ Studio, erreur `Invalid field`, domain complexe.
- Avant `query_odoo`, `read_group_odoo`, `inspect_odoo_view` ou Creator si le modèle est personnalisé.

## Séquence recommandée
1. Appelle sans `field_names` pour obtenir la carte du modèle.
2. Identifie les champs candidats et relations.
3. Appelle avec `field_names` pour confirmer les détails.
4. Construis ensuite le domain ou la modification.

## Paramètres
- `model`: modèle exact.
- `field_names`: liste courte quand tu veux les métadonnées détaillées.

## Pièges
- Le label affiché n'est pas le nom technique.
- Un one2many ne se filtre pas comme un many2one.
- Un champ non stocké peut être inutilisable pour certains domains ou groupby.

## Combinaisons
- `query_odoo` après validation des champs.
- `inspect_odoo_view` pour savoir si le champ est visible/modifiable à l'écran.
- `search_project_source` pour retrouver la définition custom.

## Critères de réponse
- Donner les noms techniques, types, relation cible et limites d'usage.
