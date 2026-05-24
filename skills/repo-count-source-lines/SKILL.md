---
name: repo_count_source_lines
aliases: [count_source_lines]
label: Compter les lignes
label_en: Count lines
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Mesurer la volumétrie de code (LOC, nombre de fichiers, taille par module, estimation d'effort de migration) dans un dépôt projet cloné ou les sources Odoo locales. Utiliser pour chiffrer une migration, comparer des modules custom ou prioriser un audit. Ne pas utiliser pour le nombre d'enregistrements en base (odoo_count_records) ni pour l'inventaire fonctionnel des modules (repo_list_modules)."
description_en: "Measure code volume (LOC, file count, per-module size, migration effort estimate) in a cloned project repo or local Odoo sources. Use to size a migration, compare custom modules or prioritize an audit. Do not use for database record counts (odoo_count_records) or for a functional module inventory (repo_list_modules)."
requirement: Sources ou dépôt disponible
requirement_en: Sources or repository available
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [loc, ligne, lines, volumétrie, taille, effort]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/repo-count-source-lines/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il compte fichiers et lignes de façon exhaustive.
- Les résultats de grep ne sont jamais une volumétrie.

## repo_count_source_lines
Utilise `repo_count_source_lines` pour mesurer LOC par extension, module ou dossier.

## Quand l'utiliser
- Estimation d'effort de migration.
- Comparaison de taille entre modules.
- Audit technique ou priorisation de revue.

## Bonnes pratiques
- Groupe par `module` pour un dépôt Odoo/custom.
- Groupe par `extension` pour savoir où est l'effort Python/XML/JS.
- Restreins `path` et `file_types` si le dépôt est très gros.
- Présente la volumétrie comme un indicateur d'effort, pas comme une complexité suffisante à elle seule.

## Déclencheurs
- "combien de lignes", "volumétrie", "LOC", taille d'un module, effort de migration.

## Séquence recommandée
1. Choisis le `scope` (`odoo`, `target`, `project`).
2. Restreins `path` si un module est ciblé.
3. Groupe par `module`, `extension` ou `directory` selon la décision à prendre.

## Paramètres
- `scope`, `path`, `file_types`, `group_by`.

## Pièges
- Une volumétrie n'est pas une complexité métier.
- Les résultats de recherche source ne remplacent jamais ce comptage exhaustif.
- Si `groups_truncated=true`, les totaux restent exhaustifs mais la répartition `by_group` est bornée : annoncer `warning`.

## Combinaisons
- `repo_list_modules` pour relier LOC et dépendances.
- `repo_search_code` pour inspecter les modules les plus volumineux.

## Critères de réponse
- Donner total, répartition, périmètre exact et limite d'interprétation.
