---
name: odoo_aggregate_records
aliases: [read_group_odoo]
label: Agréger des données
label_en: Aggregate data
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "KPI, dashboard, tendance, chiffre d'affaires, agrégat Odoo via read_group : somme, moyenne, count groupé par mois/trimestre/statut/commercial/journal/société. Utiliser quand l'utilisateur veut des chiffres synthétiques fiables sans charger les lignes. Ne pas utiliser pour lister des enregistrements détaillés (odoo_query_records) ni pour un simple count sans groupement (odoo_count_records)."
description_en: "KPI, dashboard, trend, revenue, Odoo aggregate via read_group: sum/avg/count grouped by month/quarter/status/salesperson/journal/company. Use when the user wants reliable synthetic numbers without loading rows. Do not use to list detailed records (odoo_query_records) or for a plain count without grouping (odoo_count_records)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [kpi, indicateur, dashboard, synthèse, agrég, aggregate, group, group by, grouped by, par mois, par statut, par commercial, par journal, per month, per quarter, per status, per salesperson, read_group, somme, moyenne, average, sum, total by, chiffre d'affaires, revenue, ca par, marge par, margin per]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-aggregate-records/scripts/handler.py
references_auto_load:
  - file: aggregation_patterns.md
    triggers: [agrégation, agrégat, agréger, aggregation, group by, par mois, par trimestre, par année, kpi, chiffre d'affaires, ca par, timezone, devise, pivot, croisé dynamique]
---

## Principes communs
- Skill en lecture seule : il sert aux KPI et synthèses agrégées.
- Cite modèle, domain, champs de mesure et groupements.
- Les totaux financiers doivent mentionner la société active et la devise implicite si elles sont connues.

## odoo_aggregate_records
Utilise `odoo_aggregate_records` pour calculer des agrégats Odoo fiables avec `read_group`.

## Quand l'utiliser
- CA par mois, factures par statut, opportunités par commercial, stock par emplacement, heures par projet.
- L'utilisateur demande un tableau de bord, un KPI, une tendance ou une comparaison groupée.
- En migration, pour estimer le volume par type ou par période.

## Bonnes pratiques
- `fields` contient les mesures et champs utiles, par exemple `amount_total:sum`, `state`.
- `groupby` accepte les groupements simples et les granularités date Odoo : `date_order:month`, `create_date:week`.
- Ne remplace pas `odoo_aggregate_records` par une addition manuelle d'un échantillon `odoo_query_records`.
- Si un groupement retourne peu de lignes, tu peux compléter par `odoo_query_records` sur le groupe suspect.

## Déclencheurs
- KPI, tendance, tableau de bord, total par période/statut/responsable, top clients, moyenne.
- Toute synthèse qui serait fausse si elle était calculée sur un échantillon.

## Séquence recommandée
1. Confirme modèle, champs de mesure et groupements avec `odoo_inspect_fields` si nécessaire.
2. Appelle `odoo_count_records` si le périmètre doit être annoncé.
3. Appelle `odoo_aggregate_records` avec mesures et groupby.
4. Utilise `odoo_query_records` seulement pour illustrer un groupe ou investiguer une anomalie.

## Paramètres
- `fields`: mesures Odoo (`amount_total:sum`, `id:count`) et champs nécessaires.
- `groupby`: champs ou granularités date (`date_order:month`).
- `limit=0` ou absent : ne pose pas de limite artificielle sur les groupes retournés par Odoo.
- Si `truncated=true`, le tableau de groupes est partiel : annoncer `warning` et relancer avec `limit=0` ou un groupby plus ciblé.
- `lazy=false` si plusieurs niveaux doivent être réellement retournés.

## Pièges
- Les montants dépendent de la devise, de la société et des taxes incluses/exclues.
- `limit` limite les groupes, pas les lignes source.
- Les dates sont sensibles au fuseau et au champ choisi.

## Combinaisons
- `odoo_query_records` pour exemples de records dans un groupe.
- `odoo_inspect_security` si des KPI diffèrent entre utilisateurs.
- `source_search_odoo` si une mesure standard est calculée par du code.

## Critères de réponse
- Présenter un tableau, citer domain/mesures/groupby, et signaler toute limite de groupes.
