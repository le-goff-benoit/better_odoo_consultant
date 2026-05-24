# Usage canonique — read_project_file

**Prompt utilisateur** : « Lis-moi le manifest de `acme_sales_extension` pour voir ses dépendances. »

**Tool call attendu** :
```json
{
  "name": "read_project_file",
  "arguments": {
    "path": "acme_sales_extension/__manifest__.py"
  }
}
```

**Pourquoi ces arguments** :
- `path` direct vers le manifest : structure conventionnelle d'un module Odoo (`<module>/__manifest__.py`).
- Pas de `start_line`/`end_line` : un manifest fait typiquement 30-50 lignes, on lit tout.

**Résultat retourné** :
```json
{ "ok": true,
  "path": "acme_sales_extension/__manifest__.py",
  "start_line": 1, "end_line": 35, "total_lines": 35,
  "content": "{\n    'name': 'Acme — Sales Extension',\n    'version': '17.0.0.1.3',\n    'author': 'Acme Studio',\n    'license': 'OEEL-1',\n    'depends': ['sale_management', 'crm', 'account', 'acme_pricing_engine'],\n    'data': [\n        'security/ir.model.access.csv',\n        'views/sale_order_views.xml',\n        'views/res_partner_views.xml',\n        'data/server_actions.xml',\n    ],\n    'installable': True,\n    'application': False,\n}\n"
}
```

**Interprétation côté assistant** :
> Manifest de `acme_sales_extension` (v17.0.0.1.3) :
>
> **Dépendances** : `sale_management`, `crm`, `account`, `acme_pricing_engine`.
>
> Trois standards Odoo + un module custom interne (`acme_pricing_engine`). L'ordre indique que ce module s'enrichit sur la chaîne sale + crm + account, et nécessite que la grille tarifaire (`acme_pricing_engine`) soit installée avant lui.
>
> **Fichiers de données** : 4 fichiers — ACL (sécurité), 2 vues, et des server actions. Cohérent avec un module qui personnalise des écrans existants + ajoute de la logique métier.
>
> **License OEEL-1** = Odoo Enterprise license. Le module n'est donc pas redistribuable hors contexte Odoo Enterprise — vérifier que le client est bien sous licence Enterprise.

**Pièges à éviter** :
- Si le fichier n'existe pas (mauvais nom de module, dépôt non cloné), le tool retourne une erreur `Fichier introuvable`. Vérifier la liste avec `list_project_modules`.
- Lire un fichier > 200 lignes en un appel : impossible (cap dur). Découper en plusieurs appels (start_line glissant).
- Le `path` est relatif à la racine du **repo client** (`~/.odoo-consultant/repos/<profile>/<env>/`). Pas de préfixe `community/` ni `enterprise/` ici (c'est pour `read_odoo_file`).
- Pour lire le code Odoo standard (pas custom client), utiliser `read_odoo_file`. Erreur courante : confondre les deux.
