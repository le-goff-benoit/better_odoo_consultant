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
keywords: [combien, count, nombre, volume, total, domain, périmètre, scope, records, combien de, volumétrie, taille]
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

## Déclencheurs
- "combien", "nombre de", "volume", "périmètre", "risque de masse", "tous les".
- Avant une lecture large avec `query_odoo`.

## Séquence recommandée
1. Valide le modèle et les champs du domain.
2. Appelle `count_odoo`.
3. Si le volume est important, choisis entre `read_group_odoo`, pagination `query_odoo`, ou analyse ciblée.

## Paramètres
- `model`: modèle à compter.
- `domain`: filtre exact ; domain vide = tous les records visibles.

## Pièges
- Un count est soumis aux droits et à la société active.
- Un count ne prouve pas la qualité des données ; il mesure seulement le périmètre.

## Combinaisons
- `query_odoo` pour inspecter les records après le count.
- `read_group_odoo` pour répartir le volume par statut, période ou responsable.
- `inspect_security` si le count varie selon les utilisateurs.

## Critères de réponse
- Donner le nombre, le domain et la réserve éventuelle liée aux droits.
