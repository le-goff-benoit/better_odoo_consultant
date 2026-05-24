## Principes communs
- Skill en lecture seule : il parse les manifests du dépôt projet.
- Il est plus fiable qu'un grep pour inventorier les modules.

## list_project_modules
Utilise `list_project_modules` pour lister modules custom, dépendances, fichiers data/demo, assets, licence et statut installable.

## Quand l'utiliser
- Début d'analyse d'un dépôt client.
- Préparation d'une migration.
- Cadrage d'effort ou revue d'architecture custom.

## Bonnes pratiques
- Regarde `depends` pour comprendre la surface Odoo touchée.
- Regarde `data`, `demo`, `assets`, `installable`, `application`.
- Si un manifest est invalide, signale-le comme risque de packaging.
- Complète avec `read_project_file` pour les modules les plus critiques.
