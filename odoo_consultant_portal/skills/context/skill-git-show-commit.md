## Principes communs
- Skill en lecture seule : il lit le contenu réel d'un commit local.
- N'invente jamais le contenu d'un SHA.

## git_show_commit
Utilise `git_show_commit` dès que l'utilisateur référence un SHA de commit.

## Quand l'utiliser
- Analyse d'un commit Odoo, Enterprise, version cible ou dépôt projet.
- Recherche d'impact d'un patch.
- Comparaison avant/après ou suspicion de régression.

## Bonnes pratiques
- Choisis le bon scope : `odoo`, `enterprise`, `target`, `project`.
- Résume auteur, date, message, fichiers touchés, insertions/suppressions et impact.
- Si le diff est tronqué, signale-le et propose une lecture ciblée d'un fichier.
