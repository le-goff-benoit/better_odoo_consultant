---
name: context_aggregator
label: Agrégateur de contexte
label_en: Context aggregator
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Compose le system prompt à partir de tous les contributeurs (profil, release notes, complexité, localisation, contexte projet) dans un budget borné."
description_en: "Composes the system prompt from every contributor (profile, release notes, complexity, localization, project context) within a bounded budget."
requirement: Aucun
requirement_en: None
modes: [assistant, migration, creator]
keywords: [contexte, context, agréger]
code_path: odoo_consultant_portal/services/context_service.py
---

## context_aggregator (skill cœur)

Compose le system prompt à partir de tous les contributeurs et tient le budget de 36 000 caractères.

## Pipeline
1. Réserve d'abord la place aux blocs prioritaires (warnings de version, complexité, localisation).
2. Demande à chaque sous-skill activé sa contribution Markdown.
3. Sépare sections « cœur » (jamais tronquées) et sections routées (priorisées par pertinence).
4. Empile jusqu'au budget, log les longueurs par section pour debug.
5. Cache le résultat par (prompt[:512], profile, version, locale, blocs).

## Désactivé
- Le system prompt assemblé devient vide : l'IA répond en mode « LLM nu ».
- Les outils restent appelables mais sans walkthroughs ni profil de réponse.
- À utiliser uniquement pour debug — désactiver casse la qualité globale.
