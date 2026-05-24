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
