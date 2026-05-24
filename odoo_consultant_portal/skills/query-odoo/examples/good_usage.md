# Usage canonique — query_odoo

**Prompt utilisateur** : « Donne-moi les 5 dernières commandes confirmées du client Acme SA. »

**Tool call attendu** :
```json
{
  "name": "query_odoo",
  "arguments": {
    "model": "sale.order",
    "domain": [["state", "=", "sale"], ["partner_id.name", "ilike", "Acme SA"]],
    "fields": ["name", "date_order", "amount_total", "user_id"],
    "limit": 5,
    "order": "date_order desc"
  }
}
```

**Pourquoi ces arguments** :
- `state="sale"` (et non `done`) : « confirmées » en Odoo 17+ = état `sale`. `done` = clôturées.
- `partner_id.name ilike "Acme SA"` : tolère l'orthographe et la casse. Si on connaît l'ID exact, préférer `partner_id = <id>`.
- `fields` limité à 4 : on évite de récupérer 50 colonnes inutiles. Ajouter au besoin sur un second appel.
- `order="date_order desc"` : « dernières » implique tri descendant.
- `limit=5` : exactement ce que l'utilisateur demande, pas plus.

**Résultat retourné** :
```json
{ "ok": true, "count": 5, "total_count": 18, "offset": 0, "truncated": true,
  "warning": "Résultat partiel : 5 enregistrements récupérés sur 18 visibles car limit=5.",
  "records": [
    { "id": 1247, "name": "S00347", "date_order": "2026-05-20 14:32:08",
      "amount_total": 14820.50, "user_id": [42, "Marie Dupont"] }, ...
  ]}
```

**Interprétation côté assistant** :
> Voici les 5 dernières commandes confirmées d'Acme SA : S00347 (20/05, 14 820,50 € — Marie Dupont), [...]. Total cumulé sur ces 5 commandes : 67 412 €.
> Note : recherche par `ilike` sur le nom — si Acme SA a plusieurs entités liées (filiales), elles sont incluses. Précise un ID si tu veux la maison-mère seule.
> Comme `limit=5`, ce n'est pas le total global des commandes Acme.

## Exemple exhaustif borné — lignes de commande

**Prompt utilisateur** : « Analyse toutes les lignes de la commande S00347. »

**Tool call attendu** :
```json
{
  "name": "query_odoo",
  "arguments": {
    "model": "sale.order.line",
    "domain": [["order_id.name", "=", "S00347"]],
    "fields": ["id", "display_name", "product_id", "product_uom_qty", "price_subtotal"],
    "limit": 0,
    "max_records": 5000
  }
}
```

**Interprétation** :
- Si `count == total_count` et `truncated=false`, l'analyse porte sur toutes les lignes visibles.
- Si `truncated=true`, annoncer le plafond avant toute conclusion.

**Pièges à éviter** :
- Ne jamais déduire un total global depuis un résultat `truncated=true` ou avec `limit>0` — utiliser `count_odoo` ou `read_group_odoo` pour les chiffres exhaustifs.
- Ne pas demander `fields=[]` (= tous les champs) sur un modèle volumineux : tokens gâchés.
- Ne pas confondre `state="sale"` (Odoo 17+) et l'ancien `state="manual"` ou `state="progress"` (Odoo ≤ 12).
