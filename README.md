# Better Odoo Assistant

**Le portail local du consultant Odoo : sources, projets clients, dépôts custom et assistant IA outillé — sur votre machine.**

Better Odoo Assistant centralise tout ce dont vous avez besoin en mission : sources Odoo Community + Enterprise, connexions XML-RPC aux instances clients, dépôts custom clonés, et surtout un **assistant IA piloté par skills** qui sait lire le code, les données live et les pièces jointes pour répondre avec des faits, pas des suppositions.

> **Local-first.** L'app tourne entièrement sur votre poste. Seuls les appels aux providers IA (Claude / OpenAI / Gemini / GitHub Models / Copilot) transitent par internet — vers le provider que vous choisissez.
>
> **Version actuelle :** `0.100.11` — wireframe de vue Odoo dans les réponses IA : le skill `odoo_inspect_view` génère un bloc `viewmock` rendu comme formulaire/liste fil-de-fer (statusbar, groupes de champs, onglets). **Précédemment en 0.100.10** — BA agent : qualité de réponse renforcée — 5 règles ciblées sur la surcharge technique (input/output, Standard/Config cap 3-4 bullets, TL;DR obligatoire, triggers volets, odoo:// dans tableaux). **Précédemment en 0.100.9 :** volets structurels (`:::volet[type] Titre`). **Précédemment en 0.100.0** — séparateurs HR + liens `odoo://` cliquables + callout « Exemples concrets sur cette base ». `---` rendu comme `<hr>` stylé. Nouveau scheme `odoo://<model>/<id>` que le LLM produit en Markdown `[libellé](odoo://sale.order/42)` et que le frontend résout en lien cliquable vers la fiche Odoo (avec icône ↗). Nouveau callout dédié (carte tintée + icône ampoule) pour la section « Exemples concrets » du BA — ancrage visible des réponses dans la donnée client réelle. Template `business_impact_review` + BA `AGENT.md` mis à jour pour exiger 1-3 exemples concrets cités via `odoo://`, ramenés par `odoo_query_records`. Helper `resolveOdooUri` exporté, +10 tests Vitest. Suite 98 frontend + 822 backend. **Précédemment en 0.99.4 :** validation backend défensive des IDs de modèle. Même après le retrait de `gpt-5.5` du catalogue front en 0.99.1, les bundles utilisateurs en cache continuaient à POSTer l'ID au chat endpoint → `400 unsupported_api_for_model`. Nouvelle constante `KNOWN_MODELS` server-side + helper `_validate_or_fallback_model` qui mappe les IDs inconnus vers `DEFAULT_MODELS[provider]` avec event SSE `model_fallback`. L'utilisateur reçoit une vraie réponse au lieu d'un 400. +7 tests régressifs, suite backend 822 verts. **Précédemment en 0.99.3 :** bugfix rendu sous-bullets : la regex de détection d'items de liste dans `Markdown.tsx` était ancrée en tout début de ligne sans tolérer l'indentation. Les sous-bullets `  - sub item` que produit le LLM tombaient dans `<p>` et le tiret apparaissait comme texte brut. Nouvelles regex avec capture d'indentation, helper `indentDepth`, rendu hiérarchique (`paddingLeft: depth × 18px`, marqueur creux `◦` aux niveaux ≥1). +2 tests régressifs. **Précédemment en 0.99.2 :** fix BA framing + scaffolding template qui fuit. Avant : un BA demandant « y a-t-il des modifs Studio » récupérait `technical_review` (file:ligne, slots Python, blockquotes `> Ce qui empêche la mise en prod. Vide si rien.` recopiées telles quelles). Nouveau template `business_impact_review` orienté flux métier (Ventes / Achats / SAV / Stock / Facturation) avec tableau structurant Flux × Modules × Type de personnalisation × Impact utilisateur. Sélection agent-aware via `preferred_agents` / `forbidden_agents` sur `SkillTemplate`. `technical_review.md` nettoyé (blockquotes en `<!-- ... -->`, slot Python conditionnel). BA AGENT.md renforcé (« tu n'es pas un inventaire technique »). Recalibrage tableaux : 1-2 tableaux structurants par réponse quand on croise deux dimensions, plus la règle trop dure de 0.98.0. +6 tests, suite backend 815 verts. **Précédemment en 0.99.1 :** catalogue OpenAI nettoyé des IDs hallucinés (`gpt-5.5` etc.) qui causaient `400 unsupported_api_for_model`. **Précédemment en 0.99.0 :** refonte UX Settings → API & Modèles. Carte unifiée par provider (clé API + sélecteur de modèles dans la même carte), autosave optimiste, lignes riches avec ★ recommandés, regroupement par famille pour GitHub Models et Copilot. **Précédemment en 0.98.1 :** modèles GitHub/Copilot chargés en live depuis les APIs respectives. **Précédemment en 0.98.0 :** qualité des réponses IA — trois axes adressés en un commit, autour de la même promesse produit (contexte défini et vivant, consultant-first, réponses actionnables). (1) Bloc « Contexte projet » prioritaire unifié dans `runtime-complexity-analyzer` (client + localisation fiscale + profil technique calculé + modules custom + apps installées + stratégie), affiche explicitement « non calculée » quand le diagnostic n'a pas été lancé pour que l'IA ne suppose plus une base vanilla par défaut. (2) Consignes preuves systématiques (fichier:ligne, champ, vue, SHA, traceback) + step further explicite ajoutées aux 4 AGENT.md (FR + EN) ; ton support précis/actionnable/rapide avec alerte custom/Studio, ton BA pédagogique avec concept + mode opératoire + limites. (3) Règle tableaux durcie dans `ai_service.py` : tableau uniquement pour ≥3 éléments × ≥2 dimensions, pas de chaînage ; le mode migration garde le tableau comparatif Source/Cible. Harnais éval : 14 cas qualité + scoring déterministe `criteria_hits` (cite:/step:/context:) + métrique `avg_table_count`. Suite 809 passed. Voir le changelog complet dans la page **À propos** de l'app.

---

## Table des matières

- [Ce que l'app fait](#ce-que-lapp-fait)
- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Les pages de l'app](#les-pages-de-lapp)
- [Comment l'assistant IA répond avec précision](#comment-lassistant-ia-répond-avec-précision)
- [Architecture skills IA](#architecture-skills-ia)
- [Providers IA supportés](#providers-ia-supportés)
- [Multilingue (FR + EN)](#multilingue-fr--en)
- [Données locales et secrets](#données-locales-et-secrets)
- [Architecture & développement](#architecture--développement)
- [Licence](#licence)

---

## Ce que l'app fait

Pour un consultant Odoo en mission, Better Odoo Assistant remplit 5 rôles :

1. **Hub sources Odoo** — téléchargement et maintenance des sources Community + Enterprise (v15 → v19), partagées entre tous les projets clients.
2. **CRM projets clients** — fiche par client, environnements multiples (prod / staging / dev), connexion XML-RPC, dépôt custom cloné par environnement.
3. **Assistant IA outillé** — chat conversationnel avec accès live à Odoo (lecture seule), aux sources standard, au code custom et aux pièces jointes (PDF / images / Excel / tableaux).
4. **Migration assistée** — assistant dédié au passage d'une version Odoo à une autre, avec sources source + cible chargées simultanément et release notes injectées.
5. **Creator Studio** — workflow IA pour proposer, prévisualiser (rendu de vue + PDF) puis appliquer des personnalisations Odoo Studio sur l'instance connectée.

L'app reste **read-only par défaut sur Odoo** : seuls les workflows Creator écrivent, et uniquement après validation explicite.

---

## Installation

### Prérequis

| Outil | Version minimum | Note |
|---|---|---|
| Python | 3.10+ | |
| Node.js | 18+ | pour builder l'interface |
| Git | toute version récente | |
| `poppler-utils` | optionnel | pour les PDF scannés (auto-installé par `scripts/install.sh`) |

### Installation (une fois)

```bash
git clone https://github.com/le-goff-benoit/better_odoo_consultant.git
cd better_odoo_consultant
bash scripts/install.sh
```

Le script crée `.venv`, installe les dépendances Python, builde le frontend, et tente d'installer `poppler-utils` (apt / brew / dnf) — sans `poppler`, le skill `attachment_handler` bascule sur extraction texte seule (pypdf) avec message explicite si le PDF est scanné.

### Démarrage

```bash
bash scripts/start.sh
```

L'app s'ouvre sur **http://localhost:8765**.

### CLI

```bash
source .venv/bin/activate
odoo-portal --help          # ou: better-odoo-assistant --help
```

---

## Démarrage rapide

```
1. Sources       → téléchargez la version Odoo du client (Community + Enterprise si besoin)
2. Paramètres    → ajoutez une clé API IA (Claude / GPT / Gemini / GitHub Models / Copilot)
3. Mes projets   → créez le projet client : URL, base, login, clé API Odoo
4. Assistant IA  → posez vos premières questions sur les données du client
```

Tout est cumulatif : plus vous configurez de sources, plus l'IA peut répondre avec des faits vérifiés au lieu d'hypothèses.

---

## Les pages de l'app

| Page | Rôle |
|---|---|
| **Tableau de bord** | Vue d'ensemble : projets, sources installées, dernières conversations |
| **Sources** | Téléchargement et mise à jour des sources Odoo (`~/.odoo-consultant/sources/`) |
| **Mes projets** | Liste des projets clients avec environnements, dépôts custom, contexte projet |
| **Assistant IA** | Chat outillé, mode projet ou général, agents consultants (Support / BA / Architecte / Dev — extensibles via `agents/<slug>/AGENT.md`) |
| **Migration** | Chat dédié migration : sources source + cible chargées, release notes filtrées par domaine |
| **Creator** | Workflow Studio : propositions IA, aperçu vue / PDF, application sur l'instance |
| **Requêtes** | Console XML-RPC manuelle pour exploration ponctuelle |
| **Historique** | Conversations archivées par projet |
| **Fonctionnement** | Diagramme vertical de bout en bout : profil, providers, contexte, outils |
| **Paramètres** | Profil consultant, clés API, modèles activés, fichiers Markdown de contexte, agents de réponse |
| **À propos** | Changelog complet de toutes les versions |

---

## Comment l'assistant IA répond avec précision

Un modèle IA générique connaît Odoo dans les grandes lignes — mais **pas votre version exacte, pas vos modules custom, pas vos données réelles**. Sans sources locales, il invente des noms de champs, suppose des comportements, ou donne des réponses valables pour une autre version.

Better Odoo Assistant lui fournit **trois couches de contexte cumulatives** :

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CONTEXTE INJECTÉ DANS L'IA                          │
├──────────────────────┬───────────────────────────┬─────────────────────────── ┤
│  Données live        │  Sources Odoo standard    │  Code custom               │
│  (XML-RPC)           │  (téléchargées localement)│  (dépôt GitHub cloné)      │
│                      │                           │                            │
│  • Enregistrements   │  • Code Community         │  • Modules client          │
│    réels             │    + Enterprise           │  • Overrides / _inherit    │
│  • Modules installés │  • Modèles, champs,       │  • Vues, wizards custom    │
│  • Société active    │    méthodes exacts        │  • Logique métier propre   │
│  • Localisation pays │  • Toutes versions DL     │  • Fichiers de sécurité    │
├──────────────────────┴───────────────────────────┴────────────────────────────┤
│  + Profil consultant + perspective de réponse                                │
│  + Contexte projet (notes libres, auto-complétables)                         │
│  + Skills routés selon l'intention + références auto-chargées                │
│  + Pièces jointes uploadées (PDF, images, Excel, texte structuré)            │
└──────────────────────────────────────────────────────────────────────────────┘
```

Le **dispatcher de skills** (`backend/services/context_service.py::_select_skill_playbooks`) sélectionne dynamiquement les outils utiles pour chaque prompt, avec scoring multi-niveaux (explicit name = 100, pattern = 75-90, keywords = 60, intent bundle = 40, mode default = 25) et un seuil minimum (`_MIN_SKILL_SCORE = 25`). Les règles de pruning post-scoring (`count-focus`, `schema-focus`, `list-modules-focus`, `attachment-focus`, `navigation-focus`, `view-focus`, `security-focus`, `report-focus`) suppriment les voisins faiblement matchés pour garder le contexte concentré sur l'intention dominante.

L'effet utilisateur : l'IA cite des chemins de fichiers exacts, lit le vrai code custom avant de proposer un override, et signale explicitement quand une source manque (« je n'ai pas accès aux sources Enterprise pour cette version »).

---

## Architecture skills IA

L'app fonctionne avec **34 skills self-contained** sous `skills/<slug>/`, chacun structuré ainsi :

```
skills/<slug>/
├── SKILL.md              # frontmatter YAML (name, description FR+EN, keywords,
│                         #  permissions, references_auto_load) + playbook Markdown
├── diagram/diagram.yaml  # entrées / logique / sorties (FR + EN)
├── references/           # documentation longue, chargée à la demande ou auto
├── templates/            # formats de sortie imposés (revue technique, plan migration…)
├── examples/             # few-shot good/bad usage, sélectionnés globalement
├── scripts/handler.py    # logique in-process : async def run(args, ctx)
└── eval_queries.json     # (optionnel) cas régressifs de routage
```

### Catégories de skills

| Famille | Skills | Rôle |
|---|---|---|
| **Live Odoo** (`live`) | `odoo-query-records`, `odoo-count-records`, `odoo-aggregate-records`, `odoo-inspect-fields`, `odoo-inspect-modules`, `odoo-inspect-navigation`, `odoo-inspect-report`, `odoo-inspect-security`, `odoo-inspect-studio`, `odoo-inspect-view`, `inspect-automations`, `inspect-financial-reports`, `inspect-spreadsheet` | Lecture XML-RPC bornée, schema, KPI, vues assemblées, droits, automatismes serveur, rapports financiers, spreadsheets |
| **Source standard** (`src`) | `source-search-odoo`, `source-read-odoo-file`, `source-show-commit`, `compare-odoo-versions`, `generate-diagram` | Grep / read / git show sur Odoo Community + Enterprise local, diff de versions, diagrammes Mermaid avec standard visuel |
| **Dépôt client** (`repo`) | `repo-search-code`, `repo-read-file`, `repo-list-modules`, `repo-count-source-lines`, `inspect-module-graph` | Idem mais sur le dépôt custom cloné, graphes manifest/héritage |
| **Migration** (`target`) | `migration-search-target-source`, `migration-read-target-file` | Sources de la version cible pour comparaison source → cible |
| **Output** | `output-report-writer` | Livrables structurés : revue technique, plan de migration, email client, cahier des charges |
| **Multimodal** | `runtime-attachment-handler` | PDF (pypdf → pdf2image), images, comparaison de documents, routage provider |
| **Runtime cœur** | `runtime-skill-dispatcher`, `runtime-context-aggregator`, `runtime-perspective-router`, `runtime-complexity-analyzer`, `runtime-localization-detector`, `runtime-release-notes-injector`, `runtime-project-context-refresh` | Orchestration interne — `allow_implicit_invocation: false` (jamais sélectionnés sur simple keyword) |

### Permissions et exécution

Chaque skill déclare ses permissions dans son frontmatter :

```yaml
permissions:
  filesystem: read     # read | write | none
  network: false       # bool
  scripts: false       # bool — autorise run_skill_script
  odoo: read           # read | write | none
```

Le `PolicyEngine` (`backend/services/policy_engine.py`) **enforce vraiment** ces permissions — pas seulement déclaratif. Tout appel `load_reference` ou `run_skill_script` qui viole la policy est refusé avec un event `policy_decision` loggé. Les scripts s'exécutent en subprocess isolé (timeout 30 s, stdout 32 k, stderr 4 k, `unshare -n` si réseau interdit et disponible).

### Tests régressifs

Toute modification de skill (description, keywords, règle de routage) est protégée par les suites régressives backend et frontend :

| Suite | Couverture |
|---|---|
| `tests/test_skill_registry_integrity.py` | découverte, parsing manifest, aliases legacy |
| `tests/test_skill_quality.py` | descriptions ≤ 1024 chars, pas de préfixe vague, permissions valides |
| `tests/test_skill_path_traversal.py` | défense `../`, NUL injection, symlinks d'évasion |
| `tests/test_trigger_routing.py` | cas paramétrés sur les `eval_queries.json` de tous les skills |
| `tests/test_routing_provider_parity.py` | invariant : routing identique Claude / OpenAI / Gemini |
| `tests/test_context_budget_overflow.py` | budget 32 k chars verrouillé bout-en-bout (hard cap 36 k) |
| `tests/test_auto_load_references.py` | les 12 références auto-chargées paramétrées |
| `tests/test_skill_runtime_events.py` | events runtime (policy, reference, script, provider, tokens) |
| `tests/test_policy_engine.py` | enforcement des 4 axes de permission |
| `tests/test_toolset_builder.py` | assemblage des toolsets per-provider |
| `tests/test_agent_response_eval.py` | dataset 200 cas agents + dry-run du banc d'amélioration `AGENT.md` |

Le banc `scripts/quality_eval/run_agent_response_eval.py` complète les tests
de routing avec une baseline qualité centrée agents : 200 prompts Odoo
répartis sur Support / Business Analyst / Architecte / Développeur, scoring
déterministe agent + tool-use, sorties JSONL et rapport Markdown. Les dimensions
qualitatives (`odoo_accuracy`, `answer_quality`, `handoff_quality`) sont
alimentables par traces de réponses et revue LLM/humaine, mais restent hors CI
pour éviter coût API et non-déterminisme.

---

## Providers IA supportés

| Provider | Comment obtenir une clé |
|---|---|
| **Claude** (Anthropic) | [console.anthropic.com](https://console.anthropic.com) |
| **GPT** (OpenAI) | [platform.openai.com](https://platform.openai.com) |
| **Gemini** (Google) | [aistudio.google.com](https://aistudio.google.com) |
| **GitHub Models** | Token GitHub classique |
| **GitHub Copilot Business** | Connexion OAuth — aucune clé à copier |

L'app utilise des **adapters provider-agnostiques** (`backend/services/provider_adapters.py`) : les tools sont déclarés au format natif de chaque provider (Claude objects, OpenAI function calling, Gemini function_declarations) mais le routage de skills, les permissions et le budget de contexte sont identiques pour tous. Switcher de Claude à Gemini ne change pas quel skill répond.

Le **system prompt est scindé** en bloc stable (cacheable Anthropic) + bloc variable, avec `cache_control: ephemeral` posé à la frontière. L'event SSE `done` expose `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` pour mesurer l'efficacité du cache.

Les **PDF natifs** sont gardés pour les providers compatibles (Claude, OpenAI direct, Gemini). GitHub Models / Copilot bénéficient d'un fallback automatique : `pypdf` pour extraction texte, puis `pdf2image` si le PDF est scanné.

---

## Multilingue (FR + EN)

Trois niveaux indépendants :

1. **Langue de l'app** — Paramètres → Profil. Bascule l'UI complète FR ↔ EN.
2. **Langue des réponses IA** — Auto (dernier message utilisateur), Français forcé, English forcé. Les identifiants Odoo (modèles, champs, XML IDs, chemins) ne sont jamais traduits.
3. **Langue des fichiers de contexte** — `~/.odoo-consultant/context/` pour FR (legacy), `~/.odoo-consultant/context/en/` pour EN. Defaults fournis pour `consultant-memo.md` (mémo consultant, pas dispatcher de skills), `creator-conventions.md`, `migration.md`, `studio.md`, `meeting-minute.md` et `odoo-15.0.md` → `odoo-19.0.md`.

---

## Données locales et secrets

Tous les chemins sont sous `~/.odoo-consultant/` :

```
~/.odoo-consultant/
├── portal.db                 # SQLite — projets, environnements, métadonnées
├── model-config.json         # clés API et modèles activés (chiffrées via keyring)
├── tool-config.json          # skills désactivés par l'utilisateur
├── sources/
│   ├── 17.0/                 # Odoo Community 17.0
│   └── 17.0-enterprise/      # Odoo Enterprise 17.0
├── repos/
│   └── <profile>/<env>/      # dépôts custom clonés par environnement
├── workspaces/               # workspaces VS Code générés
└── context/                  # fichiers Markdown éditables (consultant-memo.md, studio.md, …)
    └── en/                   # variantes anglaises
```

| Donnée | Où | Garantie |
|---|---|---|
| Clés API (Odoo, IA) | **Keyring système** (Keychain macOS / Secret Service Linux) | Jamais en clair dans la DB |
| Métadonnées projets | SQLite `~/.odoo-consultant/portal.db` | Local uniquement |
| Sources Odoo | Filesystem `~/.odoo-consultant/sources/` | Local uniquement |
| Dépôts custom | Filesystem `~/.odoo-consultant/repos/` | Local uniquement |
| Conversations | localStorage navigateur | Local uniquement |
| Pièces jointes uploadées | In-memory (ContextVar) pendant le chat, nettoyées en `finally` | Jamais persistées |
| Messages envoyés à l'IA | **Sortent vers le provider choisi** | Le seul flux externe |

L'app ne stocke **jamais** de dumps client, de données Odoo répliquées ou de pièces jointes au-delà de la session de chat.

---

## Architecture & développement

### Stack technique

| Couche | Technologie |
|---|---|
| Backend | Python 3.10+, FastAPI (async), SQLModel + aiosqlite |
| Frontend | React 18 + TypeScript strict, Vite, TanStack Query |
| IA SDKs | `anthropic`, `openai`, `google-generativeai` |
| Multimodal | `pypdf`, `pdf2image` (+ poppler-utils), `openpyxl` |
| Secrets | `keyring` (Keychain / Secret Service / Windows Credential Manager) |
| Sources Git | `gitpython`, subprocess `git` |
| MCP | `mcp>=1.0` — exposition des outils via Model Context Protocol |

### Structure du repo

```
better_odoo_consultant/
├── agents/                       # Agents de réponse (personas) — un dossier
│   ├── support/                  # par agent, AGENT.md + profile + migration
│   ├── business-analyst/         # + eval_queries.json. Loader pur,
│   ├── architect/                # nouveau dossier = nouvel agent dans l'UI.
│   └── developer/
├── backend/
│   ├── api/
│   │   ├── app.py                 # FastAPI app, CORS, static build serving
│   │   └── routes/                # ai, context, creator, history, profiles,
│   │                              # projects, queries, settings, sources, update
│   ├── core/
│   │   ├── models.py              # SQLModel: Profile, Project, Environment, …
│   │   ├── database.py            # async SQLite
│   │   ├── config.py              # ODOO_PORTAL_DATA_DIR, ports, paths
│   │   └── context_constants.py   # CONTEXT_BUDGET_CHARS (32k), MAX_CONTEXT_CHARS (36k)
│   ├── services/
│   │   ├── ai_service.py          # stream_chat, provider routing, system prompt
│   │   ├── context_service.py     # _select_skill_playbooks, pruning, budget
│   │   ├── execution_engine.py    # run_tool, ToolContext, handler dispatch
│   │   ├── policy_engine.py       # enforcement des permissions skills
│   │   ├── skill_loader.py        # _safe_resolve (path traversal defense)
│   │   ├── skill_runtime.py       # SkillRuntimeEvent (tokens, durations, denies)
│   │   ├── provider_adapters.py   # 5 adapters (Claude, OpenAI, GitHub, Copilot, Gemini)
│   │   ├── toolset_builder.py     # assemblage per-provider
│   │   ├── attachment_store.py    # ContextVar in-memory pour PDFs / images uploadés
│   │   ├── odoo_client.py         # XML-RPC bornée
│   │   └── ...                    # creator_*, profile_manager, source_manager, etc.
│   ├── skills/
│   │   ├── registry.py            # découverte + dedup + diagnostics
│   │   ├── manifest.py            # parsing YAML + validation
│   │   └── _shared/               # helpers réutilisés par plusieurs handlers
│   ├── cli/main.py                # entry point `odoo-portal`
│   └── mcp/server.py              # serveur MCP
├── frontend/
│   └── src/
│       ├── pages/                 # 12 pages (Assistant, Migration, Creator, …)
│       ├── components/            # Markdown, ActionProposals, modals, panels
│       ├── api/client.ts          # wrapper axios (1 endpoint = 1 fonction)
│       ├── utils/aiContext.ts     # extraction action items
│       └── theme.css              # design system (CSS variables, neo-retro)
├── skills/                        # 34 dossiers self-contained (voir section dédiée)
├── scripts/
│   ├── install.sh                 # bootstrap complet
│   └── start.sh                   # lancement local
├── tests/                         # tests pytest backend/services/skills/routes
└── docs/                          # notes techniques / audits
```

### Lancer en développement

```bash
# Terminal 1 — backend avec reload
source .venv/bin/activate
odoo-portal serve --reload

# Terminal 2 — frontend Vite
cd frontend
npm run dev
# → http://localhost:5173 (proxy vers :8765)
```

### Tests

```bash
# Suite complète
source .venv/bin/activate
pytest -q

# Suites ciblées pour le runtime skills
pytest tests/test_skill_registry_integrity.py tests/test_tool_limits.py -q
pytest tests/test_trigger_routing.py tests/test_auto_load_references.py \
       tests/test_context_budget_overflow.py tests/test_routing_provider_parity.py \
       tests/test_skill_path_traversal.py -q

# Frontend
cd frontend
npm test
npm run build
```

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `ODOO_PORTAL_DATA_DIR` | `~/.odoo-consultant` | Dossier racine des données locales |
| `ODOO_PORTAL_API_PORT` | `8765` | Port HTTP de l'API + static build |

### Contribuer

Le repo a deux fichiers de guide pour assistants IA (Claude Code, GitHub Copilot, etc.) :
- **`CLAUDE.md`** — règles produit, architecture skills, conventions backend/frontend, pièges connus, workflow versioning.
- **`AGENTS.md`** — règles génériques de contribution agent.

Lire ces deux fichiers avant toute modification non triviale.

---

## Licence

MIT
