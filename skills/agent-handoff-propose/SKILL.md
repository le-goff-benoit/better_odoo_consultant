---
name: agent_handoff_propose
aliases: [propose_handoff, suggest_agent_switch]
label: Proposer un handoff d'agent
label_en: Propose agent handoff
kind: tool
group: core
builtin: true
read_only: true
risk_level: low
description: "Proposer formellement à l'utilisateur de basculer vers un autre agent (support, business_analyst, architect, developer) quand la question franchit une frontière de phase métier : cadrage fonctionnel terminé → architecture, architecture validée → développement, support stabilisé → analyse fonctionnelle. Retourne une suggestion structurée que le frontend rend en chip cliquable. À utiliser quand l'agent courant a terminé sa phase et que la suite relève clairement d'un autre rôle. Ne pas utiliser pour changer d'agent silencieusement — le switch reste opt-in côté utilisateur."
description_en: "Formally propose switching to another agent (support, business_analyst, architect, developer) when the conversation crosses a phase boundary: functional scoping done → architecture, architecture validated → development, support stabilised → functional analysis. Returns a structured suggestion the frontend renders as a clickable chip. Use when the current agent has wrapped up its phase and the next step clearly belongs to another role. Do not use to silently switch agents — the switch stays opt-in for the user."
requirement: Aucun
requirement_en: None
version: "1.0.0"
author: Le Goff Benoît - Camptocamp SA
modes: [assistant, migration]
keywords: [handoff, passer la main, changer d'agent, switch agent, autre rôle, autre agent, phase suivante, next phase, transition, déléguer]
permissions:
  filesystem: read
  network: false
  scripts: true
  odoo: none
code_path: skills/agent-handoff-propose/scripts/handler.py
allow_implicit_invocation: true
---

## agent_handoff_propose (méta-skill)

Émet une **proposition** de bascule vers un autre agent. Le handoff lui-même se produit côté utilisateur via le chip dans `ActionProposals` — jamais en silence.

## Quand l'utiliser
- L'agent courant a livré sa partie (cadrage BA terminé, ADR architect signé, fix support stabilisé) et la suite naturelle est d'un autre rôle.
- L'utilisateur formule « maintenant comment je le code », « passe à l'archi », « bascule en mode dev ».
- En fin de turn, quand le contenu produit franchit clairement la frontière du rôle courant.

## Quand NE PAS l'utiliser
- Pour changer la perspective immédiate de la **réponse** en cours — ce skill ne modifie pas le tour courant.
- Pour proposer un handoff vers un agent absent du registre — la validation refusera.
- Pour une demande mixte qui doit rester sur un seul agent.

## Validation
- Le skill vérifie que la cible existe dans le registre agents.
- Si `handoff_can_handoff_to` est déclaré sur l'agent source, seules les cibles listées sont acceptées ; sinon toutes les cibles existantes sont permises (compat ascendante).

## Sortie
- `markdown` : phrase utilisateur en FR ou EN proposant le switch.
- `handoff` : objet structuré `{from, to, to_label, reason}` consommable par le frontend pour générer une chip.
