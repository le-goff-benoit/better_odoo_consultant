# Matrice de capacités multimodales par provider

Référence chargée à la demande quand le prompt évoque une erreur 400 PDF, un format incompatible, ou simplement « quel provider supporte les PDFs ».

## Tableau de référence

| Provider | Image native | PDF natif | PDF scanné (pas de texte) |
|---|---|---|---|
| **Claude** (Anthropic) | ✓ bloc `{"type":"image","source":{"type":"base64",...}}` | ✓ bloc `{"type":"document","source":{...}}` | ✓ vision intégrée — lit texte + layout sans OCR séparé |
| **Gemini** (Google) | ✓ `inline_data` avec `mime_type` image | ✓ `inline_data` avec `mime_type=application/pdf` | ✓ vision intégrée |
| **OpenAI** (API directe gpt-4o) | ✓ `{"type":"image_url","image_url":{"url":"data:..."}}` | ⚠ `{"type":"file","file":{"filename","file_data"}}` — accepté sur Pro tier seulement | ✗ pas de vision PDF → fallback nécessaire |
| **GitHub Models** (Azure proxy) | ✓ `image_url` | ✗ rejet 400 : `"type has to be either 'image_url' or 'text'"` | ✗ idem |
| **Copilot** (VS Code endpoint) | ✓ `image_url` | ✗ même rejet 400 que GitHub | ✗ idem |

## Stratégie automatique de l'app

Le code dans `services/attachment_service.py` (`_openai_content`) applique automatiquement la bonne stratégie :

```
PDF + provider == "openai"        → bloc `file` natif (gpt-4o accepte)
PDF + provider ∈ {github, copilot} → pypdf.extract_text()
   ├── texte ≥ 50 chars            → bloc `text` avec le contenu extrait
   └── texte vide / scanné         → pdf2image (jusqu'à 10 pages, 120 dpi)
                                       → liste de blocs `image_url`
```

Le fallback est transparent : le LLM voit du texte ou des images, il ne voit jamais l'erreur 400.

## Cas où le fallback échoue

- `pdf2image` non installé → message clair dans la réponse : « installe pdf2image + poppler-utils ou utilise Claude/Gemini ».
- `poppler-utils` (binaire OS) manquant → même message.
- PDF chiffré (mot de passe) → pypdf retourne vide ET pdf2image échoue → bloc d'avertissement explicite.

## Recommandations utilisateur

| Cas | Provider conseillé |
|---|---|
| Travail régulier sur PDFs | **Claude** ou **Gemini** (natif, qualité maximale) |
| Économie de budget sur PDFs simples (textuels) | **GitHub Models** (gratuit) + fallback pypdf — convient pour 80% des cas |
| PDFs scannés ou images riches | **Claude** > Gemini (vision plus fiable sur formulaires complexes) |
| Workflows tools-heavy (peu de PDFs) | OpenAI gpt-4o-mini (low latency, low cost) |

## Limites volumétriques

- **Max 5 fichiers** par message (configurable via `ATTACHMENT_MAX_FILES`).
- **Max 10 MB** par fichier.
- **Max 10 pages** rendues en images (cap dans `_pdf_to_image_blocks`) — au-delà, le user doit splitter ou demander une extraction texte ciblée.
- Tokens vision : ~1500 par page image. Un PDF de 10 pages converti = ~15k tokens → toujours sous le budget de 36k du contexte.

## Diagnostic d'erreur

| Symptôme | Cause probable | Fix |
|---|---|---|
| Erreur 400 `type has to be either 'image_url' or 'text'` | PDF envoyé en bloc `file` à GitHub/Copilot, fallback inactif | Vérifier que `_openai_content` reçoit bien `provider="github"` ou `"copilot"` (pas `"openai"`) |
| « Conversion impossible : pdf2image manquant » | `pip install pdf2image` non fait | `pip install pdf2image` + `apt install poppler-utils` (Linux) ou `brew install poppler` (macOS) |
| PDF lu mais texte vide / charabia | PDF scanné, pypdf retourne du bruit | Le fallback pdf2image doit se déclencher automatiquement (texte < 50 chars). Si pas le cas, vérifier les logs. |
| Image floue après conversion | DPI par défaut (120) trop bas | Augmenter `dpi=200` dans `_pdf_to_image_blocks` (coût : +50% taille payload) |
