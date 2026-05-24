---
name: runtime_context_aggregator
aliases: [context_aggregator]
label: Agrégateur de contexte
label_en: Context aggregator
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime cœur : assemble à chaque appel IA un system prompt borné (≈36 000 chars) composé du profil utilisateur, profil projet, release notes Odoo, localisation pays, complexité technique, playbooks des skills routés. Invoqué automatiquement avant chaque génération. Ne pas invoquer sur demande utilisateur explicite — c'est un orchestrateur interne, pas un outil d'analyse."
description_en: "Core runtime skill: assembles a bounded system prompt (~36k chars) for every AI call from user profile, project profile, Odoo release notes, country localization, technical complexity and routed skill playbooks. Auto-invoked before every generation. Do not invoke on explicit user request — this is an internal orchestrator, not an analysis tool."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [contexte, context, agréger]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: backend/services/context_service.py
---

## runtime_context_aggregator (skill cœur)

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
- Coordonne `runtime_skill_dispatcher`, `runtime_perspective_router`, `runtime_localization_detector`, `runtime_release_notes_injector`.

## Critères de réponse
- Le contexte assemblé doit être pertinent, borné et observable en debug.
