---
name: read_odoo_file
label: Lire un fichier source
label_en: Read a source file
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Lire le contenu d'un fichier des sources Odoo."
description_en: Read the content of an Odoo source file.
requirement: Sources Odoo téléchargées
requirement_en: Downloaded Odoo sources
modes: [assistant, migration, creator]
keywords: [fichier, file, implémentation, implementation, ligne, read]
code_path: odoo_consultant_portal/skills/read-odoo-file/scripts/handler.py
references_auto_load:
  - file: source_tree_map.md
    triggers: [organisation sources, source tree, community vs enterprise, odoo/addons]
---

## Principes communs
- Skill en lecture seule : il lit un fichier source local.
- Cite chemin et lignes quand tu t'appuies dessus.

## read_odoo_file
Utilise `read_odoo_file` après une recherche source pour lire l'implémentation complète.

## Quand l'utiliser
- `search_odoo_source` a trouvé une méthode, un modèle ou une vue pertinente.
- Tu dois comprendre le comportement exact avant de conseiller.
- Tu dois comparer source et cible en migration.

## Bonnes pratiques
- Lis une fenêtre courte autour des lignes trouvées.
- Si le fichier est long, fais plusieurs lectures ciblées.
- Ne colle pas de gros blocs : synthétise le comportement utile.

## Déclencheurs
- Après une recherche source, besoin de comprendre une méthode, vue, champ ou controller.

## Séquence recommandée
1. Pars d'un chemin trouvé par `search_odoo_source`.
2. Lis une fenêtre courte autour des lignes pertinentes.
3. Élargis seulement si les dépendances locales sont nécessaires.

## Paramètres
- `path`, `start_line`, `end_line`, `max_lines`.
- Le retour contient `returned_lines`, `total_lines`, `truncated`, `warning`. Si `truncated=true`, relance avec une fenêtre suivante ou `max_lines` plus grand.

## Pièges
- Ne cite pas un extrait hors contexte.
- Ne colle pas un fichier entier dans la réponse.

## Combinaisons
- `search_odoo_source` avant lecture.
- `read_target_file` pour comparer une migration.

## Critères de réponse
- Citer fichier/lignes et résumer le comportement utile.
