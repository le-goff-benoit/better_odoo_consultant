---
name: odoo_inspect_view
aliases: [inspect_odoo_view]
label: Inspecter une vue
label_en: Inspect a view
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Voir l'architecture XML finale d'une vue Odoo après assemblage des héritages : form, list, kanban, search, calendar ; xpath, position, mode primary/extension, readonly, invisible, champs visibles, boutons, onglets. Utiliser pour diagnostiquer un héritage de vue ou une visibilité conditionnelle. Ne pas utiliser pour un rapport PDF (odoo_inspect_report), un menu/action (odoo_inspect_navigation) ou les fichiers XML bruts non assemblés (source_search_odoo)."
description_en: "Get the final assembled XML arch of an Odoo view after inheritance: form, list, kanban, search, calendar; xpath, position, primary/extension mode, readonly, invisible, visible fields, buttons, tabs. Use to diagnose view inheritance or conditional visibility. Do not use for PDF reports (odoo_inspect_report), menus/actions (odoo_inspect_navigation) or raw unassembled XML files (source_search_odoo)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [vue, view, écran, ecran, screen, form, formulaire, list, tree, kanban, xpath, readonly, invisible, bouton, onglet, champ visible, creator]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-view/scripts/handler.py
references_auto_load:
  - file: view_inheritance_primer.md
    triggers: [xpath, héritage vue, heritage vue, view inheritance, inherit_id, position=, mode primary, mode extension, priority vue]
---

## Principes communs
- Skill en lecture seule : il lit la vue réelle après héritage.
- La vue assemblée prime sur les suppositions et sur les snippets génériques.

## odoo_inspect_view
Utilise `odoo_inspect_view` pour inspecter champs visibles, attributs readonly/required/invisible, widgets, menus et arch XML assemblée.

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
2. Utilise `odoo_inspect_navigation` si l'accès/menu n'est pas clair.
3. Appelle `odoo_inspect_view`.
4. Croise avec `odoo_inspect_security` si l'affichage dépend des droits.

## Paramètres
- `model`: modèle de l'écran.
- `view_type`: `form`, `list`, `kanban`, etc.
- `view_id`: seulement si une vue précise est connue.

## Pièges
- La vue assemblée est la vérité ; le XML source isolé peut être trompeur.
- Un champ peut être présent mais invisible via attributs, groupes ou modifiers.
- En Odoo récent, `tree` côté utilisateur correspond souvent à `list`.

## Combinaisons
- `odoo_inspect_navigation` pour retrouver le chemin UI.
- `odoo_inspect_fields` pour comprendre les champs.
- `odoo_inspect_security` pour les groupes et accès.

## Critères de réponse
- Citer vue/type, chemin menu si connu, champs/boutons observés et preuve dans l'arch.
