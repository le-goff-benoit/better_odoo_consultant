# Résumé multi-agent — Décision, orchestration et bonnes pratiques

## Objectif

Ce document résume l’approche recommandée pour décider **quand utiliser un seul agent** et **quand passer en multi-agent** dans une application IA spécialisée Odoo.

Contexte de l’application :

```text
- multi-LLM : OpenAI, Anthropic, autres providers ;
- multi-projet Odoo ;
- multi-version Odoo : 15, 16, 17, 18, 19 ;
- projets sans développement ;
- projets Odoo Studio simples ;
- projets avec développement simple ;
- projets mixtes développement + Studio ;
- profils/agents : Support, Business Analyst, Architect, Developer.
```

Idée centrale :

```text
Single-agent par défaut.
Multi-agent seulement quand le prompt contient plusieurs responsabilités distinctes
qui bénéficient réellement de perspectives séparées.
```

---

## Sources utilisées

Ce document s’appuie sur les bonnes pratiques documentées par OpenAI et Anthropic :

```text
OpenAI — Orchestration and handoffs
https://developers.openai.com/api/docs/guides/agents/orchestration

OpenAI Agents SDK — Agent orchestration
https://openai.github.io/openai-agents-python/multi_agent/

OpenAI Codex — Subagents
https://developers.openai.com/codex/subagents

Anthropic — Building effective agents
https://www.anthropic.com/engineering/building-effective-agents

Anthropic — How we built our multi-agent research system
https://www.anthropic.com/engineering/multi-agent-research-system

Anthropic — Effective context engineering for AI agents
https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Anthropic Claude Code — Create custom subagents
https://code.claude.com/docs/en/sub-agents

Anthropic — Writing effective tools for agents
https://www.anthropic.com/engineering/writing-tools-for-agents
```

---

# 1. Ce que disent les bonnes pratiques

## 1.1 OpenAI — choisir qui possède la réponse finale

OpenAI distingue deux grands patterns :

```text
1. Handoffs
   Un spécialiste prend le contrôle de la suite de la conversation.

2. Agents as tools
   Un agent manager garde le contrôle et appelle des agents spécialistes
   comme capacités bornées.
```

Dans notre application, le pattern le plus sûr est souvent :

```text
Agent principal / finalAgent
→ appelle éventuellement d’autres agents comme reviewers
→ garde la responsabilité de la réponse finale.
```

Pourquoi :

```text
- réponse finale plus cohérente ;
- meilleure maîtrise du format ;
- meilleure application des guardrails ;
- plus simple à logger ;
- plus simple à tester.
```

---

## 1.2 OpenAI — ne pas splitter trop tôt

OpenAI recommande de commencer avec un seul agent quand c’est possible.

Un spécialiste ne doit être ajouté que s’il améliore réellement :

```text
- l’isolation de capacité ;
- l’isolation de politique ;
- la clarté du prompt ;
- la lisibilité des traces ;
- la qualité de la réponse.
```

À retenir :

```text
Ne pas créer un workflow multi-agent juste parce que c’est possible.
```

---

## 1.3 OpenAI — agents spécialisés et évaluations

OpenAI recommande :

```text
- des agents spécialisés sur une tâche claire ;
- de bons prompts ;
- un monitoring des erreurs ;
- des itérations ;
- des evals.
```

Conséquence pour notre app :

```text
Support, Business Analyst, Architect et Developer doivent avoir
des frontières nettes et des eval queries d’orchestration.
```

---

## 1.4 Anthropic — commencer simple

Anthropic recommande de commencer avec des prompts simples, de les optimiser avec des évaluations, puis d’ajouter des systèmes agentiques multi-étapes seulement lorsque les solutions plus simples ne suffisent plus.

Principe à appliquer :

```text
Complexité minimale nécessaire.
```

Cela donne cette règle :

```text
Prompt simple → single-agent.
Prompt complexe mais dépendant → séquentiel.
Prompt complexe avec perspectives indépendantes → parallèle + synthèse.
```

---

## 1.5 Anthropic — complexité de coordination

Anthropic indique que les systèmes multi-agent ajoutent une complexité de coordination importante.

Exemples de problèmes observés :

