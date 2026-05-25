---
name: source_show_commit
aliases: [git_show_commit]
label: Voir un commit
label_en: Show a commit
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Analyser un commit Git précis dans les sources Odoo ou un dépôt projet : diff complet, message, fichiers modifiés, auteur, date, génération d'une entrée changelog, diagnostic de régression ou de patch. Utiliser dès que l'utilisateur fournit un SHA ou demande l'historique d'un changement spécifique. Ne pas utiliser pour lire un fichier source précis sans SHA (source_read_odoo_file), pour chercher du code dans les sources sans SHA (source_search_odoo), pour parcourir l'historique large sans SHA, ni pour comparer deux versions complètes (préférer migration_search_target_source)."
description_en: "Inspect a precise Git commit in Odoo sources or a project repo: full diff, message, changed files, author, date, changelog entry generation, regression or patch diagnosis. Use as soon as the user gives a SHA or asks about a specific change's history. Do not use to read a precise source file without a SHA (source_read_odoo_file), to grep source code without a SHA (source_search_odoo), to browse broad history without a SHA, or to compare two full versions (prefer migration_search_target_source)."
requirement: Sources ou dépôt Git disponible
requirement_en: Sources or Git repository available
modes: [assistant, migration, creator]
keywords: [commit, sha, diff, patch, git, changement]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
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
code_path: skills/source-show-commit/scripts/handler.py
references_auto_load:
  - file: odoo_commit_conventions.md
    triggers: ["[FIX]", "[IMP]", "[ADD]", "[REM]", "[REF]", "[MOV]", "[REV]", "[CLA]", "[I18N]", "[PERF]", tag commit, convention commit, conventional commits odoo, message commit]
---

## Principes communs
- Skill en lecture seule : il lit le contenu réel d'un commit local.
- N'invente jamais le contenu d'un SHA.

## source_show_commit
Utilise `source_show_commit` dès que l'utilisateur référence un SHA de commit.

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
2. Appelle `source_show_commit`.
3. Si le diff est long, lis les fichiers critiques avec le skill de lecture adapté.

## Paramètres
- `sha`, `scope`, `max_lines`.
- Défaut `max_lines=2000`, maximum 10000. Vérifie `returned_diff_lines`, `diff_lines`, `truncated`, `warning`.

## Pièges
- Ne jamais inférer le contenu d'un SHA sans l'outil.
- Un diff tronqué ne suffit pas pour conclure sur tous les impacts.

## Combinaisons
- `source_read_odoo_file`, `migration_read_target_file` ou `repo_read_file` après identification des fichiers.

## Critères de réponse
- Auteur/date/message, fichiers, stats, impact et suite de vérification.
