# Use case — comparaison devis client signé vs devis Odoo

**Prompt utilisateur** : « J'ai mis le devis signé par Acme et le devis Odoo S00347. Compare-les et dis-moi ce qui a changé. »

## Workflow

### Étape 1 — lancer la comparaison structurelle

```json
{
  "name": "compare_documents",
  "arguments": {
    "name_a": "devis-odoo-S00347.pdf",
    "name_b": "devis-signe-acme.pdf",
    "mode": "structure"
  }
}
```

### Étape 2 — résultat type retourné par le tool

```json
{
  "ok": true,
  "name_a": "devis-odoo-S00347.pdf",
  "name_b": "devis-signe-acme.pdf",
  "mode": "structure",
  "sections_a": ["En-tête", "Lignes commande", "Conditions", "Totaux", "CGV"],
  "sections_b": ["En-tête", "Lignes commande", "Conditions", "Totaux", "CGV", "Annexe — pénalités de retard"],
  "diff": [
    { "section": "Lignes commande", "status": "modifié",
      "details": "Ligne 3 retirée (Formation 2 j × 850€). Ligne 7 ajoutée (Support 6 mois × 200€/mois). Net : -1 700€ +1 200€ = -500€." },
    { "section": "Conditions", "status": "modifié",
      "details": "Délai de paiement passé de 30 à 60 jours." },
    { "section": "CGV", "status": "identique",
      "details": null },
    { "section": "Annexe — pénalités de retard", "status": "ajouté",
      "details": "Présent dans le PDF client uniquement. Pénalité 3× taux légal." }
  ],
  "totals_a": { "ht": 27500, "ttc": 33000 },
  "totals_b": { "ht": 27000, "ttc": 32400 },
  "delta_pct": -1.8
}
```

### Étape 3 — interprétation côté assistant

> **Comparaison `devis-odoo-S00347.pdf` ↔ `devis-signe-acme.pdf`** (mode structure)
>
> **Écart total HT** : −500 € (-1.8%) → en faveur du client mais sous le seuil d'alerte (5%).
>
> | Section | Statut | Action |
> |---|---|---|
> | En-tête | ✓ identique | — |
> | Lignes commande | ⚠ modifié | Formation supprimée, support 6 mois ajouté. Net −500 € HT. À reporter dans Odoo. |
> | Conditions | ⚠ modifié | Délai paiement 30 → 60 jours. **Vérifier l'impact trésorerie.** |
> | Totaux | ⚠ modifié | Cohérent avec la modification des lignes (calcul OK). |
> | CGV | ✓ identique | — |
> | **Annexe pénalités** | ⚠ ajouté | **Nouveau** : pénalités 3× taux légal en cas de retard. **Demander validation juridique.** |
>
> **Recommandation** :
> 1. Modifier la commande Odoo S00347 pour refléter le nouveau périmètre (remplacer Formation par Support 6 mois).
> 2. Passer le délai de paiement à 60 jours sur `partner_id` ou sur la commande.
> 3. **Action critique** : faire valider l'annexe pénalités par le juridique avant validation finale. Cette clause n'était pas dans la version Odoo originale.

## Variantes

### Si le client a juste signé sans modification

```json
{ "diff": [{"section":"Signatures","status":"ajouté","details":"Signature numérique + cachet entreprise"}],
  "delta_pct": 0 }
```

Réponse : « Le client a signé sans modification. ✓ Tu peux passer la commande en `state='sale'` dans Odoo. »

### Si l'écart total dépasse 5%

Flagger en rouge en tête de réponse :
> ⚠ **Écart significatif (+8.3%)** entre le devis Odoo et la version signée. **À valider** avec le commercial / la direction avant confirmation.

### Si une devise diffère

`compare_documents` ne convertit pas. Si le devis Odoo est en EUR et le devis client en USD, l'expliciter et suggérer de re-générer le devis Odoo dans la devise du client avant comparaison.

## Anti-patterns

- ❌ Conclure « identique » sans avoir vérifié les totaux numériquement.
- ❌ Manquer une section ajoutée dans le PDF client (le tool la signale dans `diff`, mais l'assistant peut la sauter dans la synthèse — toujours lister toutes les sections du diff).
- ❌ Modifier la commande Odoo sans demander confirmation à l'utilisateur.
