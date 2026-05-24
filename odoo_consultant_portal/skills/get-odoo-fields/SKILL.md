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
keywords: [champ, field, relation, many2one, x_, structure, invalid field]
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
