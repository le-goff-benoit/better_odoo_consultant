# Stratégies de diff Odoo

- `model:*` compare les classes Python qui déclarent `_name` ou `_inherit`, puis agrège champs et méthodes publiques.
- `view:*` compare le record XML porteur de l'ID demandé, pas la vue assemblée runtime.
- `module:*` compare le manifest, les dépendances et l'inventaire de fichiers.

Toujours présenter le résultat comme une preuve statique. Pour décider d'un impact utilisateur, croiser avec les données live et le code custom.
