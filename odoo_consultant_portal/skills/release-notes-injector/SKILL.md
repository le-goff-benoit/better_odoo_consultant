---
name: release_notes_injector
label: Notes de version Odoo
label_en: Odoo release notes
kind: core
group: core
builtin: true
read_only: true
risk_level: low
description: "Sous-skill du Context Aggregator : injecte les notes de version Odoo X.Y, filtrées par domaine, quand le prompt est sensible à la version."
description_en: "Sub-skill of the Context Aggregator: injects Odoo X.Y release notes, filtered by domain, when the prompt is version-sensitive."
requirement: Aucun
requirement_en: None
modes: [assistant, migration]
keywords: [release, note, version, nouveauté]
code_path: odoo_consultant_portal/services/context_service.py
---

## release_notes_injector (skill cœur)

Sous-skill du `context_aggregator` : injecte les notes de version Odoo X.Y filtrées par domaine quand le prompt est sensible à la version.

## Déclenchement
- Mode migration : toujours.
- Sinon : prompt contenant des termes liés au versioning (« migration », « nouveau », « breaking change », etc.).

## Contenu injecté
- `odoo-<X.Y>.md` depuis `~/.odoo-consultant/context/` (téléchargé via la page Sources).
- Filtré par domaine : compta, vente, RH, etc. selon le prompt — réduit de 40-70% les sections injectées.
- Pour les migrations, source ET cible sont chargées.

## Désactivé
- Aucune note de version n'entre dans le contexte.
- Utile pour économiser du budget quand la question ne dépend pas de la version.
- Risque : l'IA peut donner une réponse correcte sur la version courante mais cassée sur la version cible.
