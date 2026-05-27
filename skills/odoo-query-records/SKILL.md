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

## Suivre les relations (très important)

**Ne t'arrête jamais à l'entête.** Une fiche Odoo n'a de sens que reliée à ses objets enfants ou liés. Quand l'utilisateur parle d'une commande, d'une facture, d'un projet, d'un BL, d'une opportunité, d'un ticket — il faut presque toujours **enchaîner une seconde query sur les enregistrements liés** pour pouvoir répondre correctement. Les champs `one2many` retournés par `search_read` ne contiennent que des **listes d'ids** (`[12, 13, 14]`), jamais le contenu : une seconde query sur le modèle enfant est obligatoire pour voir les lignes.

Recettes prêtes à l'emploi :

| Parent | Modèle enfant à chaîner | Champ relationnel | Quand le faire |
|---|---|---|---|
| `sale.order` | `sale.order.line` | `order_id` | Dès qu'on parle d'une commande : produits, quantités, prix, remises |
| `purchase.order` | `purchase.order.line` | `order_id` | Idem pour les achats |
| `account.move` (facture) | `account.move.line` | `move_id` | Lignes comptables : produit, compte, taxes, analytique |
| `project.project` | `project.task` | `project_id` | Tâches d'un projet, charge, état, assignations |
| `project.task` | `mail.message` ou `project.task` (sous-tâches via `child_ids`) | `parent_id` | Sous-tâches, fil de discussion |
| `stock.picking` | `stock.move` puis `stock.move.line` | `picking_id`, `move_id` | Détail des mouvements de stock et lots/series |
| `crm.lead` | `mail.activity`, `mail.message` | `res_id` + `res_model='crm.lead'` | Suivi commercial, prochaines actions |
| `helpdesk.ticket` | `mail.message`, `helpdesk.sla.status` | `res_id` / `ticket_id` | Échanges client, SLA |
| `mrp.production` | `mrp.production.line` ou `stock.move` | `production_id` | Composants consommés / produits |
| `hr.employee` | `hr.contract`, `hr.leave`, `account.analytic.line` | `employee_id` | Contrats, congés, feuilles de temps |
| `res.partner` | `sale.order`, `account.move`, `crm.lead` | `partner_id` | Historique client : commandes, factures, pistes |

Pattern à appliquer systématiquement :
1. Charge le parent avec `id`, `display_name`, le champ `one2many` qui contient les ids (`order_line`, `invoice_line_ids`, `task_ids`, `move_ids`…).
2. **Enchaîne** une `odoo_query_records` sur le modèle enfant en filtrant par le champ relationnel (`[('order_id', '=', 42)]`) ou par `[('id', 'in', [12, 13, 14])]`.
3. Demande sur les enfants les champs métier qui répondent à la question (`product_id`, `product_uom_qty`, `price_unit`, `state`, `date_deadline`…).
4. Quand tu cites un enfant dans la réponse, transforme son libellé en lien `odoo://<modèle.enfant>/<id>`.

Si tu ne sais pas quel champ relationnel utiliser, lance d'abord `odoo_inspect_fields` sur le modèle enfant : il révèle les `many2one` qui pointent vers le parent.

## Pièges
- Ne jamais conclure "il n'y a que N lignes" si `truncated=true`.
- Ne jamais sommer manuellement un résultat borné pour produire un KPI global.
- Les règles d'accès, sociétés actives et record rules peuvent cacher des records.
- **Ne jamais répondre sur le contenu d'une commande/facture/projet à partir du seul entête.** Les champs `one2many` renvoyés par `search_read` ne contiennent que des ids — il faut une seconde query sur le modèle enfant.

## Combinaisons
- `odoo_inspect_fields` avant les relations et champs `x_*`.
- `odoo_count_records` pour confirmer le périmètre complet.
- `odoo_aggregate_records` pour totaux fiables.
- `odoo_inspect_security` si le résultat semble anormalement faible.

## Critères de réponse
- Mentionner `count/total_count`, le modèle, le domain, les champs clés et toute troncature.
- Dire clairement si la conclusion est exhaustive ou partielle.
