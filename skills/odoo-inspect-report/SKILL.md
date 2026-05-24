---
name: odoo_inspect_report
aliases: [inspect_odoo_report]
label: Inspecter un rapport
label_en: Inspect a report
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Diagnostiquer ou modifier un rapport PDF Odoo : template QWeb, paperformat, external_layout, héritage XML, xpath, t-call/t-field/t-foreach, rendu wkhtmltopdf, customisation facture/devis/BL. Utiliser pour toute question sur un document imprimé Odoo. Ne pas utiliser pour une vue d'écran (odoo_inspect_view) ni pour un PDF uploadé par l'utilisateur en pièce jointe (runtime_attachment_handler)."
description_en: "Diagnose or modify an Odoo PDF report: QWeb template, paperformat, external_layout, XML inheritance, xpath, t-call/t-field/t-foreach, wkhtmltopdf rendering, invoice/quote/delivery layout customization. Use for any question about an Odoo-generated printed document. Do not use for screen views (odoo_inspect_view) or a PDF uploaded by the user as attachment (runtime_attachment_handler)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [rapport, report, pdf, qweb, template, xpath, facture pdf, devis pdf, bon de livraison, layout, paperformat, logo]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: read
code_path: skills/odoo-inspect-report/scripts/handler.py
references_auto_load:
  - file: qweb_layout_internals.md
    triggers: [qweb, paperformat, external_layout, t-call, t-field, t-foreach, report_invoice, rapport pdf, wkhtmltopdf, header_spacing, customiser rapport, custom report]
---

## Principes communs
- Skill en lecture seule : il inspecte les rapports PDF/QWeb réels.
- Les xpath de rapport doivent cibler l'arch réelle, pas un souvenir de template.

## odoo_inspect_report
Utilise `odoo_inspect_report` pour lire action de rapport, template QWeb, héritage, `qweb_archs`, `qweb_arch_meta`, `qweb_summaries`, format papier et layout société.

## Quand l'utiliser
- Facture PDF, devis PDF, bon de livraison, layout, logo, mentions légales.
- Le Creator doit produire un `modify_report`.
- Tu dois expliquer pourquoi un rapport a une apparence donnée.

## Bonnes pratiques
- Obligatoire avant tout `modify_report`.
- Pour contenu document, hérite du template document.
- Pour en-tête/pied de page, hérite du layout actif de la société.
- En QWeb rapport, utilise `t-field` ou `t-out`, pas `<field name="..."/>`.
- Si `qweb_arch_meta[template].truncated=true`, lis `qweb_summaries[template]` avant de conclure : le résumé est extrait depuis l'arch complète et inventorie textes visibles, expressions, boucles, appels et tables.

## Déclencheurs
- Rapport PDF, QWeb, xpath, layout, logo, mentions légales, paperformat.
- Creator doit modifier un rapport.

## Séquence recommandée
1. Identifie `report_name` ou `model`.
2. Appelle `odoo_inspect_report`.
3. Lis les `qweb_archs` et `qweb_summaries` retournés avant de proposer un xpath.
4. Croise avec `odoo_inspect_fields` si un champ doit être affiché.

## Paramètres
- `report_name`: rapport précis.
- `model`: liste des rapports disponibles sur un modèle.

## Pièges
- Le template document et le layout société ne sont pas le même niveau.
- Un xpath générique sur un souvenir de version est fragile.
- Certains contenus viennent du layout ou paperformat, pas du rapport lui-même.
- Une arch brute bornée ne bloque pas l'inventaire : utiliser `qweb_summaries` pour les blocs visibles et champs affichés.

## Combinaisons
- `odoo_inspect_view` pour comprendre l'écran source.
- `repo_read_file` si un module custom hérite déjà du rapport.
- `source_search_odoo` pour le template standard.

## Critères de réponse
- Donner template/action/layout/paperformat, preuve XML, et xpath proposé seulement si vérifié.
