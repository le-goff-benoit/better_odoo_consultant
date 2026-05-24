# Stratégie d'extraction PDF — quand préférer quoi

Référence chargée à la demande quand le prompt évoque l'extraction PDF, un PDF scanné, pypdf, pdf2image ou un blocage sur le contenu d'un PDF.

## Les 3 stratégies disponibles

### 1. Vision native (Claude / Gemini)

Le PDF est envoyé tel quel au modèle. Le modèle lit en parallèle :
- Le **texte** (extrait par leur runtime),
- La **mise en page** (tableaux, colonnes, encarts),
- Les **images** intégrées (logos, photos de produits, signatures),
- Les **annotations** (commentaires, highlights).

**Avantages** : qualité maximale, zéro pipeline custom, comprend les PDFs scannés sans OCR séparé.
**Inconvénients** : coût en tokens (image-equivalent pour chaque page), uniquement Claude + Gemini.

### 2. Extraction texte (pypdf)

`pypdf.PdfReader(...).pages[i].extract_text()` rend une string par page. Concatène les pages avec `\n\n`.

**Avantages** : gratuit, instant (< 100ms même pour des PDFs de 100 pages), aucun binaire OS.
**Inconvénients** :
- Échoue silencieusement sur les PDFs scannés (retourne `""` ou du bruit).
- Préserve mal les colonnes (texte multi-colonne mélangé).
- Tableaux : extraction approximative, dépend de la structure interne du PDF (CSV ? listes de mots positionnés ?).
- Pas de vision : logos / signatures invisibles.

### 3. Conversion en images (pdf2image + poppler)

Chaque page → PNG. Envoyée comme bloc image au LLM.

**Avantages** : marche même sur les PDFs scannés. Le LLM voit la mise en page exacte.
**Inconvénients** :
- Lent : 1-3s par page sur un PDF lourd.
- Coûteux en tokens : ~1500 tokens vision par image (4-5x le coût d'une page texte).
- Nécessite `poppler-utils` (binaire OS) installé sur la machine.

## Arbre de décision (automatique dans le code)

```
Provider supporte PDF natif (Claude / Gemini) ?
├── OUI → envoyer le PDF brut au LLM. Fin.
└── NON →
    Tenter pypdf.extract_text()
    ├── ≥ 50 chars extraits → envoyer comme bloc TEXT (cheap, fast). Fin.
    └── < 50 chars (PDF scanné) →
        Tenter pdf2image (cap 10 pages, 120 dpi)
        ├── Succès → envoyer comme N blocs IMAGE. Fin.
        └── Échec (poppler manquant) → message d'avertissement explicite.
```

## Cas d'usage typiques

### Facture textuelle générée par un ERP (PDF "vrai" texte)

- Pypdf marche bien. Extraction propre, parsing possible (regex sur montant TVA, fournisseur, n° facture).
- Claude/Gemini natif marche encore mieux : ils lisent **aussi** le logo + le format de la table de lignes.

### Facture scannée / signée manuellement

- Pypdf retourne vide ou du bruit.
- Le fallback image se déclenche automatiquement. Le LLM lit la facture comme un humain.
- **Limite** : si la qualité du scan est mauvaise (flou, contraste faible), même Claude peut se tromper sur les chiffres. Demander à l'utilisateur de re-scanner en haute résolution.

### Contrat juridique multi-page

- Texte propre → pypdf suffit. La partie « clauses importantes » peut être extraite via parsing sur les headings (`#`, numérotation `1.1.`, etc.).
- Si le contrat fait > 20 pages, demander à l'utilisateur de cibler les sections d'intérêt avant l'extraction complète.

### Devis / bon de commande avec tableau de lignes

- Si pypdf rend les colonnes correctement (PDF généré par ERP) → parser le tableau ligne par ligne.
- Sinon → fallback image + vision Claude pour lire la table comme une image.

### Plan / schéma / wireframe

- Vision native (Claude / Gemini) ou image-fallback obligatoires. Pypdf est inutile sur un PDF dont le contenu utile est graphique.

## Mesures de coût

| Document | pypdf | pdf2image (image) | Claude natif |
|---|---|---|---|
| Facture 1 page (PDF texte) | ~50ms · ~800 tokens | ~1s · ~1500 tokens | natif · ~1500 tokens |
| Contrat 10 pages | ~500ms · ~8k tokens | ~10s · ~15k tokens | natif · ~15k tokens |
| Catalogue 50 pages illustré | ~3s · ~40k tokens (cap) | trop coûteux, splitter | natif · ~75k tokens (déborde) |

## Quand demander à l'utilisateur de splitter

Si le PDF fait > 20 pages, prévenir l'utilisateur **avant** de lancer l'extraction complète :

> « Ce PDF fait 47 pages. Je vais lire les 10 premières par défaut (limite du fallback). Tu veux que j'analyse une plage précise, ou tu préfères qu'on splitte par chapitre ? »

Le tool `pdf_to_images(attachment_name, pages=[1,2,3,...])` permet de cibler des pages précises.
