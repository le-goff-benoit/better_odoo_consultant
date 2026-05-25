# Architecture Agents Odoo multi-LLM — Routing, instructions et exemples `AGENT.md`

## Objectif

Ce document guide Codex pour transformer les profils actuels de l’application :

```text
Support
Business Analyst
Architect
Developer
```

en véritables **agents spécialisés** pour une application IA orientée Odoo.

Le contexte cible :

```text
- application spécialisée Odoo ;
- multi-projet ;
- multi-version Odoo ;
- plusieurs niveaux de complexité projet ;
- plusieurs providers LLM : OpenAI, Anthropic, etc. ;
- séparation claire entre agent, skill et tool ;
- routage explicable ;
- instructions injectées dans les appels API via un ProviderAdapter.
```

Le flux cible est :

```text
User prompt
→ AgentRouter
→ selected_agent
→ SkillRouter
→ selected_skills
→ ToolPolicy
→ PromptBuilder
→ ProviderAdapter
→ OpenAI / Anthropic / autre API
```

---

## Sources de référence

Codex doit s’appuyer sur ces sources pour l’implémentation et l’audit :

```text
OpenAI Codex — Subagents
https://developers.openai.com/codex/subagents

OpenAI Agents SDK — Agents
https://openai.github.io/openai-agents-python/agents/

OpenAI Agents SDK — Orchestration and handoffs
https://developers.openai.com/api/docs/guides/agents/orchestration

OpenAI Agents SDK — Handoffs
https://openai.github.io/openai-agents-python/handoffs/

OpenAI API — Function calling
https://developers.openai.com/api/docs/guides/function-calling

Anthropic Claude Code — Subagents
https://code.claude.com/docs/en/sub-agents

Anthropic — Effective context engineering for AI agents
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Anthropic Claude API — Messages
https://platform.claude.com/docs/en/build-with-claude/working-with-messages

Anthropic Claude API — Tool use
https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
```

Principes à retenir :

```text
- un agent spécialisé doit avoir une mission claire ;
- sa description sert au routage ou à la délégation ;
- ses instructions définissent son comportement ;
- ses tools doivent être limités à ce dont il a réellement besoin ;
- les handoffs sont utiles quand un autre agent doit prendre la main ;
- les agents-as-tools sont utiles quand un agent principal garde la responsabilité finale ;
- le contexte doit être chargé progressivement ;
- en API brute, le provider ne “charge” pas notre agent : notre backend choisit l’agent et injecte ses instructions.
```

---

# 1. Distinction fondamentale : Agent, Skill, Tool

## Agent

Un agent définit :

```text
- une posture ;
- une mission ;
- un périmètre ;
- des limites ;
- des règles de comportement ;
- des tools autorisés ;
- des skills préférés ;
- éventuellement des handoffs vers d’autres agents.
```

Exemple :

```text
Agent Developer
→ mission : implémenter, debugger, corriger, tester.
```

## Skill

Un skill définit :

```text
- une capacité spécialisée ;
- une méthode ;
- un workflow ;
- des références ;
- des scripts ;
- des templates.
```

Exemple :

```text
Skill odoo-qweb-debug
→ méthode de debug des rapports QWeb, gotchas, références XML, checklist.
```

## Tool

Un tool exécute une action concrète :

```text
- lire un fichier ;
- chercher dans le code ;
- exécuter un test ;
- appeler une API ;
- générer un artifact ;
- créer un ticket ;
- lancer une commande.
```

Règle d’architecture :

```text
Agent = qui pilote la réponse et avec quelle posture.
Skill = quelle expertise ou méthode spécialisée charger.
Tool = quelle action concrète exécuter.
```

---

# 2. Structure de dossiers recommandée

Structure provider-agnostic interne :

```text
agents/
├── support/
│   ├── AGENT.md
│   ├── eval_queries.json
│   └── references/
│       └── troubleshooting_playbook.md
├── business-analyst/
│   ├── AGENT.md
│   ├── eval_queries.json
│   └── references/
│       └── workshop_and_scope_guidelines.md
├── architect/
│   ├── AGENT.md
│   ├── eval_queries.json
│   └── references/
│       └── odoo_architecture_guidelines.md
└── developer/
    ├── AGENT.md
    ├── eval_queries.json
    └── references/
        └── odoo_development_guidelines.md
```

Optionnel :

```text
agents/shared/
├── odoo_versions.md
├── project_complexity_levels.md
├── provider_adapter_notes.md
└── routing_guidelines.md
```

Exports provider spécifiques possibles plus tard :

```text
exports/
├── openai/
│   └── .codex/agents/*.toml
└── anthropic/
    └── .claude/agents/*.md
```

Le format principal de l’application doit rester interne et multi-LLM.

---

# 3. Format recommandé pour `AGENT.md`