```text
- trop de subagents pour une demande simple ;
- agents qui cherchent trop longtemps ;
- agents qui se dupliquent le travail ;
- agents avec des instructions trop vagues ;
- mauvais usage des tools ;
- effort mal calibré par rapport à la complexité de la question.
```

Conséquence :

```text
Le multi-agent doit être explicitement contrôlé par le backend,
avec règles, limites, logs et evals.
```

---

## 1.6 Anthropic — enseigner à l’orchestrateur comment déléguer

Dans un système multi-agent, l’orchestrateur doit donner à chaque subagent :

```text
- un objectif précis ;
- un format de sortie ;
- des limites claires ;
- les tools ou sources à utiliser ;
- ce qu’il ne doit pas faire ;
- le niveau d’effort attendu.
```

Sinon les agents peuvent :

```text
- dupliquer le travail ;
- laisser des trous ;
- répondre hors-scope ;
- produire des sorties difficiles à synthétiser.
```

---

## 1.7 Anthropic — scaling selon la complexité

Anthropic recommande de calibrer l’effort selon la complexité.

Dans notre app, cela peut devenir :

```text
Simple:
- 1 agent
- pas de subagent
- réponse directe

Moyen:
- 1 agent principal
- éventuellement 1 agent secondaire séquentiel

Complexe:
- 2 à 3 agents
- revue parallèle ou séquentielle
- synthèse finale

Très complexe:
- orchestration explicite
- sortie intermédiaire structurée
- logs complets
- éventuellement confirmation utilisateur si coût/latence élevé
```

---

## 1.8 Anthropic — subagents pour préserver le contexte

Les subagents sont utiles quand une tâche secondaire risque de polluer le contexte principal avec :

```text
- beaucoup de recherches ;
- beaucoup de logs ;
- beaucoup de fichiers ;
- beaucoup de résultats intermédiaires.
```

Un subagent peut travailler dans son propre contexte et renvoyer un résumé condensé.

Dans notre application Odoo, c’est utile pour :

```text
- audit de repository ;
- analyse de logs longs ;
- revue de plusieurs modules ;
- comparaison Studio vs custom ;
- migration multi-version ;
- analyse de dette technique.
```

---

# 2. Architecture backend recommandée

Ne pas mélanger la sélection de l’agent et l’orchestration multi-agent.

Créer des composants séparés :

```text
AgentRouter
→ choisit l’agent principal.

OrchestrationRouter
→ décide single_agent / sequential_agents / parallel_review.

SkillRouter
→ choisit les skills selon agent + prompt + contexte projet.

PromptBuilder
→ assemble instructions agent + skills + contexte + tools.

ProviderAdapter
→ traduit vers OpenAI / Anthropic / Generic.

PolicyEngine
→ filtre réellement les tools autorisés.

RunLogger
→ trace agent, skills, tools, provider, mode et résultats.
```

Flux recommandé :

```text
User prompt
→ detect explicit agent from UI/prompt
→ AgentRouter
→ extract prompt signals
→ OrchestrationRouter
→ SkillRouter
→ PromptBuilder
→ ProviderAdapter
→ LLM calls
→ optional synthesis
→ final answer
```

---

# 3. Les trois modes d’orchestration

## 3.1 Mode 1 — single_agent

Mode par défaut.

```text
Prompt
→ Agent principal
→ Skills
→ Tools autorisés
→ Réponse finale
```

À utiliser pour environ 80 % des demandes.

Exemples :

```text
“Corrige cette traceback QWeb.”
→ Developer

“Prépare un email client.”
→ Business Analyst

“Pourquoi mon devis ne se confirme pas ?”
→ Support

“Quelle architecture pour ce runtime ?”
→ Architect
```

---

## 3.2 Mode 2 — sequential_agents

À utiliser quand une étape dépend du résultat de la précédente.

```text
Prompt
→ Agent A
→ sortie structurée A
→ Agent B
→ réponse finale
```

Exemples Odoo :

```text
“Analyse cette erreur technique puis prépare un message client.”
→ Developer → Business Analyst

“Clarifie le besoin puis propose une architecture.”
→ Business Analyst → Architect

“Décide l’architecture puis propose l’implémentation.”
→ Architect → Developer

“Analyse le fichier puis rédige une synthèse client.”
→ Developer ou Data agent → Business Analyst
```

