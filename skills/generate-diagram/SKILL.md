---
name: generate_diagram
aliases: [draw_diagram, mermaid_diagram]
label: Générer un diagramme
label_en: Generate diagram
kind: tool
group: src
builtin: false
read_only: true
risk_level: low
description: "Générer un diagramme Mermaid affichable dans la réponse : flowchart libre, classDiagram depuis AST Python, héritage de modèle, héritage de vue live ou graphe de module. Utiliser quand l'utilisateur demande de dessiner, visualiser ou montrer un schéma. Ne pas utiliser pour inspecter seulement les champs (odoo_inspect_fields), lire une vue (odoo_inspect_view) ou produire un rapport textuel (output_report_writer)."
description_en: "Generate a Mermaid diagram that can be rendered in the answer: free flowchart, classDiagram from Python AST, model inheritance, live view inheritance or module graph. Use when the user asks to draw, visualize or show a schema. Do not use only to inspect fields (odoo_inspect_fields), read a view (odoo_inspect_view) or produce a text report (output_report_writer)."
requirement: Sources Odoo, dépôt projet ou connexion Odoo selon le diagramme
requirement_en: Odoo sources, project repo or Odoo connection depending on diagram type
modes: [assistant, migration, creator]
keywords: [diagramme, diagram, schéma visuel, flowchart, class diagram, héritage de modèle, heritage de modele, arbre d'héritage, arbre heritage, graphe, graph, mermaid, dessine, dessiner, draw, visualise, visualize, show graph]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, diagram, mermaid, architecture]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/generate-diagram/scripts/handler.py
templates:
  - name: mermaid_blocks
    label: Bloc Mermaid
    triggers: [diagramme, mermaid, flowchart]
references_auto_load:
  - file: mermaid_cheatsheet.md
    triggers: [diagramme, schéma, diagram, flowchart, mermaid]
---

## Principes communs
- Skill en lecture seule : il transforme contexte ou sources en Mermaid.
- Toujours rendre le résultat dans un bloc fenced `mermaid`.
- Borner le nombre de nœuds pour garder un diagramme lisible.
- Standard qualité attendu : diagramme propre, cartes titrées, flux orthogonal/linéaire, labels courts, styles Mermaid cohérents.

## Diagramme de flux avec impact module custom

Quand l'utilisateur demande un flux standard Odoo **avec l'impact d'un module custom**, **procéder étape par étape** :

1. **Établir d'abord le flux standard** : flowchart TD avec les étapes clés du processus standard Odoo (sans custom). Chaque nœud = une étape métier avec titre court `<b>Étape</b>` + ligne de détail.
2. **Inspecter le module custom** via `repo_read_file` / `repo_search_code` / `odoo_inspect_view` pour identifier précisément les points d'injection (nouveaux champs, vues surchargées, automatisations ajoutées, modèles étendus).
3. **Produire le diagramme enrichi** : repartir du flux standard et **mettre en évidence les modifications** avec :
   - `classDef standard fill:#EFF6FF,stroke:#93C5FD` pour les étapes Odoo standard (bleu clair)
   - `classDef custom fill:#FEF3C7,stroke:#F59E0B` pour les étapes/ajouts du module custom (ambre)
   - `classDef impact fill:#ECFDF5,stroke:#34D399` pour les étapes affectées (modifiées par le custom mais pas ajoutées)
   - Chaque nœud custom doit avoir un label qui mentionne le module : `["<b>Ajout Custom</b><br/>swiss_grape_harvesting_management<br/>- Variété raisin<br/>- Parcelle"]`
4. **Ne jamais utiliser `\n` dans les labels Mermaid** : utiliser `<br/>` pour les sauts de ligne dans les labels entre guillemets.
5. **Ne pas dépasser 15 nœuds** pour un diagramme d'impact : si le flux est plus long, découper par sous-domaine (ex. Réception, Qualité, Facturation).
6. **Après le diagramme**, rédiger un résumé en texte des 3-5 points d'impact clés du module, avec référence aux fichiers/modèles inspectés.

## generate_diagram
Utilise `generate_diagram` pour produire un diagramme Mermaid à partir d'une description, de sources locales ou de l'instance live.

## Quand l'utiliser
- L'utilisateur demande explicitement un diagramme, schéma, graphe, flowchart ou arbre.
- Tu veux visualiser dépendances, classes ou héritages.
- Le Creator doit illustrer un workflow fonctionnel.

## Bonnes pratiques
- `kind=flow` pour un workflow narratif sans besoin de lecture source.
- `kind=class` ou `model-inheritance` pour les modèles Python.
- `kind=view-inheritance` avec `scope=live` pour les vues assemblées de l'instance.
- `kind=module-graph` pour les dépendances manifest.
- Pour un flowchart "joli", chaque nœud doit avoir un titre court en gras (`<b>Titre</b>`) puis une ligne de détail ; pas de carte avec seulement un paragraphe long.
- Ajouter l'init Mermaid `curve: linear`, `htmlLabels: true`, `nodeSpacing` et `rankSpacing` pour éviter les liens courbes libres.
- Utiliser `classDef` pour 3-5 types maximum : départ/acteur, action, décision, validation, résultat/risque.
- Préférer `flowchart TD` pour un processus et `flowchart LR` pour un graphe de dépendances ; éviter les liens qui remontent ou traversent tout le diagramme.

## Déclencheurs
- "Dessine", "montre le diagramme", "fais un schéma", "class diagram", "flowchart", "show graph".

## Paramètres
- `kind`: `flow`, `class`, `model-inheritance`, `view-inheritance`, `module-graph`.
- `target`: modèle, vue ou module selon le type.
- `scope`: `odoo`, `enterprise`, `project` ou `live`.
- `description`: description libre pour `flow`.
- `max_nodes`: défaut 25, maximum 60.

## Pièges
- Mermaid n'est pas une preuve : citer aussi les sources si le diagramme découle d'un audit.
- Un diagramme trop dense doit être découpé par sous-domaine.
- Ne pas produire de "spaghetti diagram" : si plus de 12 cartes ou si plusieurs branches se croisent, regrouper en sous-graphes ou simplifier.
- Ne pas multiplier les labels sur les liens ; nommer les cartes de manière assez claire pour que les liens puissent rester simples.

## Combinaisons
- `inspect_module_graph` pour un audit plus détaillé du module.
- `odoo_inspect_view` avant un diagnostic précis de vue.
- `output_report_writer` si le diagramme doit intégrer un livrable formel.

## Critères de réponse
- Fournir le bloc Mermaid, puis une légende courte et les limites de périmètre.
- Le bloc Mermaid doit être présentable directement à un client : titres visibles, espacement lisible, cartes homogènes, pas de liaisons courbes ou retours arrière inutiles.
