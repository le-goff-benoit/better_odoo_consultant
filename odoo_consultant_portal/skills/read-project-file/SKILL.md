---
name: read_project_file
label: Lire un fichier projet
label_en: Read a project file
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: Lire un fichier du dépôt custom client.
description_en: "Read a file from the client's custom repository."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
modes: [assistant, migration, creator]
keywords: [repo, fichier custom, read_project_file, override, manifest]
code_path: odoo_consultant_portal/skills/read-project-file/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il lit un fichier du dépôt custom client.
- Cite chemin et lignes quand tu relies le code à une conclusion.

## read_project_file
Utilise `read_project_file` pour confirmer l'implémentation exacte d'un module custom.

## Quand l'utiliser
- Après `search_project_source` ou `list_project_modules`.
- Tu dois comprendre un override, une vue XML, une règle de sécurité ou un manifest.
- Tu évalues une migration ou une dette technique.

## Bonnes pratiques
- Commence par le manifest pour comprendre dépendances et fichiers chargés.
- Lis ensuite `models`, `views`, `security` ou `data` selon la demande.
- En migration, croise avec `search_target_source`.