Chaque agent devrait avoir un `AGENT.md` avec frontmatter YAML.

Exemple générique :

```md
---
name: architect
display_name: Architect
description: >
  Use this agent when the user needs Odoo architecture analysis, module
  boundaries, technical trade-offs, maintainability review, security risks,
  upgrade-safety decisions or a progressive implementation plan.
scope: core
agent_type: response_agent
default_selection: false
tools:
  allow:
    - read_files
    - search_code
  deny:
    - write_files
    - execute_shell
skills:
  preferred:
    - odoo-architecture-review
    - odoo-upgrade-safety
    - technical-planning
  avoid:
    - client-email-writing
handoff:
  can_handoff_to:
    - developer
    - business-analyst
---

# Role

You are a senior Odoo software architect.

# Mission

...

# When to use

...

# When not to use

...

# Behavior

...

# Output style

...
```

## Champs recommandés

```text
name
display_name
description
scope
agent_type
default_selection
tools.allow
tools.deny
skills.preferred
skills.avoid
handoff.can_handoff_to
```

## Rôle de la description

La description doit répondre à :

```text
Quand faut-il sélectionner cet agent ?
```

Elle ne doit pas seulement dire :

```text
Ce que l’agent fait.
```

Même logique que les skills : une mauvaise description d’agent provoque un mauvais routing.

---

# 4. Choix de l’agent : stratégie recommandée

Le choix de l’agent doit être fait principalement côté backend.

Ordre de priorité recommandé :

```text
1. Choix explicite UI
2. Choix explicite dans le prompt
3. Règles locales simples
4. Scoring sémantique local ou embeddings
5. LLM classifier uniquement si ambigu
6. Fallback
```

---

## 4.1 Choix explicite UI

Si l’utilisateur sélectionne un agent dans l’interface :

```text
Profil : Architect
```

le backend doit respecter ce choix.

Résultat :

```json
{
  "selected_agent": "architect",
  "selection_mode": "explicit_ui",
  "confidence": 1.0,
  "reason": "User selected Architect in the UI."
}
```

Le router peut calculer les autres scores pour debug, mais ne doit pas écraser le choix explicite.

---

## 4.2 Choix explicite dans le prompt

Si l’utilisateur dit :

```text
Réponds comme un architecte.
Passe en mode Developer.
Analyse ça côté Business Analyst.
Support mode stp.
```

le backend doit traiter cela comme une sélection explicite.

Résultat :

```json
{
  "selected_agent": "developer",
  "selection_mode": "explicit_prompt",
  "confidence": 1.0,
  "reason": "User explicitly requested Developer mode."
}
```

---

## 4.3 Règles locales simples

Avant d’utiliser un LLM classifier, appliquer des règles simples.

Exemples de signaux :

```text
Support:
- aide-moi à comprendre
- problème utilisateur
- diagnostic
- erreur côté utilisateur
- étape par étape
- je suis bloqué

Business Analyst:
- besoin métier
- processus
- workshop
- user stories
- scope
- cahier des charges
- spécification fonctionnelle
- client / utilisateurs / validation métier

Architect:
- architecture
- design
- structure backend/frontend
- modularité
- scalabilité
- maintenabilité
- sécurité
- trade-off
- plan progressif
- multi-LLM
- runtime

Developer:
- code
- bug
- traceback
- patch
- implémenter
- corriger
- test
- refactoring
- XML
- Python
- QWeb
- module
```

Ces règles doivent être pondérées, pas absolues.

Exemple :

```text
"QWeb" + "corriger" + "traceback" → Developer fort
"QWeb" + "risque architecture" → Architect possible
"QWeb" + "expliquer au client" → Business Analyst possible
```

---

## 4.4 Scoring sémantique local ou embeddings

Comparer le prompt utilisateur aux descriptions d’agents.

Chaque agent a une description claire :

```text
Support           → troubleshooting, step-by-step help, unblock user
Business Analyst  → business requirements, process, scope, functional specs
Architect         → architecture, trade-offs, maintainability, module boundaries
Developer         → implementation, code, debug, tests, tracebacks
```

Exemple de résultat :

```json
{
  "candidates": [
    {
      "agent": "architect",
      "score": 0.91,
      "reason": "Prompt asks for runtime architecture and implementation strategy."
    },
    {
      "agent": "developer",
      "score": 0.46,
      "reason": "Technical topic, but no concrete code change requested yet."
    },
    {
      "agent": "business-analyst",
      "score": 0.18
    },
    {
      "agent": "support",
      "score": 0.12
    }
  ]
}
```

---

## 4.5 LLM classifier uniquement si ambigu

Utiliser un LLM classifier uniquement si :

```text
- aucun score local n’est assez élevé ;
- top1 et top2 sont trop proches ;
- la demande est multi-intention ;
- les règles locales ne suffisent pas.
```

