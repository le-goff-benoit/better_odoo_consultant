---
name: runtime_release_notes_injector
aliases: [release_notes_injector]
label: Notes de version Odoo
label_en: Odoo release notes
kind: core
group: core
builtin: true
read_only: true
risk_level: low
allow_implicit_invocation: false
description: "Skill runtime interne (sous-skill du context_aggregator) : injecte les release notes Odoo X.Y de la version source et/ou cible, filtrées par domaine métier mentionné dans le prompt, quand la question est sensible à la version ou à une migration. Invoqué automatiquement. Ne pas invoquer pour des questions sans version Odoo de référence ni sur demande utilisateur explicite."
description_en: "Internal runtime skill (sub-skill of context_aggregator): injects source and/or target Odoo X.Y release notes, filtered by the business domain mentioned in the prompt, when the question is version- or migration-sensitive. Auto-invoked. Do not invoke for version-agnostic questions or on explicit user request."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration]
keywords: [release, note, version, nouveauté]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: backend/services/context_service.py
---

## runtime_release_notes_injector (skill cœur)

Sous-skill du `runtime_context_aggregator` : injecte les notes de version Odoo X.Y filtrées par domaine quand le prompt est sensible à la version.

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

## Déclencheurs
- Migration, upgrade, breaking change, nouveauté, dépréciation, compatibilité version.

## Séquence recommandée
1. Identifier version source et cible si présentes.
2. Charger les notes locales filtrées par domaine.
3. Croiser avec le code source quand une décision technique dépend du comportement réel.

## Paramètres
- `odoo_version`, `target_version`, domaine déduit du prompt.

## Pièges
- Les notes de version ne remplacent pas une vérification code/source live.

## Combinaisons
- `source_search_odoo` et `migration_search_target_source` pour preuve technique.
- `odoo_inspect_modules` pour savoir si le module concerné est utilisé.

## Critères de réponse
- Relier nouveauté/changement à la version exacte et à l'impact projet.
