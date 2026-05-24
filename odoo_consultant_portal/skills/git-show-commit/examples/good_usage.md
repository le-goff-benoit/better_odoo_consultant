# Usage canonique — git_show_commit

**Prompt utilisateur** : « Qu'est-ce qu'a apporté le commit `a3f8b2c1` dans le module sale ? »

**Tool call attendu** :
```json
{
  "name": "git_show_commit",
  "arguments": {
    "sha": "a3f8b2c1",
    "scope": "odoo",
    "max_lines": 400
  }
}
```

**Pourquoi ces arguments** :
- `sha="a3f8b2c1"` : SHA court (8 caractères), suffisant pour résoudre. Le tool accepte 7-40 hex.
- `scope="odoo"` : on cherche dans le repo Odoo Community courant. Variantes :
  - `enterprise` : sources Odoo Enterprise
  - `target` : sources de la version cible (en mode migration)
  - `project` : repo custom du client
- `max_lines=400` (défaut) : raisonnable pour la plupart des commits. Augmenter à 1000-2000 pour des refactors massifs.

**Résultat retourné** (extrait) :
```json
{ "ok": true,
  "sha": "a3f8b2c1d4e5f67890abcdef1234567890abcdef",
  "short_sha": "a3f8b2c1",
  "author": "Sebastien Beau",
  "email": "sebastien.beau@example.com",
  "date": "2025-12-14T10:42:00+00:00",
  "subject": "[IMP] sale: precise tax computation when amount_total is fixed",
  "message": "When a sale.order has a fixed amount_total override...",
  "stats": { "files": 3, "insertions": 47, "deletions": 12 },
  "files": [
    { "path": "addons/sale/models/sale_order.py", "additions": 38, "deletions": 9 },
    { "path": "addons/sale/tests/test_sale_order.py", "additions": 9, "deletions": 3 }
  ],
  "diff": "diff --git a/addons/sale/models/sale_order.py b/addons/sale/models/sale_order.py\n..." }
```

**Interprétation côté assistant** :
> Commit `a3f8b2c1` par Sebastien Beau (14/12/2025) — tag `[IMP]` (amélioration) :
>
> > « [IMP] sale: precise tax computation when amount_total is fixed »
>
> **Stats** : 3 fichiers touchés (+47 / −12 lignes), essentiellement dans `sale_order.py` (+38 / −9) et son test associé.
>
> **Contenu** : améliore le calcul de TVA quand un utilisateur force `amount_total` (montant final imposé) — les anciennes versions arrondissaient mal, créant des écarts de 1-2 centimes. Le fix recalcule `amount_tax` en proportion stricte de `amount_untaxed`.
>
> **Impact sur ton projet** : si tu utilises `amount_total` en écriture (rare) ou si tu as un cas d'usage de remise globale au pied de devis, vérifier que les nouveaux totaux correspondent à ce que ton client attendait.

**Pièges à éviter** :
- Si le SHA est inconnu (clone shallow), le tool fait jusqu'à 3 deepens automatiques. Si toujours introuvable, message clair : SHA peut-être trop ancien ou sur une branche détachée.
- `scope="project"` ne fonctionne que sur une conversation Assistant avec un projet actif ayant un repo cloné.
- Tags Odoo conventionnels (à reconnaître dans le subject) : `[FIX]` bug, `[IMP]` amélioration, `[ADD]` nouvelle feature, `[REM]` suppression, `[REF]` refactor, `[MOV]` déplacement, `[REV]` revert. Voir `odoo_commit_conventions.md` pour le détail.
- Pour un commit énorme (refactor cross-modules), `max_lines=400` peut tronquer — relancer avec un `max_lines=1500` ou demander le diff d'un fichier précis (pas supporté nativement, mais on peut lire le fichier à l'état pré/post commit avec `read_odoo_file`).