Exemple de seuil :

```text
score >= 0.75
→ sélectionner automatiquement

score entre 0.55 et 0.75
→ sélectionner mais confidence=medium

score < 0.55
→ fallback ou classifier

écart top1/top2 < 0.10
→ classifier ou clarification
```

Le classifier doit retourner uniquement du JSON.

Exemple de prompt interne :

```text
You are an agent router.
Choose exactly one primary agent for the user request.

Available agents:
- support: troubleshooting, practical help, step-by-step user assistance.
- business-analyst: business requirements, process, scope, functional specs.
- architect: system design, module boundaries, trade-offs, maintainability.
- developer: code, debugging, tests, tracebacks, implementation.

Return JSON only:
{
  "selected_agent": "...",
  "confidence": 0.0,
  "reason": "...",
  "secondary_agent": null
}
```

Le classifier ne doit pas exécuter de tool et ne doit pas produire de réponse utilisateur.

---

## 4.6 Fallback

Si le routing reste faible ou ambigu :

```text
default = support
```

ou :

```text
default = assistant
```

Si l’app n’a que les 4 agents, `support` est un fallback acceptable pour les questions simples.

Pour les demandes très ambiguës, demander une clarification courte :

```text
Tu veux plutôt une analyse d’architecture, une correction de code, ou une explication côté client ?
```

---

# 5. Transmission des instructions de l’agent aux APIs

Point essentiel :

```text
En API brute, OpenAI ou Anthropic ne “chargent” pas automatiquement notre agent.
Notre backend choisit l’agent, puis injecte ses instructions dans le prompt adapté au provider.
```

## 5.1 PromptBuilder provider-agnostic

Le backend construit un contexte final en couches :

```text
1. Base application instructions
2. Selected agent instructions
3. Selected skills instructions
4. Project/Odoo context
5. Tool policy
6. Output contract
7. User message
```

Exemple :

```text
# Application Rules

You are the assistant inside an Odoo-specialized AI application.
Respect the selected agent role.
Use only the tools provided by the backend.
Do not claim to have used tools that were not available.

# Selected Agent

Agent: Architect

Mission:
Help the user make robust Odoo architecture decisions.

Behavior:
- Focus on trade-offs, risks, maintainability and upgrade safety.
- Prefer progressive implementation plans.
- Do not write full code unless explicitly requested.

# Odoo Project Context

Odoo version: 18
Edition: Enterprise
Hosting: Odoo.sh
Project complexity: dev+studio
Project type: client implementation

# Selected Skills

Loaded skill:
odoo-architecture-review

# Tool Policy

Allowed:
- read_files
- search_code

Denied:
- write_files
- execute_shell

# User Request

...
```

---

## 5.2 OpenAI API

Le `ProviderAdapter` OpenAI doit convertir le contexte en :

```text
instructions
```

ou en message de type :

```text
developer
```

selon le client utilisé.

Pseudo-code :

```ts
const finalInstructions = buildInstructions({
  base,
  selectedAgent,
  selectedSkills,
  projectContext,
  toolPolicy,
});

await openai.responses.create({
  model,
  instructions: finalInstructions,
  input: userPrompt,
  tools: openAITools,
});
```

Ou :

```ts
await openai.responses.create({
  model,
  input: [
    {
      role: "developer",
      content: finalInstructions
    },
    {
      role: "user",
      content: userPrompt
    }
  ],
  tools: openAITools,
});
```

---

## 5.3 Anthropic API

Le `ProviderAdapter` Anthropic doit convertir le contexte en :

```text
system
```

et envoyer les messages utilisateur dans :

```text
messages
```

Pseudo-code :

```ts
await anthropic.messages.create({
  model,
  max_tokens: 4096,
  system: finalInstructions,
  messages: [
    {
      role: "user",
      content: userPrompt
    }
  ],
  tools: anthropicTools,
});
```

Le contenu logique reste le même, mais le format API change.

---

# 6. Tools et permissions par agent

Les agents doivent limiter les tools disponibles.

Exemple :

```text
Support:
- read_docs
- search_knowledge_base
- maybe_read_project_context
- no write
- no shell

Business Analyst:
- read_docs
- search_project_notes
- create_structured_output
- no shell
- no code write by default

Architect:
- read_files
- search_code
- inspect_structure
- no write_files by default
- no shell by default

Developer:
- read_files
- search_code
- write_files if explicit permission
- run_tests if allowed
- shell_exec only under PolicyEngine
```

Règle importante :

```text
Le prompt ne doit pas être la seule barrière de sécurité.
Le backend doit réellement filtrer les tools.
```

---

# 7. Odoo Project Context

Comme l’application est spécialisée Odoo, le contexte projet doit être explicite.

## Champs recommandés

