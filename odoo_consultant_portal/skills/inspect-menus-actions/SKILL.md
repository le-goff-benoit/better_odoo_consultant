---
name: inspect_menus_actions
label: Menus et actions
label_en: Menus and actions
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Retrouver les menus, actions et vues d'entrée qui exposent un modèle ou un écran."
description_en: "Find menus, actions and entry views exposing a model or screen."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [menu, navigation, action, écran, screen, où cliquer, accéder]
code_path: odoo_consultant_portal/skills/inspect-menus-actions/scripts/handler.py
references_auto_load:
  - file: menu_action_graph.md
    triggers: [ir.actions, ir.actions.act_window, ir.actions.server, ir.actions.report, parent_id, parent_path, action serveur, action server, action client, raccourci menu]
---

## Principes communs
- Skill en lecture seule : il relie modèle, actions fenêtre et menus.
- Il évite d'inventer une navigation utilisateur.

## inspect_menus_actions
Utilise `inspect_menus_actions` pour retrouver comment accéder à un écran dans l'instance.

## Quand l'utiliser
- Question "où cliquer", "dans quel menu", "quel écran".
- Tu dois trouver l'action qui ouvre un modèle.
- Tu dois expliquer pourquoi une vue n'apparaît pas dans l'interface.

## Bonnes pratiques
- Recherche par `model` quand le modèle est connu, sinon par `query` sur le libellé.
- Après avoir identifié l'action, utilise `inspect_odoo_view` pour les champs visibles et l'arch réelle.
- Si aucun menu n'est trouvé, vérifie les droits avec `inspect_security`.
