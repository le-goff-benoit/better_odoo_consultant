# CLAUDE.md

Guide d'orientation pour Claude Code, GitHub Copilot et tout autre assistant IA qui intervient sur ce repository.

Dernière mise à jour contextuelle : 2026-05-25, alignée sur l'app `0.95.0` et les derniers commits `main`.

## Mission du produit

Better Odoo Assistant est une web-app locale pour consultant Odoo : elle centralise les sources Odoo Community/Enterprise, les projets clients, les dépôts custom, les connexions XML-RPC et un assistant IA outillé qui sait lire le contexte métier, les données live, le code source et les pièces jointes.

Principes produit à préserver :
- **Local-first** : l'app tourne sur la machine utilisateur ; seuls les appels providers IA sortent vers internet.
- **Contexte défini et vivant** : la qualité IA vient de sources locales fraîches, profils client, skills routés et données live bornées.
- **Consultant-first** : réponses en français par défaut, utiles en mission, actionnables et prêtes à transformer en analyse, email, plan ou changelog.
- **Read-only par défaut** : les outils IA consultent Odoo, les sources et les dépôts ; les écritures Odoo passent par les workflows explicites du Creator.

## État récent à connaître

Les derniers commits ont surtout transformé l'IA en architecture pilotée par skills :
- `0.95.0` : ajout de 2 skills IA self-contained — `inspect_financial_reports` (rapports financiers Enterprise `account.report` : list/recommend/describe/run/export, options période/partner/analytique/société/journaux) et `inspect_spreadsheet` (Odoo Spreadsheets et dashboards : list/inspect/explain_formula/suggest_formula, payload JSON/XLSX, inventaire `ODOO.*`). Nouveaux services `financial_report_service.py` et `spreadsheet_service.py`. Dispatcher enrichi avec bundles/patterns `financial_audit`, `spreadsheet_audit`, `financial-report-pattern`, `spreadsheet-formula-pattern` et pruning `financial-report-focus`, `spreadsheet-focus`. Eval queries 34/34 skills.
- `0.94.0` : ajout de 4 skills IA self-contained — `compare_odoo_versions` (diff statique modèle/vue/module entre versions Odoo locales), `inspect_automations` (audit `ir.cron`, `base.automation`, `ir.actions.server`, `mail.template`), `inspect_module_graph` (dépendances manifest + héritages modèles + Mermaid), `generate_diagram` (flow/class/model/view/module graph en Mermaid). Markdown frontend rend désormais les fences `mermaid` via lazy-load `MermaidBlock`. Dispatcher enrichi avec bundles/patterns `version_compare`, `automation_audit`, `diagram`, `module_graph` et pruning `automation-focus`, `diagram-focus`, `module-graph-focus`. Eval queries 32/32 skills.
- `0.93.1` : UI Settings — onglets du détail de skill nettoyés (suppression du suffixe `· N` sur Références / Exemples / Tests routing / Historique). Skills — comblement des 2 trous documentaires identifiés : `odoo_query_records` reçoit `references/query_pitfalls.md` (domaines polonais, `active_test`, contexte `lang`/`tz`/`company`/`bin_size`, pagination 500/5000, pièges modèles courants, erreurs XML-RPC) ; `odoo_inspect_modules` reçoit `references/module_taxonomy.md` (Community/Enterprise/custom, conventions de nommage, lecture de stack, dépendances pour cadrage migration). Lazy load, pas d'impact routage.
- `0.93.0` : audit BETTER_SKILLS appliqué (P2) — clauses limites élargies sur `output_report_writer` (cite désormais `runtime_attachment_handler`), `runtime_attachment_handler` (cite `output_report_writer`) et `source_show_commit` (cite `source_read_odoo_file` + `source_search_odoo`). Nouvelle règle dispatcher `pruned:deliverable-focus` (livrable + pièce jointe → attachment_handler désélectionné, output_report_writer dominant). +6 cas eval, couverture reste 28/28 skills, 190 cas. 592 tests.
- `0.92.0` : routing durci — 5 nouvelles règles de pruning (`query-focus`, `volume-focus`, `search-focus`, `repo-focus`, `migration-{search,read}-focus`) qui éliminent les fuites bundle entre familles ; nouveau pattern `migration-compare-pattern` ; `runtime_project_context_refresh` devient `allow_implicit_invocation: false` ; `source_read_odoo_file` enrichi de 17 keywords ciblés ; bundle `migration_target` étendu à `migration_read_target_file` ; bundle `odoo_source` enrichi (pluriels + `odoo/addons`). Eval queries 28/28 skills (couverture complète), 173 cas tous verts, **0 xfailed**. Nouveau panneau frontend « Tests routing » dans le détail de skill (route `GET /api/ai/skills/{name}/eval-queries`). 586 tests.
- `0.10.0` : implémentation des recommandations P0/P1 de l'audit runtime — fail-loud `unshare` absent (script refusé si `network=false`), +9 fichiers `eval_queries.json` (couverture 19/28 skills), nouveau test `test_no_implicit_core_invocation.py` (28 prompts × 6 runtime cœur), test `test_script_sandbox.py`, harnais `scripts/quality_eval/` (dataset 20 prompts + runner routing phase 1 100 % accuracy + README pour phase 2 LLM-as-judge). 528 tests passent, 15 xfailed documentent des faiblesses dispatcher connues.
- `0.9.0` : refonte des descriptions des 28 SKILL.md (front-load keywords, limites explicites, FR+EN), durcissement du dispatcher (`_MIN_SKILL_SCORE=25`, 6 nouvelles règles `pruned:*-focus`, word-boundary FR/EN), `allow_implicit_invocation: false` sur les 6 runtime cœur, token counting dans `execution_done`, +64 tests régressifs (path traversal, trigger routing sur 10 skills via `eval_queries.json`, cross-provider parity, budget overflow, auto-load references). 436 tests passent.
- `0.66.0` : propositions d'action extraites des réponses Markdown et affichées comme chips cliquables dans Assistant/Migration et le plein écran.
- `0.65.0` : nouveau skill cœur `attachment-handler` pour PDF/images, fallback GitHub Models/Copilot via `pypdf` puis `pdf2image`, tools `extract_pdf_text`, `pdf_to_images`, `compare_documents`.
- `0.64.0` : 28 `SKILL.md` opérationnels, routage par familles d'intention, bundles automatiques, événement SSE `skills_selected`, `query_odoo` exhaustif borné.
- `0.60.0` à `0.63.0` : migration vers dossiers de skills self-contained avec `SKILL.md`, `diagram/`, `references/`, `templates/`, `examples/`, `scripts/handler.py`, permissions déclaratives et auto-load de références.
- `0.55.0` à `0.57.0` : Sources enrichies avec commits, maintenance, `git_show_commit`, deepen automatique des shallow clones.

