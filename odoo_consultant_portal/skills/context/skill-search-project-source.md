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
