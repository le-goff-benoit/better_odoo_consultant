---
name: search_project_source
label: Chercher dans le projet
label_en: Search project code
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: Grep dans le dépôt custom du client.
description_en: "Grep in the client's custom repository."
requirement: Dépôt GitHub cloné
requirement_en: Cloned GitHub repository
modes: [assistant, migration, creator]
keywords: [repo, dépôt, depot, custom, code custom, override, surcharge, _inherit, module client, modules custom, spécifique, __manifest__, security]
code_path: odoo_consultant_portal/skills/search-project-source/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : il cherche dans le dépôt custom client.
- Le code projet prime sur les suppositions fonctionnelles.

## search_project_source
Utilise `search_project_source` pour trouver overrides, modèles custom, vues XML, sécurité, data files et logique métier.

## Quand l'utiliser
- Projet avec dépôt cloné.
- Diagnostic d'une personnalisation.
- Migration de modules custom.
- Revue sécurité de modules custom : ACL, record rules, groupes, règles
  multi-société ou domaines de visibilité.

## Bonnes pratiques
- Pour inventorier les modules, préfère `list_project_modules`.
- Pour un override Python, cherche `_inherit`, le modèle ou le nom de méthode.
- Pour les vues, cherche le modèle, l'external id ou le champ concerné.
- Pour la sécurité, cherche `ir.model.access`, `ir.rule`, `groups_id`,
  `security/`, puis lis les CSV/XML trouvés avec `read_project_file`.
- Lis ensuite les fichiers avec `read_project_file`.

## Déclencheurs
- Dépôt client, module custom, surcharge, code spécifique, migration custom, sécurité custom.
- Besoin de prouver qu'un comportement vient du code projet.

## Séquence recommandée
1. Commence par `list_project_modules` si le périmètre n'est pas connu.
2. Cherche large sur modèle/méthode/champ.
3. Restreins par dossier ou extension.
4. Lis les fichiers pertinents avec `read_project_file`.

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
- `read_project_file` pour lire le contexte complet.
- `inspect_odoo_view` pour vérifier l'effet final d'une vue.
- `search_target_source` pour migration.

## Critères de réponse
- Citer fichiers/lignes et expliquer l'impact métier ou technique.
