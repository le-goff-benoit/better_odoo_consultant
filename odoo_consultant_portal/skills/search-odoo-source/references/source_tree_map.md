# Carte des sources Odoo — community / enterprise

Référence chargée à la demande quand le prompt évoque l'organisation du code source, « où est `mail` », « comment c'est rangé », ou la différence community/enterprise.

## Deux racines distinctes

```
~/.odoo-consultant/sources/
├── 17.0/                          ← Community (clone de odoo/odoo)
│   ├── odoo/                      ← framework + modules ULTRA core (base, web)
│   │   ├── addons/
│   │   │   ├── base/              ← le module root
│   │   │   └── web/               ← framework web (OWL, controllers, assets)
│   │   ├── models/                ← BaseModel, fields, etc.
│   │   ├── tools/
│   │   └── ...
│   ├── addons/                    ← modules community (la majorité)
│   │   ├── sale/
│   │   ├── account/
│   │   ├── stock/
│   │   ├── mail/
│   │   ├── ...                    ← ~200 modules
│   └── README.md
│
└── 17.0-enterprise/               ← Enterprise (clone séparé)
    ├── account_accountant/        ← modules à plat (pas de sous-dossier addons/)
    ├── helpdesk/
    ├── sign/
    ├── web_studio/
    └── ...                        ← ~70 modules
```

## Convention de préfixe dans les résultats du tool

Le tool `search_odoo_source` retourne les chemins avec un préfixe :
- `community/...` → fichier dans `17.0/`
- `enterprise/...` → fichier dans `17.0-enterprise/`

Quand tu passes ces chemins à `read_odoo_file`, conserve le préfixe.

## Modules core (sous `odoo/addons/`)

À part : ces modules sont chargés en premier et fournissent l'infra :
- `base` : `res.partner`, `res.users`, `res.company`, `ir.model`, `ir.module.module`, etc.
- `web` : framework JavaScript (OWL), controllers, assets bundles, traductions

Tu peux chercher dans `odoo/addons/base/` pour comprendre les modèles centraux.

## Modules community vs enterprise

| Module | Où | Notes |
|---|---|---|
| `sale` | community/addons/sale | base devis/commandes |
| `sale_management` | community/addons/sale_management | suite UI sales |
| `sale_subscription` | enterprise/sale_subscription | abonnements |
| `account` | community/addons/account | compta de base |
| `account_accountant` | enterprise/account_accountant | suite compta avancée |
| `crm` | community/addons/crm | leads/opportunités |
| `helpdesk` | enterprise/helpdesk | tickets support |
| `mail` | community/addons/mail | chatter, mailing, discuss |
| `mass_mailing` | community/addons/mass_mailing | newsletters |
| `web` | community/odoo/addons/web | framework web |
| `web_studio` | enterprise/web_studio | Studio |

**Règle** : si tu cherches une feature « basique » → community. Si c'est une feature « pro » (abonnements, suite compta, helpdesk, planning, Studio, etc.) → enterprise.

## Organisation d'un module type

```
addons/sale/
├── __manifest__.py          ← métadonnées
├── __init__.py              ← import Python (models, controllers, wizards)
├── models/
│   ├── __init__.py
│   ├── sale_order.py
│   ├── sale_order_line.py
│   ├── res_partner.py       ← extensions sur d'autres modèles
│   └── res_company.py
├── views/
│   ├── sale_order_views.xml
│   ├── res_partner_views.xml
│   └── sale_menus.xml
├── data/
│   ├── sale_data.xml        ← données initiales (séquences, paramètres)
│   └── mail_template_data.xml
├── demo/
│   └── sale_demo.xml        ← données de démo
├── security/
│   ├── ir.model.access.csv  ← ACL
│   └── sale_security.xml    ← groupes + record rules
├── report/
│   ├── sale_report.py       ← modèle de reporting (vue SQL)
│   └── sale_order_report.xml
├── wizard/
│   └── sale_make_invoice_advance.py
├── controllers/
│   └── portal.py            ← routes HTTP
├── static/
│   ├── src/
│   │   ├── js/
│   │   ├── scss/
│   │   └── xml/             ← templates OWL
│   └── description/
│       └── icon.png
├── tests/
│   └── test_sale_order.py
├── i18n/
│   └── fr.po
└── README.md
```

## Patterns de recherche utiles

### Trouver la définition d'un modèle

```
pattern: "_name = 'sale.order'"
file_types: ["*.py"]
```

Le `_name` est l'identifiant unique du modèle. Première ligne typique d'une classe modèle.

### Trouver tous les overrides d'un modèle

```
pattern: "_inherit = 'sale.order'"
file_types: ["*.py"]
```

### Trouver l'origine d'un champ

```
pattern: "amount_total = fields"
path: "addons/sale"
```

### Trouver une vue par xml_id

```
pattern: "view_order_form"
file_types: ["*.xml"]
```

### Trouver un template QWeb

```
pattern: 'template id="report_invoice"'
file_types: ["*.xml"]
```

## Particularité : `odoo/addons/base/`

`base/` est un module mais il vit sous `odoo/addons/base/`, PAS sous `addons/base/`. Notre tool gère ça automatiquement : `path="addons/base"` est résolu vers `odoo/addons/base` côté community.

## Outils complémentaires

- `read_odoo_file` : lire un fichier identifié.
- `git_show_commit scope=odoo` : voir un commit Odoo Community.
- `git_show_commit scope=enterprise` : voir un commit Odoo Enterprise.
- Pour le code du projet client (custom), c'est `search_project_source` et `read_project_file`.
