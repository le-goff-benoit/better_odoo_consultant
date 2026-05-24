---
name: odoo_inspect_modules
aliases: [inspect_installed_modules]
label: Modules installés
label_en: Installed modules
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Inventorier les modules effectivement installés sur une base Odoo connectée : applications, modules techniques, modules custom probables, version installée, dépendances. Utiliser pour cadrage projet, scoping migration ou diagnostic de stack live. Ne pas utiliser pour les modules présents dans un dépôt client cloné (repo_list_modules) ni pour le code source Odoo (source_search_odoo)."
description_en: "Inventory the modules actually installed on a live Odoo database: apps, technical modules, likely custom modules, installed version, dependencies. Use for project scoping, migration scoping or live stack diagnosis. Do not use for modules in a cloned client repository (repo_list_modules) or Odoo source code (source_search_odoo)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [module installé, installed module, apps, application, dépendance, stack]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-modules/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le pour comprendre le périmètre réel de l'instance.
- Les modules installés guident les réponses fonctionnelles, techniques et migration.

## odoo_inspect_modules
Utilise `odoo_inspect_modules` pour lister applications, modules techniques, versions installées et modules custom probables.

## Quand l'utiliser
- Début d'audit, cadrage de migration, diagnostic d'une fonctionnalité absente.
- Tu dois savoir si Enterprise, Studio, subscription, helpdesk, mrp, pos, payroll, etc. sont installés.
- Tu veux croiser l'instance avec le dépôt projet.

## Bonnes pratiques
- En migration projet, commence souvent par ce skill puis `odoo_inspect_studio`.
- Ne conclus pas qu'une fonctionnalité est absente sans vérifier module installé, droits et menus.
- Les modules "probablement custom" sont des indices, pas une preuve : confirme avec `repo_list_modules` si un dépôt existe.

## Déclencheurs
- Audit, cadrage migration, fonctionnalité absente, stack applicative, Enterprise/Studio/OCA.

## Séquence recommandée
1. Appelle `odoo_inspect_modules`.
2. Filtre par app ou mot-clé si la liste est longue.
3. Croise avec `odoo_inspect_studio` et `repo_list_modules`.

## Paramètres
- `filter`, `apps_only`, `limit`, `max_records`.
- `limit=0` ou absent : lecture exhaustive bornée jusqu'à `max_records`.
- Vérifie `total_count`, `count`, `truncated`, `warning` avant de conclure qu'un module est absent.

## Pièges
- Module installé ne veut pas dire configuré ou utilisé.
- Module custom probable doit être confirmé dans le dépôt.

## Combinaisons
- `odoo_inspect_navigation` pour savoir si l'app expose un écran.
- `odoo_query_records` / `odoo_count_records` pour mesurer l'usage réel.

## Critères de réponse
- Lister apps/modules pertinents, statut custom probable et implication métier/migration.
