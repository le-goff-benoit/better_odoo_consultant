---
name: runtime_attachment_handler
aliases: [attachment_handler]
label: Pièces jointes (PDF + images)
label_en: Attachments (PDF + images)
kind: core
group: core
builtin: true
read_only: true
risk_level: low
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [multimodal, pdf, image, extraction, comparison]
description: "Traiter les PDF et images uploadés par l'utilisateur : extraction de texte (pypdf), conversion de pages en images (pdf2image + poppler) pour PDF scannés, comparaison de documents, capture d'écran, routage multimodal selon le provider (Claude/OpenAI/Gemini/GitHub Models/Copilot) et gestion des erreurs 400 de format. Utiliser dès qu'un message contient une pièce jointe. Ne pas utiliser pour un rapport PDF Odoo généré côté serveur (odoo_inspect_report)."
description_en: "Handle PDFs and images uploaded by the user: text extraction (pypdf), page-to-image conversion (pdf2image + poppler) for scanned PDFs, document comparison, screenshots, provider-aware multimodal routing (Claude/OpenAI/Gemini/GitHub Models/Copilot) and 400 format errors. Use as soon as a message contains an attachment. Do not use for an Odoo PDF report generated server-side (odoo_inspect_report)."
requirement: Aucun (pdf2image + poppler-utils recommandés pour PDF scannés)
requirement_en: None (pdf2image + poppler-utils recommended for scanned PDFs)
modes: [assistant, migration, creator]
keywords: [pdf, image, attachment, pièce jointe, joindre, upload, extraire, comparer, facture pdf, devis pdf, capture écran]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/runtime-attachment-handler/scripts/handler.py
references_auto_load:
  - file: provider_capability_matrix.md
    triggers: [erreur 400 pdf, pdf supporté, type has to be either, image_url, file_data, openai pdf, github models pdf, copilot pdf, multimodal claude, multimodal gemini, format pdf provider]
  - file: pdf_extraction_strategy.md
    triggers: [pdf scanné, pdf scanne, pypdf, pdf2image, poppler, extraction pdf, pdf vide, ocr pdf, pdf image]
---

## Purpose

Tu reçois des PDFs et des images uploadées par le consultant. Ton job :

1. **Lire le contenu** — Claude et Gemini voient nativement les PDFs et images. OpenAI/GitHub/Copilot ne supportent pas les PDFs natifs : le backend convertit automatiquement (pypdf texte → pdf2image image si scanné).
2. **Exécuter le bon tool** quand un workflow précis est demandé (extraction ciblée, conversion en images, comparaison de deux documents).
3. **Citer le fichier source** — toujours mentionner le nom de la pièce jointe quand tu cites son contenu.

## When to use which tool

| Demande utilisateur | Tool à appeler |
|---|---|
| « extrais le texte de cette facture » | `extract_pdf_text(attachment_name)` |
| « montre-moi la page 3 du PDF » | `pdf_to_images(attachment_name, pages=[3])` |
| « compare ces deux devis » | `compare_documents(name_a, name_b, mode="text")` |
| Vision libre (« qu'est-ce qu'il y a sur cette capture ? ») | Aucun tool — Claude/Gemini voient l'image directement |

## Use cases métier supportés

- **Facture fournisseur → vendor bill draft** : `extract_pdf_text` → parse montants/TVA/fournisseur → `odoo_query_records` pour matcher le partenaire → proposer un `account.move` à valider.
- **Comparaison devis client signé vs Odoo** : `compare_documents(mode="text")` ou `mode="structure"` → flagger toute différence ≥ 5% sur les montants.
- **Capture d'écran d'erreur Odoo** : vision native du LLM → identifier le composant (vue cassée, traceback, log) → enchaîner avec `odoo_inspect_view` ou `odoo_inspect_security` selon le diagnostic.
- **Plan comptable PDF** → croiser avec `account.account` Odoo via `odoo_query_records`, signaler comptes manquants.
- **Bon de livraison scanné** → `extract_pdf_text` + comparer aux `stock.move` Odoo récents du fournisseur.
- **Mockup wireframe (image)** → décrire la structure attendue, suggérer les modèles/champs Odoo à utiliser pour la reproduire.
- **Contrat multi-page** → `extract_pdf_text` ou Claude natif → extraire clauses (date, montant, parties, juridiction).
- **Logo client** → suggérer son intégration dans le QWeb `external_layout` via le skill `odoo_inspect_report`.
- **Capture du Studio** → comparer la config visible avec `odoo_inspect_studio` pour repérer les écarts.

## Output format

- Citer le nom de fichier entre backticks la première fois : `` `facture-acme-2026-05.pdf` ``.
- Pour les comparaisons : tableau Markdown avec colonnes « Champ », « Document A », « Document B », « Écart ».
- Pour les extractions : code fence avec le texte brut + résumé interprété en-dessous.

## When NOT to use

- Le user demande juste « décris cette image » → réponds avec ta vision native, **pas besoin de tool**.
- Le PDF fait moins d'1 page et le LLM le voit déjà via le canal multimodal → pas la peine d'appeler `extract_pdf_text` (sauf demande explicite « extrais »).
- Pas d'écriture côté Odoo dans ce skill : la création de `account.move` etc. reste à l'utilisateur, après validation.
