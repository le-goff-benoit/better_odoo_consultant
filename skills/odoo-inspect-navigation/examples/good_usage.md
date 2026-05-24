# Usage canonique — odoo_inspect_navigation

**Prompt utilisateur** : « Où je clique pour voir les bons de commande fournisseur ? »

**Tool call attendu** :
```json
{
  "name": "odoo_inspect_navigation",
  "arguments": { "model": "purchase.order" }
}
```

**Pourquoi ces arguments** :
- `model="purchase.order"` : on cherche par modèle, pas par texte libre. C'est plus fiable qu'un `query="bon de commande"` qui peut matcher plein d'autres écrans.
- Pas de `query` : laisser le tool retourner toutes les actions liées au modèle, on triera dans l'interprétation.

**Résultat retourné** :
```json
{ "ok": true, "model": "purchase.order",
  "actions": [
    { "id": 312, "name": "Purchase Orders", "res_model": "purchase.order",
      "view_mode": "list,form,kanban,calendar,pivot,graph",
      "domain": "[('state','in',('purchase','done'))]", "target": "current" },
    { "id": 313, "name": "Requests for Quotation", "res_model": "purchase.order",
      "view_mode": "list,form,kanban", "domain": "[('state','in',('draft','sent','to approve'))]" },
    { "id": 314, "name": "My Purchase Orders", "res_model": "purchase.order",
      "view_mode": "list,form", "domain": "[('user_id','=',uid)]" }
  ],
  "menus": [
    { "id": 248, "name": "Purchase Orders",
      "complete_name": "Purchase / Orders / Purchase Orders",
      "action": "ir.actions.act_window,312" },
    { "id": 249, "name": "Requests for Quotation",
      "complete_name": "Purchase / Orders / Requests for Quotation",
      "action": "ir.actions.act_window,313" }
  ]}
```

**Interprétation côté assistant** :
> Tu as deux chemins selon ce que tu cherches :
> - **Bons de commande confirmés** : `Purchase → Orders → Purchase Orders` (filtré sur `state ∈ {purchase, done}`)
> - **Demandes de prix (RFQ)** : `Purchase → Orders → Requests for Quotation` (filtré sur les états brouillon/envoyé/à approuver)
>
> L'action « My Purchase Orders » existe mais n'est pas exposée dans un menu — utilisable seulement si quelqu'un l'a accrochée à un raccourci personnel.

**Pièges à éviter** :
- L'action peut avoir un `domain` qui filtre — c'est ce qui distingue « Purchase Orders » de « Requests for Quotation » alors qu'ils pointent sur le **même modèle**. Toujours afficher le domain dans la réponse.
- `menus` peut être vide alors que des `actions` existent : ça arrive quand un module expose une action sans menu (accessible via Studio, raccourci, etc.).
- Le `complete_name` du menu (`Purchase / Orders / ...`) suit la hiérarchie complète. Pour pointer l'utilisateur vers le bon clic, c'est la meilleure chaîne.
- `target="new"` = popup, `target="current"` = remplace la vue courante, `target="main"` = nouvel onglet logique.