Règle mentale :

```text
Si l’étape B a besoin du résultat de l’étape A,
utiliser du séquentiel.
```

---

## 3.3 Mode 3 — parallel_review

À utiliser quand plusieurs perspectives indépendantes améliorent la décision.

```text
Prompt
→ Business Analyst analysis
→ Architect analysis
→ Developer analysis
→ Synthèse finale par finalAgent
```

Exemples Odoo :

```text
“On hésite entre Studio et module custom.”
→ BA + Architect + Developer → Architect final

“Audit complet avant production.”
→ Architect + Developer + Support → Architect final

“Migration Odoo 16 vers Odoo 18 avec Studio et modules custom.”
→ BA + Architect + Developer → Architect final

“Projet dev+Studio avec dette technique.”
→ BA + Architect + Developer → Architect final
```

Règle mentale :

```text
Si les agents peuvent travailler indépendamment sur des angles différents,
utiliser du parallèle.
```

---

# 4. Décision backend : quand passer en multi-agent ?

## 4.1 Principe

Le backend doit d’abord supposer :

```text
mode = single_agent
```

Puis passer en multi-agent seulement si des signaux explicites ou contextuels le justifient.

---

## 4.2 Signaux de prompt

Créer un objet de signaux :

```ts
type PromptIntentSignals = {
  hasMultipleTasks: boolean;
  asksForAudit: boolean;
  asksForArchitectureDecision: boolean;
  asksForImplementation: boolean;
  asksForClientExplanation: boolean;
  asksForBusinessScope: boolean;
  asksForMigration: boolean;
  asksForStudioVsCustom: boolean;
  asksForPreProductionReview: boolean;
  asksForBugDiagnosis: boolean;
  asksForFinalClientOutput: boolean;
  mentionsProduction: boolean;
  mentionsRisk: boolean;
  riskLevel: "low" | "medium" | "high";
  complexity: "simple" | "medium" | "complex";
};
```

---

## 4.3 Signaux forts pour sequential_agents

Déclencher du séquentiel quand le prompt contient :

```text
- analyser puis rédiger ;
- diagnostiquer puis expliquer ;
- cadrer puis architecturer ;
- architecturer puis implémenter ;
- auditer puis produire un plan d’action ;
- lire/analyser un fichier puis créer une synthèse client.
```

Exemples :

```text
“Analyse cette traceback puis prépare un message client simple.”
→ Developer → Business Analyst

“Clarifie le besoin métier puis dis-moi si un module custom est nécessaire.”
→ Business Analyst → Architect

“Propose l’architecture puis donne les étapes de développement.”
→ Architect → Developer
```

---

## 4.4 Signaux forts pour parallel_review

Déclencher du parallèle quand le prompt demande une décision ou un audit avec plusieurs angles indépendants :

```text
- Studio vs custom module ;
- migration Odoo ;
- audit complet ;
- pré-production ;
- projet dev+Studio ;
- risque métier + technique ;
- dette technique ;
- choix d’architecture structurant ;
- revue croisée ;
- arbitrage entre plusieurs options.
```

Exemples :

```text
“On hésite entre Studio et module custom.”
→ BA + Architect + Developer

“Peux-tu faire un audit complet avant mise en production ?”
→ Architect + Developer + Support

“Migration Odoo 16 vers 18 avec Studio et modules custom.”
→ BA + Architect + Developer
```

---

## 4.5 Influence du contexte projet Odoo

Le contexte projet doit influencer la décision.

Exemple :

```json
{
  "odooVersion": "18",
  "projectComplexity": "dev_and_studio",
  "productionRisk": "high",
  "hasStudioCustomizations": true,
  "hasCustomModules": true,
  "migrationContext": true
}
```

Avec ce contexte, un prompt vague comme :

```text
“Peux-tu vérifier cette adaptation avant qu’on avance ?”
```

peut justifier une analyse plus prudente qu’un simple support.

Règles possibles :

