---
name: git_show_commit
label: Voir un commit
label_en: Show a commit
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Afficher le diff complet d'un commit Odoo ou projet par son SHA."
description_en: Display the full diff of an Odoo or project commit by its SHA.
requirement: Sources ou dépôt Git disponible
requirement_en: Sources or Git repository available
modes: [assistant, migration, creator]
keywords: [commit, sha, diff, patch, git, changement]
version: "1.0.0"
tags: [git, source-code, history]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
templates:
  - name: changelog_entry
    label: Entrée CHANGELOG
    triggers: [changelog, entrée changelog, changelog entry, release note]
code_path: odoo_consultant_portal/skills/git-show-commit/scripts/handler.py
references_auto_load:
  - file: odoo_commit_conventions.md
    triggers: ["[FIX]", "[IMP]", "[ADD]", "[REM]", "[REF]", "[MOV]", "[REV]", "[CLA]", "[I18N]", "[PERF]", tag commit, convention commit, conventional commits odoo, message commit]
---

## Principes communs
- Skill en lecture seule : il lit le contenu réel d'un commit local.
- N'invente jamais le contenu d'un SHA.

## git_show_commit
Utilise `git_show_commit` dès que l'utilisateur référence un SHA de commit.

## Quand l'utiliser
- Analyse d'un commit Odoo, Enterprise, version cible ou dépôt projet.
- Recherche d'impact d'un patch.
- Comparaison avant/après ou suspicion de régression.

## Bonnes pratiques
- Choisis le bon scope : `odoo`, `enterprise`, `target`, `project`.
- Résume auteur, date, message, fichiers touchés, insertions/suppressions et impact.
- Si le diff est tronqué, signale-le et propose une lecture ciblée d'un fichier.

## Déclencheurs
- SHA Git, commit, patch, diff, régression, "qu'est-ce qui a changé".

## Séquence recommandée
1. Choisis le scope.
2. Appelle `git_show_commit`.
3. Si le diff est long, lis les fichiers critiques avec le skill de lecture adapté.

## Paramètres
- `sha`, `scope`, `max_lines`.

## Pièges
- Ne jamais inférer le contenu d'un SHA sans l'outil.
- Un diff tronqué ne suffit pas pour conclure sur tous les impacts.

## Combinaisons
- `read_odoo_file`, `read_target_file` ou `read_project_file` après identification des fichiers.

## Critères de réponse
- Auteur/date/message, fichiers, stats, impact et suite de vérification.
