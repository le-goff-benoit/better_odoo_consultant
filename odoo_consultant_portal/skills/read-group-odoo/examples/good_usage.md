# Usage canonique — read_group_odoo

**Prompt utilisateur** : « Chiffre d'affaires confirmé par mois sur les 12 derniers mois. »

**Tool call attendu** :
```json
{
  "name": "read_group_odoo",
  "arguments": {
    "model": "sale.order",
    "domain": [["state", "in", ["sale", "done"]],
               ["date_order", ">=", "2025-05-01"]],
    "fields": ["amount_total:sum", "date_order"],
    "groupby": ["date_order:month"],
    "orderby": "date_order asc",
    "lazy": false
  }
}
```

**Pourquoi ces arguments** :
- `state in ["sale", "done"]` : « confirmé » = commandes acceptées, qu'elles soient livrées (`done`) ou en cours (`sale`).
- `fields: ["amount_total:sum"]` : la syntaxe `:sum` agrège ; sans suffixe, Odoo retourne juste la 1ère ligne du bucket.
- `groupby: ["date_order:month"]` : groupement temporel mensuel. Variantes : `:day`, `:week`, `:quarter`, `:year`.
- `lazy=false` : retourne tous les buckets immédiatement. `lazy=true` (défaut) limite au 1er niveau de groupement — pénible quand on en a un seul.
- Pas de `limit` : 12 mois × 1 ligne = 12 résultats, on tient sans limite.

**Résultat retourné** :
```json
{ "ok": true, "count": 12, "groups": [
  { "date_order:month": "May 2025", "__count": 38, "amount_total": 124850.30,
    "__domain": [...] },
  { "date_order:month": "June 2025", "__count": 41, "amount_total": 138920.00 },
  ...
]}
```

**Interprétation côté assistant** :
> Voici le CA mensuel confirmé (`state ∈ {sale, done}`) sur 12 mois :
> | Mois | Commandes | CA (€) |
> |---|---|---|
> | Mai 2025 | 38 | 124 850 |
> | Juin 2025 | 41 | 138 920 |
> | ... |
>
> Total cumulé : 1 543 280 €. Pic en mars 2026 (172 k€), creux en août 2025 (89 k€ — saisonnalité).

**Pièges à éviter** :
- **Timezone** : `date_order` est stocké en UTC. Pour un client en `Europe/Paris`, les commandes du 1er janvier 00:30 UTC apparaissent en décembre. Préciser dans la réponse si l'utilisateur ouvre des questions de calendrier comptable.
- **Devises** : `amount_total` est en devise de la commande, pas en devise société. Pour un total cumulé fiable, filtrer sur `currency_id` ou utiliser `amount_total_signed` (= devise société).
- Ne pas oublier `:sum` sur le champ de mesure — sans, le résultat retourne `False` et l'IA improvise.