```text
projectComplexity = no_dev
→ éviter Developer sauf code/traceback explicite.

projectComplexity = studio_simple
→ préférer Support ou BA pour les demandes simples ;
→ Architect si choix Studio vs custom ou risque migration.

projectComplexity = dev_simple
→ Developer pour bugs/code ;
→ Architect pour structure module/migration.

projectComplexity = dev_and_studio
→ augmenter le score Architect ;
→ parallel_review si demande d’audit, migration, Studio vs custom ou pré-prod.

productionRisk = high
→ augmenter probabilité Architect ou parallel_review.

migrationContext = true
→ augmenter probabilité Architect + Developer + BA.
```

---

# 5. Objet de décision recommandé

```ts
type OrchestrationMode =
  | "single_agent"
  | "sequential_agents"
  | "parallel_review";

type AgentName =
  | "support"
  | "business-analyst"
  | "architect"
  | "developer";

type AgentRoleInRun =
  | "primary"
  | "reviewer"
  | "executor"
  | "synthesizer";

type AgentOrchestrationDecision = {
  mode: OrchestrationMode;
  primaryAgent: AgentName;
  finalAgent: AgentName;
  agents: Array<{
    name: AgentName;
    roleInRun: AgentRoleInRun;
    reason: string;
  }>;
  sequence?: Array<{
    step: number;
    agent: AgentName;
    purpose: string;
  }>;
  confidence: number;
  reason: string;
  signals: PromptIntentSignals;
};
```

---

# 6. Pseudo-code de l’OrchestrationRouter

```ts
function decideOrchestration(input: {
  userPrompt: string;
  explicitAgent?: AgentName;
  agentScores: Array<{ agent: AgentName; score: number; reason?: string }>;
  projectContext?: OdooProjectContext;
  signals: PromptIntentSignals;
}): AgentOrchestrationDecision {
  const { explicitAgent, agentScores, projectContext, signals } = input;

  // 1. Choix explicite UI / prompt.
  // Par défaut, respecter le choix explicite en single-agent,
  // sauf si l'utilisateur demande explicitement une revue multi-angle.
  if (
    explicitAgent &&
    !signals.hasMultipleTasks &&
    !signals.asksForAudit &&
    !signals.asksForStudioVsCustom &&
    !signals.asksForMigration
  ) {
    return {
      mode: "single_agent",
      primaryAgent: explicitAgent,
      finalAgent: explicitAgent,
      agents: [
        {
          name: explicitAgent,
          roleInRun: "primary",
          reason: "Explicit agent selection."
        }
      ],
      confidence: 1.0,
      reason: "The user explicitly selected an agent and no multi-agent signal was detected.",
      signals
    };
  }

  // 2. Séquentiel : diagnostic technique puis communication client.
  if (signals.asksForBugDiagnosis && signals.asksForClientExplanation) {
    return {
      mode: "sequential_agents",
      primaryAgent: "developer",
      finalAgent: "business-analyst",
      sequence: [
        {
          step: 1,
          agent: "developer",
          purpose: "Diagnose the technical Odoo issue."
        },
        {
          step: 2,
          agent: "business-analyst",
          purpose: "Translate the diagnosis into a client-facing explanation."
        }
      ],
      agents: [
        {
          name: "developer",
          roleInRun: "primary",
          reason: "Technical diagnosis must happen first."
        },
        {
          name: "business-analyst",
          roleInRun: "synthesizer",
          reason: "The user requested a client-facing output."
        }
      ],
      confidence: 0.9,
      reason: "The prompt asks to analyze a technical issue and then produce client communication.",
      signals
    };
  }

  // 3. Séquentiel : besoin métier puis architecture.
  if (signals.asksForBusinessScope && signals.asksForArchitectureDecision) {
    return {
      mode: "sequential_agents",
      primaryAgent: "business-analyst",
      finalAgent: "architect",
      sequence: [
        {
          step: 1,
          agent: "business-analyst",
          purpose: "Clarify business need, scope, actors and acceptance criteria."
        },
        {
          step: 2,
          agent: "architect",
          purpose: "Recommend an Odoo architecture based on the clarified need."
        }
      ],
      agents: [
        {
          name: "business-analyst",
          roleInRun: "primary",
          reason: "Business clarification is required first."
        },
        {
          name: "architect",
          roleInRun: "synthesizer",
          reason: "Architecture recommendation is the final output."
        }
      ],
      confidence: 0.85,
      reason: "The prompt requires business scoping before architecture.",
      signals
    };
  }

  // 4. Parallèle : gros signaux Odoo.
  if (
    signals.asksForStudioVsCustom ||
    signals.asksForMigration ||
    signals.asksForPreProductionReview ||
    (
      signals.asksForAudit &&
      projectContext?.productionRisk === "high"
    ) ||
    (
      projectContext?.projectComplexity === "dev_and_studio" &&
      (signals.asksForAudit || signals.mentionsRisk || signals.asksForArchitectureDecision)
    )
  ) {
    return {
      mode: "parallel_review",
      primaryAgent: "architect",
      finalAgent: "architect",
      agents: [
        {
          name: "business-analyst",
          roleInRun: "reviewer",
          reason: "Business process, scope and client impact must be considered."
        },
        {
          name: "architect",
          roleInRun: "synthesizer",
          reason: "Architecture decision and trade-off synthesis are central."
        },
        {
          name: "developer",
          roleInRun: "reviewer",
          reason: "Technical feasibility, code impact and Odoo framework risks must be checked."
        }
      ],
      confidence: 0.85,
      reason: "Complex Odoo decision requiring business, architecture and implementation perspectives.",
      signals
    };
  }

  // 5. Fallback : single-agent avec agent le mieux scoré.
  const topAgent = agentScores[0]?.agent ?? "support";
  const topScore = agentScores[0]?.score ?? 0.5;

  return {
    mode: "single_agent",
    primaryAgent: topAgent,
    finalAgent: topAgent,
    agents: [
      {
        name: topAgent,
        roleInRun: "primary",
        reason: "Highest agent routing score and no multi-agent condition matched."
      }
    ],
    confidence: topScore,
    reason: "Single-agent default.",
    signals
  };
}
```

