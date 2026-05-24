---
name: repo_list_modules
aliases: [list_project_modules]
label: Modules projet
label_en: Project modules
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Parser les __manifest__.py d'un dépôt projet client cloné pour lister les modules custom, leur version, leurs dépendances (depends), leurs fichiers data/demo/assets et le périmètre installable. Utiliser au début d'une analyse de repo client. Ne pas utiliser pour les modules effectivement installés sur une base Odoo connectée (odoo_inspect_modules) ni pour la volumétrie de code (repo_count_source_lines)."
description_en: "Parse __manifest__.py files of a cloned client project repo to list custom modules, version, depends, data/demo/assets files and installable scope. Use at the start of client repo analysis. Do not use for modules actually installed on a connected Odoo database (odoo_inspect_modules) or for code volume (repo_count_source_lines)."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
modes: [assistant, migration, creator]
keywords: [manifest, __manifest__, modules custom, depends, data files, liste modules]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, manifest, project-repo]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/repo-list-modules/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il parse les manifests du dépôt projet.
- Il est plus fiable qu'un grep pour inventorier les modules.

## repo_list_modules
Utilise `repo_list_modules` pour lister modules custom, dépendances, fichiers data/demo, assets, licence et statut installable.

## Quand l'utiliser
- Début d'analyse d'un dépôt client.
- Préparation d'une migration.
- Cadrage d'effort ou revue d'architecture custom.

## Bonnes pratiques
- Regarde `depends` pour comprendre la surface Odoo touchée.
- Regarde `data`, `demo`, `assets`, `installable`, `application`.
- Si un manifest est invalide, signale-le comme risque de packaging.
- Complète avec `repo_read_file` pour les modules les plus critiques.

## Déclencheurs
- Inventaire dépôt, modules custom, dépendances, migration, packaging.

## Séquence recommandée
1. Appelle `repo_list_modules` à la racine.
2. Trie les modules par dépendances métier et fichiers chargés.
3. Lis les manifests ou fichiers critiques avec `repo_read_file`.

## Paramètres
- `path`, `include_invalid`, `limit`.
- Le scan compte tous les manifests (`scanned_manifests`, `total_modules`) puis borne seulement la liste retournée (`returned_modules`, `truncated`, `warning`).
- Si `truncated=true`, ne conclus pas que les modules absents de la liste n'existent pas.

## Pièges
- Manifest valide ne veut pas dire module installé.
- `depends` révèle la surface touchée mais pas toute la logique.

## Combinaisons
- `repo_search_code` pour trouver overrides.
- `repo_count_source_lines` pour volumétrie.

## Critères de réponse
- Donner modules, dépendances, fichiers data/security/assets et risques.
