# CLAUDE.md

Guide d'orientation pour Claude Code (et tout autre assistant IA) qui travaille sur ce repo.

## Le produit en une phrase

Better Odoo Assistant est une web-app **locale** (FastAPI backend + React/Vite frontend) qui sert d'atelier au consultant Odoo : il télécharge les sources Odoo Community/Enterprise, gère des « projets clients » (instances Odoo + dépôts custom + environnements), et expose un assistant IA contextualisé sur tout cela.

## Layout du repo

```
backend (Python 3.11+, FastAPI, SQLAlchemy async, SQLite)
  odoo_consultant_portal/
    api/routes/        ← endpoints REST (sources, profiles, ai, settings, creator, …)
    services/          ← logique métier (source_manager, project_manager, ai_service, context_service, …)
    core/              ← constantes, schema DB, utils transverses

frontend (React 18, TypeScript strict, Vite, TanStack Query, React Router)
  src/
    pages/             ← Sources, Profiles, Assistant, Migration, Creator, Settings, About, HowItWorks
    components/        ← Markdown, ConversationContextPanel, WorkspaceShell, Sidebar, ui/*
    api/client.ts      ← wrapper axios — un endpoint = une fonction exportée
    theme.css          ← CSS variables + classes utilitaires (.btn, .ui-input, .ui-modal-*, .commit-row*, …)
    i18n.ts            ← FR/EN seulement, langue UI séparée de la langue de contexte IA
    version.ts         ← APP_VERSION — bumpée à chaque batch de changements

scripts        install.sh, start.sh — bootstrap complet (venv + npm + build)
data           ~/.odoo-consultant/  (hors repo) — sources/, context/, workspaces/, profiles.db
```

## Modèle mental du produit

1. **Sources Odoo** — clones (shallow par défaut) de `odoo/odoo` et `odoo/enterprise` sous `~/.odoo-consultant/sources/{version}` et `{version}-enterprise`. La branche est `19.0` pour les majeures, `saas-19.2` pour les intermédiaires.
2. **Profiles (Projets)** — instance Odoo cliente : URL, credentials chiffrés, version, dépôt custom GitHub, environnements multiples (prod/staging/dev) avec branches Git distinctes, contexte projet en markdown.
3. **Assistant IA** — chat multi-tour qui injecte : (a) le profil utilisateur, (b) les notes de version `odoo-{X.Y}.md`, (c) le contexte projet, (d) optionnellement les modules installés (XML-RPC live), (e) optionnellement des extraits du code source.
4. **Migration / Creator** — workflows IA spécialisés qui partagent l'assistant mais avec un prompt système différent.

## Conventions de code

### Backend
- **Async partout** : SQLAlchemy `AsyncSession`, FastAPI handlers `async def`. Pour le subprocess git/CLI, utiliser `loop.run_in_executor(None, ...)`.
- **Erreurs** : `raise HTTPException(status, message_fr)`. Les messages utilisateur sont en **français** dans les exceptions.
- **Chemins** : tout sous `Path.home() / ".odoo-consultant" / ...`. Migration automatique si on déplace un dossier.
- **Endpoints** : préfixe `/api`. Ressources REST plates. Noms cohérents avec les fonctions client TS.

