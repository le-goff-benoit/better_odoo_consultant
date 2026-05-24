---
name: odoo_count_records
aliases: [count_odoo]
label: Compter enregistrements
label_en: Count records
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Compter combien d'enregistrements Odoo correspondent à un domaine search : volumétrie métier, périmètre de migration, anomalie à quantifier, taille d'un modèle. Utiliser quand seul le nombre compte et qu'il ne faut pas charger les lignes. Ne pas utiliser quand l'utilisateur veut un total agrégé groupé/KPI (odoo_aggregate_records) ni quand il veut voir les enregistrements eux-mêmes (odoo_query_records)."
description_en: "Count how many Odoo records match a search domain: business volume, migration scope, anomaly to quantify, model size. Use when only the number matters and rows must not be loaded. Do not use when the user wants a grouped aggregate/KPI (odoo_aggregate_records) or wants to see the records themselves (odoo_query_records)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [combien, count, nombre, volume, total, domain, périmètre, scope, records, combien de, volumétrie, taille]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-count-records/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le pour confirmer un volume sans télécharger les enregistrements.
- Cite toujours le modèle et le domain utilisés.
- Un utilisateur Odoo restreint ou une société active peut produire un comptage partiel.

## odoo_count_records
Utilise `odoo_count_records` pour compter les enregistrements correspondant à un domain.

## Quand l'utiliser
- L'utilisateur demande "combien", un volume, un risque de masse ou un périmètre de migration.
- Tu dois savoir si une anomalie est isolée ou généralisée.
- Tu veux vérifier la taille avant de lancer une lecture `odoo_query_records`.

## Bonnes pratiques
- Ne déduis jamais un total depuis le nombre de résultats retournés par `odoo_query_records`.
- Vérifie les champs du domain avec `odoo_inspect_fields` si la structure est incertaine.
- Donne un résultat sous forme "N enregistrements correspondent à domain X".
- Si plusieurs domains sont nécessaires, compare-les explicitement.

## Déclencheurs
- "combien", "nombre de", "volume", "périmètre", "risque de masse", "tous les".
- Avant une lecture large avec `odoo_query_records`.

## Séquence recommandée
1. Valide le modèle et les champs du domain.
2. Appelle `odoo_count_records`.
3. Si le volume est important, choisis entre `odoo_aggregate_records`, pagination `odoo_query_records`, ou analyse ciblée.

## Paramètres
- `model`: modèle à compter.
- `domain`: filtre exact ; domain vide = tous les records visibles.

## Pièges
- Un count est soumis aux droits et à la société active.
- Un count ne prouve pas la qualité des données ; il mesure seulement le périmètre.

## Combinaisons
- `odoo_query_records` pour inspecter les records après le count.
- `odoo_aggregate_records` pour répartir le volume par statut, période ou responsable.
- `odoo_inspect_security` si le count varie selon les utilisateurs.

## Critères de réponse
- Donner le nombre, le domain et la réserve éventuelle liée aux droits.
