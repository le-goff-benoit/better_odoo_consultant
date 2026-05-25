---
name: compare_odoo_versions
aliases: [compare_versions, version_diff]
label: Comparer deux versions Odoo
label_en: Compare Odoo versions
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Comparer deux versions Odoo locales : diff de modèle, vue XML ou module entre 17.0, 18.0, Enterprise et Community, champs/méthodes ajoutés ou retirés, manifest depends/data et fichiers modifiés. Utiliser pour cadrer une migration. Ne pas utiliser pour lire un fichier précis (source_read_odoo_file) ni pour chercher dans la version cible (migration_search_target_source)."
description_en: "Compare two local Odoo versions: model, XML view or module diff between 17.0, 18.0, Enterprise and Community, added or removed fields/methods, manifest depends/data and file deltas. Use for migration scoping. Do not use to read one exact file (source_read_odoo_file) or to search the migration target tree (migration_search_target_source)."
requirement: Sources Odoo locales des deux versions
requirement_en: Local Odoo sources for both versions
modes: [assistant, migration]
keywords: [comparer versions, diff version, migration 17 18, migration 18 19, upgrade, change between, version diff, what changed, changements entre versions, compare odoo versions]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, migration, source, diff]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/compare-odoo-versions/scripts/handler.py
templates:
  - name: comparison_report
    label: Rapport de comparaison
    triggers: [diff version, comparaison migration, what changed]
references_auto_load:
  - file: diff_strategies.md
    triggers: [diff version, comparaison migration, changement entre versions]
---

## Principes communs
- Skill en lecture seule : il compare des sources locales déjà téléchargées.
- Citer les versions, le scope Community/Enterprise et la cible comparée.
- Distinguer diff détecté automatiquement et interprétation métier.

## compare_odoo_versions
Utilise `compare_odoo_versions` pour comparer un modèle, une vue XML ou un module entre deux versions Odoo.

## Quand l'utiliser
- L'utilisateur demande ce qui change entre deux versions Odoo.
- Tu cadres un risque de migration sur un modèle, une vue ou un module.
- Tu dois repérer champs, méthodes, dépendances ou fichiers ajoutés/supprimés.

## Bonnes pratiques
- Utilise `target` avec un préfixe explicite : `model:sale.order`, `view:sale.view_order_form`, `module:sale`.
- Choisis `scope=enterprise` seulement si la cible vient d'Enterprise.
- Si le résultat est vide, vérifie d'abord que les sources des versions existent.

## Déclencheurs
- "Qu'est-ce qui change entre 17 et 18", "diff du module", "compare sale.order entre versions", "what changed in Odoo 18".

## Paramètres
- `target`: `model:<model>`, `view:<xml_id>` ou `module:<module>`.
- `from_version`, `to_version`: noms de dossiers sources, par exemple `17.0`, `18.0`.
- `scope`: `odoo` ou `enterprise`.

## Pièges
- Ce skill ne remplace pas une lecture de fichier ligne par ligne.
- Un diff statique ne prouve pas l'impact runtime : croiser avec données live si nécessaire.

## Combinaisons
- `migration_search_target_source` pour chercher une méthode précise dans la cible.
- `source_read_odoo_file` pour citer les lignes après le diff.
- `output_report_writer` si un livrable client est demandé.

## Critères de réponse
- Résumer les changements par criticité, puis lister les preuves techniques retournées par le handler.
