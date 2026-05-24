---
name: output_report_writer
aliases: [report_writer]
label: Rédacteur de rapports
label_en: Report writer
kind: core
group: core
builtin: true
locked: true
allow_implicit_invocation: false
read_only: true
risk_level: low
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [reporting, output, format]
description: "Produire un livrable consultant structuré dans un template stable : revue technique de module, plan de migration, email client, cahier des charges fonctionnel, spécification, audit de code. Utiliser quand l'utilisateur demande explicitement un document formaté à remettre. Ne pas utiliser pour une réponse conversationnelle courte, une simple synthèse Markdown ou une entrée changelog issue d'un commit (source_show_commit)."
description_en: "Produce a structured consultant deliverable in a stable template: module technical review, migration plan, client email, functional spec, code audit. Use when the user explicitly asks for a formatted document to hand over. Do not use for short conversational answers, plain Markdown summaries or a changelog entry derived from a commit (source_show_commit)."
requirement: Aucun
requirement_en: None
modes: [assistant, migration, creator]
keywords: [rapport, report, revue, review, email, client, plan de migration, migration plan, cahier des charges, spec, spécification]
permissions:
  filesystem: read
  network: false
  scripts: false
  odoo: none
templates:
  - name: technical_review
    label: Revue technique
    triggers: [revue technique, code review, audit, audit de code, review module]
  - name: migration_plan
    label: Plan de migration
    triggers: [plan de migration, migration plan, plan migration, upgrade plan]
  - name: client_email
    label: Email client
    triggers: [email client, mail client, écrire au client, draft client]
  - name: functional_spec
    label: Cahier des charges fonctionnel
    triggers: [cahier des charges, spec fonctionnelle, functional spec, spécification fonctionnelle]
references_on_demand: true
code_path: backend/services/context_service.py
---

## Purpose

Tu écris des livrables structurés pour un consultant Odoo : revue technique, plan de migration, email client, cahier des charges fonctionnel. Sans ce skill, chaque sortie improvise sa propre structure — illisible quand on compare plusieurs livrables.

## Procedure

1. Détecte le type de livrable demandé via les mots-clés du prompt.
2. Charge le template correspondant (`load_skill_reference("output_report_writer", "templates/<name>.md")` si pas déjà injecté).
3. Charge `references/writing_guidelines.md` si tu n'es pas sûr du ton (chargement à la demande).
4. Remplis le template à la lettre — n'ajoute pas de section, n'en retire pas.
5. Préfère les exemples concrets et les phrases courtes (cf. `examples/good_review.md`).

## Output format

Suis exactement le template sélectionné. Le titre, l'ordre des sections et leur intitulé sont prescriptifs.

## When NOT to use

- Conversation rapide question/réponse — pas besoin d'imposer un format.
- L'utilisateur demande explicitement un format libre (« en quelques lignes », « informel »).

## Déclencheurs
- Rapport, revue, email client, plan de migration, cahier des charges, spécification.

## Séquence recommandée
1. Choisir le template déclenché par le prompt.
2. Charger les références d'écriture seulement si le ton est incertain.
3. Remplir les sections sans changer l'ordre.

## Paramètres
- Template sélectionné, audience, faits vérifiés issus des autres skills.

## Pièges
- Ne pas imposer un template à une réponse courte.
- Ne pas remplir avec des hypothèses non marquées.

## Combinaisons
- Tous les skills de preuve en amont : données live, source, sécurité, migration.

## Critères de réponse
- Document structuré, directement partageable, avec faits/hypothèses/actions séparés.
