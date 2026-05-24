# Use case — diagnostic depuis capture d'écran

**Prompt utilisateur** : « J'ai cette erreur quand je valide la facture, regarde la capture. »

## Workflow

### Étape 1 — vision native (pas de tool)

Sur Claude ou Gemini, la capture d'écran est lue directement par le modèle dans son canal multimodal. **Aucun tool nécessaire**. Sur GitHub/Copilot, l'image est aussi envoyée nativement (les images marchent partout, contrairement aux PDFs).

L'assistant analyse l'image :
- Identifie le **type d'écran** (form view facture, message d'erreur, log Python, traceback).
- Repère le **message d'erreur** complet (souvent en rouge ou dans une modale).
- Note le **contexte visible** : modèle, champs en cours de saisie, état actuel du record.

### Étape 2 — formuler le diagnostic

Exemple : la capture montre un traceback Odoo dans une modale rouge :
```
ValidationError: Vous devez configurer un compte de TVA pour le taux "TVA 20%".
```

L'assistant doit relier l'erreur à une cause probable et proposer une investigation ciblée :

> Je vois sur ta capture une **`ValidationError`** au moment de la validation de facture :
> > « Vous devez configurer un compte de TVA pour le taux "TVA 20%". »
>
> Cause probable : la `account.tax` "TVA 20%" n'a pas de compte (`invoice_repartition_line_ids` ou `repartition_line_ids` selon la version) configuré pour la part HT/TVA.
>
> Je vérifie en live :

### Étape 3 — enchaîner avec un tool de vérification

```json
{
  "name": "query_odoo",
  "arguments": {
    "model": "account.tax",
    "domain": [["name", "ilike", "TVA 20"]],
    "fields": ["id", "name", "amount", "type_tax_use", "invoice_repartition_line_ids"],
    "limit": 3
  }
}
```

Puis pour chaque taxe trouvée :
```json
{
  "name": "query_odoo",
  "arguments": {
    "model": "account.tax.repartition.line",
    "domain": [["tax_id", "=", <id>]],
    "fields": ["repartition_type", "account_id", "factor_percent"]
  }
}
```

### Étape 4 — synthèse + correctif suggéré

> ✓ Diagnostic confirmé : la taxe "TVA 20%" (id 47) a des lignes de répartition (`account.tax.repartition.line`) sans `account_id` pour le type `tax` (la part TVA).
>
> **Correctif** :
> 1. Comptabilité → Configuration → Taxes → "TVA 20%"
> 2. Onglet « Définition », pour chaque ligne avec « Pourcentage de la base/de la taxe » = 100% (type `tax`), renseigner le compte de TVA collectée (typiquement `44571` en plan comptable FR).
> 3. Re-tenter la validation de la facture.
>
> Si tu veux, je peux vérifier que le compte 44571 existe bien dans ton plan comptable :
> ```json
> { "name": "query_odoo", "arguments": { "model": "account.account", "domain": [["code","=","44571"]] } }
> ```

## Autres patterns de captures fréquentes

### Capture d'une vue cassée (champs invisibles, layout bizarre)

→ Enchaîner avec `inspect_odoo_view` sur le modèle visible pour vérifier l'arch après héritage.

### Capture du Studio (config de champ custom)

→ Enchaîner avec `inspect_studio` pour comparer config visible vs vérité serveur.

### Capture de log Python multi-ligne

→ Identifier le fichier:ligne du dernier `File ".../addons/xxx/yyy.py", line N` → `read_odoo_file` ou `read_project_file` pour montrer le code.

### Capture d'un menu / barre de navigation

→ Si la question est « où je clique pour X » : `inspect_menus_actions(model=...)`.

## Anti-patterns

- ❌ Décrire l'image en détail mais ne pas répondre à la question. La capture est un moyen, pas une fin.
- ❌ Inventer un message d'erreur que tu n'as pas vu (relire la capture, citer exactement ce qui est écrit).
- ❌ Ne pas enchaîner avec un tool de vérification quand le diagnostic est testable (toujours croiser avec la vérité serveur via `query_odoo` / `inspect_*`).
- ❌ Sur GitHub/Copilot avec une capture en PJ : ne PAS dire « je ne peux pas voir les images » — les images marchent sur tous les providers.
