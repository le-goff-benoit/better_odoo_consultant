---
name: runtime_complexity_analyzer
aliases: [complexity_analyzer]
label: Profil de complexité
label_en: Complexity profile
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime interne (sous-skill du context_aggregator) : adapte le ton et la profondeur des réponses selon le profil de complexité technique calculé du projet (vanilla, Studio, dev custom, mixte). Invoqué automatiquement quand le profil projet possède une complexité calculée. Ne pas invoquer sur demande utilisateur explicite ni pour des questions hors projet."
description_en: "Internal runtime skill (sub-skill of context_aggregator): adapts tone and depth based on the project's computed technical complexity profile (vanilla, Studio, custom-dev, mixed). Auto-invoked when the project profile has a computed complexity. Do not invoke on explicit user request or for non-project questions."
requirement: Profil avec complexité calculée
requirement_en: Profile with computed complexity
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant]
keywords: [complexité, complexity, studio, dev]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: backend/services/technical_complexity_service.py
---

## runtime_complexity_analyzer (skill cœur)

Sous-skill du `runtime_context_aggregator` : injecte le profil technique du projet (vanilla, Studio, dev, mixte) en bloc prioritaire et adapte le ton.

## Modes détectés
- `vanilla` : projet sans personnalisation — ton orienté « out of the box ».
- `studio` : Studio uniquement — ton orienté no-code, limites Studio mises en avant.
- `dev` : développement custom — ton orienté code, bonnes pratiques OWL/Python.
- `studio_dev` : mixte — IA explicite la coexistence et les limites.

## Effet
- 2 blocs Markdown ajoutés en blocs prioritaires (non tronqués) :
  1. « Complexité technique du projet » (le diagnostic factuel)
  2. « profile tuning » (les consignes de réponse pour ce mode)

## Désactivé
- Plus aucune adaptation au type de projet.
- Ton uniforme, l'IA ne sait pas si elle doit privilégier Studio ou dev.

## Déclencheurs
- Projet avec diagnostic technique connu, prompt parlant de Studio, dev custom, dette ou migration.

## Séquence recommandée
1. Lire le mode calculé (`vanilla`, `studio`, `dev`, `studio_dev`).
2. Injecter le bloc factuel et le tuning de réponse.
3. Orienter les autres skills vers Studio ou dépôt custom selon le mode.

## Paramètres
- Aucun paramètre utilisateur ; dépend du profil projet.

## Pièges
- Le mode n'est qu'un cadrage : vérifier les faits avec `odoo_inspect_studio` ou les skills repo.

## Combinaisons
- `odoo_inspect_studio` pour projets Studio.
- `repo_list_modules` et `repo_search_code` pour projets dev.

## Critères de réponse
- Adapter le niveau de solution et signaler si le diagnostic projet est absent ou ancien.
