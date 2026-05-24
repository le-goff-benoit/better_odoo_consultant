# Usage canonique — odoo_inspect_fields

**Prompt utilisateur** : « Quels champs custom (Studio) a-t-on sur les factures ? »

**Tool call attendu** :
```json
{
  "name": "odoo_inspect_fields",
  "arguments": { "model": "account.move" }
}
```

**Pourquoi ces arguments** :
- Pas de `field_names` : on veut l'index condensé. L'index priorise automatiquement les champs `x_*` (Studio) et les relationnels en tête de liste — exactement ce qu'on cherche.
- Ne pas spécifier `field_names=["x_studio_xxx"]` avant d'avoir l'index : on ne connaît pas encore les noms exacts.

**Résultat retourné** :
```json
{ "ok": true, "model": "account.move",
  "total_fields": 184,
  "fields": {
    "x_studio_commission_amount": { "label": "Commission", "type": "monetary" },
    "x_studio_origine_lead": { "label": "Origine Lead", "type": "many2one", "relation": "crm.lead" },
    "x_studio_signature_date": { "label": "Date signature", "type": "date" },
    "partner_id": { "label": "Client", "type": "many2one", "relation": "res.partner" },
    ...
  },
  "note": "Index condensé (max 150, custom + relations en tête)..."
}
```

**Interprétation côté assistant** :
> Trois champs Studio sur les factures (`account.move`) :
> - `x_studio_commission_amount` (monetary) — montant de commission
> - `x_studio_origine_lead` (many2one → `crm.lead`) — lien vers le lead d'origine
> - `x_studio_signature_date` (date) — date de signature
>
> Le modèle compte 184 champs au total. Pour un détail complet d'un champ précis (help, required, stored, compute), rappelle-moi avec `field_names=["x_studio_commission_amount"]`.

**Pièges à éviter** :
- Ne pas confondre champ Studio (`x_studio_*`, créé via l'UI Studio) avec champ custom code (`x_*` simple sans `_studio_`, créé par un dev).
- Si l'utilisateur demande « tous les champs » sur un gros modèle (300+ champs), faire deux passes : index condensé d'abord, puis `field_names=[...]` ciblé.
- Le `relation` (modèle lié) n'apparaît que pour `many2one`/`one2many`/`many2many`. Pour un `selection`, il faut un appel supplémentaire à `selection` keys.
