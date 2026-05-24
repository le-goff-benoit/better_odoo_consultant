# Usage canonique — count_odoo

**Prompt utilisateur** : « Combien de factures clients sont en brouillon ? »

**Tool call attendu** :
```json
{
  "name": "count_odoo",
  "arguments": {
    "model": "account.move",
    "domain": [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"]
    ]
  }
}
```

**Pourquoi ces arguments** :
- `move_type="out_invoice"` : « factures clients » → factures émises, pas reçues (`in_invoice`) ni avoirs (`out_refund`).
- `state="draft"` : « en brouillon » a une valeur Odoo précise (`draft`), à ne pas confondre avec `posted` ou `cancel`.
- Pas de `limit` : `count_odoo` retourne juste un entier, ça ne coûte rien d'avoir le vrai total.

**Résultat retourné** :
```json
{ "ok": true, "count": 47 }
```

**Interprétation côté assistant** :
> Il y a actuellement **47 factures clients en brouillon** sur l'instance.
> Si tu veux les voir une par une, je peux les lister avec `query_odoo` (préciser combien tu veux récupérer).

**Pièges à éviter** :
- Ne **pas** compter en appelant `query_odoo` puis en mesurant la taille du résultat — `query_odoo` peut être borné par `max_records` ou limité explicitement.
- Le compteur respecte les droits du user connecté : si tu vois `47` et l'utilisateur en attend `200`, il a peut-être un filtre multi-société qui restreint. Le signaler.
- `state="open"` n'existe plus en Odoo 13+ pour `account.move` — c'est `state="posted"`. Vérifier la version cible.