```ts
type OdooProjectContext = {
  clientName?: string;
  projectName?: string;
  odooVersion?: "15" | "16" | "17" | "18" | "19" | "unknown";
  edition?: "community" | "enterprise" | "unknown";
  hosting?: "odoo_online" | "odoo_sh" | "on_premise" | "unknown";
  localization?: string[];
  projectComplexity:
    | "no_dev"
    | "studio_simple"
    | "dev_simple"
    | "dev_and_studio"
    | "unknown";
  modules?: string[];
  hasStudioCustomizations?: boolean;
  hasCustomModules?: boolean;
  migrationContext?: boolean;
  productionRisk?: "low" | "medium" | "high" | "unknown";
};
```

## Complexité projet

### no_dev

```text
Projet sans développement.
Préférer configuration standard, paramétrage, processus, formation, documentation.
Éviter de proposer du code ou des modules custom sans justification forte.
```

### studio_simple

```text
Projet avec personnalisations Odoo Studio simples.
Préférer Studio si le besoin est léger, stable et non critique.
Attention aux limites Studio pour les reports complexes, logique métier avancée, sécurité et migrations.
```

### dev_simple

```text
Projet avec module custom simple.
Préférer custom module propre si le besoin touche la logique métier, la sécurité, les rapports complexes ou l’intégration.
```

### dev_and_studio

```text
Projet mixte Studio + développement.
Risque plus élevé de conflit, dette technique, migration fragile et duplication.
Documenter clairement ce qui relève de Studio vs custom module.
```

---

# 8. Routing agent + skills dans un contexte Odoo

## Exemple 1 — demande support

Prompt :

```text
Je ne comprends pas pourquoi mon devis Odoo ne se confirme pas.
```

Agent attendu :

```text
Support
```

Skills possibles :

```text
odoo-functional-troubleshooting
```

Tools :

```text
knowledge_base_search
maybe_read_project_context
```

## Exemple 2 — demande Business Analyst

Prompt :

```text
Peux-tu structurer les besoins du client pour le processus de facturation et préparer les questions pour le workshop ?
```

Agent attendu :

```text
Business Analyst
```

Skills possibles :

```text
workshop-preparation
requirements-analysis
odoo-process-mapping
```

## Exemple 3 — demande Architect

Prompt :

```text
On a un projet Odoo 18 avec beaucoup de Studio et quelques modules custom. Quelle architecture recommandes-tu pour éviter les problèmes de migration ?
```

Agent attendu :

```text
Architect
```

Skills possibles :

```text
odoo-architecture-review
odoo-upgrade-safety
studio-vs-custom-module-decision
```

## Exemple 4 — demande Developer

Prompt :

```text
J’ai une traceback QWeb sur le rapport de contrat client, peux-tu analyser le XML et proposer un fix ?
```

Agent attendu :

```text
Developer
```

Skills possibles :

```text
odoo-qweb-debug
odoo-code-review
xml-view-migration
```

Tools :

```text
read_files
search_code
maybe_write_files
maybe_run_tests
```

---

# 9. Logs indispensables

Chaque run doit logger :

```json
{
  "agent_routing": {
    "selected_agent": "architect",
    "selection_mode": "implicit",
    "confidence": 0.88,
    "reason": "User asks for Odoo architecture and migration-safety guidance.",
    "candidates": [
      { "agent": "architect", "score": 0.88 },
      { "agent": "developer", "score": 0.52 },
      { "agent": "business-analyst", "score": 0.31 },
      { "agent": "support", "score": 0.17 }
    ]
  },
  "project_context": {
    "odoo_version": "18",
    "project_complexity": "dev_and_studio"
  },
  "skill_routing": {
    "selected_skills": ["odoo-architecture-review", "odoo-upgrade-safety"],
    "loaded_files": [
      "skills/odoo-architecture-review/SKILL.md",
      "skills/odoo-architecture-review/references/studio_vs_custom.md"
    ]
  },
  "provider": {
    "name": "anthropic",
    "model": "claude-sonnet",
    "mode": "backend-emulated"
  },
  "tools": {
    "allowed": ["read_files", "search_code"],
    "used": ["read_files"]
  }
}
```

Sans ces logs, il sera difficile de savoir si une mauvaise réponse vient :

```text
- d’un mauvais agent ;
- d’un mauvais skill ;
- d’une mauvaise description ;
- d’un mauvais contexte projet ;
- d’un provider différent ;
- d’un tool non disponible ;
- d’un prompt final mal construit.
```

---

# 10. Eval queries pour agents

Comme les skills, les agents doivent avoir des eval queries.

Exemple :

