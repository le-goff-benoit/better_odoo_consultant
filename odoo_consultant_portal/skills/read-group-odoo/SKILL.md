---
name: read_group_odoo
label: Agréger des données
label_en: Aggregate data
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Calculer des agrégats Odoo fiables par période, statut, commercial, journal ou autre groupement."
description_en: "Compute reliable Odoo aggregates by period, status, salesperson, journal or another grouping."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [kpi, indicateur, dashboard, synthèse, agrég, aggregate, group, group by, par mois, par statut, par commercial, read_group, somme, moyenne, chiffre d'affaires, ca par]
code_path: odoo_consultant_portal/skills/read-group-odoo/scripts/handler.py
references_auto_load:
  - file: aggregation_patterns.md
    triggers: [agrégation, agrégat, agréger, aggregation, group by, par mois, par trimestre, par année, kpi, chiffre d'affaires, ca par, timezone, devise, pivot, croisé dynamique]
---

## Principes communs
- Skill en lecture seule : il sert aux KPI et synthèses agrégées.
- Cite modèle, domain, champs de mesure et groupements.
- Les totaux financiers doivent mentionner la société active et la devise implicite si elles sont connues.

## read_group_odoo
Utilise `read_group_odoo` pour calculer des agrégats Odoo fiables avec `read_group`.

## Quand l'utiliser
- CA par mois, factures par statut, opportunités par commercial, stock par emplacement, heures par projet.
- L'utilisateur demande un tableau de bord, un KPI, une tendance ou une comparaison groupée.
- En migration, pour estimer le volume par type ou par période.

## Bonnes pratiques
- `fields` contient les mesures et champs utiles, par exemple `amount_total:sum`, `state`.
- `groupby` accepte les groupements simples et les granularités date Odoo : `date_order:month`, `create_date:week`.
- Ne remplace pas `read_group_odoo` par une addition manuelle d'un échantillon `query_odoo`.
- Si un groupement retourne peu de lignes, tu peux compléter par `query_odoo` sur le groupe suspect.

## Déclencheurs
- KPI, tendance, tableau de bord, total par période/statut/responsable, top clients, moyenne.
- Toute synthèse qui serait fausse si elle était calculée sur un échantillon.

## Séquence recommandée
1. Confirme modèle, champs de mesure et groupements avec `get_odoo_fields` si nécessaire.
2. Appelle `count_odoo` si le périmètre doit être annoncé.
3. Appelle `read_group_odoo` avec mesures et groupby.
4. Utilise `query_odoo` seulement pour illustrer un groupe ou investiguer une anomalie.

## Paramètres
- `fields`: mesures Odoo (`amount_total:sum`, `id:count`) et champs nécessaires.
- `groupby`: champs ou granularités date (`date_order:month`).
- `lazy=false` si plusieurs niveaux doivent être réellement retournés.

## Pièges
- Les montants dépendent de la devise, de la société et des taxes incluses/exclues.
- `limit` limite les groupes, pas les lignes source.
- Les dates sont sensibles au fuseau et au champ choisi.

## Combinaisons
- `query_odoo` pour exemples de records dans un groupe.
- `inspect_security` si des KPI diffèrent entre utilisateurs.
- `search_odoo_source` si une mesure standard est calculée par du code.

## Critères de réponse
- Présenter un tableau, citer domain/mesures/groupby, et signaler toute limite de groupes.
