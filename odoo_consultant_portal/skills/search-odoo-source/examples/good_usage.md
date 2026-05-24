# Usage canonique — search_odoo_source

**Prompt utilisateur** : « Où est défini le calcul du `amount_total` sur les commandes ? »

**Tool call attendu** :
```json
{
  "name": "search_odoo_source",
  "arguments": {
    "pattern": "amount_total",
    "path": "addons/sale",
    "file_types": ["*.py"],
    "case_sensitive": true
  }
}
```

**Pourquoi ces arguments** :
- `pattern="amount_total"` : nom exact du champ. Pas de regex pour cette question, c'est un simple identifiant.
- `path="addons/sale"` : restreint au module `sale`. Sans ça, on aurait des hits dans `account`, `purchase`, `pos`, etc.
- `file_types=["*.py"]` : on cherche le calcul, donc Python. Pour le XML (vues), faire un appel séparé.
- `case_sensitive=true` : les identifiants Python sont case-sensitive. Le défaut.

**Résultat retourné** :
```json
{ "ok": true, "matches": 28, "files_count": 5,
  "files": {
    "community/addons/sale/models/sale_order.py": [
      { "line": 142, "content": "amount_total = fields.Monetary(string='Total', store=True, ..." },
      { "line": 234, "content": "@api.depends('order_line.price_total')" },
      { "line": 236, "content": "    def _compute_amounts(self):" },
      { "line": 240, "content": "        order.amount_total = order.amount_untaxed + order.amount_tax" }
    ],
    "community/addons/sale/models/sale_order_line.py": [...]
  }}
```

**Interprétation côté assistant** :
> Le champ `amount_total` est défini sur `sale.order` (`community/addons/sale/models/sale_order.py:142`), de type `Monetary` et `store=True`.
>
> Son calcul est dans la méthode `_compute_amounts` (ligne 236) :
> ```python
> @api.depends('order_line.price_total')
> def _compute_amounts(self):
>     ...
>     order.amount_total = order.amount_untaxed + order.amount_tax
> ```
>
> Le déclencheur est `order_line.price_total` : tout changement de ligne de commande recalcule le total. Pour le détail des calculs en cascade (`price_total` au niveau ligne), je peux ouvrir `sale_order_line.py`.

**Pièges à éviter** :
- **Préférer un `path` ciblé** : `addons/sale` plutôt qu'aucun path. Sans restriction, un pattern courant comme `_compute_` retourne des milliers de hits.
- `community/` et `enterprise/` sont les deux racines préfixées dans les résultats. Si tu vois `community/addons/sale/...`, c'est le module standard ; `enterprise/sale_subscription/...` c'est l'enterprise.
- Pour Odoo Enterprise, les modules sont à la racine de `enterprise/`, **pas** sous `addons/` (ex. `enterprise/web_studio/`, pas `enterprise/addons/web_studio/`).
- Patterns avec quotes (`_name = 'sale.order'`) : essayer simples ET doubles guillemets, le source code varie.
- Si zéro match avec `case_sensitive=true`, le tool suggère parfois `case_sensitive=false` — c'est pertinent pour les chaînes traduites ou les commentaires.
