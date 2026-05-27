---
name: source_search_odoo
aliases: [search_odoo_source]
label: Chercher dans les sources
label_en: Search source code
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Rechercher dans les sources Odoo standard locales (Community + Enterprise, version courante) : méthode, classe, _name, _inherit, champ, XML id, rapport, manifest, comportement standard. Utiliser pour comprendre comment Odoo fait nativement quelque chose. Ne pas utiliser pour le code custom client (repo_search_code) ni pour la version cible d'une migration (migration_search_target_source)."
description_en: "Search local standard Odoo sources (Community + Enterprise, current version): method, class, _name, _inherit, field, XML id, report, manifest, standard behavior. Use to understand how Odoo natively does something. Do not use for client custom code (repo_search_code) or for a migration target version (migration_search_target_source)."
requirement: Sources Odoo téléchargées
requirement_en: Downloaded Odoo sources
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [source, code odoo, grep, méthode, model, class, standard, nativement, natif, natively, implémente, implements natively, xml id, xmlid, community, enterprise, comment odoo, how does odoo, where is]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
code_path: skills/source-search-odoo/scripts/handler.py
references_auto_load:
  - file: source_tree_map.md
    triggers: [organisation sources, source tree, community vs enterprise, odoo/addons, où se trouve, _name = , _inherit = , manifest depends]
---

## Principes communs
- Skill en lecture seule : il cherche dans les sources Odoo locales.
- Le code source local prime sur les souvenirs de version.

## Choisir entre source_search_odoo et les skills voisins

| Question | Skill à appeler |
|---|---|
| « Comment Odoo standard implémente cette méthode / ce modèle ? » | `source_search_odoo` |
| « Y a-t-il un override dans le module custom client ? » | `repo_search_code` |
| « Lire un fichier source Odoo précis » | `source_read_odoo_file` |
| « Chercher dans la version cible d'une migration » | `migration_search_target_source` |
| « Comparer le même fichier entre deux versions Odoo » | `compare_odoo_versions` |

Règle : si la question concerne le code standard Odoo SA (« comment Odoo fait X »), c'est ce skill. Si la question concerne le code écrit par le client ou un partenaire, c'est `repo_search_code`.

## source_search_odoo
Utilise `source_search_odoo` pour vérifier modèles, champs, méthodes, vues, controllers et comportements standard.

## Quand l'utiliser
- Question technique sur Odoo standard.
- Tu dois confirmer un nom exact avant de répondre.
- Tu compares standard, Enterprise et custom.

## Bonnes pratiques
- Cherche d'abord largement, puis restreins `path`.
- Community : souvent `community/addons/<module>`.
- Module `base` et coeur ORM : `community/odoo/...`.
- Enterprise : `enterprise/<module>`, pas `addons/<module>`.

## Déclencheurs
- Question technique standard Odoo, nom de modèle/champ/méthode, comportement framework.

## Séquence recommandée
1. Cherche largement le symbole.
2. Restreins au module ou au cœur si trop de résultats.
3. Lis les fichiers avec `source_read_odoo_file`.

## Paramètres
- `pattern`, `path`, `file_types`, `case_sensitive`, `max_matches`.
- Le résultat expose `returned_matches`, `max_matches`, `truncated`, `warning`. Si `truncated=true`, lis les fichiers les plus pertinents ou affine `path/pattern`.

## Pièges
- Community, Enterprise et cœur framework n'ont pas la même racine.
- Un résultat grep doit être lu dans son contexte.

## Combinaisons
- `source_read_odoo_file` pour preuve complète.
- `repo_search_code` pour vérifier une surcharge client.
- `migration_search_target_source` en migration.

## Critères de réponse
- Citer chemin/lignes et séparer standard, Enterprise et custom.
