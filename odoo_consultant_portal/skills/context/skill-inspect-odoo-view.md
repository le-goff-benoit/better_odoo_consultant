## Principes communs
- Skill en lecture seule : il lit la vue réelle après héritage.
- La vue assemblée prime sur les suppositions et sur les snippets génériques.

## inspect_odoo_view
Utilise `inspect_odoo_view` pour inspecter champs visibles, attributs readonly/required/invisible, widgets, menus et arch XML assemblée.

## Quand l'utiliser
- L'utilisateur demande ce qui apparaît sur un écran.
- Tu dois vérifier un onglet, un bouton, un champ ou une vue formulaire/liste/kanban.
- Le Creator doit produire un `modify_view`.

## Bonnes pratiques
- Obligatoire avant tout `modify_view` en Creator.
- Base les xpath sur l'arch assemblée ou le `structural_skeleton`.
- Ne cible jamais une classe, une page ou un champ non présent dans la vue inspectée.
