# Modules Odoo installés — taxonomie et lecture d'inventaire

Référence chargée à la demande quand le prompt évoque le scoping d'une stack, l'identification de modules custom, le diagnostic de dépendances, ou la préparation d'une migration.

## Sources et identification

`ir.module.module` est la table de vérité côté base. Champs clés :

| Champ | Sens |
|---|---|
| `name` | Nom technique du module (ex. `sale_management`). |
| `shortdesc` | Libellé affiché (« Sales »). |
| `state` | `installed`, `uninstalled`, `to install`, `to upgrade`, `uninstallable`. |
| `latest_version` | Version installée (ex. `17.0.1.2.3`). Inclut la version Odoo majeure. |
| `author` | Auteur déclaré dans `__manifest__.py`. |
| `license` | LGPL-3, OEEL-1 (Enterprise), AGPL-3, OPL-1, autre. |
| `application` | True si c'est une « application » au sens du Apps store. |
| `dependencies_id` | Liens vers les modules dépendants. |

## Trois grandes familles à distinguer

### 1. Modules **Community** (officiels Odoo SA, gratuits)

- `author` = `Odoo S.A.`, `license` = `LGPL-3`.
- Présents dans `odoo/addons/` du dépôt principal.
- Exemples : `base`, `web`, `sale`, `purchase`, `stock`, `account`, `mail`, `contacts`, `hr`, `project`, `crm`, `mrp`, `point_of_sale`.

### 2. Modules **Enterprise** (Odoo SA, licence payante)

- `author` = `Odoo S.A.`, `license` = `OEEL-1` (Odoo Enterprise Edition License).
- Présents dans le dépôt **enterprise** (souvent `enterprise/<module>/`, **pas** sous `addons/`).
- Exemples : `account_accountant`, `documents`, `sign`, `helpdesk`, `studio`, `marketing_automation`, `web_studio`, `quality`, `mrp_workorder`, `account_reports`, `appraisal`, `planning`.
- Signal fort : si une base a `studio` installé, attendre des champs `x_studio_*` partout.

### 3. Modules **custom** (client, partenaire, OCA, marketplace)

Pas de signal unique — combinaison à inspecter :

- `author` ≠ `Odoo S.A.` (ex. `Camptocamp`, `Akretion`, `Odoo Community Association (OCA)`, un partenaire local, le client lui-même).
- `license` libre (LGPL-3, AGPL-3, OPL-1, autre).
- `name` souvent préfixé : `oca_`, `l10n_<pays>_<partenaire>`, ou un acronyme client (`acme_sale_extension`).
- `latest_version` parfois pas alignée sur la version Odoo (ex. `1.0.0` au lieu de `17.0.1.0.0`) — signal d'un module artisanal.
- **OCA** : `author` contient `Odoo Community Association` ou `OCA` ; nombreux modules `account_*`, `partner_*`, `sale_*`, `stock_*` enrichis.

## Patterns de nommage utiles

| Préfixe | Indique |
|---|---|
| `l10n_<code>` | Localisation pays (`l10n_ch`, `l10n_fr`, `l10n_be`). Plans comptables, déclarations fiscales. |
| `account_<…>` | Extension comptabilité. |
| `sale_<…>`, `purchase_<…>`, `stock_<…>` | Extensions du module concerné. |
| `pos_<…>` | Point of Sale. |
| `mrp_<…>` | Fabrication. |
| `website_<…>` | Frontend web (CMS, eCommerce). |
| `hr_<…>` | RH, paie (paie = souvent Enterprise via `hr_payroll`). |
| `<client>_<…>` | Module client custom. |

## Lecture rapide d'une stack

Une base typique d'une PME industrielle Odoo 17 :

- Apps : `sale_management`, `purchase`, `stock`, `mrp`, `account_accountant` (Enterprise), `crm`, `hr`.
- Localisation : `l10n_ch` + `l10n_ch_hr_payroll` ou équivalent.
- Custom typiques : 3 à 15 modules client, souvent `<client>_sale_*`, `<client>_stock_*`, `<client>_mrp_*` qui surchargent les vues/champs.
- Si `studio` installé : attendre des `x_studio_*` champs et vues — confirmer avec `odoo_inspect_studio`.

## Dépendances : comment les lire

- Un module dépend de ses parents via `depends` dans `__manifest__.py` → reflété dans `dependencies_id`.
- Pour cadrer une migration, partir des **applications custom** (`application=True` ET author ≠ Odoo SA) et remonter les dépendances : ce sont les vrais points durs.
- Un module Community installé « tout seul » sans dépendant custom est en général migré gratuitement par Odoo.

## Pièges fréquents

- `state='uninstalled'` mais module **présent dans le code** : module disponible mais non activé — ne pas le compter comme installé.
- `state='to upgrade'` : la mise à jour est en attente, la base est dans un état transitoire — alerter l'utilisateur.
- Modules **désinstallés sales** : `state='uninstalled'` mais des tables `x_*` ou des données héritées subsistent. Vérifier avec `inspect_fields` si on suspecte des reliquats.
- `author='Odoo S.A.'` sur un module dont le code est en fait OCA-forké : se méfier des bases reprises par un partenaire — toujours croiser avec le dépôt client cloné (`repo_list_modules`).
- **Apps payantes du marketplace** (auteurs tiers) : `license='OPL-1'`, souvent peu de documentation et risque de blocage migration.

## Quand basculer vers un autre skill

| Besoin | Skill |
|---|---|
| Lister les modules **du dépôt client cloné** (pas la base live) | `repo_list_modules` |
| Chercher le code source d'un module Community/Enterprise | `source_search_odoo` |
| Voir le contenu d'un fichier de module | `source_read_odoo_file` / `repo_read_file` |
| Identifier les champs/vues Studio liées | `odoo_inspect_studio` |
| Diagnostiquer les droits liés à un module | `odoo_inspect_security` |
