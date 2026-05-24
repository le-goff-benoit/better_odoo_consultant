---
name: migration_read_target_file
aliases: [read_target_file]
label: Lire un fichier cible
label_en: Read target file
kind: tool
group: target
builtin: false
read_only: true
risk_level: low
description: "Lire un fichier précis des sources Odoo de la version cible de migration (modèle, vue, manifest, méthode standard) avec citation des lignes. Utiliser après migration_search_target_source pour confirmer un renommage, une nouvelle API, vérifier l'implémentation cible ou comparer source→cible. Ne pas utiliser pour la version courante (source_read_odoo_file) ni pour le dépôt projet client (repo_read_file)."
description_en: "Read a precise file from target-version Odoo sources during migration (model, view, manifest, standard method) with line references. Use after migration_search_target_source to confirm a rename, new API, target implementation or source→target comparison. Do not use for current-version sources (source_read_odoo_file) or the client project repo (repo_read_file)."
requirement: Sources cible téléchargées
requirement_en: Downloaded target sources
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [migration]
keywords: [migration, target, version cible, fichier cible]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/migration-read-target-file/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il lit un fichier de la version cible.
- Sépare clairement observations source et cible.

## migration_read_target_file
Utilise `migration_read_target_file` après `migration_search_target_source` pour lire l'implémentation cible.

## Quand l'utiliser
- Tu dois confirmer le comportement exact dans la version d'arrivée.
- Tu compares une méthode, vue, modèle ou champ entre versions.
- Tu rédiges une action de migration technique.

## Bonnes pratiques
- Cite le chemin cible.
- Compare avec `source_read_odoo_file` côté source si nécessaire.
- Ne généralise pas un changement sans preuve dans les deux versions.

## Déclencheurs
- Après `migration_search_target_source`, besoin de confirmer l'implémentation cible.

## Séquence recommandée
1. Lis la zone cible autour du symbole.
2. Lis la source équivalente avec `source_read_odoo_file`.
3. Conclus uniquement sur les différences vérifiées.

## Paramètres
- `path`, `start_line`, `end_line`, `max_lines`.
- Le retour contient `returned_lines`, `total_lines`, `truncated`, `warning`. Si `truncated=true`, relance avec une fenêtre suivante ou `max_lines` plus grand.

## Pièges
- Une méthode peut être déplacée vers un mixin ou un service.
- Un changement cible doit être relié au module exact.

## Combinaisons
- `migration_search_target_source` avant lecture.
- `repo_read_file` pour adapter le custom.

## Critères de réponse
- Citer fichier/lignes cible et action de migration.
