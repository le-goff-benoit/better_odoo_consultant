# Harnais d'éval qualité

Deux phases :

## Phase 1 — routing (déterministe, hors-ligne)

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

Le dataset couvre 10 catégories (live data, schema, view, security, report,
navigation, studio, near-miss email, commit, migration, no-skill, etc.) avec
une cible explicite par prompt.

## Phase 2 — qualité de réponse LLM (en ligne, coût API)

À implémenter quand on veut prouver le gain qualité. Modèle :

1. Pour chaque prompt du dataset, appeler le backend trois fois :
   - A) avec `disabled_tools = <tous les tool skills>` (baseline sans skills)
   - B) avec `disabled_tools = []` (skills auto)
   - C) avec `force_skill = <expected_skills[0]>` (skill forcé)
2. Logger les réponses dans `runs/<run_id>.jsonl`.
3. Soit revue humaine, soit LLM-as-judge (scoring par les `criteria` du dataset).
4. Produire un diff A vs B vs C.

Le but n'est pas un benchmark continu (trop cher) mais un check ponctuel
avant les bumps majeurs.

## Ajouter un prompt

Éditer `dataset.json`. Chaque entrée :

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
