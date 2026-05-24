---
name: complexity_analyzer
label: Profil de complexité
label_en: Complexity profile
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Sous-skill du Context Aggregator : injecte le mode de complexité technique du projet (vanilla, Studio, dev, mixte) et adapte le ton."
description_en: "Sub-skill of the Context Aggregator: injects the project's technical complexity mode (vanilla, Studio, dev, mixed) and adapts the tone."
requirement: Profil avec complexité calculée
requirement_en: Profile with computed complexity
modes: [assistant]
keywords: [complexité, complexity, studio, dev]
code_path: odoo_consultant_portal/services/technical_complexity_service.py
---

## complexity_analyzer (skill cœur)

Sous-skill du `context_aggregator` : injecte le profil technique du projet (vanilla, Studio, dev, mixte) en bloc prioritaire et adapte le ton.

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
- Le mode n'est qu'un cadrage : vérifier les faits avec `inspect_studio` ou les skills repo.

## Combinaisons
- `inspect_studio` pour projets Studio.
- `list_project_modules` et `search_project_source` pour projets dev.

## Critères de réponse
- Adapter le niveau de solution et signaler si le diagnostic projet est absent ou ancien.
