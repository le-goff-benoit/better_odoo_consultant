# Usage canonique — odoo_inspect_view

**Prompt utilisateur** : « Montre-moi l'arch complète de la vue form des commandes de vente après tous les héritages. »

**Tool call attendu** :
```json
{
  "name": "odoo_inspect_view",
  "arguments": {
    "model": "sale.order",
    "view_type": "form"
  }
}
```

**Pourquoi ces arguments** :
- `model="sale.order"` + `view_type="form"` : Odoo résout la vue principale du modèle pour ce type. Pas besoin de connaître le `view_id` exact.
- Pas de `view_id` : on veut la vue **par défaut** (la plus prioritaire). Pour une vue précise, passer son `id` ou son `xml_id`.

**Résultat retourné** (structure) :
```json
{ "ok": true,
  "view": { "id": 547, "xml_id": "sale.view_order_form", "name": "sale.order.form",
            "type": "form", "model": "sale.order", "mode": "primary" },
  "inheritance_chain": [
    { "xml_id": "sale.view_order_form", "module": "sale", "priority": 16 },
    { "xml_id": "sale_stock.view_order_form_inherit_sale_stock",
      "module": "sale_stock", "priority": 16, "inherit_id": 547 },
    { "xml_id": "studio_customization.odoo_studio_sale_order_xxx",
      "module": "studio_customization", "priority": 100,
      "modifies": ["field[@name='partner_id']", "notebook/page[@string='Order Lines']"] }
  ],
  "arch": "<form>...</form>",
  "summary": {
    "fields_count": 47,
    "tabs": ["Order Lines", "Other Info", "Customer Signature", "Notes"],
    "buttons": ["Confirm", "Send by Email", ...]
  }}
```

**Interprétation côté assistant** :
> La vue form de `sale.order` est `sale.view_order_form` (xml_id : `sale.view_order_form`), assemblée à partir de **3 héritages** :
> 1. **sale** (base) : la vue d'origine, 47 champs, 4 onglets.
> 2. **sale_stock** : ajoute l'onglet livraison et le statut de transfert (priority 16, même que base — appliqué après).
> 3. **studio_customization** : ajoute un champ après `partner_id` et modifie l'onglet « Order Lines » (priority 100, appliqué en dernier).
>
> Les boutons en tête : `Confirm`, `Send by Email`, `Send PRO-FORMA Invoice` (+ d'autres).
>
> Si tu modifies la vue, fais-le via un module héritant `sale.view_order_form` avec un `priority` ≥ 100 pour passer après Studio. Voir `view_inheritance_primer.md` pour les règles.

**Pièges à éviter** :
- L'arch retournée est **après** héritage complet — c'est ce que voit l'utilisateur. Pour comprendre une modification précise, regarder la `modifies` liste de chaque héritage.
- `mode="primary"` = vue racine d'un type. `mode="extension"` = hérite et patche.
- L'ordre d'application = `priority` croissant. Les valeurs identiques sont appliquées dans l'ordre alphabétique du `xml_id` (instable d'une version Odoo à l'autre).
- Studio écrit avec `priority=100` par défaut → passe après la plupart des extensions modules (priority 10-30). Pour qu'un module custom passe APRÈS Studio, mettre `priority=200+`.