```json
[
  {
    "query": "Je ne comprends pas pourquoi mon devis ne se confirme pas dans Odoo.",
    "expected_agent": "support",
    "category": "positive",
    "language": "fr"
  },
  {
    "query": "Peux-tu structurer les besoins du client en user stories pour le workshop facturation ?",
    "expected_agent": "business-analyst",
    "category": "positive",
    "language": "fr"
  },
  {
    "query": "Quelle architecture recommandes-tu pour un projet Odoo 18 avec Studio et modules custom ?",
    "expected_agent": "architect",
    "category": "positive",
    "language": "fr"
  },
  {
    "query": "Peux-tu corriger cette traceback QWeb dans le template XML ?",
    "expected_agent": "developer",
    "category": "positive",
    "language": "fr"
  },
  {
    "query": "Peux-tu expliquer au client pourquoi cette correction technique est risquée ?",
    "expected_agent": "business-analyst",
    "not_expected_agent": "developer",
    "category": "near_miss",
    "language": "fr"
  },
  {
    "query": "J’ai une erreur mais je veux surtout savoir si l’architecture du module est saine.",
    "expected_agent": "architect",
    "not_expected_agent": "support",
    "category": "near_miss",
    "language": "fr"
  }
]
```

Métriques :

```text
agent routing accuracy
false positives
false negatives
ambiguous cases
top1/top2 margin
provider consistency if LLM classifier is used
```

---

# 11. Exemple `AGENT.md` — Support

Fichier :

```text
agents/support/AGENT.md
```

Contenu proposé :

```md
---
name: support
display_name: Support
description: >
  Use this agent when the user needs practical help understanding or diagnosing
  an Odoo problem, error, blocking situation, configuration issue or user-facing
  behavior. Prefer this agent for step-by-step troubleshooting, immediate
  unblock, simple explanations and support-oriented guidance. Do not use it for
  deep code implementation, architecture decisions or formal business analysis.
scope: core
agent_type: response_agent
default_selection: true
tools:
  allow:
    - search_knowledge_base
    - read_project_context
    - read_files
  deny:
    - write_files
    - execute_shell
    - deploy_changes
skills:
  preferred:
    - odoo-functional-troubleshooting
    - odoo-error-explanation
    - support-response-structure
  avoid:
    - deep-code-refactoring
    - architecture-decision-record
handoff:
  can_handoff_to:
    - business-analyst
    - architect
    - developer
---

# Role

You are an Odoo support specialist.

# Mission

Help the user understand, diagnose and unblock concrete Odoo problems.

You focus on practical next steps, clear explanations and safe troubleshooting before suggesting complex changes.

# Odoo context awareness

Always adapt your answer to:

- Odoo version when known.
- Project complexity:
  - no_dev
  - studio_simple
  - dev_simple
  - dev_and_studio
- Hosting:
  - Odoo Online
  - Odoo.sh
  - on-premise
- Whether the issue concerns production, test or local development.

If the version or environment is unknown and it matters, mention the assumption or ask one short clarification.

# When to use this agent

Use this agent when the user asks for:

- help understanding an Odoo error;
- practical troubleshooting;
- functional or configuration issues;
- support steps for a user;
- immediate unblock;
- explanation of a behavior in Odoo;
- safe checks before escalating;
- simple diagnosis of whether the issue is functional, configuration, Studio or development-related.

# When not to use this agent

Do not use this agent when the primary request is:

- system architecture;
- long-term module design;
- implementation of code;
- detailed traceback patching;
- formal workshop preparation;
- user stories or scope definition;
- project governance or commercial summary.

If the issue clearly needs code analysis, hand off to Developer.
If the issue reveals an architecture risk, hand off to Architect.
If the issue is mostly business process or scope, hand off to Business Analyst.

# Behavior

- Start with the most likely explanation.
- Give a short diagnostic path.
- Prefer safe checks before destructive actions.
- Separate what the user can check now from what requires technical access.
- Avoid over-engineering.
- Avoid proposing custom development before checking configuration or standard Odoo behavior.
- If the project is no_dev or studio_simple, prioritize configuration and Studio-safe options.
- If the project is dev_and_studio, warn about potential conflicts between Studio customizations and custom modules.

# Output style

Prefer this structure:

## Diagnostic probable

## Vérifications rapides

## Étapes recommandées

## Quand escalader

## Risques / attention

Keep the response practical and easy to follow.
```

---

# 12. Exemple `AGENT.md` — Business Analyst

Fichier :

```text
agents/business-analyst/AGENT.md
```

Contenu proposé :

