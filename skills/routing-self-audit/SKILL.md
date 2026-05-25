---
name: routing_self_audit
aliases: [audit_routing, routing_audit]
label: Audit routage IA
label_en: Routing self-audit
kind: tool
group: core
builtin: true
read_only: true
risk_level: low
description: "Auditer la qualité du routage du dispatcher sur les derniers tours enregistrés (~/.odoo-consultant/routing-feedback.jsonl) : taux de reformulation, taux de confiance basse, skills les plus impliqués dans des reformulations, répartition par agent. À utiliser quand l'utilisateur demande « audite ton routage », « combien de fois tu te trompes », « quels skills posent problème ». Ne pas utiliser pour expliquer le tour précédent (utiliser routing_explain) ni pour modifier le dispatcher."
description_en: "Audit dispatcher routing quality across the recently logged turns (~/.odoo-consultant/routing-feedback.jsonl): reformulation rate, low-confidence rate, skills most involved in reformulations, per-agent split. Use when the user asks 'audit your routing', 'how often do you get it wrong', 'which skills are noisy'. Do not use to explain the previous turn (use routing_explain) or to change the dispatcher."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration, creator]
keywords: [audit routage, audit routing, qualité routage, qualité du routage, qualite du routage, routing quality, reformulation rate, taux de reformulation, skills problématiques, mauvais routage, debug routing global, audite, audit ia, audit du routage, audite ton routage, audite le routage, audit la qualité]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/routing-self-audit/scripts/handler.py
allow_implicit_invocation: true
---

## routing_self_audit (méta-skill)

Lit le log JSONL local de feedback de routage et produit un rapport agrégé en Markdown.

## Quand l'utiliser
- L'utilisateur demande un audit / un bilan de la qualité du routage.
- Tu veux pointer des skills systématiquement mal routés (suivi qualité).

## Quand NE PAS l'utiliser
- Pour expliquer le tour précédent → `routing_explain`.
- Pour modifier les règles du dispatcher → c'est un audit, pas un éditeur.

## Sortie
- Nombre d'entrées analysées, période couverte.
- Taux de reformulation, taux de confiance basse.
- Top skills présents dans des tours reformulés.
- Répartition par agent.
