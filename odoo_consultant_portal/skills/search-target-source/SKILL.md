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
