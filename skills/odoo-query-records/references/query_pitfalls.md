# Requêter Odoo via XML-RPC — pièges et bonnes pratiques

Référence chargée à la demande quand le prompt évoque un domaine complexe, une pagination, des performances, des données qui « manquent », ou un comportement inattendu de `search_read`.

## Domaines (`domain`)

### Syntaxe polonaise préfixée

Les opérateurs logiques **précèdent** leurs opérandes :

```python
# AND implicite entre éléments de la liste
[('state', '=', 'done'), ('amount_total', '>', 1000)]

# OR explicite : 1 opérateur pour 2 conditions
['|', ('state', '=', 'done'), ('state', '=', 'sale')]

# NOT : 1 opérateur pour 1 condition
['!', ('state', '=', 'cancel')]

# Combinaisons : compter les opérandes !
# (state='done' AND amount>1000) OR partner_id=42
['|', '&', ('state','=','done'), ('amount_total','>',1000), ('partner_id','=',42)]
```

Erreur fréquente : oublier qu'un `|` ne couvre que **les deux éléments suivants**. Pour 3 conditions OR il faut deux `|` consécutifs.

### Opérateurs utiles

| Opérateur | Sens | Note |
|---|---|---|
| `=`, `!=`, `>`, `>=`, `<`, `<=` | comparaison | |
| `=like`, `like`, `ilike` | LIKE SQL | `ilike` = case-insensitive |
| `=ilike` | match exact insensible à la casse | rarement utile |
| `in`, `not in` | liste | `('id', 'in', [1,2,3])` |
| `child_of`, `parent_of` | hiérarchie | sur champs `parent_id` (catégories, BoM, comptes) |
| `=?` | match si valeur non nulle | sinon ignoré |

### Pièges classiques

- `('field', '=', False)` cherche **NULL** ; pour chaîne vide selon le type, tester aussi `('field', '=', '')`.
- `many2one` : comparer par `id` (`('partner_id', '=', 42)`) ou via path (`('partner_id.country_id.code', '=', 'CH')`).
- `one2many`/`many2many` : `('line_ids', '!=', False)` = a au moins une ligne ; pour filtrer sur un champ enfant, utiliser un path direct.
- Filtre sur date : toujours passer une chaîne `'YYYY-MM-DD HH:MM:SS'` en UTC, pas un `datetime` Python.

## `active_test` et enregistrements archivés

Par défaut, l'ORM applique un filtre implicite `active = True` sur les modèles ayant un champ `active`. Conséquences :

- Un `search_read` ne renvoie **pas** les enregistrements archivés.
- Pour les inclure : passer `context={'active_test': False}`.
- Pour ne voir **que** les archivés : `domain=[('active', '=', False)]` + `active_test=False`.

À vérifier sur : `res.partner`, `product.template`, `product.product`, `account.account`, `hr.employee`, presque tous les modèles maîtres.

## Contexte (`context`) qui modifie le résultat

Clés à connaître :

- `lang` : `'fr_CH'`, `'en_US'`… affecte les champs `translate=True` (noms, descriptions, sélections).
- `tz` : convertit `datetime` à l'affichage côté serveur — pour des calculs, garder UTC.
- `company_id` / `allowed_company_ids` : multi-société, indispensable sinon on lit la company de l'utilisateur RPC.
- `active_test: False` : voir archivés.
- `bin_size: True` : remplace les champs `binary` par leur taille (kilo-octets) — utile pour ne pas charger les blobs.
- `default_*` : ignoré en lecture, utile uniquement en `create`.

## Pagination et volumétrie

L'app borne `query_odoo` :

- `limit=0` ⇒ **exhaustif borné** par défaut.
- Pages internes de **500**, plafond global **5000**.
- Retour : `total_count`, `count`, `pages_fetched`, `truncated`, `warning` si partiel.

Recommandations pour le LLM :

1. Si l'utilisateur dit « tous », garder `limit=0` mais surveiller `truncated`.
2. Pour un **comptage seul**, ne pas utiliser `query_odoo` : préférer `odoo_count_records`.
3. Pour des **KPI groupés** (somme, moyenne par mois, par partenaire), préférer `odoo_aggregate_records` (`read_group`).
4. Si `truncated=True`, annoncer à l'utilisateur que le résultat est partiel et proposer un filtre.

## Champs à éviter de demander

- `binary` non filtré : peut renvoyer plusieurs Mo par ligne. Toujours passer `context={'bin_size': True}` si on doit lister.
- `__last_update` : présent sur tous les modèles mais rarement utile.
- `display_name` : calculé, coûteux sur certains modèles (chaînage parent). Préférer un champ `name` réel si possible.

## Modèles courants — pièges spécifiques

| Modèle | Piège |
|---|---|
| `account.move` | Filtrer aussi `move_type` (`out_invoice`, `in_invoice`, `out_refund`…) ; `state` peut être `draft`/`posted`/`cancel`. |
| `account.move.line` | Pour les lignes facture, filtrer `display_type` ∈ `False/'product'` pour exclure les notes/sections. |
| `sale.order` | `state` : `draft`, `sent`, `sale`, `done`, `cancel`. « Confirmé » = `('state', 'in', ['sale','done'])`. |
| `stock.move` | Les mouvements annulés (`state='cancel'`) traînent — filtrer `state='done'` pour les flux réels. |
| `res.partner` | `type` ∈ `contact/invoice/delivery/other` ; `is_company` distingue société/personne. `parent_id` lie un contact à sa société. |
| `product.product` vs `product.template` | Toujours clarifier : variante vs template. Beaucoup de prompts mélangent les deux. |
| `hr.employee` | Le champ `user_id` peut être vide ; pour lier à un utilisateur Odoo. |
| `mail.message` / `mail.activity` | Volumétrie énorme — toujours borner par date ou par enregistrement parent (`res_model`+`res_id`). |

## Performance

- Toujours préciser `fields=[…]` ; sans, le serveur renvoie tous les champs stockés du modèle (lourd).
- Éviter de demander des champs `compute` non stockés sur de gros volumes (recalcul ligne par ligne).
- Pour comparer 2 environnements, lancer les deux requêtes en parallèle plutôt qu'en série.
- `order='id desc'` est le plus rapide ; un tri sur champ non indexé peut coûter cher.

## Erreurs XML-RPC fréquentes

| Erreur | Cause typique |
|---|---|
| `Invalid field 'x_foo' on model 'y'` | Champ Studio absent de cette base — vérifier via `odoo_inspect_fields`. |
| `AccessError` | L'utilisateur RPC n'a pas le droit de lire ce modèle / record rule. Vérifier `inspect_security`. |
| `Expected singleton` | Côté serveur, un champ `compute` itère sur un recordset multi — pas notre problème, signaler à l'utilisateur. |
| Timeout | Plage de date trop large, ou champ non stocké demandé. Réduire `fields` ou découper. |