---

# 7. Exécution backend selon le mode

## 7.1 single_agent

```text
1. Charger les instructions de l’agent.
2. Router les skills compatibles.
3. Filtrer les tools autorisés.
4. Construire le prompt final.
5. Appeler le provider.
6. Retourner la réponse.
```

Pseudo-flow :

```text
AGENT.md
+ selected SKILL.md
+ contexte projet Odoo
+ tools autorisés
+ prompt utilisateur
→ ProviderAdapter
→ Réponse finale
```

---

## 7.2 sequential_agents

Exemple :

```text
Developer → Business Analyst
```

Étape 1 :

```text
Prompt original
+ contexte projet
+ instructions Developer
+ skills Developer
→ diagnostic technique structuré
```

Étape 2 :

```text
Prompt original
+ diagnostic Developer
+ instructions Business Analyst
+ skills Business Analyst
→ réponse finale client / fonctionnelle
```

Règle :

```text
Chaque agent suivant doit recevoir la sortie structurée de l’agent précédent.
```

Ne pas laisser le deuxième agent ignorer la première analyse.

---

## 7.3 parallel_review

Exemple :

```text
BA + Architect + Developer → synthèse Architect
```

Étape parallèle :

```text
Business Analyst reçoit le prompt original et produit une analyse métier.
Architect reçoit le prompt original et produit une analyse architecture.
Developer reçoit le prompt original et produit une analyse technique.
```

Étape finale :

```text
Architect reçoit :
- prompt original ;
- analyse BA ;
- analyse Architect ;
- analyse Developer ;
- consigne de synthèse ;
- format final attendu.

Architect produit la réponse finale.
```

Règle :

```text
Toujours un finalAgent responsable de la réponse finale.
```

---

# 8. Formats de sorties intermédiaires

Pour éviter le chaos, chaque agent intermédiaire doit produire une sortie courte et structurée.

## Business Analyst

```markdown
## Business impact

## Process assumptions

## Scope risks

## Questions to clarify

## BA recommendation
```

## Architect

```markdown
## Architecture assessment

## Trade-offs

## Upgrade / migration risks

## Recommended technical direction
```

## Developer

```markdown
## Technical feasibility

## Implementation risks

## Odoo-specific pitfalls

## Estimated complexity

## Developer recommendation
```

## Support

```markdown
## User impact

## Quick checks

## Support risks

## Suggested support plan
```

