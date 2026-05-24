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
