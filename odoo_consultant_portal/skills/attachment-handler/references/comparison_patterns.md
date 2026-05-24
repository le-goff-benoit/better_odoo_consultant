# Patterns de comparaison de documents

Référence chargée à la demande quand le prompt évoque comparer / diff / écart entre deux documents (devis, factures, rapports, contrats).

## Trois modes de comparaison

### `mode="text"` — diff ligne par ligne

Extrait le texte de chaque document via pypdf, puis applique `difflib.SequenceMatcher` pour produire un diff unifié.

**Quand utiliser** : documents textuels simples (factures générées par ERP, exports CSV/MD reconvertis en PDF). Rapide, déterministe.

**Sortie** :
```
- Ligne ancienne (devis Odoo)
+ Ligne nouvelle (devis client signé)
```

**Limite** : pas de notion de structure. Si le client a juste réordonné des lignes, le diff montre tout en différent.

### `mode="structure"` — diff par section

Découpe chaque document en sections (détectées par headings Markdown, ou par changement de police taille / weight si pdf2image), puis compare section par section.

**Quand utiliser** : rapports, contrats, cahiers des charges. Permet de dire « la section TVA est identique, la section Livraison diffère ».

**Sortie** : tableau Markdown
```
| Section | Statut | Écart |
|---|---|---|
| En-tête | ✓ identique | — |
| Lignes | ⚠ différent | Acme a ajouté 2 lignes (+1240€) |
| TVA | ✓ identique | — |
| CGV | ✓ identique | — |
```

### `mode="visual"` — comparaison côte à côte

Convertit chaque document en images (pdf2image), retourne les pages appariées. Le LLM (vision native) compare visuellement.

**Quand utiliser** : factures scannées, contrats signés, mockups vs réalisation. Quand la mise en page compte (logo, signature, tampon).

**Sortie** : N paires d'images + texte d'analyse du LLM. Coût en tokens significatif.

## Workflow recommandé : devis client signé vs devis Odoo

1. **Charger les deux** : l'utilisateur uploade `devis-signe-acme.pdf` (versions client) et `devis-odoo-S00347.pdf` (version Odoo générée).
2. **Premier passage `mode="text"`** pour repérer les écarts rapides.
3. **Si écarts détectés** : `mode="structure"` pour confirmer dans quelle section.
4. **Si doute persiste sur des chiffres** : `mode="visual"` + demander à Claude de relire les montants directement.
5. **Synthèse** : tableau des écarts avec leur impact (montant, conditions).

## Seuils de pertinence

- **Différence ≤ 0.01€** : arrondi, ignorer.
- **Différence ≤ 1%** : à mentionner mais pas alerter.
- **Différence ≥ 5%** : flagger en rouge, suggérer une action (refaire le devis Odoo, ou comprendre la négociation client).
- **Section entière manquante** : alerter immédiatement, conséquence potentielle juridique (clause CGV ?).

## Pièges courants

### Encoding / accents

Pypdf peut rendre `é` comme `é` ou des séquences cassées. Avant la comparaison, normaliser avec `unicodedata.normalize("NFKC", text)`.

### Numérotation des pages

Une page de garde insérée dans un seul document décale tout. Pour les comparaisons longues, demander à l'utilisateur si la pagination doit être ignorée.

### Devises et formats

`1 250,00 €` (FR) vs `€1,250.00` (EN) vs `1.250,00€` (DE) — le même montant. Normaliser avant comparaison : strip non-digits sauf `.`, parser float.

### Dates

`12/05/2026` (FR) vs `05/12/2026` (US) vs `2026-05-12` (ISO) — même date. Pour les diffs sur les dates, parser puis comparer les objets `date`.

### Champs Odoo vs nom commercial

Le devis Odoo cite `Acme SA — Lyon` (champ `partner_id.display_name`), le devis client cite juste `Acme`. Ne pas alerter sur ce type de divergence.

## Quand préférer un autre tool

- Comparer une **réponse Odoo live** vs un **PDF** : extraire le PDF puis appeler `query_odoo` pour récupérer la version Odoo, comparer côté assistant.
- Comparer **deux versions Odoo** du même devis (historique) : pas de tool dédié — utiliser `query_odoo` deux fois (un sur la version courante, un sur la version archivée).
- Comparer un **template QWeb** (XML) vs un **PDF généré** : c'est `inspect_odoo_report` pour le template + extraction PDF de l'autre côté.