La synthèse finale ne doit pas recopier mécaniquement toutes les sorties.

Elle doit décider, trier et produire une réponse cohérente.

---

# 9. Règles de garde-fou

## Limites recommandées pour V1

```text
- single_agent par défaut ;
- maximum 3 agents en parallèle ;
- maximum 3 étapes séquentielles ;
- pas de handoff récursif automatique ;
- pas de multi-agent sur prompt simple ;
- pas de parallèle si les étapes sont dépendantes ;
- pas de séquentiel si les angles sont indépendants ;
- toujours un finalAgent ;
- toujours une raison de décision ;
- toujours un log d’orchestration.
```

## Coût / latence

Avant de lancer le multi-agent, le backend peut estimer :

```text
- coût approximatif ;
- latence attendue ;
- nombre d’appels provider ;
- volume de contexte ;
- nécessité réelle du multi-agent.
```

Pour un prompt très simple :

```text
Si le gain attendu n’est pas clair, rester en single-agent.
```

---

# 10. Logs indispensables

Chaque run doit logger :

```json
{
  "orchestration": {
    "mode": "parallel_review",
    "reason": "Studio vs custom module decision with business and technical risks.",
    "primary_agent": "architect",
    "final_agent": "architect",
    "agents": [
      "business-analyst",
      "architect",
      "developer"
    ],
    "confidence": 0.85
  },
  "signals": {
    "asksForStudioVsCustom": true,
    "asksForArchitectureDecision": true,
    "asksForImplementation": true,
    "riskLevel": "high",
    "complexity": "complex"
  },
  "project_context": {
    "odooVersion": "18",
    "projectComplexity": "dev_and_studio",
    "productionRisk": "high"
  },
  "steps": [
    {
      "agent": "business-analyst",
      "role": "reviewer",
      "status": "success",
      "tokens": 900
    },
    {
      "agent": "architect",
      "role": "synthesizer",
      "status": "success",
      "tokens": 1000
    },
    {
      "agent": "developer",
      "role": "reviewer",
      "status": "success",
      "tokens": 950
    },
    {
      "agent": "architect",
      "role": "final_synthesis",
      "status": "success",
      "tokens": 1200
    }
  ],
  "provider": {
    "name": "anthropic",
    "model": "claude-sonnet",
    "mode": "backend-emulated"
  }
}
```

Ces logs servent à comprendre :

```text
- pourquoi le multi-agent a été choisi ;
- quels agents ont travaillé ;
- qui a produit la réponse finale ;
- combien cela a coûté ;
- si une étape a échoué ;
- si le router sur-utilise le multi-agent.
```

---

# 11. Evals d’orchestration

Créer un fichier :

```text
agents/eval_orchestration.json
```

Exemple :

```json
[
  {
    "id": "single_dev_qweb_001",
    "query": "Peux-tu corriger cette traceback QWeb ?",
    "expected_mode": "single_agent",
    "expected_primary_agent": "developer",
    "expected_final_agent": "developer",
    "category": "single",
    "language": "fr"
  },
  {
    "id": "seq_diag_client_001",
    "query": "Analyse cette erreur technique puis prépare un message client simple.",
    "expected_mode": "sequential_agents",
    "expected_sequence": ["developer", "business-analyst"],
    "expected_final_agent": "business-analyst",
    "category": "sequential",
    "language": "fr"
  },
  {
    "id": "parallel_studio_custom_001",
    "query": "On hésite entre Studio et module custom pour cette règle métier avancée.",
    "expected_mode": "parallel_review",
    "expected_agents": ["business-analyst", "architect", "developer"],
    "expected_final_agent": "architect",
    "category": "parallel",
    "language": "fr"
  },
  {
    "id": "single_support_001",
    "query": "Je ne comprends pas pourquoi mon devis Odoo ne se confirme pas.",
    "expected_mode": "single_agent",
    "expected_primary_agent": "support",
    "expected_final_agent": "support",
    "category": "single",
    "language": "fr"
  },
  {
    "id": "parallel_migration_001",
    "query": "On doit migrer un projet Odoo 16 vers Odoo 18 avec Studio et modules custom. Que faut-il contrôler ?",
    "expected_mode": "parallel_review",
    "expected_agents": ["business-analyst", "architect", "developer"],
    "expected_final_agent": "architect",
    "category": "parallel",
    "language": "fr"
  }
]
```