### Frontend
- **TypeScript strict** : `npx tsc --noEmit` doit passer après chaque modif. C'est le check rapide qu'on fait au lieu des tests.
- **Pas de react-markdown** : `components/Markdown.tsx` est notre implémentation custom — supporte `#` à `######`, tableaux, code fences (tolérant à l'indentation), avec un `MarkdownActionsProvider` pour les actions (édition table, copie).
- **Pas de styled-components** : CSS classique via `theme.css` (CSS variables `--th-*`, `--brand`, etc.) + styles inline pour le ponctuel.
- **i18n** : labels groupés dans des objets `copy = { fr: {…}, en: {…} }` au début du fichier de page. Pas de gettext.
- **Modals** : `createPortal(<div className="ui-modal-overlay">…)` vers `document.body`. Classes : `.ui-modal`, `.ui-modal-header`, `.ui-modal-body`, `.ui-icon-button`.
- **Persistance UI** : `localStorage` avec clés préfixées (`odoo-active-convs`, `odoo-conv-history`, `odoo-assistant-last-key`, …). React Query (`staleTime` 30 s à 60 s typiquement) pour les fetches.
- **Streaming signals** : `streamingSignals` et `sourceSyncSignals` (sous `utils/`) sont des event buses globaux pour partager l'état actif entre pages (badges, dots, dernier message IA même en background).

### Lifting state / Rules of Hooks
- Les modals dont la trigger est ailleurs que leur contenu (cas Maintenance Sources) ont leur état au niveau du parent. Toujours déclarer tous les `useState` **avant** un early-return.

### Versioning
- **Garder sous v1.x**. Bumper le minor à chaque batch de changements user-visible.
- Le bump = `frontend/src/version.ts` + entrée en haut du `CHANGELOG` de `frontend/src/pages/About.tsx` (en français, badge `Actuel` sur l'entrée en cours, retiré sur les précédentes).
- Format commit : `vX.YY — résumé court` puis bullets, finir par le co-author Claude.

## Pièges connus

- **Sandbox interactif manquant** : `pytest` n'est pas installé localement dans cet env. Pas de tests Python automatisés — se fier à `tsc --noEmit` + tests manuels côté UI.
- **Shallow clones** : `get_commits_since` fait un `git fetch --shallow-since` à la demande pour deepen l'historique. Le SHA renvoyé est `%H` (long) côté backend, mais l'UI affiche `sha.slice(0, 8)`.
- **Tags de commits Odoo** : convention `[TAG] module: msg`. Tags fréquents : FIX, IMP, ADD, REM, REF, MOV, REV, MERGE, PERF, TYP, CLA, DOC, I18N, FW. Le modal Sources les détecte via `parseTag(subject)`.
- **Locale du contexte IA** : `userProfile.contextLanguage` ≠ `userProfile.language` (UI). Quand on lit/écrit des fichiers de `~/.odoo-consultant/context/`, toujours résoudre `contextLanguage || language || 'fr'`.
- **Perspective type** : seulement `'support' | 'business_analyst' | 'architect' | 'developer'`. Pas de `creator` (qui est un workflow séparé).
- **GENERAL_KEY vs profileId** : dans Assistant.tsx, `profileId` est `number | 'general' | null`. Toujours sérialiser via `String(profileId)` pour les clés de conversation.
- **VS Code workspace generation** : `_vscode_cmd` cherche `code` puis `codium`, fallback macOS uniquement (`open -a "Visual Studio Code"`). Pas de fallback Windows pour cette commande.

## Workflow attendu pendant une session

1. Comprendre la demande (souvent FR, parfois batch de 5–10 items à la fois).
2. Implémenter en parallélisant les edits indépendants.
3. `npx tsc --noEmit` (frontend) et `python3 -c "import ast; ast.parse(open(...).read())"` pour valider le Python si touché.
4. Demander avant de bumper la version / committer.
5. Sur OK : bumper `version.ts`, ajouter l'entrée en haut du `CHANGELOG` de `About.tsx`, commit (jamais `--no-verify`, jamais `--amend` sauf demande explicite).

## Ce que le user attend en pratique

- Réponses courtes en français, ton direct.
- Pacing : « tout d'un coup » sur les batches. Le user teste après chaque commit.
- Vision produit : **« contexte défini et vivant »** (prévisibilité, complétude, fraîcheur) — différenciateur vs l'assistant natif odoo.com (lecture de PDF-image, captures d'écran, etc.).
- Pas d'emojis dans le code/docs sauf demande explicite.
- Pas de commentaires qui paraphrasent le code.
