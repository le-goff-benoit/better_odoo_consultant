# Patterns d'agrégation Odoo — `read_group`

Référence chargée à la demande quand le prompt évoque KPI, chiffre d'affaires, agrégation, ou comparaison temporelle.

## Syntaxe de base

```python
read_group(
    model="sale.order",
    domain=[["state", "in", ["sale", "done"]]],
    fields=["amount_total:sum", "user_id"],   # ":sum" obligatoire pour l'agrégation
    groupby=["user_id", "date_order:month"],   # ordre = ordre des niveaux
    orderby="amount_total desc",
    lazy=False,                                # True = niveau 1 seul, à éviter pour multi-niveaux
)
```

## Agrégateurs disponibles

| Suffixe | Effet | Type compatible |
|---|---|---|
| `:sum` | Somme | numeric |
| `:avg` | Moyenne | numeric |
| `:min` / `:max` | Min/max | numeric, date, datetime |
| `:count` (sur l'`id` typiquement) | Nombre d'enregistrements | tout |
| `:count_distinct` | Comptage distinct | tout |

Pas de suffixe = `:sum` par défaut sur numeric, sinon retourne juste la valeur de la 1ère ligne du bucket (= souvent inutile).

## Groupements temporels

Champ `date` ou `datetime` + suffixe :
- `:day` → 2026-05-24
- `:week` → W21 2026
- `:month` → May 2026  *(le plus courant)*
- `:quarter` → Q2 2026
- `:year` → 2026

**Important** : le bucket retourné est une string formatée, pas une date. Pour ordonner correctement, ajouter `orderby="date_order asc"`.

## Pièges courants

### 1. Timezone

Les champs `datetime` (ex. `date_order`) sont stockés en **UTC**. Pour un client en `Europe/Paris`, une commande passée le 1er janvier 00:30 UTC apparaît dans le bucket de décembre.

Workaround : passer un `context` avec `tz` :
```python
{"context": {"tz": "Europe/Paris"}}
```
(non supporté par notre tool actuellement → réponse à donner avec cette nuance).

### 2. Devises mixtes

`amount_total` est dans la devise de la commande. Pour un total fiable en devise société, utiliser :
- `amount_total_signed` (`account.move`) — déjà converti en devise société
- `amount_company_currency` (`sale.order` selon les versions) — idem

### 3. `lazy=True` masque des buckets

Avec `lazy=True` (défaut Odoo) et 2 niveaux de `groupby`, le résultat n'expose que le 1er niveau. Pour avoir tous les buckets cartésiens, passer `lazy=False`.

### 4. Filtre invisible

Si l'utilisateur connecté a une record rule restrictive, le résultat est partiel. À mentionner systématiquement.

### 5. Multi-société

Sur une instance multi-company, `read_group` respecte `allowed_company_ids`. Pour un global, switcher via le sélecteur de company en haut de l'app ou utiliser `sudo()` côté backend (pas possible via XML-RPC).

## Comparaisons temporelles

### N vs N-1 sur le mois courant

Faire **deux appels** read_group, un par période, puis comparer côté assistant :
```python
# Appel 1 : mois en cours
domain=[["date_order", ">=", "2026-05-01"], ["date_order", "<", "2026-06-01"]]
# Appel 2 : même mois année dernière
domain=[["date_order", ">=", "2025-05-01"], ["date_order", "<", "2025-06-01"]]
```

### Évolution sur 12 mois glissants

Un seul appel avec `groupby=["date_order:month"]` + domain `>= today - 12 mois`. Tri par date ASC pour produire un graphique cohérent.

## Pivots avancés

Pour un croisé dynamique (ex. CA par commercial × mois), `groupby=["user_id", "date_order:month"]` avec `lazy=False`. Le résultat est plat (liste de buckets) — reconstruire le tableau à 2D côté assistant.

## Performance

Sur les modèles volumineux (`account.move`, `stock.move`), un `read_group` sans `limit` peut être lent. Bonnes pratiques :
- Filtrer par date d'abord (`date >= today - N`)
- Restreindre les champs aux mesures nécessaires
- Utiliser `limit=12` si on veut « les 12 derniers buckets »

## Quand préférer un autre tool

- Besoin d'enregistrements individuels (pas d'agrégat) → `query_odoo`
- Juste un nombre total → `count_odoo` (plus simple, plus rapide)
- Champ inconnu → `get_odoo_fields` d'abord
