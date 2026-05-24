## Principes communs
- Skill en lecture seule : il lit un fichier de la version cible.
- Sépare clairement observations source et cible.

## read_target_file
Utilise `read_target_file` après `search_target_source` pour lire l'implémentation cible.

## Quand l'utiliser
- Tu dois confirmer le comportement exact dans la version d'arrivée.
- Tu compares une méthode, vue, modèle ou champ entre versions.
- Tu rédiges une action de migration technique.

## Bonnes pratiques
- Cite le chemin cible.
- Compare avec `read_odoo_file` côté source si nécessaire.
- Ne généralise pas un changement sans preuve dans les deux versions.
