---
name: search_target_source
label: Chercher dans la cible
label_en: Search target source
kind: tool
group: target
builtin: false
read_only: true
risk_level: low
description: "Rechercher dans les sources Odoo de la version cible d'une migration."
description_en: Search Odoo source code for the migration target version.
requirement: Sources cible téléchargées
requirement_en: Downloaded target sources
modes: [migration]
keywords: [migration, version cible, target, breaking, compatibilité]
code_path: odoo_consultant_portal/skills/search-target-source/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il cherche dans les sources de la version cible.
- En migration, compare toujours source et cible avant de conclure.

## search_target_source
Utilise `search_target_source` pour vérifier un symbole, modèle, champ ou comportement dans la version d'arrivée.

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
1. Cherche le symbole côté source avec `search_odoo_source`.
2. Cherche le même symbole côté cible.
3. Lis les deux implémentations si le résultat impacte une décision.

## Paramètres
- `pattern`, `path`, `file_types`, `case_sensitive`.

## Pièges
- Absence de résultat ne prouve pas suppression : chercher variantes et modules déplacés.
- Enterprise cible n'est pas sous `addons/`.

## Combinaisons
- `read_target_file` et `read_odoo_file` pour comparer.
- `search_project_source` pour mesurer impact custom.

## Critères de réponse
- Tableau Source | Cible | Impact | Action.
