---
name: routing_explain
aliases: [explain_routing, why_skill, pourquoi_skill]
label: Expliquer le routage
label_en: Explain routing
kind: tool
group: core
builtin: true
read_only: true
risk_level: low
description: "Expliquer pourquoi tel skill ou tel agent a été choisi au tour précédent : retourne le détail scoré du dispatcher (candidats, scores, raisons, niveau de confiance, signaux sémantiques). À utiliser quand l'utilisateur demande « pourquoi tu as utilisé tel outil », « comment tu as routé », « pourquoi cet agent », « décris ton raisonnement de routage ». Ne pas utiliser pour lancer un skill, pour modifier le routage, ou pour analyser la réponse elle-même."
description_en: "Explain why a given skill or agent was selected on the previous turn: returns the scored dispatcher decision (candidates, scores, reasons, confidence level, semantic signals). Use when the user asks 'why did you use that tool', 'how did you route this', 'why this agent', 'describe your routing'. Do not use to run a skill, to change the routing, or to analyse the answer itself."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [pourquoi ce skill, pourquoi cet outil, expliquer le routage, explique le routage, explique ton routage, explique ton routage de skills, why this skill, why this tool, explain routing, comment tu as choisi, how did you choose, ton raisonnement de routage, debug routing, candidats de routage, montre tes candidats, routing candidates]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/routing-explain/scripts/handler.py
allow_implicit_invocation: true
---

## routing_explain (méta-skill)

Auto-documente le dispatcher : restitue, pour le tour précédent, la liste triée des candidats avec leurs scores, leurs raisons, le niveau de confiance, et les éventuels signaux du semantic fallback.

## Quand l'utiliser
- L'utilisateur demande pourquoi tel outil a été appelé, ou pourquoi tel agent a été choisi.
- L'utilisateur veut comprendre/déboguer un routage qui lui paraît surprenant.
- L'utilisateur demande « décris ton raisonnement de routage » ou « montre tes candidats ».

## Quand NE PAS l'utiliser
- Pour exécuter un skill différent — utiliser le skill cible directement.
- Pour modifier le routage — passer par le toggle UI ou par un prompt explicite « comme un <agent> ».
- Pour analyser le contenu de la réponse précédente — ce n'est pas un skill de relecture.

## Sortie
- Tableau Markdown des candidats triés par score décroissant.
- Niveau de confiance global (`high`, `medium`, `low`) et top score.
- Liste des skills effectivement injectés au prompt.
- Mention explicite des hits semantic-fallback éventuels (avec cosinus).
