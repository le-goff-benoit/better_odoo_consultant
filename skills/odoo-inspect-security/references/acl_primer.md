# Sécurité Odoo — primer ACL / record rules / groupes

> Référence chargée à la demande quand l'utilisateur diagnostique un problème
> d'accès, audite la sécurité ou conçoit un nouveau modèle. Pas injecté en permanence.

## Les trois couches

1. **ACL (`ir.model.access`)** — droits sur un modèle entier, par groupe. Réponse : "ce groupe peut-il lire / créer / modifier / supprimer ce modèle ?"
2. **Record rules (`ir.rule`)** — filtre dynamique sur les enregistrements visibles. Réponse : "parmi les enregistrements du modèle, lesquels peuvent être lus/écrits ?" Exprimé en **domain**.
3. **Groupes (`res.groups`)** — qui appartient à quoi. Hiérarchie via `implied_ids` (être Manager implique être User).

Ordre d'évaluation : un user doit passer l'ACL **et** toutes les record rules de tous ses groupes (ET implicite).

## Pièges classiques

- **`perm_*` à `False`** dans une ACL = bloqué, mais une ACL plus permissive d'un autre groupe peut compenser (OR sur les groupes).
- **Record rule sans `groups`** = applique à tout le monde, **y compris** les admins. Cause typique de "je ne vois plus rien en admin".
- **`global=True`** sur une record rule = ignore les groupes et s'applique au monde. Très puissant, à manier avec précaution.
- **Mode `Read` uniquement** : une rule `perm_read=True, perm_write=False` filtre les lectures mais pas les écritures — incohérence fréquente.
- **`sudo()` court-circuite tout** : un compute ou un cron en sudo voit tout. Sécurité = ce qui se passe **hors** sudo.

## Diagnostic d'un "accès refusé"

1. Reproduire avec le user concerné, noter le modèle + l'action.
2. Inspecter les groupes du user (`res.users.groups_id`).
3. Pour chaque groupe : ACL du modèle ?
4. Pour chaque groupe : record rules sur le modèle ? quels domains ?
5. Vérifier les **inherited rules** (héritage via `implied_ids`).

## Diagnostic d'un "accès trop large"

1. Lister les record rules **sans groupes** sur le modèle — elles s'appliquent à tous.
2. Lister les ACL avec `perm_read=True` sur des groupes basiques (`base.group_user` notamment).
3. Vérifier si des modules custom ont surchargé les rules sans la décorer `replace="0"` (écrasement silencieux).

## Champs sensibles

- `password`, `api_key`, `token` : surveillance des ACL en lecture.
- `salary`, `cost` : champs HR/comptables typiquement réservés à des groupes spécifiques.

## Commandes utiles

- `odoo_inspect_security(model="sale.order")` côté skill — résume les 3 couches.
- En console Odoo : `env["sale.order"].with_user(user).check_access_rights("read", raise_exception=False)`.