Avant de modifier une zone IA, vérifier la page À propos (`frontend/src/pages/About.tsx`) : son changelog est la source produit la plus fraîche.

## Architecture du repository

```text
backend/          Backend Python 3.10+ / FastAPI / SQLModel async / SQLite
  api/app.py                     App FastAPI, CORS, routes /api/*, static frontend build
  api/routes/                    sources, profiles, projects, queries, history, ai, context, creator, update, settings
  core/                          config, database, models, constantes de budget contexte
  services/                      logique métier : AI, Odoo, sources, projets, Studio, Creator, attachments, preview
  skills/                        loader Python et helpers partagés des skills
  cli/main.py                    commande `odoo-portal`
  mcp/server.py                  serveur MCP

frontend/                        React 18 / TypeScript strict / Vite / TanStack Query
  src/App.tsx                    routes SPA : sources, profiles, assistant, migration, creator, query, history, settings, about...
  src/api/client.ts              wrapper axios ; garder 1 endpoint = 1 fonction exportée
  src/pages/About.tsx            changelog produit affiché dans l'app
  src/components/Markdown.tsx    renderer Markdown custom + `extractActionItems`
  src/components/ActionProposals.tsx chips d'actions IA unifiées
  src/theme.css                  design system CSS variables + classes utilitaires
  src/version.ts                 `APP_VERSION`

tests/                           pytest backend/services/skills/routes
docs/                            notes produit/contexte
scripts/install.sh / scripts/start.sh            bootstrap local et lancement
```

## Données locales et chemins

