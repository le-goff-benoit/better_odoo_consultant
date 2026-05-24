---
name: repo_read_file
aliases: [read_project_file]
label: Lire un fichier projet
label_en: Read a project file
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Lire un fichier précis du dépôt projet client cloné (custom module, override _inherit, manifest, security CSV, vue XML, contrôleur) avec citation des lignes. Utiliser après repo_search_code pour confirmer une implémentation custom. Ne pas utiliser pour les sources Odoo standard (source_read_odoo_file) ni pour la version cible d'une migration (migration_read_target_file)."
description_en: "Read a precise file from the cloned client project repo (custom module, _inherit override, manifest, security CSV, XML view, controller) with line references. Use after repo_search_code to confirm a custom implementation. Do not use for standard Odoo sources (source_read_odoo_file) or for a migration target version (migration_read_target_file)."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [repo, fichier custom, repo_read_file, override, manifest]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/repo-read-file/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il lit un fichier du dépôt custom client.
- Cite chemin et lignes quand tu relies le code à une conclusion.

## repo_read_file
Utilise `repo_read_file` pour confirmer l'implémentation exacte d'un module custom.

## Quand l'utiliser
- Après `repo_search_code` ou `repo_list_modules`.
- Tu dois comprendre un override, une vue XML, une règle de sécurité ou un manifest.
- Tu évalues une migration ou une dette technique.

## Bonnes pratiques
- Commence par le manifest pour comprendre dépendances et fichiers chargés.
- Lis ensuite `models`, `views`, `security` ou `data` selon la demande.
- En migration, croise avec `migration_search_target_source`.

## Déclencheurs
- Après `repo_search_code` ou `repo_list_modules`, besoin de preuve complète.

## Séquence recommandée
1. Lis le manifest pour le module ciblé.
2. Lis ensuite le fichier Python/XML/CSV pertinent.
3. Croise l'effet live avec `odoo_inspect_view` ou `odoo_inspect_security`.

## Paramètres
- `path`, `start_line`, `end_line`, `max_lines`.
- Le retour contient `returned_lines`, `total_lines`, `truncated`, `warning`. Si `truncated=true`, relance avec une fenêtre suivante ou `max_lines` plus grand.

## Pièges
- Un fichier data peut être chargé sous conditions ou en démo.
- Une surcharge peut dépendre de l'ordre d'installation et des dépendances.

## Combinaisons
- `repo_search_code` pour trouver les chemins.
- `migration_search_target_source` pour compatibilité migration.

## Critères de réponse
- Citer chemin/lignes et relier le code à l'effet observé.
