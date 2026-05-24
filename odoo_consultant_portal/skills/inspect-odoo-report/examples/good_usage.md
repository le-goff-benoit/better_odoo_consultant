# Usage canonique — inspect_odoo_report

**Prompt utilisateur** : « Comment est construit le rapport de facture PDF ? Je veux ajouter le numéro de client en haut. »

**Tool call attendu** :
```json
{
  "name": "inspect_odoo_report",
  "arguments": { "report_name": "account.report_invoice" }
}
```

**Pourquoi ces arguments** :
- `report_name="account.report_invoice"` : nom technique de l'action de rapport (préfixe module + `report_` + nom court). Reconnaissable depuis l'URL d'impression ou via `inspect_menus_actions`.
- Alternative : `model="account.move"` pour lister tous les rapports liés au modèle facture.

**Résultat retourné** (extrait) :
```json
{ "ok": true,
  "report": { "id": 89, "name": "Invoices", "report_name": "account.report_invoice",
              "report_type": "qweb-pdf", "model": "account.move",
              "paperformat_id": [3, "European A4"] },
  "main_template": {
    "xml_id": "account.report_invoice",
    "arch": "<t t-name=\"account.report_invoice\">\n  <t t-call=\"web.html_container\">..."
  },
  "inherited_templates": [
    { "xml_id": "l10n_ch.report_invoice_isr", "modifies": "ajoute QR-bill Suisse" },
    { "xml_id": "studio_customization.report_invoice_logo_custom",
      "modifies": "remplace le logo header" }
  ],
  "qweb_archs": {
    "web.external_layout_standard": "<template id=\"external_layout_standard\">...</template>",
    "account.report_invoice_document": "<template id=\"report_invoice_document\">..."
  },
  "paperformat": { "format": "A4", "margin_top": 40, "margin_bottom": 32,
                   "header_spacing": 35, "orientation": "portrait" }}
```

**Interprétation côté assistant** :
> Le rapport « Invoices » (`account.report_invoice`) est un QWeb PDF assemblé en 3 couches :
> 1. **Layout** : `web.external_layout_standard` (header avec logo société, footer avec adresse).
> 2. **Template principal** : `account.report_invoice` → appelle `account.report_invoice_document` pour chaque facture.
> 3. **Héritages** : 2 modifications — `l10n_ch` ajoute le QR-bill suisse ; `studio_customization` remplace le logo header.
>
> Pour ajouter le numéro de client en haut, deux approches :
> - **Via Studio** (rapide, peu pérenne) : éditer le layout externe et glisser le champ.
> - **Via module custom** (recommandé prod) : créer un héritage du template `account.report_invoice_document` avec un xpath au début du `<div class="page">` :
>   ```xml
>   <xpath expr="//div[@class='page']" position="before">
>     <div class="text-end small">Client n° <span t-field="doc.partner_id.ref"/></div>
>   </xpath>
>   ```
>
> Le paperformat A4 a une marge top de 40px — ton ajout doit tenir dans le `header_spacing` (35px) si tu vises l'en-tête, ou dans la zone principale sinon.

**Pièges à éviter** :
- `report_type="qweb-pdf"` vs `qweb-html` vs `qweb-text` : seul `qweb-pdf` produit un PDF (passe par wkhtmltopdf). Le template QWeb est le même mais le rendu diffère.
- Le `doc` accessible dans le template QWeb = un record du modèle (`account.move` ici). Pour itérer sur plusieurs factures, c'est `docs` (au pluriel) à la racine du template.
- L'héritage Studio écrit avec un xml_id du style `studio_customization.report_invoice_xxxx_hash` — illisible. Ouvrir avec `inspect_odoo_view` (les rapports sont stockés comme `ir.ui.view`) pour voir l'arch.
- En dev, après modification d'un template QWeb, vider le cache assets via menu Dev → Regenerate Assets Bundles.
