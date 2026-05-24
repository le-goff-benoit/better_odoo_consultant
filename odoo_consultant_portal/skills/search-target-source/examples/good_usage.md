# Usage canonique — search_target_source

**Prompt utilisateur** : « En migration 16 → 17, est-ce que `action_invoice_open` existe toujours ? »

**Tool call attendu** :
```json
{
  "name": "search_target_source",
  "arguments": {
    "pattern": "def action_invoice_open",
    "path": "addons/account",
    "file_types": ["*.py"],
    "case_sensitive": true
  }
}
```

**Pourquoi ces arguments** :
- `pattern="def action_invoice_open"` : on cherche la définition exacte. Si la méthode n'existe plus, zéro résultat — réponse claire.
- `path="addons/account"` : restreint au module comptabilité, là où la méthode devrait vivre. Évite les hits dans des modules tiers.
- L'outil cherche dans les sources de la **version cible** (Odoo 17 dans cet exemple) configurées au démarrage de la conversation migration.

**Résultat retourné** :
```json
{ "ok": true, "matches": 0, "files": {},
  "note": "Aucune correspondance.",
  "suggestions": [
    "Retentez avec `case_sensitive=false` (recherche insensible à la casse)."
  ]}
```

**Interprétation côté assistant** :
> `action_invoice_open` **n'existe plus dans Odoo 17** (aucun match dans `addons/account`).
>
> Cette méthode a été supprimée dans la refonte du module comptabilité (Odoo 13/14). L'équivalent moderne est `action_post()` sur `account.move` :
>
> ```python
> # Avant (Odoo ≤ 12)
> invoice.action_invoice_open()
> # Après (Odoo 13+)
> move.action_post()
> ```
>
> Si ton code custom appelle encore `action_invoice_open`, c'est un point bloquant pour la migration 16 → 17. Je peux chercher les call sites dans le repo client avec `search_project_source` pour évaluer le scope du changement.

**Pièges à éviter** :
- Toujours s'assurer que la version cible est bien configurée dans la conversation migration (page Assistant → mode migration → sélectionner version cible). Sinon, le tool tourne dans le vide.
- Une méthode peut avoir été **renommée** : si zéro match sur le nom exact, chercher en `case_sensitive=false` ou avec un fragment (ex. `invoice_open` → matche aussi `action_invoice_open_old`).
- L'absence d'une méthode dans le source cible ne signifie pas qu'elle est inutilisable côté API : elle peut être en `@api.model` dans un module non installé par défaut.
- Pour le détail des breaking changes par version, croiser avec `inspect_installed_modules` (modules actuellement utilisés) + notes de version Odoo (`odoo-17.0.md` chargé via le skill `release_notes_injector`).