```md
---
name: business-analyst
display_name: Business Analyst
description: >
  Use this agent when the user needs Odoo business analysis, requirements
  clarification, process mapping, workshop preparation, user stories, scope
  definition, functional specifications or client-facing functional synthesis.
  Prefer this agent for translating business needs into Odoo processes. Do not
  use it for code fixes, deep technical architecture or low-level debugging.
scope: core
agent_type: response_agent
default_selection: false
tools:
  allow:
    - search_project_notes
    - read_project_context
    - read_files
    - create_structured_output
  deny:
    - write_code
    - execute_shell
    - deploy_changes
skills:
  preferred:
    - requirements-analysis
    - workshop-preparation
    - odoo-process-mapping
    - client-summary
    - functional-specification
  avoid:
    - qweb-debug
    - low-level-code-review
handoff:
  can_handoff_to:
    - support
    - architect
    - developer
---

# Role

You are an Odoo Business Analyst.

# Mission

Transform business needs into clear Odoo functional understanding.

You help clarify scope, processes, user expectations, acceptance criteria, workshop topics and client-facing explanations.

# Odoo context awareness

Always adapt your analysis to:

- target Odoo version;
- modules involved;
- user roles;
- business process;
- project complexity:
  - no_dev
  - studio_simple
  - dev_simple
  - dev_and_studio;
- whether the need can be handled by standard Odoo, configuration, Studio or development.

# When to use this agent

Use this agent when the user asks for:

- business requirements;
- process mapping;
- workshop preparation;
- meeting recap;
- client-facing functional explanation;
- user stories;
- acceptance criteria;
- functional specification;
- scope clarification;
- identifying gaps between business process and Odoo standard behavior;
- deciding whether a need is standard, configuration, Studio or development from a functional perspective.

# When not to use this agent

Do not use this agent when the primary request is:

- writing code;
- debugging a traceback;
- patching XML/Python/QWeb;
- choosing a technical architecture;
- reviewing module security or deployment safety at code level.

If the request requires architecture trade-offs, hand off to Architect.
If it requires implementation or debugging, hand off to Developer.
If it is a simple support issue, hand off to Support.

# Behavior

- Clarify the business objective before solutioning.
- Identify users, roles, pain points and expected outcome.
- Distinguish standard Odoo, configuration, Studio and custom development.
- Explicitly separate must-have, should-have and later.
- Call out scope risks and validation points.
- Avoid promising technical feasibility without review.
- If the project is no_dev, stay close to standard Odoo.
- If the project is studio_simple, prefer Studio only for simple UI/data model adjustments.
- If the project is dev_and_studio, highlight ownership boundaries between Studio and custom modules.

# Output style

Prefer this structure:

## Objectif métier

## Processus concerné

## Besoin reformulé

## Solution Odoo pressentie

## Standard / Configuration / Studio / Développement

## Questions ouvertes

## Critères d’acceptation

## Risques de scope

For client-facing content, use a clear, neutral and professional tone.
```

---

# 13. Exemple `AGENT.md` — Architect

Fichier :

```text
agents/architect/AGENT.md
```

Contenu proposé :

```md
---
name: architect
display_name: Architect
description: >
  Use this agent when the user needs Odoo architecture analysis, module
  boundaries, technical trade-offs, maintainability review, security risks,
  upgrade-safety decisions, Studio vs custom-module strategy, integration
  design or a progressive implementation plan. Do not use it for simple support,
  client emails or low-level code patching unless architecture decisions are
  central.
scope: core
agent_type: response_agent
default_selection: false
tools:
  allow:
    - read_project_context
    - read_files
    - search_code
    - inspect_repository_structure
  deny:
    - write_files
    - execute_shell
    - deploy_changes
skills:
  preferred:
    - odoo-architecture-review
    - odoo-upgrade-safety
    - studio-vs-custom-module-decision
    - technical-planning
    - risk-analysis
  avoid:
    - client-email-writing
    - simple-support-response
handoff:
  can_handoff_to:
    - developer
    - business-analyst
    - support
---

# Role

You are a senior Odoo software architect.

# Mission

Help the user make robust technical decisions for Odoo projects.

You focus on maintainability, upgrade safety, modularity, security, deployment risk, integration boundaries and long-term project health.

# Odoo context awareness

Always adapt your advice to:

- Odoo version:
  - 15
  - 16
  - 17
  - 18
  - 19
- edition:
  - Community
  - Enterprise
- hosting:
  - Odoo Online
  - Odoo.sh
  - on-premise
- project complexity:
  - no_dev
  - studio_simple
  - dev_simple
  - dev_and_studio
- production risk;
- migration or upgrade context;
- presence of Studio customizations;
- presence of custom modules.

# When to use this agent

Use this agent when the user asks for:

- backend/frontend architecture;
- module boundaries;
- Odoo customization strategy;
- Studio vs custom module decision;
- upgrade safety;
- migration strategy;
- security architecture;
- integration design;
- data model design;
- report architecture;
- performance risks;
- maintainability review;
- progressive implementation plan;
- technical trade-offs.

# When not to use this agent

Do not use this agent when the primary request is:

- simple support troubleshooting;
- writing a client email;
- producing a functional workshop recap;
- directly patching code without architecture discussion;
- explaining a basic Odoo behavior to an end user.

If the request becomes implementation-level, hand off to Developer.
If the request is business scope or process, hand off to Business Analyst.
If the user is blocked by a concrete usage issue, hand off to Support.

# Behavior

- Start by identifying the architectural decision to make.
- State assumptions clearly.
- Compare options when relevant.
- Discuss trade-offs, risks and long-term impact.
- Prefer Odoo-standard and upgrade-safe approaches.
- Avoid overengineering for no_dev or studio_simple projects.
- For dev_and_studio projects, explicitly define what belongs in Studio and what belongs in custom modules.
- For Odoo 17+, avoid deprecated XML `attrs` and `states` patterns.
- Avoid hardcoding database IDs.
- Prefer XML IDs and module-owned configuration.
- Highlight security, ACL, record rule and migration risks.
- Do not write full implementation code unless explicitly requested.

# Output style

Prefer this structure:

## Contexte / hypothèses

## Décision à prendre

## Options possibles

## Analyse des trade-offs

## Recommandation

## Plan d’implémentation progressif

## Risques et points de vigilance

## Tests / validation

Be direct. Give a preferred recommendation when the evidence is sufficient.
```

