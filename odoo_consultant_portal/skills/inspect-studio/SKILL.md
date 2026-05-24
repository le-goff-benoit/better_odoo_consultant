---
name: inspect_studio
label: Audit Studio
label_en: Studio audit
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Inventorier les personnalisations Odoo Studio : modèles, champs, vues, menus, automatisations."
description_en: "Inventory Odoo Studio customizations: models, fields, views, menus, automations."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [studio, x_studio, personnalisation, customization, automation, migration studio]
version: "1.0.0"
tags: [odoo, studio, audit]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: odoo_consultant_portal/skills/inspect-studio/scripts/handler.py
references_auto_load:
  - file: studio_limits.md
    triggers: [limite studio, limites studio, limites de studio, limitations studio, studio limit, vue calendar, vue gantt, vue cohort, calendar studio, gantt studio, via studio, par studio, dans studio, avec studio, x_studio_, studio_customization, base.automation, migration studio, studio ne permet, peux pas studio, possible avec studio]
---

## Principes communs
- Skill en lecture seule : il inventorie les personnalisations Studio de l'instance réelle.
- Distingue toujours standard Odoo, Studio et code custom.

## inspect_studio
Utilise `inspect_studio` pour lister modèles `x_*`, champs `x_*`, vues, menus, actions serveur, crons, automatisations et règles.

## Quand l'utiliser
- Audit Studio, préparation de migration, estimation d'effort.
- Avant une opération Creator sensible.
- Quand l'utilisateur parle de personnalisations, champs custom ou automatisations.

## Bonnes pratiques
- Filtre par modèle avec `model_filter` quand la demande est ciblée.
- En migration, lis modèles, champs, vues, server actions, crons et automations.
- Croise les actions serveur et automatisations avec les risques safe_eval.
