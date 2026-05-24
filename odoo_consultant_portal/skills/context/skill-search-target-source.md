## Principes communs
- Skill en lecture seule : il cherche dans les sources de la version cible.
- En migration, compare toujours source et cible avant de conclure.

## search_target_source
Utilise `search_target_source` pour vérifier un symbole, modèle, champ ou comportement dans la version d'arrivée.

## Quand l'utiliser
- Migration de version.
- Recherche de breaking change, renommage, suppression ou changement de signature.
- Validation de compatibilité d'un module custom.

## Bonnes pratiques
- Cherche le même symbole dans la source et la cible.
- Structure la conclusion `Source | Cible | Impact | Action`.
- Si la cible ne contient rien, cherche des variantes de nom avant de conclure.
