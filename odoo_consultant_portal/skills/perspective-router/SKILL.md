---
name: perspective_router
label: Profil de réponse
label_en: Response perspective
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Choisit le rôle de réponse (support, BA, architecte, dev) — explicite ou inféré du prompt — et injecte les consignes de style associées."
description_en: "Picks the response role (support, BA, architect, dev) — explicit or inferred from the prompt — and injects the matching style guidance."
requirement: Aucun
requirement_en: None
modes: [assistant, migration, creator]
keywords: [perspective, rôle, role, profil]
code_path: odoo_consultant_portal/services/ai_service.py
---

## perspective_router (skill cœur)

Choisit le rôle de réponse (support, business analyst, architecte, développeur) et adapte le style.

## Quand il agit
- À chaque tour de conversation, avant l'appel au LLM.
- Si l'utilisateur a forcé une perspective dans l'UI : elle est retenue telle quelle.
- Sinon : score les mots-clés du prompt et choisit le rôle dominant.

## Effet sur le system prompt
- Charge `profile-<role>.md` et l'injecte comme bloc cœur (jamais tronqué).
- Conditionne le ton, le niveau technique, la nature des recommandations.

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
- `context_aggregator` pour injecter le fichier profil.
- `skill_dispatcher` pour router les playbooks adaptés à l'intention.

## Critères de réponse
- Ton, profondeur et format doivent correspondre au rôle effectif affiché.
