---
name: repo_search_code
aliases: [search_project_source]
label: Chercher dans le projet
label_en: Search project code
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Rechercher dans le dépôt projet client cloné : code custom, override _inherit, surcharge, manifest, fichiers de sécurité CSV, vues XML, modèles spécifiques, contrôleurs. Utiliser quand l'utilisateur parle de son code custom, d'un module client ou d'une surcharge. Ne pas utiliser pour le code standard Odoo (source_search_odoo) ni pour la version cible d'une migration (migration_search_target_source)."
description_en: "Search the cloned client project repo: custom code, _inherit overrides, manifest, security CSV files, XML views, specific models, controllers. Use when the user talks about their custom code, a client module or an override. Do not use for standard Odoo code (source_search_odoo) or for a migration target version (migration_search_target_source)."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [repo, dépôt, depot, custom, code custom, override, surcharge, _inherit, module client, modules custom, spécifique, __manifest__, security]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/repo-search-code/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il cherche dans le dépôt custom client.
- Le code projet prime sur les suppositions fonctionnelles.

## Choisir entre repo_search_code et les skills voisins

| Question | Skill à appeler |
|---|---|
| « Y a-t-il un override `_inherit` dans le module custom ? » | `repo_search_code` |
| « Comment Odoo standard implémente ce même modèle ? » | `source_search_odoo` |
| « Lire un fichier custom précis » | `repo_read_file` |
| « Lister les modules custom du dépôt » | `repo_list_modules` |
| « Le comportement vient-il de Studio ou du code custom ? » | `odoo_inspect_studio` + `repo_search_code` |

Règle : si le code est écrit par le client ou le partenaire, c'est ce skill. Si c'est le code Odoo SA officiel, c'est `source_search_odoo`.

## repo_search_code
Utilise `repo_search_code` pour trouver overrides, modèles custom, vues XML, sécurité, data files et logique métier.

## Quand l'utiliser
- Projet avec dépôt cloné.
- Diagnostic d'une personnalisation.
- Migration de modules custom.
- Revue sécurité de modules custom : ACL, record rules, groupes, règles
  multi-société ou domaines de visibilité.

## Bonnes pratiques
- Pour inventorier les modules, préfère `repo_list_modules`.
- Pour un override Python, cherche `_inherit`, le modèle ou le nom de méthode.
- Pour les vues, cherche le modèle, l'external id ou le champ concerné.
- Pour la sécurité, cherche `ir.model.access`, `ir.rule`, `groups_id`,
  `security/`, puis lis les CSV/XML trouvés avec `repo_read_file`.
- Lis ensuite les fichiers avec `repo_read_file`.

## Déclencheurs
- Dépôt client, module custom, surcharge, code spécifique, migration custom, sécurité custom.
- Besoin de prouver qu'un comportement vient du code projet.

## Séquence recommandée
1. Commence par `repo_list_modules` si le périmètre n'est pas connu.
2. Cherche large sur modèle/méthode/champ.
3. Restreins par dossier ou extension.
4. Lis les fichiers pertinents avec `repo_read_file`.

## Paramètres
- `pattern`: texte ou regex utile.
- `path`: sous-dossier module si connu.
- `file_types`: `*.py`, `*.xml`, `*.csv`, `__manifest__.py` selon la question.
- `max_matches`: nombre max de lignes retournées.
- Vérifie `returned_matches`, `truncated`, `warning` avant de conclure qu'une occurrence n'existe pas.

## Pièges
- Ne cherche pas un nom de fichier comme contenu sauf intention explicite.
- Un grep donne des occurrences, pas une preuve complète.
- Le code custom peut compléter Studio et standard ; ne pas les confondre.

## Combinaisons
- `repo_read_file` pour lire le contexte complet.
- `odoo_inspect_view` pour vérifier l'effet final d'une vue.
- `migration_search_target_source` pour migration.

## Critères de réponse
- Citer fichiers/lignes et expliquer l'impact métier ou technique.