- DB FastAPI : `~/.odoo-portal/portal.db` via `core/config.py`.
- Configuration IA/tools : `~/.odoo-consultant/model-config.json`, `~/.odoo-consultant/tool-config.json`.
- Sources Odoo actuelles : `~/.odoo-consultant/sources/<version>` et `<version>-enterprise`.
- Migration legacy : `api/routes/sources.py` migre `~/odoo-sources/` vers `~/.odoo-consultant/sources/` si nécessaire.
- Dépôts projet : `~/.odoo-consultant/repos/<profile>/<env>`.
- Workspaces VS Code générés : `~/.odoo-consultant/workspaces`.
- Contextes utilisateur : `~/.odoo-consultant/context/`, et anglais sous `~/.odoo-consultant/context/en/`.

Ne jamais stocker de secrets, dumps client ou pièces jointes volumineuses dans le repo.

## Backend : règles de contribution

- Garder les handlers FastAPI en `async def` et les accès DB via sessions async.
- Pour Git, subprocess et I/O bloquante, utiliser `loop.run_in_executor(None, ...)` ou un helper existant.
- Messages d'erreur utilisateur en français : `HTTPException(status_code=..., detail="...")`.
- Respecter les préfixes `/api/*` définis dans `api/app.py` et garder le client TS synchronisé.
- Les lectures Odoo passent par `services/odoo_client.py` et les skills ; ne pas contourner les limites de pagination.
- `query_odoo` doit rester exhaustif mais borné : `limit=0` par défaut, pages de 500, plafond 5000, retour `total_count`, `count`, `pages_fetched`, `truncated`, `warning` si partiel.
- Les outils IA doivent rester read-only sauf workflow Creator explicitement prévu.
- Les pièces jointes IA sont exposées aux tools via `services/attachment_store.py` : store in-memory par session, publication au début du chat, nettoyage en `finally`.

## Architecture skills IA

Toute capacité IA est un skill sous `skills/<slug>/`.

Structure canonique :
```text
SKILL.md              frontmatter YAML + playbook Markdown
diagram/diagram.yaml  entrées / logique / sorties FR+EN
references/           documentation longue, lazy ou eager via `references_auto_load`
templates/            formats de sortie imposés
examples/             few-shot good/bad usage
scripts/handler.py    logique in-process appelée par l'outil LLM
```

Règles importantes :
- Ajouter un skill = créer un dossier avec `SKILL.md` ; ne pas éditer `registry.py` sauf évolution du loader.
- Les noms de dossiers utilisent des tirets, les noms runtime utilisent des underscores (`query-odoo` → `query_odoo`).
- `scripts/handler.py` expose `async def run(args, ctx)` et peut déclarer `REQUIRES_ODOO`, `REQUIRES_SOURCE`, `REQUIRES_REPO`, `REQUIRES_TARGET`.
- Les handlers reçoivent un `ToolContext` (`odoo`, `source_path`, `repo_path`, `target_path`, `loop`) au lieu de paramètres dispersés.
- `load_skill_reference` et `run_skill_script` sont les deux meta-tools ; les permissions viennent du frontmatter (`filesystem`, `network`, `scripts`, `odoo`).
- Les références auto-loadables sont déclarées dans `references_auto_load` ; rester parcimonieux pour éviter le context rot.
- Les examples sont sélectionnés globalement (top 3, budget 4000 chars), pas injectés systématiquement.
- **Descriptions** (depuis 0.9.0) : front-load des mots-clés (pas `Utiliser ce skill quand…` en préfixe), limites explicites `Ne pas utiliser pour … (skill_X)` pour neutraliser les overlaps, FR + EN, 100–1024 chars. Test `test_skill_quality.test_all_skills_have_trigger_oriented_descriptions_and_permissions` verrouille la règle.
- **Skills runtime cœur** (context_aggregator, complexity_analyzer, localization_detector, perspective_router, release_notes_injector, skill_dispatcher) ont `allow_implicit_invocation: false` — ne jamais les sélectionner via simple keyword.
- **Dispatcher** (`backend/services/context_service.py::_select_skill_playbooks`) : scoring 5 niveaux (explicit 100, keywords 60, intent bundle 40, mode-default 25, pattern 75–90) + seuil minimum `_MIN_SKILL_SCORE = 25` + pruning post-scoring (`pruned:*-focus`). Toute nouvelle règle doit être couverte par un cas dans `tests/test_trigger_routing.py` via un `eval_queries.json`.
- **Eval queries** : **34/34 skills** ont un `eval_queries.json`. Convention : `expected_skill` informationnel, le test asserte sur le **owner** (dossier → underscore). Une entrée peut porter `"xfail": "raison..."` pour documenter une faiblesse dispatcher connue sans bloquer la CI. Pour les cores avec `allow_implicit_invocation: false`, le positif est typiquement le nom de skill brut + plusieurs négatifs montrant que le mot-clé ne déclenche pas implicitement.
- **Sandbox scripts** (depuis 0.10.0) : `run_skill_script_subprocess` refuse l'exécution quand `permissions.network=false` ET `unshare` est absent. Émet un `policy_decision denied=True permission=network` et retourne `{"ok": false, "sandbox_unavailable": true}`. Fail-loud sur poste sans util-linux.
- **Harnais qualité** : `scripts/quality_eval/` — `dataset.json` (28 prompts représentatifs), `run_routing_eval.py` (phase 1, déterministe, exit 0 si 100 % accuracy), `README.md` (phase 2 LLM-as-judge à activer manuellement).
- **Substring matching** : `_BOUNDARY_TOKENS` (mots courts ambigus en FR/EN, ex. `group`, `groupe`, `view`, `custom`) utilise `(?<!\w)…(?!\w)` ; le reste utilise du substring rapide. Ajouter à `_BOUNDARY_TOKENS` tout token qui risque de matcher un mot plus long (FR↔EN).

