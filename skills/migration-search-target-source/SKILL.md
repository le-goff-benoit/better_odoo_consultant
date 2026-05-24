---
name: migration_search_target_source
aliases: [search_target_source]
label: Chercher dans la cible
label_en: Search target source
kind: tool
group: target
builtin: false
read_only: true
risk_level: low
description: "Rechercher dans les sources Odoo de la version cible de migration : renommages, suppressions, changements d'API, breaking changes, nouveau comportement standard. Utiliser quand il faut vérifier ce que devient un appel/champ/modèle après l'upgrade. Ne pas utiliser pour la version courante (source_search_odoo) ni pour le code custom client (repo_search_code)."
description_en: "Search target-version Odoo sources during migration: renames, removals, API changes, breaking changes, new standard behavior. Use to verify what a call/field/model becomes after the upgrade. Do not use for the current version (source_search_odoo) or client custom code (repo_search_code)."
requirement: Sources cible téléchargées
requirement_en: Downloaded target sources
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [migration]
keywords: [migration, version cible, target, breaking, compatibilité]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/migration-search-target-source/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il cherche dans les sources de la version cible.
- En migration, compare toujours source et cible avant de conclure.

## migration_search_target_source
Utilise `migration_search_target_source` pour vérifier un symbole, modèle, champ ou comportement dans la version d'arrivée.

## Quand l'utiliser
- Migration de version.
- Recherche de breaking change, renommage, suppression ou changement de signature.
- Validation de compatibilité d'un module custom.

## Bonnes pratiques
- Cherche le même symbole dans la source et la cible.
- Structure la conclusion `Source | Cible | Impact | Action`.
- Si la cible ne contient rien, cherche des variantes de nom avant de conclure.

## Déclencheurs
- Migration, breaking change, renommage, suppression, compatibilité version cible.

## Séquence recommandée
1. Cherche le symbole côté source avec `source_search_odoo`.
2. Cherche le même symbole côté cible.
3. Lis les deux implémentations si le résultat impacte une décision.

## Paramètres
- `pattern`, `path`, `file_types`, `case_sensitive`, `max_matches`.
- Vérifie `returned_matches`, `truncated`, `warning` avant de conclure qu'un symbole n'existe plus côté cible.

## Pièges
- Absence de résultat ne prouve pas suppression : chercher variantes et modules déplacés.
- Enterprise cible n'est pas sous `addons/`.

## Combinaisons
- `migration_read_target_file` et `source_read_odoo_file` pour comparer.
- `repo_search_code` pour mesurer impact custom.

## Critères de réponse
- Tableau Source | Cible | Impact | Action.
