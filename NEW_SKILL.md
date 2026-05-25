# Plan — 4 nouveaux skills IA (compare-versions, automations, module-graph, generate-diagram)

## Contexte

L'app `better_odoo_consultant` (v0.93.1) expose aujourd'hui 28 skills couvrant essentiellement la **lecture** (sources Odoo, données live XML-RPC, fichiers projet). Trois zones de travail consultant restent mal outillées :

1. **Cadrage de migration** : pas de diff sémantique entre versions Odoo. `migration-read-target-file` lit mais ne *compare* pas.
2. **Audit d'automatismes** : `ir.cron`, `base.automation`, `ir.actions.server`, `mail.template` ne sont accessibles qu'au travers de `query_odoo`, sans regroupement métier.
3. **Compréhension d'architecture** : dépendances de modules, héritages de modèles ou de vues, flux métier — aujourd'hui décrits en prose, jamais visualisés.

Ce plan ajoute **4 skills** pour combler ces trous et **enrichit le renderer Markdown** pour afficher des diagrammes Mermaid dans les réponses IA. Objectif : passer de 28/28 à 32/32 skills avec couverture eval queries complète et pruning anti-fuites.

---

## Vue d'ensemble des 4 skills

| Slug | Sources | Permissions | Output | Tool name (underscore) |
|---|---|---|---|---|
| `compare-odoo-versions` | sources locales | filesystem:read, network:false, odoo:none | Diff structuré FR | `compare_odoo_versions` |
| `inspect-automations` | XML-RPC | odoo:read | Tableau récap + détails | `inspect_automations` |
| `inspect-module-graph` | sources + sources projet | filesystem:read | Graphe + sortie Mermaid | `inspect_module_graph` |
| `generate-diagram` | sources / XML-RPC / target | filesystem:read, odoo:read | Bloc ` ```mermaid ` | `generate_diagram` |

Tous : `read_only: true`, `risk_level: low`, `modes: [assistant, migration]` (+ `creator` pour `generate-diagram`).

---

## Skill 1 — `compare-odoo-versions`

**But** : diff sémantique d'un modèle, vue, ou module entre deux versions Odoo (ex. 17.0 ↔ 18.0, Community ↔ Enterprise).

**Args handler** :
- `target` : `"model:sale.order" | "view:<xml_id>" | "module:<name>"`
- `from_version` : `"17.0"` (résolu via `~/.odoo-consultant/sources/<version>[-enterprise]`)
- `to_version` : `"18.0"`
- `scope` : `"odoo" | "enterprise"` (par défaut `odoo`)

**Implémentation** :
- Réutilise la résolution de path de `backend/skills/_shared/git_ops.py` (lignes 32-41).
- Pour `model:` → grep récursif des fichiers `models/*.py` dans les deux versions, extraction AST des classes héritant via `_inherit`/`_name`, diff des champs et méthodes.
- Pour `view:` → glob `**/views/*.xml`, match sur `<record id="<xml_id>">`, diff XML structurel (utiliser `lxml`).
- Pour `module:` → diff du `__manifest__.py` (depends, version, data) + liste de fichiers ajoutés/supprimés.
- Pas de subprocess externe : tout en Python (`ast` + `lxml`).

**Frontmatter clés** : `keywords: [comparer versions, diff version, migration 17 18, upgrade, change between, version diff, what changed]`, `allow_implicit_invocation: true`.

**Eval queries** : 6-8 cas — positifs (« qu'est-ce qui change sur sale.order entre 17 et 18 », « diff du module hr_holidays »), négatifs (« lis sale_order.py en 18 » → `source_read_odoo_file`), 1-2 near-miss.

**Files** :
- `skills/compare-odoo-versions/SKILL.md`
- `skills/compare-odoo-versions/scripts/handler.py`
- `skills/compare-odoo-versions/diagram/diagram.yaml`
- `skills/compare-odoo-versions/eval_queries.json`
- `skills/compare-odoo-versions/references/diff_strategies.md`
- `skills/compare-odoo-versions/templates/comparison_report.md`

---

## Skill 2 — `inspect-automations`

**But** : vue unifiée des automatismes serveur d'une instance — ir.cron, base.automation, ir.actions.server, mail.template.

**Args handler** :
- `kind` : `"cron" | "automation" | "server_action" | "mail_template" | "all"` (défaut `"all"`)
- `module` : optionnel, filtre sur `ir.model.data.module`
- `model` : optionnel, filtre sur le modèle cible
- `active_only` : bool, défaut `true`

**Implémentation** :
- `REQUIRES_ODOO = True`.
- Utilise `search_read_bounded` (`backend/services/odoo_pagination.py`) sur chaque modèle.
- Pour chaque automation : récupère le `code` Python associé, le tronque (~ 4000 chars), conserve les champs clés (`active`, `interval_number`, `nextcall`, `trigger`, `state`).
- Jointure manuelle avec `ir.model.data` pour identifier le module d'origine (vs custom).
- Sortie : structure JSON regroupée par `kind`, prête à être rendue en tableau Markdown.

**Frontmatter clés** : `keywords: [cron, automation, automated action, server action, mail template, scheduled, planifié, base.automation, ir.cron]`.

**Eval queries** : positifs (« quels crons tournent sur sale.order », « affiche les server actions du module CRM »), négatifs (« liste les utilisateurs admin » → `query_odoo`).

**Pruning** : règle `pruned:automation-focus` dans `_select_skill_playbooks` → désélectionne `query_odoo`/`read_group_odoo` si query verbatim contient cron/automation/server action sans énumération de modèle générique.

---

## Skill 3 — `inspect-module-graph`

**But** : graphe de dépendances `__manifest__.py` + arbre d'héritages de modèles d'un module.

**Args handler** :
- `module` : nom du module
- `scope` : `"odoo" | "enterprise" | "project"` (résout `source_path`, `source_path-enterprise`, ou `repo_path`)
- `depth` : profondeur dépendances, défaut 2
- `include_inheritance` : bool, défaut `true`

**Implémentation** :
- Parse `__manifest__.py` via `ast.literal_eval` sur la dict literal (pattern déjà utilisé dans `skills/list-project-modules`).
- Walk récursif `depends:` jusqu'à `depth`.
- Si `include_inheritance` : AST sur `models/*.py`, extraire `_name` / `_inherit` / `_inherits` par classe.
- Détection de cycles + overrides via dict.
- Sortie : nodes + edges + bloc Mermaid pré-formaté (réutilisable par le frontend).

**Frontmatter clés** : `keywords: [dépendances module, dependency graph, manifest depends, héritage module, override, qui hérite de, who inherits, module tree]`.

**Eval queries** : positifs (« graphe de dépendances de sale_management », « qui hérite de res.partner dans le module CRM »), négatifs (« lis le manifest de sale » → `source_read_odoo_file`).

---

## Skill 4 — `generate-diagram` (le nouveau différenciateur)

**But** : générer un diagramme **Mermaid** prêt à afficher dans la réponse, pour 5 types :

| `kind` | Mermaid type | Source data |
|---|---|---|
| `flow` | `flowchart TD` | description libre dans `description` arg |
| `class` | `classDiagram` | AST `models/*.py` (sources ou projet) |
| `model-inheritance` | `flowchart LR` | XML-RPC `ir.model` + `_inherit` AST |
| `view-inheritance` | `flowchart LR` | XML-RPC `ir.ui.view` (`inherit_id`) |
| `module-graph` | `flowchart LR` | manifest depends (réutilise logique skill 3) |

**Args handler** :
- `kind` : un des 5 ci-dessus
- `target` : modèle / vue / module selon `kind`
- `scope` : `"odoo" | "enterprise" | "project" | "live"` (live = XML-RPC)
- `description` : pour `kind=flow` uniquement, prompt narratif que le LLM transforme en flowchart
- `max_nodes` : défaut 25, plafond 60 (anti-context-rot)

**Implémentation** :
- `REQUIRES_ODOO` conditionnel sur `scope=live`, `REQUIRES_SOURCE` sinon.
- Construction directe d'une chaîne Mermaid (pas de lib externe côté backend). Renvoie `{"mermaid": "<source>", "summary": "...", "node_count": N}`.
- Pour `class` : extrait fields/methods par classe via `ast`, limite à `max_nodes`, ajoute legend si tronqué.
- Pour `model-inheritance` : `_inherit` chain via parsing AST croisé avec sources Odoo.
- Pour `view-inheritance` : `search_read` sur `ir.ui.view` avec `inherit_id != False`, build tree.
- Pour `flow` : ce skill n'a pas besoin d'inférence — le LLM rédige le diagramme Mermaid lui-même dans sa réponse en s'appuyant sur les conventions documentées dans `references/mermaid_cheatsheet.md` (auto-load `triggers: [diagramme, schéma, diagram, flowchart]`).

**Frontmatter clés** :
```yaml
keywords: [diagramme, diagram, schéma, flowchart, class diagram, héritage de modèle, arbre d'héritage,
           graphe, mermaid, dessine, dessiner, draw, visualise, visualize, show graph]
```

**Eval queries** : positifs (« dessine le diagramme de classe de sale.order », « montre l'arbre d'héritage de res.partner », « fais-moi un flowchart du workflow de validation des congés »), négatifs (« liste les champs de sale.order » → `odoo_inspect_fields`).

**Pruning** : règle `pruned:diagram-focus` → si verbe de visualisation explicite (`dessine`, `montre le diagramme`, `flowchart`, `class diagram`) et `generate_diagram` sélectionné, désélectionne `odoo_inspect_view`, `odoo_inspect_fields`, `query_odoo`.

---

## Renderer Markdown — bloc Mermaid dans les réponses

**Fichier critique** : `frontend/src/components/Markdown.tsx`

**Approche** : étendre le rendu des code fences. Quand `language === "mermaid"`, rendre via un composant `MermaidBlock` (nouveau, `frontend/src/components/MermaidBlock.tsx`) :
- Lazy-load `mermaid` (`import("mermaid")`), initialisation une fois avec thème aligné sur `theme.css` (variables `--color-*`).
- Render SVG dans un container avec bordure cohérente `SkillDiagramModal` (réutiliser classes `ui-card-*` existantes).
- Fallback : si parsing échoue, afficher le code brut dans un `<pre>` avec message d'erreur.
- Bouton "agrandir" qui ouvre un modal plein écran (réutilise pattern `SkillDiagramModal`).

**Dépendance** : ajouter `mermaid` à `frontend/package.json` (~ 600 KB minifié, lazy-loaded donc pas dans le bundle initial).

**Tests** : `frontend` — test unitaire `Markdown.test.tsx` vérifiant qu'un bloc ` ```mermaid ` rend bien `<MermaidBlock>`.

---

## Modifications backend transverses

1. **`backend/services/context_service.py`** (`_select_skill_playbooks`, lignes 700-850) :
   - Ajouter 2-3 règles `pruned:*-focus` (automation, diagram, module-graph).
   - Ajouter les patterns explicites (ex. `compare-version-pattern` → score 80).
   - Étendre `_BOUNDARY_TOKENS` avec `cron`, `flow`, `flux`, `graphe`, `graph` si risque de match dans mots plus longs.

2. **Aucune modif registry** : les 4 skills sont chargés automatiquement par le loader.

3. **Bundles d'intent** (dans `context_service.py`) : ajouter `diagram` bundle (cible : `generate_diagram` + `inspect_module_graph` quand contexte module), `automation_audit` bundle (cible : `inspect_automations` + `inspect_security` éventuellement).

---

## Fichiers critiques à créer / modifier

**Création** (16 fichiers minimum, ~ 4 dossiers de skill) :
- `skills/compare-odoo-versions/{SKILL.md, scripts/handler.py, diagram/diagram.yaml, eval_queries.json, references/diff_strategies.md, templates/comparison_report.md}`
- `skills/inspect-automations/{SKILL.md, scripts/handler.py, diagram/diagram.yaml, eval_queries.json, references/automation_types.md}`
- `skills/inspect-module-graph/{SKILL.md, scripts/handler.py, diagram/diagram.yaml, eval_queries.json, references/manifest_anatomy.md}`
- `skills/generate-diagram/{SKILL.md, scripts/handler.py, diagram/diagram.yaml, eval_queries.json, references/mermaid_cheatsheet.md, templates/mermaid_blocks.md}`
- `frontend/src/components/MermaidBlock.tsx` (nouveau)
- `frontend/src/components/MermaidBlock.test.tsx` (nouveau)

**Modification** :
- `backend/services/context_service.py` (pruning + patterns + bundles)
- `frontend/src/components/Markdown.tsx` (détection fence `mermaid` → `MermaidBlock`)
- `frontend/package.json` (+ `mermaid`)
- `frontend/src/version.ts` → bump `0.94.0`
- `frontend/src/pages/About.tsx` (entrée changelog en tête, retire badge `Actuel` du précédent)
- `README.md` (mention version + capacité diagrammes)
- `CLAUDE.md` (section "État récent" + skills présents : 28 → 32, +ligne 0.94.0)

**Helpers à réutiliser (pas réécrire)** :
- `backend/skills/_shared/git_ops.py::show_commit` — modèle de helper partagé
- `backend/services/odoo_pagination.py::search_read_bounded` — pagination XML-RPC standard
- `backend/services/tool_context.py::ToolContext` — pas de nouveau champ requis
- `backend/skills/registry.py::SkillDiagram` — dataclass déjà compatible avec les nouveaux `diagram.yaml`

---

## Vérification end-to-end

1. **Backend** :
   ```bash
   source .venv/bin/activate
   pytest tests/test_skill_registry_integrity.py tests/test_tool_limits.py -q   # 32 skills chargés, frontmatter valide
   pytest tests/test_trigger_routing.py -q                                       # 32/32 eval_queries, 0 xfail
   pytest tests/test_skill_quality.py -q                                         # descriptions OK
   pytest tests/test_no_implicit_core_invocation.py -q                           # cores toujours protégés
   pytest -q                                                                     # full sweep
   ```

2. **Frontend** :
   ```bash
   cd frontend
   npm test                # MermaidBlock + Markdown
   npm run build           # tsc + Vite, vérifier que mermaid n'est pas dans le bundle initial
   ```

3. **Quality eval (routing)** :
   ```bash
   python scripts/quality_eval/run_routing_eval.py
   ```
   → 100 % accuracy maintenu après ajout des prompts diagram/automation/module-graph/compare-versions dans `dataset.json`.

4. **Test manuel app** :
   ```bash
   bash scripts/start.sh
   ```
   - Assistant : « dessine le diagramme de classe du modèle sale.order en v18 » → réponse contient bloc Mermaid rendu visuellement.
   - Migration : « qu'est-ce qui change sur hr.leave entre 17 et 18 » → tableau diff structuré.
   - Assistant : « liste les crons actifs sur le module CRM » → tableau automatisations.
   - Assistant : « graphe de dépendances de sale_management » → réponse texte + bloc Mermaid.

5. **Versioning** (cf. CLAUDE.md §Versioning) :
   - Bump `APP_VERSION` → `0.94.0`.
   - Entrée About.tsx au sommet, badge `Actuel` déplacé.
   - README + CLAUDE.md + AGENTS.md alignés.
   - Commit unique sur `main` au format `v0.94.0 — 4 nouveaux skills (compare-versions, automations, module-graph, generate-diagram) + Mermaid dans Markdown`.

---

## Risques et atténuations

- **Fuites de routing entre les 4 nouveaux skills et les existants** → eval_queries exhaustives + règles `pruned:*-focus`.
- **Bundle frontend qui grossit** → `mermaid` lazy-loaded via `import()` dynamique, pas dans bundle initial.
- **`generate-diagram` qui hallucine** → références Mermaid auto-loadées + post-validation Python du code Mermaid avant de retourner (regex simple détectant les blocs invalides).
- **Coût XML-RPC `inspect-automations`** → pagination bornée 500/5000 standard, agrégation côté serveur Odoo via `read_group` quand possible.