Skills présents au moment de cette mise à jour : `attachment-handler`, `compare-odoo-versions`, `complexity-analyzer`, `context-aggregator`, `count-odoo`, `count-source-lines`, `generate-diagram`, `get-odoo-fields`, `git-show-commit`, `inspect-automations`, `inspect-financial-reports`, `inspect-installed-modules`, `inspect-menus-actions`, `inspect-module-graph`, `inspect-odoo-report`, `inspect-odoo-view`, `inspect-security`, `inspect-spreadsheet`, `inspect-studio`, `list-project-modules`, `localization-detector`, `perspective-router`, `project-context-refresh`, `query-odoo`, `read-group-odoo`, `read-odoo-file`, `read-project-file`, `read-target-file`, `release-notes-injector`, `report-writer`, `search-odoo-source`, `search-project-source`, `search-target-source`, `skill-dispatcher`.

## Frontend : règles de contribution

- TypeScript strict : `npm run build` exécute `tsc -b` puis Vite.
- Pas de `react-markdown` : utiliser `components/Markdown.tsx`.
- Les blocs fenced `mermaid` sont rendus par `components/MermaidBlock.tsx` avec `import("mermaid")` lazy ; garder Mermaid hors du rendu Markdown initial et prévoir fallback code brut si le parse échoue.
- Les actions issues des réponses IA doivent passer par `extractActionItems` + `ActionProposals`, pas par un bouton inline dans le Markdown.
- Pas de styled-components : styles dans `theme.css` ou inline ponctuel.
- i18n simple : objets `copy = { fr: ..., en: ... }` dans les pages/composants ; UI `language` séparée de `contextLanguage`.
- Modals via `createPortal(..., document.body)` et classes `.ui-modal-*`.
- Persistance UI dans `localStorage` avec clés préfixées `odoo-*`.
- React Query pour les fetches, avec `staleTime` raisonnable (souvent 30–60 s).
- Respecter les Rules of Hooks : tous les hooks avant un early-return ; état de modal au parent si le trigger est ailleurs.
- Les event buses `streamingSignals` et `sourceSyncSignals` permettent les badges/dots inter-pages pendant les opérations background.

## IA, contexte et multimodal

- Providers supportés : Claude, OpenAI/GitHub Models/Copilot, Gemini.
- Les PDFs natifs sont gardés pour providers compatibles ; GitHub Models/Copilot passent par texte `pypdf`, puis images `pdf2image` si PDF scanné.
- `install.sh` tente d'installer `poppler-utils`/`poppler` pour `pdf2image`; sans poppler, expliquer clairement la limitation.
- Le contexte IA combine profil utilisateur, profil projet, localisation, complexité, release notes Odoo, sources locales, repo client, skills routés, données live et attachments.
- `userProfile.contextLanguage` prime sur `userProfile.language` pour les fichiers de contexte ; fallback `fr`.
- Perspectives valides seulement : `support`, `business_analyst`, `architect`, `developer`. `creator` est un workflow, pas une perspective.
- Si un prompt mentionne un SHA, pousser l'usage de `git_show_commit` plutôt que spéculer.

