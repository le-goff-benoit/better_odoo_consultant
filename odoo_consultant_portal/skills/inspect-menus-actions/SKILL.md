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

## Déclencheurs
- "où cliquer", menu, navigation, action fenêtre, écran introuvable.

## Séquence recommandée
1. Appelle avec `model` si connu, sinon avec `query`.
2. Lis action, view modes et menus retournés.
3. Appelle `inspect_odoo_view` pour le contenu de l'écran.
4. Appelle `inspect_security` si le menu/action manque.

## Paramètres
- `model`, `query`, `limit`.

## Pièges
- Un menu peut exister mais être caché par groupes.
- Une action peut exposer plusieurs types de vues.

## Combinaisons
- `inspect_odoo_view` pour champs/boutons.
- `inspect_security` pour droits.

## Critères de réponse
- Donner chemin menu, action, modèle, vues disponibles et réserve d'accès.
