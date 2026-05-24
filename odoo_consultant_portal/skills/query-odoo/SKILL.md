---
name: query_odoo
label: Requêter Odoo
label_en: Query Odoo
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Rechercher des enregistrements via search_read (commandes, factures, contacts...)."
description_en: "Fetch records via search_read (orders, invoices, contacts...)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [donnée, data, records, search_read, liste, facture, commande, contact]
version: "1.0.0"
tags: [odoo, live-data, search-read]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: odoo_consultant_portal/skills/query-odoo/scripts/handler.py
---

## Principes communs
- Skill en lecture seule : utilise-le sans demander d'autorisation quand il peut confirmer un fait.
- Cite les paramètres importants utilisés : modèle, domain, champs, limite, tri.
- Les données live Odoo priment sur le contexte Markdown et les hypothèses.
- Si les droits utilisateur ou la société active limitent le résultat, signale-le.

## query_odoo
Utilise `query_odoo` pour lire des enregistrements concrets via `search_read`.

## Quand l'utiliser
- L'utilisateur demande une liste, un exemple réel, un détail de fiche ou une vérification de données.
- Tu dois confirmer l'état d'une commande, facture, opportunité, tâche, produit, contact, etc.
- Le Creator doit résoudre précisément les enregistrements à modifier.

## Bonnes pratiques
- Appelle `get_odoo_fields` avant si le modèle, les champs ou les relations sont incertains.
- Demande uniquement les champs utiles.
- Utilise `limit` comme échantillon contrôlé ; ne présente jamais un échantillon comme exhaustif.
- Pour un total, utilise `count_odoo`; pour un KPI groupé, utilise `read_group_odoo`.
- Dans la réponse, indique le domain utilisé et distingue faits vérifiés, hypothèses et recommandations.
