## Principes communs
- Skill en lecture seule : il lit un fichier du dépôt custom client.
- Cite chemin et lignes quand tu relies le code à une conclusion.

## read_project_file
Utilise `read_project_file` pour confirmer l'implémentation exacte d'un module custom.

## Quand l'utiliser
- Après `search_project_source` ou `list_project_modules`.
- Tu dois comprendre un override, une vue XML, une règle de sécurité ou un manifest.
- Tu évalues une migration ou une dette technique.

## Bonnes pratiques
- Commence par le manifest pour comprendre dépendances et fichiers chargés.
- Lis ensuite `models`, `views`, `security` ou `data` selon la demande.
- En migration, croise avec `search_target_source`.
