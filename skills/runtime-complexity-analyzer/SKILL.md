---
name: runtime_complexity_analyzer
aliases: [complexity_analyzer]
label: Contexte projet
label_en: Project context
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime interne (sous-skill du context_aggregator) : injecte le bloc prioritaire « Contexte projet » qui conditionne toute la réflexion de l'IA — client, ville, localisation fiscale, profil technique calculé (vanilla, Studio, dev custom, mixte) avec modules custom et apps installées, et stratégie de réponse correspondante. Non tronqué (priority block). Si la complexité n'a jamais été calculée, signale explicitement le point aveugle plutôt que de laisser supposer une base vanilla. Invoqué automatiquement à chaque tour assistant/migration/creator. Ne pas invoquer sur demande utilisateur explicite ni pour des questions hors projet."
description_en: "Internal runtime skill (sub-skill of context_aggregator): injects the priority « Project context » block that conditions all AI reasoning — client, city, fiscal localization, computed technical profile (vanilla, Studio, custom-dev, mixed) with custom modules and installed apps, plus matching response strategy. Untruncated (priority block). When complexity has never been computed, explicitly flags the blind spot rather than letting the model assume a vanilla base. Auto-invoked every assistant/migration/creator turn. Do not invoke on explicit user request or for non-project questions."
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

Sous-skill du `runtime_context_aggregator` : injecte le bloc prioritaire **« Contexte projet »** qui ouvre chaque system prompt avec client + localisation fiscale + profil technique + stratégie. Conditionne toute la réflexion de l'IA pour ne jamais induire le consultant en erreur en répondant comme si la base était vanilla par défaut.

## Modes techniques détectés
- `standard` : projet sans personnalisation — ton orienté « out of the box ».
- `studio` : Studio uniquement — ton orienté no-code, limites Studio mises en avant.
- `dev` : développement custom — ton orienté code, bonnes pratiques OWL/Python.
- `studio_dev` : mixte — IA explicite la coexistence et les limites.

## Effet
- Un bloc Markdown unique `## Contexte projet` ajouté en bloc prioritaire (non tronqué, cap 6 000 chars), avec :
  - **Client** (nom + ville si renseignés)
  - **Localisation fiscale** (pays + code)
  - **Profil technique** (mode + confiance), Studio détecté ou non, dev custom détecté ou non
  - **Modules custom installés**, modules communautaires (OCA…), apps Odoo installées
  - **Stratégie de réponse** selon le mode (standard / studio / dev / studio_dev)
  - **Alerte explicite « non calculée »** quand la complexité n'a pas été lancée — l'IA doit demander confirmation plutôt que présumer vanilla
- Un second bloc « profile tuning » (consignes de ton pour ce mode) reste injecté ensuite.

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
