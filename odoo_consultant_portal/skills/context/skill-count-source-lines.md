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
