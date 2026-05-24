---
name: count_odoo
label: Compter enregistrements
label_en: Count records
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: Compter les enregistrements correspondant à un domaine de filtrage.
description_en: Count records matching a filter domain.
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [combien, count, nombre, volume, total, domain]
code_path: odoo_consultant_portal/skills/count-odoo/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le pour confirmer un volume sans télécharger les enregistrements.
- Cite toujours le modèle et le domain utilisés.
- Un utilisateur Odoo restreint ou une société active peut produire un comptage partiel.

## count_odoo
Utilise `count_odoo` pour compter les enregistrements correspondant à un domain.

## Quand l'utiliser
- L'utilisateur demande "combien", un volume, un risque de masse ou un périmètre de migration.
- Tu dois savoir si une anomalie est isolée ou généralisée.
- Tu veux vérifier la taille avant de lancer une lecture `query_odoo`.

## Bonnes pratiques
- Ne déduis jamais un total depuis le nombre de résultats retournés par `query_odoo`.
- Vérifie les champs du domain avec `get_odoo_fields` si la structure est incertaine.
- Donne un résultat sous forme "N enregistrements correspondent à domain X".
- Si plusieurs domains sont nécessaires, compare-les explicitement.
