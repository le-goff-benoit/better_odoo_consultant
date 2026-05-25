# Harnais d'éval qualité

Deux harnais complémentaires vivent ici :

## 1. Routing skills (déterministe, hors-ligne)

```bash
python scripts/quality_eval/run_routing_eval.py
```

Rejoue les 20 prompts de `dataset.json` à travers `_select_skill_playbooks`
sans appel LLM. Vérifie que les skills attendus sont bien sélectionnés et
qu'aucun skill métier ne fuit sur les prompts génériques. Exit code 0 si
100 % corrects.

Sortie machine :
```bash
python scripts/quality_eval/run_routing_eval.py --json > report.json
```

Le dataset couvre les catégories live data, schema, view, security, report,
navigation, studio, near-miss email, commit, migration, no-skill, etc.) avec
une cible explicite par prompt.

## 2. Réponses agents (déterministe + traces optionnelles)

```bash
python scripts/quality_eval/run_agent_response_eval.py \
  --dataset scripts/quality_eval/agent_response_eval.jsonl \
  --out runs/agent-baseline.jsonl \
  --report runs/agent-baseline.md
```

Le dataset `agent_response_eval.jsonl` contient 200 cas Odoo répartis sur les
4 agents (`support`, `business_analyst`, `architect`, `developer`) :

- 50 cas Support : incidents, tracebacks, utilisateurs bloqués, droits, données incohérentes.
- 50 cas Business Analyst : cadrage, processus, UAT, emails client, paramétrage.
- 50 cas Architecte : migration, multi-société, intégrations, sécurité, trade-offs.
- 50 cas Développeur : ORM, XML, tests, refactor, commits, debug code.

Le socle historique de 100 cas est complété par 50 cas simples (`simple-*`) et
50 cas difficiles (`hard-*`) pour tester à la fois les réflexes de base et les
ambiguïtés multi-sources / handoff.

Chaque ligne JSONL déclare le prompt, l'agent attendu, le contexte simulé
minimal, les skills attendus/interdits, les critères de réponse, la difficulté,
les tags Odoo et le flag `golden`.

Le run hors-ligne note uniquement les dimensions prouvables sans appel provider :

- `agent_fit` : agent inféré vs agent attendu.
- `tool_use` : skills attendus présents, skills interdits absents, pas de tool leak évident.

Les dimensions qualitatives restent explicitement `pending` tant qu'une trace de
réponse ou un judge externe n'a pas été fournie :

- `odoo_accuracy`
- `answer_quality`
- `handoff_quality`

Un fichier de traces optionnel peut enrichir un run :

```bash
python scripts/quality_eval/run_agent_response_eval.py \
  --responses runs/provider-responses.jsonl \
  --out runs/agent-graded.jsonl \
  --report runs/agent-graded.md
```

Format minimal d'une trace :

```json
{"id":"support-001-login-500","response_text":"…","tool_calls":[…],"events":[…],"scores":{"odoo_accuracy":16,"answer_quality":18,"handoff_quality":14}}
```

Le runner capture aussi la version Git et le hash SHA-256 de chaque `AGENT.md`
pour rendre les comparaisons de prompts reproductibles.

## Phase online / LLM-as-judge (manuel, coût API)

Le runner ne déclenche pas encore lui-même les providers IA. La phase online
doit rester manuelle ou orchestrée par un script séparé pour éviter une CI
coûteuse et non déterministe. Modèle recommandé :

1. Appeler le backend pour chaque prompt avec les agents/skills actuels.
2. Logger réponse, tool calls, events SSE, tokens et coût dans un JSONL.
3. Ajouter les scores LLM-as-judge selon les critères du cas.
4. Revoir humainement les cas `golden` et les régressions majeures.
5. Relancer `run_agent_response_eval.py --responses …` pour produire le rapport consolidé.

Ne jamais optimiser uniquement sur le score LLM-as-judge : garder les cas
golden humains pour détecter le grader hacking.

## Ajouter un prompt

Pour le routing skills, éditer `dataset.json`. Chaque entrée :

```json
{
  "id": "qNN-slug",
  "prompt": "…",
  "category": "…",
  "expected_skills": ["skill_name_underscore", "…"],
  "mode": "assistant|migration|creator",  // optionnel, défaut assistant
  "criteria": ["…", "…"]                  // pour la phase 2 LLM-judge
}
```

Pour le banc agents, ajouter une ligne JSONL à `agent_response_eval.jsonl`.
Conserver la distribution 25 cas par agent, ou documenter explicitement le
changement de distribution dans ce README.
