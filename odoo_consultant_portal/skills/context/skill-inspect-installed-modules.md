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
