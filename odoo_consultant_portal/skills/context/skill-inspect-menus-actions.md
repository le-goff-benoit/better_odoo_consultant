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
