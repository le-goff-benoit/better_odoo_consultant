---
name: runtime_skill_dispatcher
aliases: [skill_dispatcher]
label: Sélecteur de skills
label_en: Skill dispatcher
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime cœur : route chaque prompt utilisateur vers les playbooks d'outils pertinents, score les candidats par mots-clés et intention, respecte les skills désactivés en réglages et évite de charger tout le catalogue. Invoqué automatiquement au début de chaque tour. Ne pas invoquer sur demande utilisateur explicite — c'est l'orchestrateur de sélection, pas un outil métier."
description_en: "Core runtime skill: routes each user prompt to relevant tool playbooks, scores candidates by keywords and intent, respects user-disabled skills and avoids loading the whole catalog. Auto-invoked at the start of each turn. Do not invoke on explicit user request — this is the selection orchestrator, not a business tool."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [dispatch, sélecteur, router]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: backend/services/context_service.py
---

## runtime_skill_dispatcher (skill cœur)

Sélectionne dynamiquement les playbooks d'outils à injecter dans le contexte selon le prompt utilisateur.

## Règles de dispatch
- Matching name + keywords du registre des skills tool.
- Patterns explicites prioritaires : SHA git → `source_show_commit`, « où cliquer » → `odoo_inspect_navigation`, etc.
- Defaults selon le mode : Creator → toujours `odoo_inspect_studio` + `odoo_inspect_view`.
- Skills désactivés par l'utilisateur sont exclus avant matching.

## Désactivé
- Aucun playbook d'outil n'est injecté.
- L'IA peut toujours appeler les tools, mais sans guidance — elle improvise les paramètres.
- Utile pour mesurer combien les playbooks contribuent à la qualité.

## Déclencheurs
- Chaque prompt utilisateur ; combine noms de skills, keywords et familles d'intention.

## Séquence recommandée
1. Ajouter les defaults de mode.
2. Matcher noms/keywords.
3. Ajouter les bundles d'intention (record, KPI, vue, sécurité, Studio, source, migration).
4. Exclure les skills désactivés.

## Paramètres
- Prompt, mode (`assistant`, `migration`, `creator`), skills désactivés.

## Pièges
- Un seul prompt peut nécessiter plusieurs skills ; ne pas caper arbitrairement.
- Un skill sélectionné n'est pas forcément appelé si le LLM n'en a finalement pas besoin.

## Combinaisons
- `runtime_context_aggregator` injecte le résultat.
- L'événement `skills_selected` expose la sélection à l'UI.

## Critères de réponse
- Charger assez de playbooks pour éviter les relances utilisateur sans noyer le prompt.
