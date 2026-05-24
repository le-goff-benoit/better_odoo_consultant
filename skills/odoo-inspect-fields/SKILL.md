---
name: odoo_inspect_fields
aliases: [get_odoo_fields]
label: Inspecter les champs
label_en: Inspect fields
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lister les champs d'un modèle Odoo : types, relations many2one/one2many/many2many, attributs readonly/store/required/compute, champs Studio x_*. Utiliser avant odoo_query_records pour valider un domaine, identifier un champ inconnu, vérifier une relation inverse ou repérer les personnalisations. Ne pas utiliser pour lire les données d'un modèle (odoo_query_records) ni pour l'architecture XML d'une vue (odoo_inspect_view)."
description_en: "List the fields of an Odoo model: types, many2one/one2many/many2many relations, readonly/store/required/compute attributes, Studio x_* fields. Use before odoo_query_records to validate a domain, identify an unknown field, check an inverse relation or spot customizations. Do not use to read model data (odoo_query_records) or for a view's XML arch (odoo_inspect_view)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [champ, champs, field, fields, relation, many2one, one2many, many2many, x_, x_studio, structure, schema, invalid field, relation inverse, store, readonly]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-fields/scripts/handler.py
references_auto_load:
  - file: field_types_guide.md
    triggers: [type de champ, compute, store=true, related, héritage de champ, many2one, one2many, many2many, selection, _inherit, _inherits, champ calculé]
---

## Principes communs
- Skill en lecture seule : utilise-le pour éviter d'inventer un champ.
- Le résultat décrit l'instance réelle, y compris les champs Studio et modules custom.

## odoo_inspect_fields
Utilise `odoo_inspect_fields` pour inspecter les champs d'un modèle Odoo.

## Quand l'utiliser
- Tu ne connais pas le nom exact d'un champ, d'une relation ou d'un champ `x_*`.
- Une requête échoue avec "Invalid field".
- Le Creator doit créer une vue, un rapport ou une modification liée à des champs existants.

## Bonnes pratiques
- Sans `field_names`, lis l'index condensé pour repérer relations et champs custom.
- Avec `field_names`, confirme le détail complet de quelques champs candidats.
- Vérifie les relations many2one/one2many/many2many avant de composer un domain traversant.
- En cas de doute de version, croise avec `source_search_odoo`.

## Déclencheurs
- Nom de champ incertain, relation à traverser, champ Studio, erreur `Invalid field`, domain complexe.
- Avant `odoo_query_records`, `odoo_aggregate_records`, `odoo_inspect_view` ou Creator si le modèle est personnalisé.

## Séquence recommandée
1. Appelle sans `field_names` pour obtenir la carte du modèle.
2. Identifie les champs candidats et relations.
3. Appelle avec `field_names` pour confirmer les détails.
4. Construis ensuite le domain ou la modification.

## Paramètres
- `model`: modèle exact.
- `field_names`: liste courte quand tu veux les métadonnées détaillées.
- `max_fields`: taille de l'index condensé sans `field_names` (défaut 150, max 1000).
- Vérifie `truncated` / `warning` : si l'index est borné, ne conclus pas qu'un champ absent n'existe pas sans `field_names` ou `max_fields` plus grand.

## Pièges
- Le label affiché n'est pas le nom technique.
- Un one2many ne se filtre pas comme un many2one.
- Un champ non stocké peut être inutilisable pour certains domains ou groupby.

## Combinaisons
- `odoo_query_records` après validation des champs.
- `odoo_inspect_view` pour savoir si le champ est visible/modifiable à l'écran.
- `repo_search_code` pour retrouver la définition custom.

## Critères de réponse
- Donner les noms techniques, types, relation cible et limites d'usage.