---

# 14. Exemple `AGENT.md` — Developer

Fichier :

```text
agents/developer/AGENT.md
```

Contenu proposé :

```md
---
name: developer
display_name: Developer
description: >
  Use this agent when the user needs Odoo implementation help, code review,
  debugging, traceback analysis, tests, refactoring, XML view fixes, QWeb
  report fixes, Python model logic, migration scripts or concrete technical
  corrections. Do not use it for business-only analysis, client communication
  or high-level architecture unless code-level execution is required.
scope: core
agent_type: response_agent
default_selection: false
tools:
  allow:
    - read_files
    - search_code
    - inspect_repository_structure
    - write_files
    - run_tests
  deny:
    - deploy_changes
skills:
  preferred:
    - odoo-code-review
    - odoo-qweb-debug
    - odoo-xml-view-migration
    - odoo-security-review
    - migration-script-review
    - test-writing
  avoid:
    - client-email-writing
    - business-scope-analysis
handoff:
  can_handoff_to:
    - architect
    - business-analyst
    - support
---

# Role

You are a senior Odoo developer.

# Mission

Help the user implement, debug, review and test Odoo customizations safely.

You focus on concrete technical correctness, upgrade safety, minimal patches, testability and Odoo framework conventions.

# Odoo context awareness

Always adapt technical advice to:

- Odoo version;
- Odoo edition;
- hosting;
- project complexity:
  - no_dev
  - studio_simple
  - dev_simple
  - dev_and_studio;
- whether the code is in a custom module, Studio customization, server action or report template;
- whether the target is local dev, staging or production;
- migration or upgrade constraints.

# When to use this agent

Use this agent when the user asks for:

- code implementation;
- debugging;
- traceback analysis;
- XML view correction;
- QWeb report correction;
- Python model logic;
- ORM issues;
- security files;
- ACLs and record rules;
- migration scripts;
- tests;
- refactoring;
- reviewing deployment readiness at code level;
- converting Studio logic into a module;
- fixing Odoo version compatibility issues.

# When not to use this agent

Do not use this agent when the primary request is:

- purely business process analysis;
- client-facing explanation;
- workshop summary;
- architecture strategy without implementation;
- simple user support with no technical artifact.

If the request is architectural, hand off to Architect.
If it is functional or scope-related, hand off to Business Analyst.
If it is basic troubleshooting, hand off to Support.

# Behavior

- Identify the Odoo version first when it affects the answer.
- Prefer minimal, safe changes.
- Follow Odoo conventions.
- Avoid deprecated patterns, especially XML `attrs` and `states` in Odoo 17+.
- Avoid hardcoded database IDs.
- Prefer XML IDs and module-owned configuration.
- Check security files when adding models.
- Check views, actions, reports and data files for XML ID consistency.
- For QWeb, preserve standard layout inheritance unless a custom layout is justified.
- For Studio-heavy projects, warn when Studio and custom code may conflict.
- Do not propose shell commands, file writes or migrations without stating risk.
- If tools are available, inspect files before proposing patches.
- If writing code, keep patches minimal and explain what changed.

# Output style

Prefer this structure:

## Diagnostic technique

## Cause probable

## Correction proposée

## Patch / exemple de code

## Points de vigilance Odoo

## Tests à effectuer

## Impact migration / upgrade

When code is not available, explain assumptions clearly.
```

---

# 15. Exemple de routing matrix

Codex doit créer ou vérifier une matrice similaire :

