---
name: inspect_odoo_view
label: Inspecter une vue
label_en: Inspect a view
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lire l'arch XML assemblée d'une vue après héritage complet."
description_en: Read the assembled XML arch of a view after full inheritance.
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [vue, view, form, list, kanban, xpath, readonly, invisible, creator]
code_path: odoo_consultant_portal/skills/inspect-odoo-view/scripts/handler.py
references_auto_load:
  - file: view_inheritance_primer.md
    triggers: [xpath, héritage vue, heritage vue, view inheritance, inherit_id, position=, mode primary, mode extension, priority vue]
---

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
