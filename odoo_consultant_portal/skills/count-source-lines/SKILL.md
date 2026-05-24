---
name: count_source_lines
label: Compter les lignes
label_en: Count lines
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Comptage exhaustif des LOC par module, extension ou dossier."
description_en: "Exhaustive LOC count by module, extension or directory."
requirement: Sources ou dépôt disponible
requirement_en: Sources or repository available
modes: [assistant, migration, creator]
keywords: [loc, ligne, lines, volumétrie, taille, effort]
code_path: odoo_consultant_portal/skills/count-source-lines/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il compte fichiers et lignes de façon exhaustive.
- Les résultats de grep ne sont jamais une volumétrie.

## count_source_lines
Utilise `count_source_lines` pour mesurer LOC par extension, module ou dossier.

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
- `list_project_modules` pour relier LOC et dépendances.
- `search_project_source` pour inspecter les modules les plus volumineux.

## Critères de réponse
- Donner total, répartition, périmètre exact et limite d'interprétation.