## Versioning et changelog

- Version affichée : `frontend/src/version.ts` (`APP_VERSION`).
- À chaque incrémentation de version applicative, l'agent IA doit garder la gestion cohérente dans le même changeset :
  1. bumper `APP_VERSION` dans `frontend/src/version.ts` ;
  2. ajouter une entrée en haut du `CHANGELOG` dans `frontend/src/pages/About.tsx` et retirer le badge `Actuel` des entrées précédentes ;
  3. mettre à jour `README.md` pour refléter la version, le bandeau et les capacités principales ;
  4. mettre à jour `CLAUDE.md` avec les changements d'architecture, règles ou informations de version utiles aux agents ;
  5. mettre à jour `AGENTS.md` si les consignes agent/versioning évoluent ou si la version courante y est référencée ;
  6. commit et push sur la branche Git courante, sauf demande explicite contraire de l'utilisateur.
- Le repo est historiquement resté en `0.x`; ne passer en `1.x` que sur demande explicite.
- Format commit release recommandé : `vX.YY — résumé court` ou `vX.YY.Z — résumé court`, factuel et court.

## Commandes utiles

Installation complète :
```bash
bash scripts/install.sh
```

Démarrage local :
```bash
bash scripts/start.sh
```

Backend/tests :
```bash
source .venv/bin/activate
pytest -q
pytest tests/test_skill_registry_integrity.py tests/test_tool_limits.py -q
pytest tests/test_trigger_routing.py tests/test_auto_load_references.py tests/test_context_budget_overflow.py tests/test_routing_provider_parity.py tests/test_skill_path_traversal.py -q
```

Frontend :
```bash
cd frontend
npm test
npm run build
```

Validation ciblée recommandée :
- Backend/service/skill modifié : lancer le ou les tests pytest adjacents, puis `pytest -q` si impact transversal.
- Frontend UI/Markdown : lancer `npm test`, puis `npm run build`.
- Version/changelog uniquement : vérifier au minimum que `APP_VERSION` et le badge `Actuel` restent cohérents.

## Pièges connus

- `frontend/package.json` peut avoir une version npm historique différente de `APP_VERSION`; la version produit est `frontend/src/version.ts`.
- Les clones Odoo sont shallow ; `get_commits_since` et `git_show_commit` peuvent deepen l'historique à la demande.
- Les modules Enterprise sont souvent à la racine du dépôt Enterprise (`enterprise/<module>/`), pas sous `addons/`.
- `GENERAL_KEY` / `profileId` côté Assistant : `profileId` peut être `number | 'general' | null`; sérialiser avec `String(profileId)` pour les clés.
- Ne pas réintroduire `ActionPromptButton` ni `.markdown-action-item-*`; les actions passent par les chips `ActionProposals`.
- Ne pas augmenter les budgets de contexte sans raison forte : les constantes protègent contre le context rot.
- Ne jamais utiliser `--no-verify` ou `--amend`. Ne créer un commit/push automatiquement que dans le cadre d'une incrémentation de version applicative ou si l'utilisateur le demande explicitement.

## Workflow attendu pour un agent IA

1. Lire la demande complète, identifier si elle touche backend, frontend, skills, docs ou versioning.
2. Inspecter les fichiers existants avant d'éditer ; privilégier les changements minimaux et cohérents avec le style courant.
3. Pour les skills, modifier le dossier du skill plutôt qu'ajouter de la logique dans `ai_service.py`.
4. Pour les pages frontend, synchroniser types TS, client API et copy FR/EN si nécessaire.
5. Valider avec les commandes les plus ciblées possible, puis élargir si l'impact est transversal.
6. Résumer en français, court et factuel, avec tests exécutés et limites éventuelles.

Le propriétaire du repo préfère des réponses directes, sans emojis dans le code/docs, et des changements livrés “tout d'un coup” quand la demande contient un batch.
