# Usage canonique — repo_search_code

**Prompt utilisateur** : « Le module custom client a-t-il un override de `action_confirm` sur sale.order ? »

**Tool call attendu** :
```json
{
  "name": "repo_search_code",
  "arguments": {
    "pattern": "def action_confirm",
    "file_types": ["*.py"],
    "case_sensitive": true
  }
}
```

**Pourquoi ces arguments** :
- `pattern="def action_confirm"` : on cherche une définition de méthode, pas un appel. Précis et sans faux positifs.
- Pas de `path` : on cherche dans tout le dépôt client, sans présupposer dans quel module l'override se trouve.
- `file_types=["*.py"]` : un override de méthode = Python.

**Résultat retourné** :
```json
{ "ok": true, "matches": 2, "files_count": 2,
  "files": {
    "acme_sales_extension/models/sale_order.py": [
      { "line": 47, "content": "def action_confirm(self):" }
    ],
    "acme_pricing_engine/models/sale_order.py": [
      { "line": 18, "content": "def action_confirm(self):" }
    ]
  }}
```

**Interprétation côté assistant** :
> Oui, **2 modules custom du client overrident `action_confirm`** sur `sale.order` :
> 1. `acme_sales_extension/models/sale_order.py:47`
> 2. `acme_pricing_engine/models/sale_order.py:18`
>
> Pour comprendre l'ordre d'application : si les deux modules s'héritent (depend de `sale`), ils s'enchaînent selon l'ordre de chargement Odoo (= ordre topologique des `depends`). Si l'un dépend de l'autre, le dépendant exécute en dernier. Pour voir le détail des deux overrides, je peux ouvrir chaque fichier avec `repo_read_file`.
>
> Attention : si l'un des overrides ne fait pas `super().action_confirm()` à la fin, l'autre ne s'exécutera pas — pattern fréquent de bug.

**Pièges à éviter** :
- `repo_search_code` ne cherche QUE dans le repo cloné du client — pas dans le code Odoo standard. Pour ça, utiliser `source_search_odoo`.
- Pas de notion de `community/enterprise` ici : le repo client est mono-racine. Les chemins retournés sont relatifs à la racine du repo.
- Si le client a plusieurs sous-dossiers (`addons/`, `local-src/`, `extra-addons/`), utiliser `path="local-src"` pour cibler.
- Un override peut aussi être un **monkey-patch** (`SaleOrder.action_confirm = ...`) — pas matché par `def action_confirm`. Si tu suspectes, chercher aussi `_inherit = "sale.order"` puis `action_confirm` dans les fichiers identifiés.
