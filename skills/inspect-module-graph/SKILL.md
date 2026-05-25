---
name: inspect_module_graph
aliases: [module_graph, dependency_graph]
label: Graphe de module
label_en: Module graph
kind: tool
group: repo
builtin: false
read_only: true
risk_level: low
description: "Construire le graphe d'un module Odoo : dépendances manifest `depends`, profondeur contrôlée, cycles, classes modèles et héritages `_inherit` / `_inherits`, avec sortie Mermaid. Utiliser pour comprendre l'architecture d'un module standard, Enterprise ou custom. Ne pas utiliser pour lire simplement un manifest (source_read_odoo_file/repo_read_file) ni pour lister tous les modules (repo_list_modules)."
description_en: "Build an Odoo module graph: manifest `depends`, bounded depth, cycles, model classes and `_inherit` / `_inherits` inheritance, with Mermaid output. Use to understand the architecture of a standard, Enterprise or custom module. Do not use to simply read one manifest (source_read_odoo_file/repo_read_file) or list every module (repo_list_modules)."
requirement: Sources Odoo ou dépôt projet disponible
requirement_en: Odoo sources or project repository available
modes: [assistant, migration]
keywords: [dépendances module, dependances module, dependency graph, manifest depends, graphe module, module graph, héritage module, heritage module, override, qui hérite de, who inherits, module tree]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, architecture, manifest, mermaid]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/inspect-module-graph/scripts/handler.py
references_auto_load:
  - file: manifest_anatomy.md
    triggers: [manifest depends, graphe module, dependency graph]
---

## Principes communs
- Skill en lecture seule : il parse manifests et fichiers Python locaux.
- Limiter la profondeur pour rester lisible.
- La sortie Mermaid peut être reprise directement dans la réponse.

## inspect_module_graph
Utilise `inspect_module_graph` pour analyser les dépendances d'un module et ses héritages de modèles.

## Quand l'utiliser
- L'utilisateur demande un graphe de dépendances ou une architecture module.
- Tu dois expliquer qui dépend de quoi avant migration.
- Tu dois repérer les classes qui héritent d'un modèle dans un module.

## Bonnes pratiques
- Pour un module custom, utilise `scope=project`.
- Pour Enterprise, utilise `scope=enterprise`.
- Garde `depth=2` sauf demande explicite de graphe plus large.

## Déclencheurs
- "Graphe de dépendances", "module tree", "manifest depends", "qui hérite de", "architecture du module".

## Paramètres
- `module`: nom technique du module.
- `scope`: `odoo`, `enterprise` ou `project`.
- `depth`: profondeur des dépendances.
- `include_inheritance`: inclure les héritages Python.

## Pièges
- Les modules inconnus dans `depends` sont gardés comme nœuds externes.
- Un graphe de dépendance ne donne pas l'ordre exact de chargement des data XML.

## Combinaisons
- `generate_diagram` si l'utilisateur veut uniquement un diagramme visuel.
- `repo_read_file` ou `source_read_odoo_file` pour lire un manifest précis.

## Critères de réponse
- Donner le graphe Mermaid, puis résumer dépendances directes, nœuds externes, cycles et héritages significatifs.
