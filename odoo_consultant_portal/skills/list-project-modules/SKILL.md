---
name: list_project_modules
label: Modules projet
label_en: Project modules
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Parser les manifests du dépôt client pour lister modules, dépendances et fichiers déclarés."
description_en: "Parse client repository manifests to list modules, dependencies and declared files."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
modes: [assistant, migration, creator]
keywords: [manifest, __manifest__, modules custom, depends, data files, liste modules]
version: "1.0.0"
tags: [odoo, manifest, project-repo]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: odoo_consultant_portal/skills/list-project-modules/scripts/handler.py
---

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
