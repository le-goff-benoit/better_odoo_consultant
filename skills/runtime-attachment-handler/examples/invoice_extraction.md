# Use case — extraction de facture fournisseur

**Prompt utilisateur** : « J'ai uploadé la facture du loueur de bureaux (octobre). Crée le brouillon de vendor bill dans Odoo. »

## Workflow attendu

### Étape 1 — extraire le contenu

```json
{ "name": "extract_pdf_text", "arguments": { "attachment_name": "loyer-bureaux-oct.pdf" } }
```

### Étape 2 — parser les champs clés (côté assistant, pas un tool)

L'assistant lit la sortie de `extract_pdf_text` et identifie :
- **Numéro de facture** (regex `F\d+`, `INV-\d+`, etc.)
- **Date** (formats FR/EN reconnus)
- **Fournisseur** (en-tête de la facture)
- **Montant HT, TVA, TTC** (parse des chiffres avec normalisation séparateur décimal)
- **Compte analytique éventuel** (si mentionné — sinon laisser vide)

### Étape 3 — confirmer le fournisseur dans Odoo

```json
{
  "name": "odoo_query_records",
  "arguments": {
    "model": "res.partner",
    "domain": [["name", "ilike", "Foncia"], ["supplier_rank", ">", 0]],
    "fields": ["id", "name", "vat", "property_account_payable_id"],
    "limit": 5
  }
}
```

Si plusieurs matches : présenter la liste à l'utilisateur, lui demander de choisir.
Si aucun match : proposer la création (mais ce skill ne le fait pas — demander à l'utilisateur ou utiliser le Creator).

### Étape 4 — proposer le draft sans le créer

L'assistant **n'a pas la permission `odoo: write`** sur ce skill. Donc :

> Voici le brouillon de vendor bill que je propose, à valider avant création :
>
> | Champ | Valeur extraite |
> |---|---|
> | `partner_id` | Foncia Lyon (id 2841) |
> | `move_type` | `in_invoice` |
> | `invoice_date` | 2026-10-01 |
> | `invoice_date_due` | 2026-10-31 |
> | `ref` | F2026-OCT-LOY |
> | `narration` | Loyer bureaux 45 rue République — octobre 2026 |
> | `invoice_line_ids` | 1 ligne : « Loyer bureau Lyon octobre » · 1 × 3 800,00 € HT |
> | `amount_untaxed` | 3 800,00 € |
> | `amount_tax` | 760,00 € (TVA 20%) |
> | `amount_total` | 4 560,00 € |
>
> ✓ Pour créer ce brouillon dans Odoo : copie-colle la commande XML-RPC ci-dessous dans la console Odoo, ou clique sur « Nouveau » dans Comptabilité > Fournisseurs > Factures et reporte les champs manuellement.
>
> ```python
> env['account.move'].create({
>     'partner_id': 2841,
>     'move_type': 'in_invoice',
>     'invoice_date': '2026-10-01',
>     ...
> })
> ```

## Points d'attention

- **Compte fournisseur** : Odoo a un compte par défaut (`property_account_payable_id`), mais la facture peut nécessiter un compte analytique spécifique (loyer ≠ téléphonie). Demander à l'utilisateur.
- **TVA** : le taux extrait du PDF (20%) doit correspondre à une `account.tax` Odoo. Faire `odoo_query_records({"model":"account.tax","domain":[["amount","=",20],["type_tax_use","=","purchase"]]})` si doute.
- **Devise** : si la facture est en EUR mais l'instance en CHF (cas suisse), ajuster `currency_id` et noter le taux du jour.
- **Pièce justificative** : suggérer à l'utilisateur d'attacher le PDF original au record `account.move` créé (champ `message_attachment_count`).

## Anti-patterns

- ❌ Créer le vendor bill silencieusement sans demander confirmation.
- ❌ Hallucination de l'ID partenaire si Odoo n'a pas matché.
- ❌ Inventer un `account_id` (compte comptable) sans vérifier qu'il existe.
- ❌ Lire le PDF sans citer le nom du fichier dans la réponse.