## Métriques à suivre

```text
- orchestration accuracy ;
- single-agent accuracy ;
- sequential accuracy ;
- parallel accuracy ;
- false multi-agent rate ;
- missed multi-agent rate ;
- average number of agents per request ;
- average cost per mode ;
- average latency per mode ;
- finalAgent accuracy.
```

## Faux positifs à éviter

Exemple :

```text
Prompt :
“Corrige cette traceback QWeb.”

Résultat mauvais :
parallel_review avec BA + Architect + Developer.

Pourquoi mauvais :
un Developer seul suffit.
```

## Faux négatifs à éviter

Exemple :

```text
Prompt :
“On hésite entre Studio et module custom pour une règle critique qui impacte la migration.”

Résultat mauvais :
single Developer.

Pourquoi mauvais :
la demande contient un arbitrage métier + architecture + technique.
```

---

# 12. Red flags

Codex doit chercher et éviter :

```text
- multi-agent lancé sur presque tous les prompts ;
- aucun agent final responsable ;
- agents parallèles qui font le même travail ;
- sorties intermédiaires non structurées ;
- pas de logs de décision ;
- pas d’evals d’orchestration ;
- AgentRouter et OrchestrationRouter mélangés ;
- skills routés avant de connaître l’agent ;
- tools non filtrés par agent ;
- handoffs récursifs ;
- contexte entier transmis à tous les agents ;
- réponses finales qui exposent tout le débat interne sans demande utilisateur ;
- coût et latence non mesurés ;
- aucun garde-fou sur le nombre d’agents.
```

---

# 13. Recommandation pour l’implémentation Codex

## Étape 1 — Modèle de données

Créer :

```text
AgentOrchestrationDecision
PromptIntentSignals
OrchestrationMode
AgentRoleInRun
```

## Étape 2 — OrchestrationRouter

Créer un composant dédié :

```text
src/agents/orchestration-router.ts
```

Responsabilités :

```text
- recevoir prompt, agent explicite, agentScores, projectContext ;
- extraire ou recevoir les signaux ;
- décider le mode ;
- choisir primaryAgent ;
- choisir finalAgent ;
- construire sequence si nécessaire ;
- donner une reason ;
- donner confidence ;
- ne pas appeler directement le provider.
```

## Étape 3 — Prompt signal extraction

Créer :

```text
src/agents/prompt-signals.ts
```

Débuter avec règles locales simples :

```text
- mots-clés ;
- expressions ;
- regex ;
- contexte projet ;
- labels projet.
```

LLM classifier plus tard seulement si ambigu.

## Étape 4 — Exécution multi-agent

Créer :

```text
src/agents/orchestration-runner.ts
```

Responsabilités :

```text
- exécuter single_agent ;
- exécuter sequential_agents ;
- exécuter parallel_review ;
- passer les sorties intermédiaires ;
- contrôler finalAgent ;
- produire logs.
```

## Étape 5 — Logs

Créer ou compléter :

```text
agent_routing
orchestration
skill_routing
provider
tools
cost
latency
```

## Étape 6 — Evals

Créer :

```text
agents/eval_orchestration.json
scripts/evaluate_agent_orchestration.ts
```

Le script doit tester :

```text
- mode attendu ;
- agents attendus ;
- sequence attendue ;
- finalAgent attendu ;
- pas de multi-agent inutile.
```

---

# 14. Résumé très court

```text
Single-agent par défaut.

Sequential agents si une étape dépend d’une autre :
diagnostiquer → expliquer,
cadrer → architecturer,
architecturer → implémenter.

Parallel review si plusieurs perspectives indépendantes améliorent la décision :
Studio vs custom,
migration,
audit complet,
pré-production,
projet dev+Studio risqué.

Toujours un finalAgent.
Toujours des logs.
Toujours des evals.
```

Phrase clé :

```text
Le multi-agent ne doit pas être choisi parce que c’est possible,
mais parce que le prompt contient plusieurs responsabilités qui gagnent
à être isolées, évaluées, puis synthétisées.
```