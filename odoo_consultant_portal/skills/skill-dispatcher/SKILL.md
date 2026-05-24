---
name: skill_dispatcher
label: Sélecteur de skills
label_en: Skill dispatcher
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Choisit dynamiquement quels playbooks d'outils inclure dans le contexte selon les mots-clés et patterns du prompt."
description_en: Dynamically picks which tool playbooks to include in the context based on prompt keywords and patterns.
requirement: Aucun
requirement_en: None
modes: [assistant, migration, creator]
keywords: [dispatch, sélecteur, router]
code_path: odoo_consultant_portal/services/context_service.py
---

## skill_dispatcher (skill cœur)

Sélectionne dynamiquement les playbooks d'outils à injecter dans le contexte selon le prompt utilisateur.

## Règles de dispatch
- Matching name + keywords du registre des skills tool.
- Patterns explicites prioritaires : SHA git → `git_show_commit`, « où cliquer » → `inspect_menus_actions`, etc.
- Defaults selon le mode : Creator → toujours `inspect_studio` + `inspect_odoo_view`.
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
- `context_aggregator` injecte le résultat.
- L'événement `skills_selected` expose la sélection à l'UI.

## Critères de réponse
- Charger assez de playbooks pour éviter les relances utilisateur sans noyer le prompt.
