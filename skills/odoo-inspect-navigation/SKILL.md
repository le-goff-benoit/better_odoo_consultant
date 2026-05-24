---
name: odoo_inspect_navigation
aliases: [inspect_menus_actions]
label: Menus et actions
label_en: Menus and actions
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Tracer le chemin UI vers un écran Odoo : menu, action (act_window, server, report, client), modèle ciblé, action serveur, raccourci, parent_path. Utiliser quand l'utilisateur demande où cliquer, quel menu ouvre tel modèle, ou comment un écran est exposé dans l'interface. Ne pas utiliser pour le rendu d'une vue (odoo_inspect_view) ni pour les droits d'accès aux menus (odoo_inspect_security)."
description_en: "Trace the UI path to an Odoo screen: menu, action (act_window, server, report, client), target model, server action, shortcut, parent_path. Use when the user asks where to click, which menu opens a model, or how a screen is exposed in the UI. Do not use for view rendering (odoo_inspect_view) or for menu access rights (odoo_inspect_security)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [menu, navigation, naviguer, navigate, navigate to, action, écran, screen, où cliquer, où aller, where click, accéder, access screen, comment naviguer, how to navigate, chemin pour]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-navigation/scripts/handler.py
references_auto_load:
  - file: menu_action_graph.md
    triggers: [ir.actions, ir.actions.act_window, ir.actions.server, ir.actions.report, parent_id, parent_path, action serveur, action server, action client, raccourci menu]
---

## Principes communs
- Skill en lecture seule : il relie modèle, actions fenêtre et menus.
- Il évite d'inventer une navigation utilisateur.

## odoo_inspect_navigation
Utilise `odoo_inspect_navigation` pour retrouver comment accéder à un écran dans l'instance.

## Quand l'utiliser
- Question "où cliquer", "dans quel menu", "quel écran".
- Tu dois trouver l'action qui ouvre un modèle.
- Tu dois expliquer pourquoi une vue n'apparaît pas dans l'interface.

## Bonnes pratiques
- Recherche par `model` quand le modèle est connu, sinon par `query` sur le libellé.
- Après avoir identifié l'action, utilise `odoo_inspect_view` pour les champs visibles et l'arch réelle.
- Si aucun menu n'est trouvé, vérifie les droits avec `odoo_inspect_security`.

## Déclencheurs
- "où cliquer", menu, navigation, action fenêtre, écran introuvable.

## Séquence recommandée
1. Appelle avec `model` si connu, sinon avec `query`.
2. Lis action, view modes et menus retournés.
3. Appelle `odoo_inspect_view` pour le contenu de l'écran.
4. Appelle `odoo_inspect_security` si le menu/action manque.

## Paramètres
- `model`, `query`, `limit`, `max_records`.
- `limit=0` ou absent : actions et menus sont paginés jusqu'à `max_records`.
- Vérifie `actions_meta`, `menus_meta`, `truncated` et `warning` avant de dire qu'aucun menu/action supplémentaire n'existe.

## Pièges
- Un menu peut exister mais être caché par groupes.
- Une action peut exposer plusieurs types de vues.

## Combinaisons
- `odoo_inspect_view` pour champs/boutons.
- `odoo_inspect_security` pour droits.

## Critères de réponse
- Donner chemin menu, action, modèle, vues disponibles et réserve d'accès.
