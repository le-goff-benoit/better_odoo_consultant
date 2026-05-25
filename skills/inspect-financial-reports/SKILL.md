---
name: inspect_financial_reports
aliases: [financial_reports, account_report]
label: Rapports financiers
label_en: Financial reports
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Inspecter, recommander, exécuter ou exporter les rapports financiers Enterprise `account.report` : bilan, compte de résultat, P&L, grand livre, tax report, TVA, aged receivable/payable, filtres période, partenaire, analytique, société. Ne pas utiliser pour un rapport QWeb/PDF (odoo_inspect_report), une liste de factures (odoo_query_records) ni un KPI groupé hors comptabilité (odoo_aggregate_records)."
description_en: "Inspect, recommend, run or export Enterprise financial `account.report` reports: balance sheet, profit and loss, P&L, general ledger, tax report, VAT, aged receivable/payable, period, partner, analytic and company filters. Do not use for QWeb/PDF reports (odoo_inspect_report), invoice record lists (odoo_query_records), or non-accounting grouped KPIs (odoo_aggregate_records)."
requirement: Connexion Odoo avec comptabilité Enterprise
requirement_en: Odoo connection with Enterprise accounting
modes: [assistant, migration]
keywords: [bilan, balance sheet, compte de résultat, compte de resultat, P&L, profit and loss, grand livre, general ledger, tax report, déclaration TVA, declaration TVA, état financier, etat financier, financial report, account.report, rapport comptable, exporter rapport, situation client, résultat projet, resultat projet, analytique, partenaire]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, accounting, financial-report, live-data]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/inspect-financial-reports/scripts/handler.py
templates:
  - name: financial_report_summary
    label: Synthèse rapport financier
    triggers: [bilan, compte de résultat, P&L, grand livre]
references_auto_load:
  - file: account_report_taxonomy.md
    triggers: [bilan, compte de résultat, tax, grand livre, GL, BS, P&L, financial report]
  - file: run_options.md
    triggers: [date_from, date_to, partner, analytic, période, exporter]
---

## Principes communs
- Skill en lecture seule : il lit ou exécute les rapports financiers visibles par la connexion Odoo.
- Toujours citer le rapport, la période, les sociétés et les filtres appliqués.
- Pour "client X" ou "projet Y", résoudre d'abord les IDs via `odoo_query_records` si le prompt ne fournit pas d'identifiant.

## inspect_financial_reports
Utilise `inspect_financial_reports` pour lister, recommander, décrire, exécuter ou exporter un `account.report`.

## Quand l'utiliser
- L'utilisateur demande un bilan, P&L, compte de résultat, grand livre, tax report ou situation TVA.
- Il faut choisir le bon rapport financier pour une demande comptable.
- Il faut exécuter un rapport pour une période, un partenaire, un projet analytique ou une société.

## Bonnes pratiques
- `action=list` pour connaître les rapports disponibles.
- `action=recommend` quand la demande est fonctionnelle ou ambiguë.
- `action=describe` avant un diagnostic de structure.
- `action=run` pour retourner les chiffres ; `action=export` seulement si l'utilisateur demande Excel.

## Déclencheurs
- "Bilan au 31/03", "P&L du projet", "grand livre janvier", "déclaration TVA", "account.report".

## Paramètres
- `action`: `list`, `recommend`, `describe`, `run`, `export`.
- `report`: ID ou nom du rapport pour `describe/run/export`.
- `query`: demande libre pour `recommend`.
- `options`: période, `partner_ids`, `analytic_account_ids`, `company_ids`, `journal_ids`, `unfold_all`, `comparison`.

## Pièges
- Les méthodes Enterprise peuvent varier selon version/localisation ; si l'exécution échoue, restituer l'erreur XML-RPC et proposer `describe`.
- Ne pas confondre rapport financier `account.report` et rapport QWeb/PDF.

## Combinaisons
- `odoo_query_records` pour résoudre partenaire, projet analytique, société ou journal.
- `odoo_aggregate_records` pour un KPI commercial hors `account.report`.
- `output_report_writer` si le résultat doit devenir une note client.

## Critères de réponse
- Répondre avec tableau Markdown synthétique, totaux, filtres appliqués et avertissement si lignes tronquées.
