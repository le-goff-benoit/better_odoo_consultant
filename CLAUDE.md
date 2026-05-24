# CLAUDE.md

Guide d'orientation pour Claude Code, GitHub Copilot et tout autre assistant IA qui intervient sur ce repository.

Dernière mise à jour contextuelle : 2026-05-24, alignée sur l'app `0.66.0` et les derniers commits `main`.

## Mission du produit

Better Odoo Assistant est une web-app locale pour consultant Odoo : elle centralise les sources Odoo Community/Enterprise, les projets clients, les dépôts custom, les connexions XML-RPC et un assistant IA outillé qui sait lire le contexte métier, les données live, le code source et les pièces jointes.

Principes produit à préserver :
- **Local-first** : l'app tourne sur la machine utilisateur ; seuls les appels providers IA sortent vers internet.
- **Contexte défini et vivant** : la qualité IA vient de sources locales fraîches, profils client, skills routés et données live bornées.
- **Consultant-first** : réponses en français par défaut, utiles en mission, actionnables et prêtes à transformer en analyse, email, plan ou changelog.
- **Read-only par défaut** : les outils IA consultent Odoo, les sources et les dépôts ; les écritures Odoo passent par les workflows explicites du Creator.

## État récent à connaître

Les derniers commits ont surtout transformé l'IA en architecture pilotée par skills :
- `0.66.0` : propositions d'action extraites des réponses Markdown et affichées comme chips cliquables dans Assistant/Migration et le plein écran.
- `0.65.0` : nouveau skill cœur `attachment-handler` pour PDF/images, fallback GitHub Models/Copilot via `pypdf` puis `pdf2image`, tools `extract_pdf_text`, `pdf_to_images`, `compare_documents`.
- `0.64.0` : 28 `SKILL.md` opérationnels, routage par familles d'intention, bundles automatiques, événement SSE `skills_selected`, `query_odoo` exhaustif borné.
- `0.60.0` à `0.63.0` : migration vers dossiers de skills self-contained avec `SKILL.md`, `diagram/`, `references/`, `templates/`, `examples/`, `scripts/handler.py`, permissions déclaratives et auto-load de références.
- `0.55.0` à `0.57.0` : Sources enrichies avec commits, maintenance, `git_show_commit`, deepen automatique des shallow clones.

Avant de modifier une zone IA, vérifier la page À propos (`frontend/src/pages/About.tsx`) : son changelog est la source produit la plus fraîche.

## Architecture du repository

```text
odoo_consultant_portal/          Backend Python 3.10+ / FastAPI / SQLModel async / SQLite
  api/app.py                     App FastAPI, CORS, routes /api/*, static frontend build
  api/routes/                    sources, profiles, projects, queries, history, ai, context, creator, update, settings
  core/                          config, database, models, constantes de budget contexte
  services/                      logique métier : AI, Odoo, sources, projets, Studio, Creator, attachments, preview
  skills/                        28 skills auto-découverts, cœur de l'architecture IA
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
install.sh / start.sh            bootstrap local et lancement
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

Toute capacité IA est un skill sous `odoo_consultant_portal/skills/<slug>/`.

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

Skills présents au moment de cette mise à jour : `attachment-handler`, `complexity-analyzer`, `context-aggregator`, `count-odoo`, `count-source-lines`, `get-odoo-fields`, `git-show-commit`, `inspect-installed-modules`, `inspect-menus-actions`, `inspect-odoo-report`, `inspect-odoo-view`, `inspect-security`, `inspect-studio`, `list-project-modules`, `localization-detector`, `perspective-router`, `project-context-refresh`, `query-odoo`, `read-group-odoo`, `read-odoo-file`, `read-project-file`, `read-target-file`, `release-notes-injector`, `report-writer`, `search-odoo-source`, `search-project-source`, `search-target-source`, `skill-dispatcher`.

## Frontend : règles de contribution

- TypeScript strict : `npm run build` exécute `tsc -b` puis Vite.
- Pas de `react-markdown` : utiliser `components/Markdown.tsx`.
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
bash install.sh
```

Démarrage local :
```bash
bash start.sh
```

Backend/tests :
```bash
source .venv/bin/activate
pytest -q
pytest tests/test_skill_registry_integrity.py tests/test_tool_limits.py -q
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
