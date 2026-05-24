# Rapports QWeb Odoo — internals

Référence chargée à la demande quand le prompt évoque QWeb, rapport PDF, paperformat, layout, ou personnalisation de facture/devis PDF.

## Anatomie d'un rapport

Un rapport Odoo se compose de 4 couches :

```
┌──────────────────────────────────────────────────┐
│ ir.actions.report           (= "Imprimer Facture")│
│  ↓ déclenche                                      │
│ template principal          (= "account.report_invoice")│
│  ↓ wrappé par                                     │
│ web.html_container          (= HTML doctype)      │
│  ↓ qui appelle                                    │
│ web.external_layout         (= header/footer société)│
│  ↓ qui appelle                                    │
│ <template document>         (= contenu de la page)│
└──────────────────────────────────────────────────┘
                  ↓ rendu par wkhtmltopdf
                  ↓ avec un paperformat
                  ↓ → fichier PDF
```

## L'action `ir.actions.report`

```python
{
    "name": "Invoices",
    "report_name": "account.report_invoice",   # = nom technique
    "report_type": "qweb-pdf",                  # qweb-pdf | qweb-html | qweb-text
    "model": "account.move",
    "paperformat_id": <id>,
    "binding_model_id": <id account.move>,     # → bouton dans le print menu
}
```

`report_name` est l'**xml_id** d'un `ir.ui.view` de type `qweb`. Convention : `<module>.report_<nom>`.

## Le template principal

```xml
<template id="report_invoice">
    <t t-call="web.html_container">
        <t t-foreach="docs" t-as="o">
            <t t-call="account.report_invoice_document" t-lang="o.partner_id.lang"/>
        </t>
    </t>
</template>
```

Conventions :
- `docs` = liste d'enregistrements (passés par l'action) — itérer avec `t-foreach`.
- `o` (ou `doc`) = enregistrement courant.
- `t-call="..."` = inclusion d'un autre template.
- `t-lang="..."` = force la langue pour le rendu (utile pour traduire selon le client).

## Le layout externe

```xml
<template id="external_layout">
    <t t-if="company.external_report_layout_id">
        <t t-call="{{ company.external_report_layout_id.key }}"/>
    </t>
    <t t-else="">
        <t t-call="web.external_layout_standard"/>
    </t>
</template>
```

Le layout effectif dépend de la société (champ `external_report_layout_id`). Odoo livre 5 layouts standard :
- `web.external_layout_standard` (défaut)
- `web.external_layout_background` (image de fond)
- `web.external_layout_boxed`
- `web.external_layout_bold`
- `web.external_layout_clean`

Le client peut créer un layout custom et le sélectionner dans **Settings → Companies → Document Layout**.

## Le template document

C'est là que vit le contenu réel (table des lignes, totaux, conditions). Convention : `<module>.report_<nom>_document`.

Variables disponibles dans le template document :
- `o` : enregistrement courant
- `company` : société (résolu via `o.company_id` ou `request.env.company`)
- `user` : utilisateur connecté (pas le destinataire)
- `res_company` : alias de company
- Toutes les méthodes/champs Python du modèle

## Le paperformat

```python
{
    "name": "European A4",
    "format": "A4",
    "orientation": "portrait",
    "margin_top": 40,
    "margin_bottom": 32,
    "margin_left": 7,
    "margin_right": 7,
    "header_spacing": 35,
    "header_line": False,
    "dpi": 90,
}
```

- `header_spacing` : espace en haut où le header (logo société) est rendu. Si tu mets 0, ton contenu chevauche le header.
- `dpi` : qualité de rendu. 90 par défaut, monter à 150 pour des PDF print-quality (plus lourd).

## Tags QWeb essentiels

| Tag | Effet |
|---|---|
| `t-if="cond"` | Rendu conditionnel |
| `t-foreach="list" t-as="item"` | Itération |
| `t-field="o.partner_id"` | Affiche un champ avec son widget (devise, date locale, etc.) |
| `t-esc="expression"` | Affiche le résultat de l'expression (échappé) |
| `t-out="expression"` | Affiche sans échappement (HTML brut) |
| `t-call="template_id"` | Inclut un autre template |
| `t-set="var" t-value="expr"` | Définit une variable QWeb |
| `t-options='{"widget":"monetary","display_currency":o.currency_id}'` | Options de rendu du widget |

## Patterns courants

### Afficher un champ monetary avec la devise de la commande

```xml
<span t-field="o.amount_total" t-options='{"widget": "monetary", "display_currency": o.currency_id}'/>
```

### Afficher la date au format de la société

```xml
<span t-field="o.date_order"/>
```

(`t-field` connaît le format date selon `tz`/`lang` du destinataire si `t-lang` est défini sur le wrapper)

### Itérer sur les lignes avec compteur

```xml
<tr t-foreach="o.order_line" t-as="line">
    <td><t t-esc="line_index + 1"/></td>
    <td t-field="line.name"/>
    <td t-field="line.product_uom_qty"/>
    <td t-field="line.price_unit" t-options='{"widget":"monetary","display_currency":o.currency_id}'/>
</tr>
```

Variables auto disponibles dans `t-foreach` : `<as>_index`, `<as>_first`, `<as>_last`, `<as>_size`.

### Sauter une page

```xml
<div style="page-break-after: always;"/>
```

CSS standard accepté par wkhtmltopdf.

## Hériter un template QWeb

Même syntaxe xpath que les vues normales :

```xml
<template id="report_invoice_document_acme_logo" inherit_id="account.report_invoice_document">
    <xpath expr="//div[@class='page']" position="before">
        <img t-att-src="'data:image/png;base64,' + str(o.company_id.x_studio_secondary_logo, 'utf-8')"
             style="height: 40px; margin-bottom: 10px;"/>
    </xpath>
</template>
```

## Pièges

### `t-call` sans `t-lang`

Le PDF est rendu dans la langue du **user connecté**, pas du destinataire. Pour un envoi par mail au client, toujours `t-lang="o.partner_id.lang"`.

### `t-field` sur un champ vide

Affiche une chaîne vide. Pour personnaliser le placeholder : `<t t-if="o.x_field" t-field="o.x_field"/><t t-else="">N/A</t>`.

### Cache des assets

Après modification d'un template, vider le cache via **Dev → Regenerate Assets Bundles** (mode développeur). Sinon le rendu reste l'ancien.

### Wkhtmltopdf et CSS modernes

Wkhtmltopdf utilise un vieux WebKit. Pas de flexbox, pas de grid, pas de `position: sticky`. Préférer tables HTML pour les layouts complexes.

### Image inline limit

Les images en data URI sont limitées à ~10 Mo. Pour des PJ volumineuses, passer par `binary` field + `t-att-src` qui pointe vers un endpoint `/web/image/...`.

## Outils complémentaires

- `odoo_inspect_report` : voir la structure d'un rapport, ses héritages, son paperformat.
- `odoo_inspect_view` : les templates QWeb sont stockés en `ir.ui.view` — accessibles via cet outil.
- `source_search_odoo` + `file_types=["*.xml"]` : chercher des patterns QWeb dans le code Odoo standard pour s'inspirer.
