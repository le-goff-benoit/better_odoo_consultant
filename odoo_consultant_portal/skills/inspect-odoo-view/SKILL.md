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
keywords: [vue, view, écran, ecran, screen, form, formulaire, list, tree, kanban, xpath, readonly, invisible, bouton, onglet, champ visible, creator]
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

## Déclencheurs
- Question sur un écran, champ invisible/readonly, bouton absent, xpath, héritage de vue.
- Avant toute recommandation de modification XML.

## Séquence recommandée
1. Identifie le modèle et le type de vue.
2. Utilise `inspect_menus_actions` si l'accès/menu n'est pas clair.
3. Appelle `inspect_odoo_view`.
4. Croise avec `inspect_security` si l'affichage dépend des droits.

## Paramètres
- `model`: modèle de l'écran.
- `view_type`: `form`, `list`, `kanban`, etc.
- `view_id`: seulement si une vue précise est connue.

## Pièges
- La vue assemblée est la vérité ; le XML source isolé peut être trompeur.
- Un champ peut être présent mais invisible via attributs, groupes ou modifiers.
- En Odoo récent, `tree` côté utilisateur correspond souvent à `list`.

## Combinaisons
- `inspect_menus_actions` pour retrouver le chemin UI.
- `get_odoo_fields` pour comprendre les champs.
- `inspect_security` pour les groupes et accès.

## Critères de réponse
- Citer vue/type, chemin menu si connu, champs/boutons observés et preuve dans l'arch.
