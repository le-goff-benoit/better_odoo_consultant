# Types de champs Odoo — guide pratique

Référence chargée à la demande quand le prompt évoque un type de champ, un compute, un related, ou un comportement bizarre d'un champ.

## Les types ORM

| Type | Stocké en DB | Usage typique |
|---|---|---|
| `char` | varchar | Texte court (nom, code, référence) |
| `text` | text | Texte long (commentaire, description) |
| `html` | text | HTML riche (description produit, note client) |
| `integer` | int4 | Entier (séquence, quantité entière) |
| `float` | numeric | Décimal (avec `digits=(16,3)` typiquement) |
| `monetary` | numeric | Montant + devise associée via `currency_field` |
| `boolean` | bool | Oui/non, actif/inactif |
| `date` | date | Date pure (sans heure) |
| `datetime` | timestamp | Date + heure UTC |
| `selection` | varchar | Choix dans liste statique `[('key','Label')]` |
| `many2one` | int4 (FK) | Lien vers un autre modèle (`product_id`) |
| `one2many` | (calculé) | Inverse d'un many2one (`invoice.line_ids`) |
| `many2many` | table de liaison | N↔N (tags, groupes) |
| `binary` | bytea | Fichier (image, PDF, blob) |
| `reference` | varchar | many2one « polymorphe » (`model,id`) |
| `json` | jsonb | Document JSON (depuis Odoo 16) |
| `properties` | jsonb | Champs dynamiques par enregistrement (depuis Odoo 17) |

## Modificateurs essentiels

### `required=True`

Contraint la validation Python ET la contrainte NOT NULL en DB (si `store=True`).

### `readonly=True`

Bloqué dans l'UI par défaut. Peut être contourné via attributs de vue ou compute.

### `store=True` / `store=False`

- `store=False` (défaut sur les `compute`) : recalculé à chaque accès, jamais en DB. **Pas filtrable** dans un domain.
- `store=True` : stocké en DB après chaque recalcul. Filtrable, indexable, mais ralentit les écritures.

### `index=True`

Crée un index PostgreSQL. À mettre sur les champs **fréquemment filtrés** (FK, dates, états).

### `tracking=True` (depuis 13)

Ajoute le champ au log d'audit (chatter). Utile pour les champs sensibles.

## Champs calculés (`compute`)

```python
amount_total = fields.Monetary(
    compute="_compute_amounts",
    store=True,
    currency_field="currency_id",
)

@api.depends('order_line.price_subtotal', 'order_line.price_tax')
def _compute_amounts(self):
    for order in self:
        order.amount_total = ...
```

**Règles clés** :
- `@api.depends(...)` est OBLIGATOIRE si `store=True` — sinon le champ ne se recalcule jamais après création.
- Le compute doit gérer le cas `self = recordset vide` proprement (boucle for).
- Si le compute dépend de champs d'un autre modèle, le path est `field1.field2.field3`.

### Pièges

- **Compute sans `store`** : recalculé à chaque lecture. Lent si appelé en boucle.
- **Compute avec `store` mais sans `depends`** : recalculé seulement à la création de l'enregistrement. Bug silencieux classique.
- **Compute qui dépend de `now()` ou `datetime.now()`** : non recalculé automatiquement, le `depends` ne peut pas tracker le temps qui passe.

## Champs `related`

```python
partner_name = fields.Char(related="partner_id.name", store=True, readonly=True)
```

Raccourci pour exposer un champ d'un modèle lié. Plus simple qu'un compute manuel.

**Limitations** :
- Chaîne de profondeur ≤ 2 conseillée. Au-delà, performance dégradée.
- `store=True` sur un related = duplication en DB (gain en filtrage, coût en cohérence).
- Modification d'un `related` : pas autorisée par défaut (`readonly=True`).

## Champs custom (Studio vs code)

| Préfixe | Origine | Reconnaissable via |
|---|---|---|
| `x_studio_*` | Studio UI | `inspect_studio` + `state='manual'` dans `ir.model.fields` |
| `x_*` (sans `_studio_`) | Module custom code | Présent dans `__manifest__.py` (data file ou inline) |
| Aucun préfixe | Module standard Odoo | Présent dans le source Odoo |

## Héritage de champs

Trois mécanismes :

### 1. `_inherit` (extension)

```python
class SaleOrder(models.Model):
    _inherit = "sale.order"
    x_commission = fields.Float()
```

Ajoute le champ sur le modèle existant. Pas de nouveau modèle.

### 2. `_inherit` + `_name` (prototype/delegation)

Crée un nouveau modèle qui hérite des champs et des méthodes mais a sa propre table.

### 3. `_inherits` (delegation)

```python
class Product(models.Model):
    _name = "product.product"
    _inherits = {"product.template": "product_tmpl_id"}
```

Le modèle accède aux champs d'un autre via une FK. Modifications propagées.

## Cas particuliers

### `selection` dynamique

```python
state = fields.Selection(selection="_get_states")

def _get_states(self):
    return [('draft', 'Draft'), ...]
```

Liste calculée à l'init. Utile pour des choix dépendants de la config.

### Champ traduit

```python
name = fields.Char(translate=True)
```

Stocké en JSON par langue depuis Odoo 16. Avant, table `ir.translation`.

### Champ avec contrainte SQL

```python
_sql_constraints = [
    ('code_unique', 'UNIQUE(code)', 'Le code doit être unique.'),
]
```

Plus rapide qu'un `@api.constrains` mais ne s'applique qu'au niveau ligne.

## Quand préférer un autre tool

- Pour voir l'arch d'une vue (où le champ est exposé) → `inspect_odoo_view`
- Pour le code source d'un compute → `read_odoo_file` (besoin du chemin)
- Pour les contraintes/règles applicables → `inspect_security` (côté ACL/record rules)
