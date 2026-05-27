---
name: odoo_query_records
aliases: [query_odoo]
label: Requêter Odoo
label_en: Query Odoo
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lire des enregistrements Odoo concrets via search_read : commandes, factures, contacts, lignes, statuts, valeurs de champs, preuves live, export, détail d'une fiche. Utiliser quand l'utilisateur veut voir les données réelles d'une base connectée. Ne pas utiliser pour compter sans charger les lignes (odoo_count_records), agréger en KPI groupé (odoo_aggregate_records), ni pour la structure d'un modèle (odoo_inspect_fields)."
description_en: "Read concrete Odoo records via search_read: orders, invoices, contacts, lines, statuses, field values, live evidence, exports, single-record detail. Use when the user wants to see real data from a connected database. Do not use to count without loading rows (odoo_count_records), to aggregate as a grouped KPI (odoo_aggregate_records), or for a model's field structure (odoo_inspect_fields)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [donnée, données, data, records, search_read, liste, lister, analyse record, fiche, lignes, facture, commande, sale.order, contact, export, détail]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, live-data, search-read]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/odoo-query-records/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le sans demander d'autorisation quand il peut confirmer un fait.
- Cite les paramètres importants utilisés : modèle, domain, champs, limite, tri.
- Les données live Odoo priment sur le contexte Markdown et les hypothèses.
- Si les droits utilisateur ou la société active limitent le résultat, signale-le.

## odoo_query_records
Utilise `odoo_query_records` pour lire des enregistrements concrets via `search_read`.

## Quand l'utiliser
- L'utilisateur demande une liste, un exemple réel, un détail de fiche ou une vérification de données.
- Tu dois confirmer l'état d'une commande, facture, opportunité, tâche, produit, contact, etc.
- Le Creator doit résoudre précisément les enregistrements à modifier.

## Bonnes pratiques
- Appelle `odoo_inspect_fields` avant si le modèle, les champs ou les relations sont incertains.
- Demande uniquement les champs utiles.
- Par défaut, `limit=0` signifie lecture exhaustive bornée : vérifie toujours `total_count`, `count`, `truncated` et `warning`.
- Si `truncated=true`, annonce explicitement que l'analyse est partielle et explique le plafond ou la limite utilisée.
- Pour un total, utilise `odoo_count_records`; pour un KPI groupé, utilise `odoo_aggregate_records`.
- Dans la réponse, indique le domain utilisé et distingue faits vérifiés, hypothèses et recommandations.
- Quand tu cites un enregistrement exact dans la réponse, transforme son libellé en lien Markdown `odoo://<model>/<id>`. Pour les relations many2one retournées sous forme `[id, name]`, utilise le modèle métier attendu (ex. `partner_id` → `res.partner`) et l'id de la relation. Si l'id manque, relance la query avec `id`, `display_name` et le champ relationnel utile plutôt que de laisser un libellé non cliquable.

## Déclencheurs
- "analyse cette commande/facture/fiche", "liste les lignes", "montre les enregistrements", "exporte", "vérifie l'état".
- Toute demande qui nécessite des valeurs réelles et non une explication standard.

## Séquence recommandée
1. Si le modèle ou les champs ne sont pas sûrs, appelle `odoo_inspect_fields`.
2. Appelle `odoo_count_records` quand le volume influence la réponse.
3. Appelle `odoo_query_records` avec les champs strictement nécessaires.
4. Si `truncated=true`, affine le domain, augmente `max_records`, ou réponds avec réserve.

## Paramètres
- `model`: modèle exact, jamais deviné si un doute existe.
- `domain`: domain Odoo vérifié ; cite-le dans la réponse.
- `fields`: inclure `id`, `display_name` et les champs métier utiles.
- `limit=0`: exhaustif borné par `max_records`; `limit>0`: limite explicite.
- `page_size` et `max_records`: pour grands volumes.

## Pièges
- Ne jamais conclure "il n'y a que N lignes" si `truncated=true`.
- Ne jamais sommer manuellement un résultat borné pour produire un KPI global.
- Les règles d'accès, sociétés actives et record rules peuvent cacher des records.

## Combinaisons
- `odoo_inspect_fields` avant les relations et champs `x_*`.
- `odoo_count_records` pour confirmer le périmètre complet.
- `odoo_aggregate_records` pour totaux fiables.
- `odoo_inspect_security` si le résultat semble anormalement faible.

## Critères de réponse
- Mentionner `count/total_count`, le modèle, le domain, les champs clés et toute troncature.
- Dire clairement si la conclusion est exhaustive ou partielle.
