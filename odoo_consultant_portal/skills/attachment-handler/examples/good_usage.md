# Usage canonique — extract_pdf_text

**Prompt utilisateur** : « Extrais le contenu textuel de la facture `acme-2026-05.pdf` que je viens de joindre. »

**Tool call attendu** :
```json
{
  "name": "extract_pdf_text",
  "arguments": { "attachment_name": "acme-2026-05.pdf" }
}
```

**Pourquoi ces arguments** :
- `attachment_name` cite exactement le nom du fichier uploadé (visible dans la dernière requête utilisateur, balise `[Pièce jointe...]`).
- Pas besoin d'autres paramètres — l'extraction est par défaut sur toutes les pages.

**Résultat retourné** :
```json
{
  "ok": true,
  "attachment_name": "acme-2026-05.pdf",
  "pages": 2,
  "char_count": 1842,
  "content": "FACTURE\nN° F2026-0512\nDate : 12/05/2026\n\nACME SA\n45 rue de la République\n69002 Lyon\n\nDescription                              Qté    PU       Total\n------------------------------------------------------------\nConsulting Odoo - Mai 2026               12    850,00   10 200,00\nDéplacements (km)                       340    0,42     142,80\n\nTotal HT                                                10 342,80\nTVA 20%                                                  2 068,56\nTotal TTC                                               12 411,36"
}
```

**Interprétation côté assistant** :
> Voici le contenu de `acme-2026-05.pdf` (2 pages, 1842 caractères) :
>
> **Facture F2026-0512** émise le 12/05/2026 pour **ACME SA** (Lyon, 69002) :
> - Consulting Odoo (mai 2026) : 12 j × 850 € = 10 200,00 €
> - Déplacements : 340 km × 0,42 € = 142,80 €
>
> **Total HT** : 10 342,80 € · **TVA 20%** : 2 068,56 € · **Total TTC** : 12 411,36 €
>
> Veux-tu que je crée le brouillon de vendor bill correspondant dans Odoo ? J'aurai besoin de confirmer le compte fournisseur (`res.partner` Acme SA) et la date d'écriture.

**Pièges à éviter** :
- **Toujours citer le nom du fichier** — l'utilisateur peut avoir joint plusieurs PDFs, l'ambiguïté est piégeuse.
- **Ne pas créer de record Odoo sans demander confirmation** — `extract_pdf_text` est read-only, la création de `account.move` doit passer par le user (ce skill n'a pas la permission `odoo: write`).
- **Si l'extraction renvoie `content: ""` ou très court** : c'est probablement un PDF scanné. Le backend convertit automatiquement en images sur les providers OpenAI/GitHub/Copilot, mais Claude/Gemini natif voient déjà le contenu — pas besoin de re-appeler le tool, lis l'image directement.
- **Ne pas appeler `extract_pdf_text` sur un PDF de 50 pages sans raison** : c'est 8k+ tokens dans le contexte. Demande d'abord si l'utilisateur veut tout ou une partie.
