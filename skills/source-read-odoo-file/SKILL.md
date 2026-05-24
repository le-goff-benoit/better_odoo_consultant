---
name: source_read_odoo_file
aliases: [read_odoo_file]
label: Lire un fichier source
label_en: Read a source file
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Lire un fichier précis des sources Odoo standard (Community ou Enterprise) de la version courante, avec citation des lignes : modèle, méthode, vue XML brute, rapport QWeb, manifest. Utiliser après source_search_odoo pour confirmer une implémentation standard. Ne pas utiliser pour la version cible d'une migration (migration_read_target_file) ni pour le dépôt projet client custom (repo_read_file)."
description_en: "Read a precise file from current-version standard Odoo sources (Community or Enterprise) with line references: model, method, raw XML view, QWeb report, manifest. Use after source_search_odoo to confirm a standard implementation. Do not use for a migration target version (migration_read_target_file) or the client custom project repo (repo_read_file)."
requirement: Sources Odoo téléchargées
requirement_en: Downloaded Odoo sources
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [fichier, file, implémentation, implementation, ligne, read]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/source-read-odoo-file/scripts/handler.py
references_auto_load:
  - file: source_tree_map.md
    triggers: [organisation sources, source tree, community vs enterprise, odoo/addons]
---

## Principes communs
- Skill en lecture seule : il lit un fichier source local.
- Cite chemin et lignes quand tu t'appuies dessus.

## source_read_odoo_file
Utilise `source_read_odoo_file` après une recherche source pour lire l'implémentation complète.

## Quand l'utiliser
- `source_search_odoo` a trouvé une méthode, un modèle ou une vue pertinente.
- Tu dois comprendre le comportement exact avant de conseiller.
- Tu dois comparer source et cible en migration.

## Bonnes pratiques
- Lis une fenêtre courte autour des lignes trouvées.
- Si le fichier est long, fais plusieurs lectures ciblées.
- Ne colle pas de gros blocs : synthétise le comportement utile.

## Déclencheurs
- Après une recherche source, besoin de comprendre une méthode, vue, champ ou controller.

## Séquence recommandée
1. Pars d'un chemin trouvé par `source_search_odoo`.
2. Lis une fenêtre courte autour des lignes pertinentes.
3. Élargis seulement si les dépendances locales sont nécessaires.

## Paramètres
- `path`, `start_line`, `end_line`, `max_lines`.
- Le retour contient `returned_lines`, `total_lines`, `truncated`, `warning`. Si `truncated=true`, relance avec une fenêtre suivante ou `max_lines` plus grand.

## Pièges
- Ne cite pas un extrait hors contexte.
- Ne colle pas un fichier entier dans la réponse.

## Combinaisons
- `source_search_odoo` avant lecture.
- `migration_read_target_file` pour comparer une migration.

## Critères de réponse
- Citer fichier/lignes et résumer le comportement utile.
