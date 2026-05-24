# Usage canonique — read_target_file

**Prompt utilisateur** : « Montre-moi le nouveau code de `action_post` en Odoo 17 pour comparer avec notre 15. »

**Tool call attendu** :
```json
{
  "name": "read_target_file",
  "arguments": {
    "path": "community/addons/account/models/account_move.py",
    "start_line": 1700,
    "end_line": 1780
  }
}
```

**Pourquoi ces arguments** :
- `path` commence par `community/` (préfixe standard pour les sources Odoo). Même convention que `read_odoo_file`.
- `start_line=1700` : la position est obtenue d'abord via `search_target_source` qui a remonté `def action_post` à la ligne 1735.
- `end_line=1780` : 80 lignes pour absorber la méthode + le décorateur + 1-2 helpers.

**Résultat retourné** :
```json
{ "ok": true,
  "path": "community/addons/account/models/account_move.py",
  "start_line": 1700, "end_line": 1780, "total_lines": 3892,
  "content": "    def action_post(self):\n        \"\"\"Post the journal entries.\"\"\"\n        validation_msgs = self._post_validate()\n        ...\n        for move in self.filtered(lambda m: m.state == 'draft'):\n            move.write({'state': 'posted'})\n            move._post()\n        return True\n"
}
```

**Interprétation côté assistant** :
> Voici `action_post` en Odoo 17 (`community/addons/account/models/account_move.py:1735`) :
>
> ```python
> def action_post(self):
>     """Post the journal entries."""
>     validation_msgs = self._post_validate()
>     ...
>     for move in self.filtered(lambda m: m.state == 'draft'):
>         move.write({'state': 'posted'})
>         move._post()
>     return True
> ```
>
> Différences notables vs Odoo 15 :
> 1. Pas de transition `proforma` ni `paid` — l'état `paid` est calculé via `payment_state` séparé.
> 2. Le hook business est dans `_post()` (méthode protégée) — c'est là que les écritures comptables sont effectivement créées. À overrider plutôt que `action_post` si tu veux ajouter de la logique post-validation.
> 3. Le `_post_validate()` regroupe toutes les validations (devise, équilibre débit/crédit, séquence). En 15, c'était éparpillé.
>
> Pour ton code custom 15 qui override `action_post`, vérifier qu'il :
> - appelle bien `super().action_post()`
> - ne touche pas à `state='paid'` (qui n'existe plus en tant qu'état de move).

**Pièges à éviter** :
- Le fichier est dans les sources de la **version cible**, configurée au démarrage de la conversation migration. Si pas configurée, le tool retourne « Sources de la version cible non disponibles ».
- Les chemins sont absolus depuis la racine des sources cible — préfixe `community/` ou `enterprise/`.
- Pour comparer ligne à ligne version source vs cible : faire deux appels (`read_odoo_file` pour source courante, `read_target_file` pour cible) puis comparer côté assistant.
- Les méthodes Odoo grossissent souvent (refactor + abstractions) : pour une comparaison utile, prendre une fenêtre généreuse (50-100 lignes).
