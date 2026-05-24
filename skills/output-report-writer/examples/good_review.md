# Revue technique — module `acme_sales_extension` (Odoo 17)

**Contexte** : Audit avant mise en production du module custom `acme_sales_extension` (Acme SA, Odoo 17.0), 642 LOC sur 3 fichiers Python + 2 vues XML.
**Verdict global** : ⚠ Corrections requises

## Bloquants

- [ ] **Mot de passe en clair dans le code** — `acme_sales_extension/models/external_api.py:34` — La clé API du service de pricing externe est hardcodée. Visible dans git, partagée avec tous les développeurs présents et futurs.
  Correction proposée :
  ```python
  # Remplacer
  API_KEY = "ak_live_a1b2c3d4..."
  # Par
  API_KEY = self.env["ir.config_parameter"].sudo().get_param("acme.pricing_api_key")
  ```

- [ ] **`@api.depends` manquant sur champ calculé stocké** — `models/sale_order.py:78` — `_compute_x_commission` est marqué `store=True` sans `@api.depends`. Le champ ne se recalcule jamais après la création — commissions figées à 0 pour toutes les commandes existantes.

## Risques importants

- **Pas de `<record id="...">` sur 2 vues** — `views/sale_order_views.xml:14,52` — Vues anonymes : impossibles à hériter, impossibles à désinstaller proprement. À nommer avant que d'autres modules n'en dépendent.
- **Aucun `security/ir.model.access.csv`** — `__manifest__.py` ne déclare pas de fichier de sécurité. Les modèles ajoutés sont accessibles à tout user authentifié — à corriger avant prod.

## Suggestions

- Renommer `x_commission` en `commission_amount` : le préfixe `x_` est réservé aux champs Studio. La confusion freinera les futures évolutions.
- Ajouter un test sur le calcul de commission (`tests/test_commission.py`) — la formule est non triviale (paliers + TVA récupérable).

## Exemples corrigés

```python
# Avant — models/sale_order.py:75-80
class SaleOrder(models.Model):
    _inherit = "sale.order"
    x_commission = fields.Float(compute="_compute_x_commission", store=True)

    def _compute_x_commission(self):
        for order in self:
            order.x_commission = order.amount_total * 0.05

# Après
class SaleOrder(models.Model):
    _inherit = "sale.order"
    commission_amount = fields.Float(compute="_compute_commission", store=True)

    @api.depends("amount_total", "partner_id.x_commission_rate")
    def _compute_commission(self):
        for order in self:
            rate = order.partner_id.x_commission_rate or 0.05
            order.commission_amount = order.amount_total * rate
```

## Recommandation finale

Ne pas déployer en l'état. Corriger les 2 bloquants (24h de travail), puis re-soumettre une PR. Les risques importants peuvent être traités dans le sprint suivant. Décision finale : @{{ tech lead }} valide la PR corrective avant lundi.