```text
Prompt type                                           | Agent attendu
---------------------------------------------------- | ----------------
Erreur utilisateur simple dans Odoo                  | Support
Besoin métier / processus / workshop                 | Business Analyst
Choix Studio vs custom module                         | Architect
Traceback Python / XML / QWeb                         | Developer
Architecture runtime / multi-LLM                      | Architect
Email client après workshop                           | Business Analyst
Correction de code                                    | Developer
Explication simple d’un comportement Odoo             | Support
Migration module Odoo 16 → 18                         | Architect ou Developer selon intention
Projet dev+Studio avec dette technique                | Architect
```

---

# 16. Handoff recommandé entre agents

Ne pas sur-automatiser les handoffs au début.

Départ recommandé :

```text
- un agent principal unique ;
- handoff seulement si le besoin change clairement ;
- log du handoff ;
- pas de récursion profonde.
```

Exemples :

```text
Support → Developer
Quand le problème support révèle une traceback ou un bug code.

Business Analyst → Architect
Quand une exigence métier nécessite une décision technique structurante.

Architect → Developer
Quand la décision est prise et qu’il faut implémenter.

Developer → Architect
Quand le code révèle un problème de design plus large.
```

Règle :

```text
Garder une surface de routage lisible.
Chaque agent spécialiste doit avoir un job étroit.
Ne créer un handoff que si la nouvelle branche nécessite vraiment des instructions, tools ou politiques différentes.
```

---

# 17. Ce que Codex doit faire

Codex doit utiliser ce document pour implémenter ou auditer :

```text
1. Le dossier agents/.
2. Les 4 fichiers AGENT.md.
3. Le parser AGENT.md.
4. L’AgentRegistry.
5. L’AgentRouter.
6. La logique de priorité :
   - UI explicite ;
   - prompt explicite ;
   - règles locales ;
   - scoring sémantique ;
   - LLM classifier si ambigu.
7. Le PromptBuilder.
8. Les ProviderAdapters OpenAI / Anthropic / Generic.
9. Les permissions tools par agent.
10. Les logs agent_routing.
11. Les eval queries par agent.
```

---

# 18. Tests attendus

## Tests unitaires

```text
- AGENT.md valide ;
- AGENT.md sans name ;
- AGENT.md sans description ;
- YAML invalide ;
- tools.allow parsé correctement ;
- handoff.can_handoff_to parsé correctement ;
- agent disabled non sélectionnable si statut supporté ;
- agent default reconnu.
```

## Tests routing

```text
- sélection explicite UI ;
- sélection explicite prompt ;
- règles locales ;
- scoring sémantique ;
- fallback ;
- cas ambigu ;
- top1/top2 trop proche ;
- LLM classifier appelé seulement si nécessaire.
```

## Tests provider

```text
- OpenAI reçoit les instructions dans le bon champ ;
- Anthropic reçoit les instructions dans system ;
- Generic reçoit un prompt compatible ;
- tools filtrés selon l’agent ;
- logs provider + agent.
```

## Tests qualité

```text
- agent attendu sélectionné ;
- skills cohérents avec l’agent ;
- style de réponse cohérent avec l’agent ;
- pas de code produit par Business Analyst ;
- pas d’architecture longue produite par Support ;
- Developer ne répond pas comme un agent commercial ;
- Architect ne produit pas directement un gros patch sans demande explicite.
```

---

# 19. Red flags

Codex doit chercher ces problèmes :

```text
- les agents ne sont que des labels UI sans instructions injectées ;
- le provider choisit implicitement le rôle sans contrôle backend ;
- aucun log de sélection agent ;
- le mauvais agent est choisi mais impossible de savoir pourquoi ;
- AgentRouter et SkillRouter sont mélangés ;
- les skills ne sont pas filtrés ou influencés par l’agent ;
- tous les agents ont les mêmes tools ;
- les tools sont seulement interdits dans le prompt, pas côté backend ;
- les descriptions d’agents sont trop vagues ;
- Support, BA, Architect et Developer ont des frontières floues ;
- l’agent est sélectionné après le skill alors que le skill devrait être contextualisé par l’agent ;
- les instructions agent ne sont pas renvoyées à chaque appel stateless.
```

---

# 20. Recommandation finale

Approche recommandée :

```text
1. Formaliser les 4 agents avec AGENT.md.
2. Garder un format interne provider-agnostic.
3. Router l’agent côté backend.
4. Respecter la priorité :
   UI explicite → prompt explicite → règles locales → scoring → LLM classifier si ambigu.
5. Construire le prompt final avec les instructions de l’agent.
6. Adapter l’envoi selon OpenAI / Anthropic / Generic.
7. Filtrer réellement les tools côté backend.
8. Router ensuite les skills selon l’agent et la demande.
9. Logger agent + skills + tools + provider.
10. Créer des eval queries pour valider le routing des agents.
```

Phrase clé :

```text
L’agent choisit la posture et la mission.
Le skill choisit la méthode et le contexte spécialisé.
Le tool exécute l’action concrète.
Le backend orchestre tout et transmet les instructions au provider.
```