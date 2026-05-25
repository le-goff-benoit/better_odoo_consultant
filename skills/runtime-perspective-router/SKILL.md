---
name: runtime_perspective_router
aliases: [perspective_router]
label: Agent de réponse
label_en: Response agent
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime cœur : choisit l'agent de réponse (support, business_analyst, architect, developer) avec le contrat de ton et le niveau de détail correspondant, explicite ou inféré du prompt. Invoqué automatiquement à chaque tour. Ne pas confondre avec un mode applicatif — creator est un workflow/mode, pas un agent de réponse. Ne pas invoquer sur demande utilisateur explicite."
description_en: "Core runtime skill: selects the response agent (support, business_analyst, architect, developer) with matching tone and detail contract, explicit or inferred from the prompt. Auto-invoked each turn. Do not confuse with an app mode — creator is a workflow/mode, not a response agent. Do not invoke on explicit user request."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [perspective, rôle, role, profil]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: backend/services/ai_service.py
---

## runtime_perspective_router (skill cœur)

Choisit l'agent de réponse (support, business analyst, architecte, développeur) et adapte le style.

## Quand il agit
- À chaque tour de conversation, avant l'appel au LLM.
- Si l'utilisateur a forcé une perspective dans l'UI : elle est retenue telle quelle.
- Sinon : score les mots-clés du prompt et choisit le rôle dominant.

## Effet sur le system prompt
- Charge l'agent résolu (`agents/<slug>/AGENT.md`) comme bloc système.
- `AGENT.md` porte le rôle, les limites, le ton et le format de restitution.

## Désactivé
- Aucun bloc de rôle n'est injecté.
- L'IA répond avec un ton générique développeur, sans biais de profil.
- Le toggle de perspective côté UI est masqué dans le panneau de contexte.

## Déclencheurs
- Tous les prompts en mode Assistant, Migration et Creator sauf profil verrouillé.

## Séquence recommandée
1. Respecter le choix manuel de l'utilisateur.
2. Sinon scorer le dernier prompt.
3. Injecter le profil correspondant et laisser les autres skills s'y adapter.

## Paramètres
- `perspective`: `support`, `business_analyst`, `architect`, `developer` ou auto.

## Pièges
- Un prompt mixte doit garder une réponse équilibrée et expliciter les validations techniques.

## Combinaisons
- `runtime_context_aggregator` pour injecter le fichier profil.
- `runtime_skill_dispatcher` pour router les playbooks adaptés à l'intention.

## Critères de réponse
- Ton, profondeur et format doivent correspondre au rôle effectif affiché.
