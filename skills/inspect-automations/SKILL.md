---
name: inspect_automations
aliases: [audit_automations, inspect_cron]
label: Auditer les automatismes
label_en: Inspect automations
kind: tool
group: live
builtin: false
read_only: true
risk_level: low
description: "Auditer les automatismes serveur d'une instance Odoo connectée : crons ir.cron, actions automatisées base.automation, actions serveur ir.actions.server et templates mail. Filtrer par module, modèle ou actifs seulement, avec origine XML-ID. Ne pas utiliser pour lister des records métier génériques (odoo_query_records) ni pour les personnalisations Studio globales (odoo_inspect_studio)."
description_en: "Audit server-side automations on a connected Odoo instance: ir.cron jobs, base.automation automated actions, ir.actions.server records and mail templates. Filter by module, model or active records only, with XML-ID origin. Do not use for generic business record listing (odoo_query_records) or broad Studio customization inventory (odoo_inspect_studio)."
requirement: Connexion Odoo active
requirement_en: Active Odoo connection
modes: [assistant, migration]
keywords: [cron, automation, automatisation, automated action, server action, action serveur, mail template, template mail, scheduled, planifié, planifie, base.automation, ir.cron, ir.actions.server]
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
tags: [odoo, live-data, automation, audit]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: read
code_path: skills/inspect-automations/scripts/handler.py
references_auto_load:
  - file: automation_types.md
    triggers: [cron, automation, action serveur, server action]
---

## Principes communs
- Skill en lecture seule : il inventorie les automatismes visibles avec les droits de connexion.
- Signaler `active_only`, `module` et `model` utilisés.
- Le code Python embarqué est tronqué pour éviter d'injecter trop de contexte.

## inspect_automations
Utilise `inspect_automations` pour obtenir une vue unifiée des crons, automatisations, actions serveur et templates mail.

## Quand l'utiliser
- L'utilisateur demande quels crons ou actions automatisées tournent.
- Tu audites un modèle avant migration ou diagnostic.
- Tu dois savoir si un comportement vient d'une action serveur ou d'un template.

## Bonnes pratiques
- Filtre par `model` dès qu'un modèle est mentionné.
- Filtre par `module` quand l'utilisateur cible CRM, sale, account ou un module custom.
- Pour Studio au sens large, combine avec `odoo_inspect_studio`.

## Déclencheurs
- "Quels crons", "actions serveur", "base.automation", "template mail", "automatisations planifiées".

## Paramètres
- `kind`: `cron`, `automation`, `server_action`, `mail_template` ou `all`.
- `module`: module d'origine via `ir.model.data.module`.
- `model`: modèle cible exact, par exemple `sale.order`.
- `active_only`: vrai par défaut.

## Pièges
- Un record sans XML-ID est probablement custom ou créé manuellement.
- Les droits d'accès peuvent masquer certains automatismes.

## Combinaisons
- `odoo_inspect_studio` pour compléter par les personnalisations Studio.
- `odoo_query_records` si un automatisme référence des records métier précis à vérifier.

## Critères de réponse
- Restituer un tableau par type avec nom, modèle, état, origine module et prochain déclenchement quand disponible.
