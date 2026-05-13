# Odoo Consultant Portal

Portail local pour consultants Odoo — assistant IA, exploration des sources, gestion multi-projets et multi-environnements.

> **v0.13.0** — Fonctionne entièrement en local. Seuls les appels aux API IA (Claude, OpenAI…) transitent par internet.

---

## Installation

### Prérequis

| Outil | Version | Rôle |
|---|---|---|
| Python | 3.11+ | Backend (obligatoire) |
| Node.js | 18+ | Interface web (obligatoire) |
| Git | récent | Sources Odoo, dépôts projets |

### Première installation

```bash
git clone https://github.com/le-goff-benoit/better_odoo_consultant.git
cd better_odoo_consultant
bash install.sh
```

Le script installe l'environnement Python, les dépendances, et compile l'interface web.

### Démarrage

```bash
bash start.sh
```

Le portail s'ouvre à **http://localhost:8765**.

---

## Fonctionnalités

### Sources Odoo

Téléchargez et maintenez à jour les sources Odoo Community et Enterprise (v15 à v19+) en local.

- Détection automatique de l'accès GitHub SSH (Enterprise)
- Génération de clé SSH guidée si nécessaire
- Mise à jour incrémentale avec barre de progression
- Versions intermédiaires (saas) supportées

### Projets & Environnements

Gérez vos connexions aux instances Odoo de vos clients.

**Wizard de création en 3 étapes :**
1. Nom du projet + URL de l'instance
2. Identifiants + test de connexion automatique (détecte la version, les modules, la société)
3. Récapitulatif

**Par projet :**
- Plusieurs **environnements** (production, staging, dev…) avec identifiants indépendants, version Odoo propre et dépôt GitHub dédié
- Sélection de la **société active** (multi-société Odoo)
- Vérification des **droits d'accès** (admin système, admin ERP détectés avec avertissement)
- **Contexte projet** : notes libres injectées dans les prompts IA, avec auto-complétion par l'IA

### Sources complémentaires (dépôts custom)

Chaque environnement peut avoir un **dépôt GitHub** associé (modules custom du client).

- Clone et mise à jour via SSH (réutilise les clés SSH existantes)
- Stocké dans `~/.odoo-consultant/repos/{projet}/{env}/`
- Badge `✓ ⎇ {repo}` dans la barre de contexte de l'assistant quand actif
- L'IA explore le code custom via `search_project_source` et `read_project_file`
- L'auto-complétion du contexte projet lit automatiquement les `__manifest__.py`

### Assistant IA

Posez des questions sur vos données Odoo et votre code source en langage naturel.

**Providers supportés :**
| Provider | Modèles |
|---|---|
| Anthropic Claude | Sonnet 4.6, Opus 4.7, Haiku 4.5 |
| OpenAI | GPT-4o, GPT-4o mini, o1 mini |
| Google Gemini | 2.0 Flash, 1.5 Pro, 1.5 Flash |
| GitHub Models | GPT-4o, Claude 3.5/3.7, Llama… |
| GitHub Copilot Business | GPT-5.x, Claude 4.x, Gemini 3.x, Grok… |

**Outils disponibles pour l'IA (selon le contexte) :**
| Outil | Description |
|---|---|
| `query_odoo` | Recherche d'enregistrements (search_read) |
| `count_odoo` | Comptage d'enregistrements |
| `get_odoo_fields` | Liste des champs d'un modèle |
| `search_odoo_source` | Grep dans les sources Odoo standard |
| `read_odoo_file` | Lecture d'un fichier source Odoo |
| `search_project_source` | Grep dans le dépôt custom du projet |
| `read_project_file` | Lecture d'un fichier du dépôt custom |

**Barre de contexte :**
- Onglets par projet + mode général
- Sélecteur provider/modèle unifié
- Sélecteur d'environnement par conversation (override temporaire)
- Badge sources Odoo installées (C / E / C+E)
- Badge dépôt custom actif

### Requêtes

Explorateur de données Odoo avec domaine, champs et pagination.
Export en Markdown, CSV ou Excel.

### Paramètres

- Clés API par provider avec bouton de test
- Connexion Copilot Business via OAuth Device Flow (sans clé API)
- Préférences de modèles par provider
- Profil consultant (nom, titre, équipe) injecté dans les prompts

---

## Développement

```bash
# Backend — API FastAPI avec rechargement automatique
source .venv/bin/activate
odoo-portal serve --reload

# Frontend — Vite dev server
cd frontend
npm run dev
# → http://localhost:5173 (proxy vers :8765)
```

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `ODOO_PORTAL_DATA_DIR` | `~/.odoo-consultant` | Dossier de données (DB, exports, repos) |
| `ODOO_PORTAL_API_PORT` | `8765` | Port de l'API |

Créez un fichier `.env` à la racine pour les surcharger.

### Tests

```bash
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Stockage des secrets

Les clés API (Odoo, IA) sont stockées dans le **keyring système** (Keychain macOS, Secret Service Linux) — jamais en clair dans la base de données.

---

## Architecture

```
better_odoo_consultant/
├── odoo_consultant_portal/
│   ├── api/routes/         # Endpoints FastAPI (profiles, ai, sources, queries…)
│   ├── core/               # Modèles SQLModel, base SQLite, config
│   └── services/           # OdooClient (XML-RPC), ai_service, keyring, source_manager
├── frontend/
│   └── src/
│       ├── pages/          # Assistant, Profiles, Sources, Settings, About…
│       ├── api/client.ts   # Appels API axios
│       └── theme.ts        # Design tokens
├── install.sh              # Installateur automatique
└── start.sh                # Lanceur
```

**Stack :**
- Backend : FastAPI + SQLModel + SQLite (async)
- Frontend : React + TanStack Query + Vite
- Secrets : keyring système (pas de .env pour les credentials)

---

## Licence

MIT
