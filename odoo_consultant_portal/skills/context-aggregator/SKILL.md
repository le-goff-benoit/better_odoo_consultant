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

## Déclencheurs
- Tous les appels IA qui doivent recevoir contexte, profils, skills, version, localisation ou projet.

## Séquence recommandée
1. Construire les blocs prioritaires.
2. Router les playbooks et références.
3. Ajuster au budget et conserver les sections cœur.

## Paramètres
- Prompt, perspective, versions, pays, complexité, skills désactivés.

## Pièges
- Un contexte trop large dégrade la précision ; router plutôt que tout charger.
- Les blocs prioritaires doivent rester courts.

## Combinaisons
- Coordonne `skill_dispatcher`, `perspective_router`, `localization_detector`, `release_notes_injector`.

## Critères de réponse
- Le contexte assemblé doit être pertinent, borné et observable en debug.
