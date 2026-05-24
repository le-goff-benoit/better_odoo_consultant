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
keywords: [studio, x_studio, personnalisation, personnalisations, customization, custom field, automation, automatisation, base.automation, action serveur, migration studio, modèle custom]
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

## Déclencheurs
- Mention de Studio, `x_*`, champs/modèles custom, automatisations, migration de personnalisations.
- Projet marqué `studio` ou `studio_dev`.

## Séquence recommandée
1. Appelle `inspect_studio` avec `sections=['all']` pour un audit global.
2. Filtre par modèle si la demande est ciblée.
3. Croise vues avec `inspect_odoo_view`, champs avec `get_odoo_fields`.
4. En migration, compare avec code source cible et limitations Studio.

## Paramètres
- `sections`: `models`, `fields`, `views`, `menus`, `server_actions`, `cron`, `automations`, `rules`, `all`.
- `model_filter`: préfixe ou modèle métier.

## Pièges
- Une personnalisation Studio peut masquer un comportement standard.
- Les actions serveur peuvent contenir du Python `safe_eval` risqué.
- Tous les types de vues ne sont pas couverts par Studio.

## Combinaisons
- `load_skill_reference` pour `studio_limits.md` en cas de limite Studio.
- `inspect_security` pour règles et groupes générés.
- `search_project_source` pour distinguer Studio et code custom.

## Critères de réponse
- Classer standard / Studio / custom code et lister les impacts réels.
