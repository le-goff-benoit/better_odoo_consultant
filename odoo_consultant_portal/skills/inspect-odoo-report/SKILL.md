---
name: inspect_odoo_report
label: Inspecter un rapport
label_en: Inspect a report
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Lire le template QWeb, l'héritage et la mise en page d'un rapport PDF."
description_en: "Read the QWeb template, inheritance tree and layout of a PDF report."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration, creator]
keywords: [rapport, report, pdf, qweb, template, xpath, facture pdf]
code_path: odoo_consultant_portal/skills/inspect-odoo-report/scripts/handler.py
references_auto_load:
  - file: qweb_layout_internals.md
    triggers: [qweb, paperformat, external_layout, t-call, t-field, t-foreach, report_invoice, rapport pdf, wkhtmltopdf, header_spacing, customiser rapport, custom report]
---

## Principes communs
- Skill en lecture seule : il inspecte les rapports PDF/QWeb réels.
- Les xpath de rapport doivent cibler l'arch réelle, pas un souvenir de template.

## inspect_odoo_report
Utilise `inspect_odoo_report` pour lire action de rapport, template QWeb, héritage, `qweb_archs`, format papier et layout société.

## Quand l'utiliser
- Facture PDF, devis PDF, bon de livraison, layout, logo, mentions légales.
- Le Creator doit produire un `modify_report`.
- Tu dois expliquer pourquoi un rapport a une apparence donnée.

## Bonnes pratiques
- Obligatoire avant tout `modify_report`.
- Pour contenu document, hérite du template document.
- Pour en-tête/pied de page, hérite du layout actif de la société.
- En QWeb rapport, utilise `t-field` ou `t-out`, pas `<field name="..."/>`.
