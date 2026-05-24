## Principes communs
- Skill en lecture seule : il inventorie les personnalisations Studio de l'instance réelle.
- Distingue toujours standard Odoo, Studio et code custom.

## inspect_studio
Utilise `inspect_studio` pour lister modèles `x_*`, champs `x_*`, vues, menus, actions serveur, crons, automatisations et règles.

## Quand l'utiliser
- Audit Studio, préparation de migration, estimation d'effort.
- Avant une opération Creator sensible.
- Quand l'utilisateur parle de personnalisations, champs custom ou automatisations.

## Bonnes pratiques
- Filtre par modèle avec `model_filter` quand la demande est ciblée.
- En migration, lis modèles, champs, vues, server actions, crons et automations.
- Croise les actions serveur et automatisations avec les risques safe_eval.
