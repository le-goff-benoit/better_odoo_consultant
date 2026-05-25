# Anatomie d'un manifest Odoo

Champs utiles pour le graphe :

- `depends` : dépendances de chargement module.
- `data` : fichiers chargés en production.
- `demo` : fichiers chargés seulement en démo.
- `assets` : bundles web, souvent critiques pour POS, Website et backend UI.
- `installable` : module installable ou historique.

Dans un cadrage migration, les dépendances externes inconnues et les cycles signalent souvent une dette de packaging.
