---
name: localization_detector
label: Détecteur de localisation
label_en: Localization detector
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Sous-skill du Context Aggregator : injecte les spécificités fiscales du pays actif (l10n_<cc>.md) quand le prompt est fiscalement pertinent."
description_en: "Sub-skill of the Context Aggregator: injects fiscal specifics of the active country (l10n_<cc>.md) when the prompt is fiscally relevant."
requirement: Société active avec code pays
requirement_en: Active company with country code
modes: [assistant]
keywords: [localization, l10n, tva, fiscal, pays]
code_path: odoo_consultant_portal/services/localization_service.py
---

## localization_detector (skill cœur)

Sous-skill du `context_aggregator` : injecte les spécificités fiscales du pays actif (`l10n_<cc>.md`) quand le prompt est fiscalement pertinent.

## Déclenchement
- Société active avec `country_code` connu (depuis `res.company`).
- Prompt contenant des termes fiscaux (TVA, facture, déclaration, échéance, plan comptable, etc.) ou utilisateur a forcé une localisation côté UI.

## Contenu injecté
- `l10n_<cc>.md` depuis `~/.odoo-consultant/context/`.
- Section dédiée « Localisation <CC> » dans le system prompt.
- Si le fichier n'existe pas pour ce pays, l'injection est sautée silencieusement.

## Désactivé
- Plus aucune connaissance fiscale spécifique au pays.
- L'IA répond avec une TVA générique, sans tenir compte des spécificités CH/FR/BE/etc.
- À garder activé sur tout projet de comptabilité.
