---
name: search_odoo_source
label: Chercher dans les sources
label_en: Search source code
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: Grep dans le code source Odoo Community/Enterprise téléchargé localement.
description_en: Grep in locally downloaded Odoo Community/Enterprise source code.
requirement: Sources Odoo téléchargées
requirement_en: Downloaded Odoo sources
modes: [assistant, migration, creator]
keywords: [source, code odoo, grep, méthode, model, class, standard]
code_path: odoo_consultant_portal/skills/search-odoo-source/scripts/handler.py
references_auto_load:
  - file: source_tree_map.md
    triggers: [organisation sources, source tree, community vs enterprise, odoo/addons, où se trouve, _name = , _inherit = , manifest depends]
---

## Principes communs
- Skill en lecture seule : il cherche dans les sources Odoo locales.
- Le code source local prime sur les souvenirs de version.

## search_odoo_source
Utilise `search_odoo_source` pour vérifier modèles, champs, méthodes, vues, controllers et comportements standard.

## Quand l'utiliser
- Question technique sur Odoo standard.
- Tu dois confirmer un nom exact avant de répondre.
- Tu compares standard, Enterprise et custom.

## Bonnes pratiques
- Cherche d'abord largement, puis restreins `path`.
- Community : souvent `community/addons/<module>`.
- Module `base` et coeur ORM : `community/odoo/...`.
- Enterprise : `enterprise/<module>`, pas `addons/<module>`.
