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
