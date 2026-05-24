---
name: inspect_installed_modules
label: Modules installés
label_en: Installed modules
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lister les modules installés et distinguer applications, modules techniques et modules custom probables."
description_en: "List installed modules and distinguish apps, technical modules and likely custom modules."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [module installé, installed module, apps, application, dépendance, stack]
code_path: odoo_consultant_portal/skills/inspect-installed-modules/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le pour comprendre le périmètre réel de l'instance.
- Les modules installés guident les réponses fonctionnelles, techniques et migration.

## inspect_installed_modules
Utilise `inspect_installed_modules` pour lister applications, modules techniques, versions installées et modules custom probables.

## Quand l'utiliser
- Début d'audit, cadrage de migration, diagnostic d'une fonctionnalité absente.
- Tu dois savoir si Enterprise, Studio, subscription, helpdesk, mrp, pos, payroll, etc. sont installés.
- Tu veux croiser l'instance avec le dépôt projet.

## Bonnes pratiques
- En migration projet, commence souvent par ce skill puis `inspect_studio`.
- Ne conclus pas qu'une fonctionnalité est absente sans vérifier module installé, droits et menus.
- Les modules "probablement custom" sont des indices, pas une preuve : confirme avec `list_project_modules` si un dépôt existe.

## Déclencheurs
- Audit, cadrage migration, fonctionnalité absente, stack applicative, Enterprise/Studio/OCA.

## Séquence recommandée
1. Appelle `inspect_installed_modules`.
2. Filtre par app ou mot-clé si la liste est longue.
3. Croise avec `inspect_studio` et `list_project_modules`.

## Paramètres
- `filter`, `apps_only`, `limit`, `max_records`.
- `limit=0` ou absent : lecture exhaustive bornée jusqu'à `max_records`.
- Vérifie `total_count`, `count`, `truncated`, `warning` avant de conclure qu'un module est absent.

## Pièges
- Module installé ne veut pas dire configuré ou utilisé.
- Module custom probable doit être confirmé dans le dépôt.

## Combinaisons
- `inspect_menus_actions` pour savoir si l'app expose un écran.
- `query_odoo` / `count_odoo` pour mesurer l'usage réel.

## Critères de réponse
- Lister apps/modules pertinents, statut custom probable et implication métier/migration.
