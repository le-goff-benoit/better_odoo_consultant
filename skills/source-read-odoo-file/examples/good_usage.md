# Usage canonique — source_read_odoo_file

**Prompt utilisateur** : « Montre-moi la méthode `_compute_amounts` complète de sale.order. »

**Tool call attendu** :
```json
{
  "name": "source_read_odoo_file",
  "arguments": {
    "path": "community/addons/sale/models/sale_order.py",
    "start_line": 230,
    "end_line": 260
  }
}
```

**Pourquoi ces arguments** :
- `path` commence par `community/` : le préfixe est imposé par `source_search_odoo` quand on est dans le code standard. Sans préfixe, le tool essaie `community` puis `enterprise`.
- `start_line=230` : on a localisé la méthode à la ligne 236 via `source_search_odoo`, on prend une marge avant pour voir le décorateur `@api.depends`.
- `end_line=260` : 30 lignes typiquement suffisent pour une méthode Odoo. Si la méthode déborde, le résultat indique `total_lines` et `end_line` réel — relance avec un `start_line` plus loin.

**Résultat retourné** :
```json
{ "ok": true,
  "path": "community/addons/sale/models/sale_order.py",
  "start_line": 230,
  "end_line": 260,
  "total_lines": 1842,
  "content": "    @api.depends('order_line.price_total', 'order_line.price_subtotal')\n    def _compute_amounts(self):\n        \"\"\"Compute the total amounts of the SO.\"\"\"\n        for order in self:\n            ...\n            order.amount_untaxed = sum(line.price_subtotal for line in order_lines)\n            order.amount_tax = sum(line.price_tax for line in order_lines)\n            order.amount_total = order.amount_untaxed + order.amount_tax\n"
}
```

**Interprétation côté assistant** :
> Voici `_compute_amounts` de `sale.order` (sale_order.py:230-260) :
>
> ```python
> @api.depends('order_line.price_total', 'order_line.price_subtotal')
> def _compute_amounts(self):
>     """Compute the total amounts of the SO."""
>     for order in self:
>         ...
>         order.amount_untaxed = sum(line.price_subtotal for line in order_lines)
>         order.amount_tax = sum(line.price_tax for line in order_lines)
>         order.amount_total = order.amount_untaxed + order.amount_tax
> ```
>
> Le calcul est trivial une fois les lignes calculées : somme des `price_subtotal` (HT), somme des `price_tax` (TVA), addition. La complexité est dans `sale.order.line._compute_amount` côté ligne, où s'appliquent remises, fiscalité multi-taxes, et arrondis.

**Pièges à éviter** :
- **Toujours regarder `total_lines`** : si tu lis lignes 230-260 sur un fichier de 1842, ne pas conclure « j'ai lu le fichier ». Souvent il faut une 2e passe pour le contexte.
- Le `end_line` rendu est capé à `start_line + 200` (limite tool). Pour lire plus, faire plusieurs appels.
- En enterprise, les chemins commencent par `enterprise/<module>/...` SANS `addons/` (le préfixe `addons/` est community uniquement).
- Si le fichier n'existe pas, le tool retourne `{"ok": false, "error": "Fichier introuvable"}` — vérifier la version Odoo cible : un fichier peut exister en 17 mais pas en 15.
