---
name: odoo_inspect_studio
aliases: [inspect_studio]
label: Audit Studio
label_en: Studio audit
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Auditer les personnalisations Odoo Studio : modèles x_*, champs x_studio_*, vues studio, menus, automatisations base.automation, actions serveur ajoutées via Studio, dette no-code, risques migration. Utiliser pour évaluer la complexité Studio d'un projet ou préparer une migration. Ne pas utiliser pour le code custom d'un module développeur (repo_search_code) ni pour des champs métier standards (odoo_inspect_fields)."
description_en: "Audit Odoo Studio customizations: x_* models, x_studio_* fields, studio views, menus, base.automation rules, server actions added via Studio, no-code debt, migration risks. Use to assess a project's Studio complexity or prepare a migration. Do not use for developer-module custom code (repo_search_code) or for standard business fields (odoo_inspect_fields)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [studio, x_studio, personnalisation, personnalisations, customization, custom field, automation, automatisation, base.automation, action serveur, migration studio, modèle custom]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, studio, audit]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/odoo-inspect-studio/scripts/handler.py
references_auto_load:
  - file: studio_limits.md
    triggers: [limite studio, limites studio, limites de studio, limitations studio, studio limit, vue calendar, vue gantt, vue cohort, calendar studio, gantt studio, via studio, par studio, dans studio, avec studio, x_studio_, studio_customization, base.automation, migration studio, studio ne permet, peux pas studio, possible avec studio]
---

## Principes communs
- Skill en lecture seule : il inventorie les personnalisations Studio de l'instance réelle.
- Distingue toujours standard Odoo, Studio et code custom.

## Choisir entre odoo_inspect_studio et les skills voisins

| Question | Skill à appeler |
|---|---|
| « Y a-t-il des champs x_studio_* ou des automatisations Studio ? » | `odoo_inspect_studio` |
| « À quoi ressemble la vue assemblée finalement ? » | `odoo_inspect_view` |
| « Y a-t-il un override Python dans le module custom ? » | `repo_search_code` |
| « Quels champs métier le modèle expose-t-il ? » | `odoo_inspect_fields` |
| « L'automatisation vient-elle du standard Odoo ou de Studio ? » | `odoo_inspect_studio` puis `source_search_odoo` pour confirmer |

## odoo_inspect_studio
Utilise `odoo_inspect_studio` pour lister modèles `x_*`, champs `x_*`, vues, menus, actions serveur, crons, automatisations et règles.

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
1. Appelle `odoo_inspect_studio` avec `sections=['all']` pour un audit global.
2. Filtre par modèle si la demande est ciblée.
3. Croise vues avec `odoo_inspect_view`, champs avec `odoo_inspect_fields`.
4. En migration, compare avec code source cible et limitations Studio.

## Paramètres
- `sections`: `models`, `fields`, `views`, `menus`, `server_actions`, `cron`, `automations`, `rules`, `all`.
- `model_filter`: préfixe ou modèle métier.
- Chaque section retourne `count`, `total_count`, `pages_fetched`, `truncated` et `warning`. Si `truncated=false`, la section est exhaustive pour les records visibles dans l'instance.

## Pièges
- Une personnalisation Studio peut masquer un comportement standard.
- Les actions serveur peuvent contenir du Python `safe_eval` risqué.
- Tous les types de vues ne sont pas couverts par Studio.
- Ne jamais dire qu'une liste Studio est complète si `truncated=true`; relancer avec un filtre plus ciblé.

## Combinaisons
- `load_skill_reference` pour `studio_limits.md` en cas de limite Studio.
- `odoo_inspect_security` pour règles et groupes générés.
- `repo_search_code` pour distinguer Studio et code custom.

## Critères de réponse
- Classer standard / Studio / custom code et lister les impacts réels.
