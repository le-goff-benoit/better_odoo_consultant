---
name: inspect_spreadsheet
aliases: [odoo_spreadsheet, spreadsheet_audit]
label: Inspecter les spreadsheets
label_en: Inspect spreadsheets
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lister et inspecter les Odoo Spreadsheets et dashboards : documents.document handler spreadsheet, spreadsheet.dashboard, payload JSON/XLSX, feuilles, cellules non vides, formules `ODOO.PIVOT`, `ODOO.LIST`, `ODOO.FILTER.VALUE`, explication et suggestion de formules. Ne pas utiliser pour des rapports financiers account.report (inspect_financial_reports), rapports QWeb/PDF (odoo_inspect_report), ni formules Excel génériques hors Odoo."
description_en: "List and inspect Odoo Spreadsheets and dashboards: documents.document spreadsheet handler, spreadsheet.dashboard, JSON/XLSX payload, sheets, non-empty cells, `ODOO.PIVOT`, `ODOO.LIST`, `ODOO.FILTER.VALUE` formulas, formula explanation and suggestions. Do not use for account.report financial reports (inspect_financial_reports), QWeb/PDF reports (odoo_inspect_report), or generic non-Odoo Excel formulas."
requirement: Connexion Odoo active et sources Odoo locales
requirement_en: Active Odoo connection and local Odoo sources
modes: [assistant, migration]
keywords: [spreadsheet, tableur Odoo, Odoo spreadsheet, dashboard spreadsheet, spreadsheet.dashboard, documents.document, ODOO.PIVOT, ODOO.LIST, ODOO.FILTER.VALUE, formule Odoo, formule spreadsheet, budget spreadsheet, dashboard Sales]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, spreadsheet, dashboard, formulas]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/inspect-spreadsheet/scripts/handler.py
templates:
  - name: spreadsheet_inspection_report
    label: Rapport spreadsheet
    triggers: [spreadsheet, ODOO.PIVOT, tableur]
references_auto_load:
  - file: odoo_spreadsheet_formulas.md
    triggers: [ODOO.PIVOT, ODOO.LIST, ODOO.FILTER.VALUE, formule Odoo]
  - file: spreadsheet_payload_format.md
    triggers: [payload spreadsheet, JSON spreadsheet, inspecte le spreadsheet]
---

## Principes communs
- Skill en lecture seule : il lit documents, dashboards, payloads et sources JS locales.
- Les formules `ODOO.*` sont le cœur du périmètre ; une formule Excel générique n'est pas un déclencheur.
- Signaler si le payload est tronqué ou si le catalogue formule vient du fallback.

## inspect_spreadsheet
Utilise `inspect_spreadsheet` pour lister les spreadsheets, inspecter leur contenu et expliquer ou suggérer des formules `ODOO.*`.

## Quand l'utiliser
- L'utilisateur demande les spreadsheets ou dashboards disponibles.
- Il faut inspecter un spreadsheet Budget/Sales et inventorier ses formules Odoo.
- Il faut expliquer `=ODOO.PIVOT(...)`, `=ODOO.LIST(...)` ou `=ODOO.FILTER.VALUE(...)`.
- Il faut suggérer une formule Odoo Spreadsheet pour un besoin métier.

## Bonnes pratiques
- `action=list` avant `inspect` si l'utilisateur donne seulement un nom.
- `action=inspect` avec `document_id` après résolution du document.
- `action=explain_formula` pour une formule fournie verbatim.
- `action=suggest_formula` pour une demande libre.

## Déclencheurs
- "Spreadsheet Budget", "dashboard spreadsheet", "formule ODOO.PIVOT", "tableur Odoo", "liste les spreadsheets".

## Paramètres
- `action`: `list`, `inspect`, `explain_formula`, `suggest_formula`.
- `document_id`: ID du document ou dashboard pour `inspect`.
- `model`: `documents.document` ou `spreadsheet.dashboard`.
- `formula`: formule à expliquer.
- `query`, `model_hint`: besoin libre pour suggestion.

## Pièges
- Les dashboards Odoo non-spreadsheet ne sont pas dans le périmètre.
- Les formules Excel classiques comme `SOMME.SI` ne nécessitent pas ce skill sauf si elles combinent `ODOO.*`.

## Combinaisons
- `odoo_query_records` pour résoudre un document par nom si nécessaire.
- `inspect_financial_reports` pour les rapports comptables Enterprise.

## Critères de réponse
- Pour `inspect`, fournir table des feuilles, top formules `ODOO.*`, cellules et recommandations de maintenance.
