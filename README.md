# Better Odoo Assistant

**Votre portail local pour travailler avec Odoo au quotidien.**

Better Odoo Assistant est une application web qui tourne sur votre machine. Elle centralise tout ce dont vous avez besoin en mission : connexion aux instances clients, exploration des sources Odoo, et surtout un **assistant IA qui connaît vos données et votre code**.

> Fonctionne entièrement en local. Seuls les appels aux API IA (Claude, OpenAI…) transitent par internet.  
> Version actuelle : **0.64.0** — assistant piloté par skills :
> - **Skills — playbooks complets** : les 27 `SKILL.md` décrivent quand utiliser chaque capacité, les déclencheurs FR/EN, la séquence recommandée, les paramètres, les pièges et les combinaisons utiles.
> - **Sélection IA — routage par intention** : le dispatcher combine les skills pertinents dès le premier prompt (record métier, KPI, vue, sécurité, Studio, migration, source projet/Odoo, volumétrie, commit).
> - **Données Odoo — lectures exhaustives bornées** : `query_odoo` récupère tous les records visibles par défaut jusqu'au plafond configuré, avec pagination, compte total et warning explicite en cas de résultat partiel.
> - **Contexte — plus lisible** : le panneau Contexte reste visible en desktop sur Assistant, Migration et Creator, et la liste des skills utilisés n'est plus tronquée.

---

## Table des matières

- [Installation](#installation)
- [Démarrage rapide](#démarrage-rapide)
- [Comprendre le fonctionnement](#comprendre-le-fonctionnement)
- [Langues et contextes multilingues](#langues-et-contextes-multilingues)
- [Guide d'utilisation](#guide-dutilisation)
  - [1. Configurer les sources Odoo](#1-configurer-les-sources-odoo)
  - [2. Ajouter un projet client](#2-ajouter-un-projet-client)
  - [3. Gérer les environnements](#3-gérer-les-environnements)
  - [4. Connecter un dépôt GitHub](#4-connecter-un-dépôt-github)
  - [5. Configurer l'assistant IA](#5-configurer-lassistant-ia)
  - [6. Utiliser l'assistant IA](#6-utiliser-lassistant-ia)
- [Qualité des réponses IA — Sources & contexte](#qualité-des-réponses-ia--sources--contexte)
  - [Pourquoi les sources comptent](#pourquoi-les-sources-comptent)
  - [Les trois couches de contexte](#les-trois-couches-de-contexte)
  - [Sources Odoo standard](#sources-odoo-standard)
  - [Dépôt custom GitHub](#dépôt-custom-github)
  - [Contexte projet](#contexte-projet)
  - [Inspection Studio](#inspection-studio)
  - [Données live Odoo](#données-live-odoo)
  - [Checklist — obtenir les meilleures réponses](#checklist--obtenir-les-meilleures-réponses)
- [Architecture & développement](#architecture--développement)

---

## Installation

### Prérequis

| Outil | Version minimum |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| Git | toute version récente |

**Téléchargement :**
```bash
git clone https://github.com/le-goff-benoit/better_odoo_consultant.git
cd better_odoo_consultant
```

**Installation (une seule fois) :**
```bash
bash install.sh
```

Le script installe automatiquement l'environnement Python, les dépendances backend, et compile l'interface web.

**Démarrage :**
```bash
bash start.sh
```

Le portail s'ouvre dans votre navigateur à **http://localhost:8765**.

---

## Démarrage rapide

Voici le flux typique pour commencer à travailler sur un nouveau projet client :

```
1. Sources      →  Téléchargez les sources Odoo de la version du client
2. Paramètres   →  Ajoutez une clé API pour un modèle IA (Claude, GPT…)
3. Mes projets  →  Créez un projet avec l'URL et les identifiants du client
4. Assistant IA →  Posez vos premières questions sur les données du client
```

---

## Comprendre le fonctionnement

La page **Fonctionnement** explique le flux complet de l'application sous forme d'un diagramme vertical, du haut vers le bas.

Elle détaille comment le portail combine :
- la **configuration utilisateur** : nom, poste, équipe, thème, couleur d'accent et préférences d'interface ;
- la **configuration des providers IA** : clés API, provider actif, modèle choisi et modèles activés/désactivés ;
- la **perspective de réponse** : 4 rôles consultant (Support, Business Analyst, Architecte, Développeur) avec détection automatique selon la question ;
- les **fichiers Markdown de contexte** : `skills.md`, `studio.md`, `migration.md`, `meeting-minute.md`, `odoo-*.md` ;
- le **projet client** : environnement actif, société active, contexte projet et auto-complétion ;
- les **sources Odoo locales** et le **repo custom client** ;
- le **routeur de contexte**, qui sélectionne les sections utiles avant d'appeler le modèle IA ;
- les **outils IA** : données live Odoo, lecture du code source, inspection Studio, comptage de lignes, etc.

Cette page est utile pour comprendre pourquoi une réponse IA est bonne ou mauvaise : si une source manque, si le mauvais provider est choisi, ou si le contexte projet est incomplet, le diagramme montre où corriger.

La version 0.64 **fiabilise le pilotage par skills et les analyses Odoo volumineuses** :
- **27 playbooks SKILL.md complétés** : chaque skill documente ses cas d'usage, déclencheurs, séquence recommandée, paramètres, pièges, combinaisons et critères de réponse ;
- **sélecteur de skills plus pertinent** : scoring par familles d'intention et bundles automatiques pour les analyses de record métier, KPI, vues, sécurité, Studio et migrations ;
- **événement SSE `skills_selected`** : l'interface affiche les skills routés par l'assistant, pas seulement les outils effectivement appelés ;
- **`query_odoo` exhaustif borné** : `limit=0` récupère tous les records visibles jusqu'à 5000, par pages de 500, avec `total_count`, `pages_fetched`, `truncated` et warning explicite ;
- **contexte sticky** : le panneau de contexte reste accessible pendant le scroll sur Assistant, Migration et Creator, et la liste des skills utilisés s'affiche entièrement.

La version 0.40 **affine l'aperçu du Creator et la faisabilité Studio** :
- **rendu des vues redessiné façon Odoo** : feuille blanche, colonnes, statusbar, button box, palette aubergine ;
- **aperçu en contexte du changeset** : les champs créés par les opérations précédentes sont appliqués avant l'aperçu — plus de faux négatif « le champ x_… n'existe pas » ;
- **aperçu en plein écran**, encadré récapitulant la modification, et **demande de révision** directement depuis l'aperçu ;
- **executor tolérant** : un arch d'héritage enveloppé à tort dans `<template>` / `<odoo>` est automatiquement déballé ;
- **faisabilité Odoo Studio renforcée** : l'IA n'invente plus de classes CSS (faux positifs sans effet visuel), privilégie les styles en ligne et les classes existantes, et émet un verdict de faisabilité explicite.

La version 0.39 **ajoute l'aperçu avant/après au Creator** :
- **bouton « Aperçu »** sur chaque opération de modification de vue ou de rapport ;
- **aperçu des vues** : rendu schématique (wireframe) de la vue assemblée par Odoo, avant et après l'héritage, avec les champs et onglets ajoutés surlignés ;
- **aperçu des rapports** : rendu **PDF réel** avant/après, généré par Odoo sur un enregistrement témoin — en-tête, pied de page et mise en page société inclus ;
- l'aperçu est **transitoire** (la vue héritée est créée puis annulée, rien n'est persisté) et sert de **garde-fou** : une vue qui ne s'assemble pas ou un rapport qui ne se rend pas est signalé avant l'application.

La version 0.38 **fiabilise le Creator et l'entrée en mode IA** :
- **Creator — vues héritées propres** : les vues héritées créées par le Creator sont nommées automatiquement et de façon cohérente (« <vue parente> (Creator) »), identifiables côté Studio, sans suffixes qui s'empilent ;
- **Creator — héritage en-tête/pied de page** : pour modifier l'en-tête ou le pied d'un document, l'IA est guidée vers le bon template de mise en page (`web.external_layout_*`) plutôt que le template du document ;
- **garde « fournisseur IA requis »** : un modal avertit l'utilisateur et le renvoie vers la configuration des clés API lorsqu'il ouvre l'Assistant, la Migration, le Creator ou l'auto-remplissage de contexte sans aucun fournisseur IA configuré.

La version 0.37 **enrichit les pièces jointes et le clonage de dépôt** :
- **analyse visuelle des images et PDF** (vision) sur Claude, OpenAI et Gemini — l'IA lit le texte, la mise en page, les tableaux, les captures d'écran et les schémas ; idéal pour reconstruire un rapport QWeb à partir d'une maquette PDF ou repartir d'un écran déjà modélisé par le client ;
- **classeurs Excel** (`.xlsx`, `.xls`) convertis en tableaux Markdown exploitables par l'IA ;
- **formats texte élargis** : YAML, HTML, SQL, `.po`/`.pot` de traduction, INI, TOML, TSV, etc. ;
- **glisser-déposer** des pièces jointes sur l'Assistant IA, la Migration et le Creator ; limite portée à **10 MB par fichier** ;
- **submodules Git** : le dépôt client est cloné avec `--recurse-submodules` et les submodules sont resynchronisés à chaque mise à jour.

La version 0.22 modernise l'interface :
- navigation principale dans une **top bar responsive** ;
- panneau **Contexte workspace** repliable avec profil, providers IA, projets et sources Odoo ;
- typographie **Geist Sans / Geist Mono** ;
- personnalisation couleur recentrée sur une **couleur d'accent** sobre ;
- documents joints disponibles dans l'Assistant IA et les requêtes de Migration.

La version 0.23 nettoie l'expérience de discussion :
- **bandeau de contexte allégé** sur Assistant IA et Migration (suppression des badges Sources / Repo / Migration path qui doublonnaient le sélecteur de version et le panneau contextuel) ;
- **collapse-on-scroll** : le titre de page et la barre de configuration se compactent automatiquement dès qu'on scrolle dans la discussion, pour libérer la zone de lecture ;
- **PerspectiveToggle redessiné** : couleurs theme-aware (variables CSS), libellé du profil actif affiché à côté de l'icône, transitions fluides ;
- **profils Markdown** (Support, BA, Architecte, Développeur) réécrits avec grilles de priorité, vocabulaire de référence, snippets, checklists ;
- **notes de version Odoo v15→v19** enrichies avec tags Community/Enterprise, modèles ORM par fonctionnalité, workflows détaillés (Sales Commissions, Dispatch, ESG/CSRD, Loyalty) et commandes d'audit pré-migration ;
- **auto-perspective** revue avec listes de termes élargies, scoring multi-catégories, fallback BA au lieu de Dev pour les questions fonctionnelles ;
- **analyse de complexité** corrigée : les modules OCA et communautaires (Camptocamp, Akretion, Tecnativa…) ne sont plus classés comme custom dev ; seuil Studio relevé à 3 signaux ;
- **drapeaux fiscaux** : émoji du pays affiché à côté des sociétés (sélecteur, onglets projets) et dans le panneau contextuel.

La version 0.23.x **unifie le système de perspective** des 4 rôles end-to-end :
- backend reconnaît désormais Support / BA / Architecte / Développeur (au lieu de seulement 2 valeurs internes) ;
- les fichiers `profile-*.md` sont **réellement injectés** dans le contexte (section core, jamais évincée du budget) — avant, ils étaient annoncés mais jamais chargés côté serveur ;
- **scoring pondéré** avec seuil minimum et marge sur le runner-up : moins de bascules erratiques entre rôles ;
- nouveau hook `useResolvedPerspective` avec hystérésis 350 ms — le badge ne flicke plus pendant la frappe ;
- routage de contexte resserré : tokens ambigus (`pos`, `custom`, `mrp`, `of`…) matchés avec word-boundaries pour éviter les faux positifs (« propose » → POS, « customer » → Customizations) ;
- `load_context_for_prompt` accepte un `target_version` pour charger les notes source ET cible en mode migration ;
- cache mtime-aware sur les lectures markdown — un tour chat ne re-lit plus 5-6 fichiers depuis le disque.

La version 0.24 **optimise les coûts d'API IA** :
- le system prompt est **scindé en deux blocs** — stable (identité, sources, instructions, contexte projet) cacheable + variable (langue, perspective, markdown routé) non-cacheable ;
- en mode Claude, un `cache_control: ephemeral` est posé à la frontière stable/variable, et un autre sur le **dernier `tool_result`** de chaque itération ; les tours conversationnels et les tours outils profitent désormais tous les deux du caching ;
- l'événement `done` SSE expose `cache_creation_input_tokens` et `cache_read_input_tokens` pour observer l'efficacité du cache ;
- nouveau helper `_source_instructions()` DRY (les 3 versions de `build_system_*` partagent un texte identique pour stabiliser le préfixe cacheable) ;
- `search_odoo_source` : option `case_sensitive` (défaut `true` pour les patterns de code), retour distinct `files_count` vs `matches`, suggestions de fallback si 0 hit (insensible casse / sans accents / restreindre `path`) ;
- `stop_reason` Claude `max_tokens` et `refusal` surfacés comme événement `warning` SSE et affichés en bulle grise — fin des troncatures silencieuses ;
- inférence perspective côté serveur si un client envoie `perspective="auto"` — utile pour CLI / mobile.

La version 0.28 **consolide l'expérience de conversation** :
- **panneau "Conversation context" sticky** sur Assistant IA et Migration : le panneau reste visible pendant le scroll, via une contrainte hauteur viewport sur `migration-shell` calquée sur `assistant-shell` ;
- **auto-scroll pendant le streaming** restauré : la liste de messages suit la rédaction automatiquement, sauf si l'utilisateur remonte pour lire ;
- **markdown enrichi** : listes numérotées (`1. 2. 3.`) et italique (`*texte*`) rendus correctement dans les deux pages ;
- **temps de réponse sur Migration** : le chrono avec icône Timer apparaît sous chaque réponse IA, comme sur l'Assistant ;
- **anti-oscillation du header** : le collapse-on-scroll est gelé pendant le streaming — plus de vibration du bloc de contexte et du header ;
- **sources Enterprise dans le contexte migration** (FR + EN) : règle critique documentée — toujours chercher dans `enterprise/<module>/` pour comptabilité, rapprochement bancaire, helpdesk, abonnements, planning.

La version 0.27 **ajoute le streaming en arrière-plan et l'historique Migration** :
- une requête lancée sur Assistant IA ou Migration **continue de s'exécuter** même si on navigue ailleurs — les messages s'accumulent dans un buffer module-level hors du cycle React et sont réinjectés au retour sur la page ;
- **indicateurs de streaming dans la topbar** : point pulsant sur les liens Assistant et Migration pendant une réponse en cours, point vert quand le résultat est disponible ;
- **indicateurs par onglet projet** : chaque onglet projet dans l'Assistant affiche son propre dot de streaming/done indépendant ;
- **historique de la page Migration** : les conversations sont sauvegardées en localStorage par paire de versions (ex: 16.0 C+E → 17.0 C+E), avec titre auto-généré, panneau historique accessible depuis un bouton en haut de page ;
- **bulles utilisateur et fonds tintés** : les bulles de saisie utilisent `var(--brand)`, les fonds de l'application utilisent `color-mix()` avec la couleur d'accent choisie — l'interface reflète subtilement la personnalisation couleur ;
- **texte gras en couleur brand légère** : les éléments `<strong>` dans les réponses IA utilisent `color-mix(40% brand + 60% text)` pour un rappel discret sans surcharger la lecture ;
- **badge C+E en Migration** et recherche étendue aux sources Enterprise dans les sélecteurs source/cible ;
- **limite de boucle outils portée à 25 itérations** avec garde anti-répétition — les requêtes nécessitant de nombreux appels d'outils n'échouent plus prématurément ;
- **correction chemin Enterprise** : les modules Enterprise (helpdesk, etc.) sont à la racine `enterprise/<module>/`, pas sous `addons/` — les outils de recherche gèrent désormais les deux structures.

La version 0.25 **refond l'interface en identité Better Odoo Assistant neo-retro** :
- inspirations HARRY.SYS + Portal Aperture + Arc Raiders, avec une marque propre à l'app ;
- typographie tri-rôle : **Space Grotesk** (titres / CTAs en uppercase), **Inter** (corps), **JetBrains Mono** (codes / IDs / badges) ;
- palette : light = blueprint off-white, dark = terminal `#0a0a0a`, accent par défaut vert BOA, rappel cyan / vert / jaune / rouge dans la topbar ;
- bordures fines, coins légèrement adoucis, états hover/focus uniformes pour garder le style retro sans nuire à l'ergonomie ;
- topbar redessinée : logo `BOA`, nom **Better Odoo Assistant**, lien actif avec marqueur `▪` et soulignement multicolore ;
- chaque page affiche désormais un **identifiant section `00000NNN`** au-dessus du titre ;
- effet **CRT subtil en dark mode** : scanlines + vignette radiale (light reste pur pour la lisibilité en réunion) ;
- nouvelles classes utilitaires : `.neo-id`, `.neo-tag`, `.neo-section-number`, `.neo-frame`, `.neo-status-bar`, `.neo-bracket`.

---

## Langues et contextes multilingues

L'application prépare l'ajout progressif de plusieurs langues. La version actuelle supporte **Français** et **English** sur trois niveaux distincts :

1. **Langue de l'application**
   Pilotée depuis Paramètres → Profil. Elle sert de préférence globale d'interface et permet aux écrans principaux de s'afficher en français ou en anglais : navigation, Sources, Projets, Assistant, Migration, Fonctionnement, Paramètres, À propos et pages historiques simples.

2. **Langue des réponses IA**
   Trois modes sont disponibles :
   - **Automatique** : l'assistant répond dans la langue du dernier message utilisateur ;
   - **Français** : l'assistant répond toujours en français ;
   - **English** : l'assistant répond toujours en anglais.

   Les identifiants techniques Odoo ne sont jamais traduits : modèles, champs, XML IDs, chemins de fichiers, domains et méthodes restent exacts.

3. **Langue des fichiers de contexte IA**
   L'éditeur de contexte permet de choisir la langue du fichier Markdown édité. Les fichiers français historiques restent dans :

   ```text
   ~/.odoo-consultant/context/
   ```

   Les fichiers anglais personnalisés sont stockés dans :

   ```text
   ~/.odoo-consultant/context/en/
   ```

   Des defaults anglais sont fournis pour `skills.md`, `migration.md`, `studio.md`, `meeting-minute.md` et les notes de version `odoo-15.0.md` à `odoo-19.0.md`. Le français reste le fallback par défaut pour préserver les installations existantes.

---

## Guide d'utilisation

### 1. Configurer les sources Odoo

La page **Sources** vous permet de télécharger les sources Odoo en local. L'assistant IA les utilise pour répondre avec précision sur les modèles, champs et méthodes — sans halluciner.

<!-- docs/screenshots/sources-page.png : vue de la page Sources avec les cartes de version -->

**Comment télécharger :**
1. Allez dans **Sources** dans le menu
2. Choisissez la version (ex: 17.0) et cochez Community et/ou Enterprise
3. Cliquez **Télécharger** — une barre de progression s'affiche en temps réel

> **Enterprise** nécessite un accès SSH GitHub. Si vous n'avez pas encore de clé SSH, le portail vous guide pour en créer une et l'ajouter à votre compte GitHub.

**Où sont stockées les sources ?**  
Dans `~/odoo-sources/{version}/` pour Community et `~/odoo-sources/{version}-enterprise/` pour Enterprise.

---

### 2. Ajouter un projet client

La page **Mes projets** liste toutes vos connexions Odoo. Chaque projet correspond à un client.

<!-- docs/screenshots/projects-cards.png : vue des cartes projets avec logo, badges, environnements -->

**Créer un projet :**

Cliquez **+ Nouveau projet** et suivez le wizard en 3 étapes :

**Étape 1 — Identification du projet**
- Donnez un nom au projet (ex : "Acme Corp — Production")
- Collez l'URL de l'instance Odoo

**Étape 2 — Connexion**
- Renseignez le nom de base de données, votre login et votre [clé API Odoo](https://www.odoo.com/documentation/17.0/developer/reference/external_api.html#api-keys)
- Cliquez **▶ Tester** : le portail détecte automatiquement la version Odoo, les modules installés et les informations société

<!-- docs/screenshots/wizard-step2-diagnose.png : étape 2 du wizard avec le test de connexion réussi -->

**Étape 3 — Récapitulatif**
- Vérifiez et enregistrez

Une fois créé, le projet apparaît sous forme de carte avec le logo de la société, la version Odoo, et les modules installés.

---

### 3. Gérer les environnements

Chaque projet peut avoir plusieurs **environnements** : production, staging, développement, migration… Chacun a ses propres identifiants, sa propre version Odoo et son propre dépôt GitHub.

<!-- docs/screenshots/env-modal.png : modal d'ajout d'environnement avec le test de connexion -->

**Ajouter un environnement :**
1. Sur la carte projet, cliquez **+** à côté de la section Environnements
2. Renseignez l'identifiant (ex: `staging`), le nom affiché, l'URL, la base, le login et la clé API
3. Cliquez **▶ Tester** pour valider la connexion et détecter automatiquement la version

**Activer un environnement :**
Cliquez sur la pilule d'un environnement pour ouvrir sa configuration, puis **✓ Activer**. L'environnement actif est mis en évidence sur la carte.

**Changer d'environnement dans l'assistant :**  
Dans la barre de contexte de l'assistant, un sélecteur permet de choisir l'environnement pour la conversation en cours — sans modifier l'environnement par défaut du projet.

<!-- docs/screenshots/assistant-env-selector.png : barre de contexte avec le sélecteur d'environnement -->

---

### 4. Connecter un dépôt GitHub

Si votre client a des modules custom, connectez son dépôt GitHub à l'environnement concerné. L'IA pourra alors explorer le code custom exactement comme elle explore les sources Odoo standard.

<!-- docs/screenshots/env-modal-repo.png : section "Source complémentaire" dans la modal d'environnement -->

**Prérequis :** une clé SSH GitHub configurée (la même que pour les sources Enterprise).

**Comment connecter :**
1. Ouvrez la modal d'un environnement (cliquez sur sa pilule)
2. Dans la section **Source complémentaire**, renseignez :
   - **Dépôt** : `organisation/nom-du-repo` (ex: `acme/odoo-custom`)
   - **Branche** : `main`, `16.0`, etc.
3. Cliquez **⬇ Cloner** — le clone s'effectue en temps réel via SSH
4. Les mises à jour se font avec **↑ Mettre à jour** (pull)

Une fois cloné, le badge **✓ ⎇ nom-du-repo** apparaît dans la barre de contexte de l'assistant quand cet environnement est actif.

```
Barre de contexte avec repo actif :
┌────────────────────────────────────────────────────────────────────────┐
│  Copilot · GPT-5.4 ▼  │  Production ▼  │  ✓ Sources v17.0 · C+E  │  ✓ ⎇ acme-custom  │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 5. Configurer l'assistant IA

Allez dans **Paramètres** pour configurer vos accès aux modèles IA.

<!-- docs/screenshots/settings-ai-keys.png : page paramètres avec les clés API configurées -->

**Providers disponibles :**

| Provider | Comment obtenir une clé |
|---|---|
| **Claude** (Anthropic) | [console.anthropic.com](https://console.anthropic.com) |
| **GPT** (OpenAI) | [platform.openai.com](https://platform.openai.com) |
| **Gemini** (Google) | [aistudio.google.com](https://aistudio.google.com) |
| **GitHub Models** | Token GitHub classique |
| **GitHub Copilot Business** | Connexion OAuth — pas de clé à copier |

Pour Copilot Business, cliquez **Se connecter via GitHub** et suivez le flux d'autorisation (aucune clé API à gérer).

**Choisir un modèle :**  
Dans les Paramètres, cochez les modèles que vous voulez voir apparaître dans l'assistant. Les modèles recommandés sont présélectionnés par défaut.

---

### 6. Utiliser l'assistant IA

L'assistant IA est la fonctionnalité centrale du portail. Il combine trois sources de connaissance :

```
┌──────────────────────────────────────────────────────┐
│                   Assistant IA                        │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Données    │  │  Sources     │  │  Code       │  │
│  │  Odoo live  │  │  Odoo std    │  │  custom     │  │
│  │  (XML-RPC)  │  │  (fichiers)  │  │  (repo git) │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Mode projet** (onglet d'un client) — l'IA a accès aux trois sources :
- Elle interroge directement Odoo via XML-RPC pour répondre avec de vraies données
- Elle explore les sources Odoo standard pour vérifier les noms de modèles et champs
- Elle explore le code custom pour comprendre les overrides et modules spécifiques

**Mode général** (onglet Odoo Général) — l'IA répond à des questions sur Odoo sans connexion client, en s'appuyant uniquement sur les sources locales.

<!-- docs/screenshots/assistant-chat.png : exemple de conversation avec un appel d'outil visible -->

**Perspective fonctionnelle / technique :**  
Un toggle 💼 / `</>` permet de basculer entre le mode **AM/BA** (réponses orientées métier, tableaux processus, vocabulaire utilisateur) et le mode **ARCHI/DEV** (réponses techniques avec extraits de code, ORM, noms de champs exacts). La préférence est mémorisée par page.

**Exemples de questions utiles :**

En mode projet :
```
"Combien de factures clients sont en statut brouillon ?"
"Quels sont les 10 derniers bons de commande avec leur montant total ?"
"Est-ce que ce client a le module MRP installé ?"
"Cherche si le modèle sale.order a été surchargé dans les modules custom"
"Qu'est-ce qui a été personnalisé via Studio sur cette instance ?"
"Donne-moi l'inventaire des champs custom créés sur sale.order"
"Combien de lignes de code Python dans le repo client ?"
```

En mode général :
```
"Comment fonctionne le calcul de prix dans Odoo 17 ?"
"Quelle est la différence entre stock.move et stock.quant ?"
"Montre-moi l'implémentation de action_confirm sur sale.order"
```

**Contexte projet :**  
Sur chaque carte projet, le bouton **📋 Contexte** ouvre un éditeur de notes libre. Ce texte est injecté dans tous les prompts de ce projet. Utilisez **✨ Auto-compléter** pour générer automatiquement un contexte à partir des données du projet (modules installés, société, dépôts custom).

---

## Qualité des réponses IA — Sources & contexte

La qualité des réponses de l'assistant dépend directement des sources que vous avez configurées. Plus le contexte est riche et précis, moins l'IA hallucine, plus ses réponses sont exploitables directement sur le projet.

### Pourquoi les sources comptent

Un modèle IA comme Claude ou GPT-4 connaît Odoo de manière générale — mais **pas votre version exacte, pas vos modules custom, pas vos données**. Sans sources locales, il invente des noms de champs, suppose des comportements ou donne des réponses valables pour une autre version.

Avec les bonnes sources configurées, l'IA ne "sait" plus — elle **lit le code réel** avant de répondre, exactement comme vous le feriez vous-même dans un terminal.

```
Sans sources              Avec sources complètes
─────────────────         ───────────────────────────────────────────────────
"Je crois que             "J'ai vérifié dans sale.order (v17.0 enterprise) :
 le champ est             le champ s'appelle amount_untaxed (Float).
 amount_subtotal"         Dans votre module custom, il est surchargé dans
                          neca_sale/models/sale_order.py ligne 42."
```

### Les trois couches de contexte

L'assistant combine plusieurs sources indépendantes. Elles sont **cumulatives** : chacune apporte quelque chose que les autres ne peuvent pas fournir.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONTEXTE INJECTÉ DANS L'IA                         │
├──────────────────────┬───────────────────────────┬────────────────────────── ┤
│  Données live        │  Sources Odoo standard    │  Code custom              │
│  (XML-RPC)           │  (sources locales)        │  (dépôt GitHub cloné)     │
│                      │                           │                           │
│  • Vrais enregistre- │  • Code source Odoo       │  • Modules spécifiques    │
│    ments de la base  │    Community / Enterprise  │    au client              │
│  • Modules installés │  • Modèles, champs,       │  • Overrides et héritages │
│  • Société active    │    méthodes exacts        │  • Vues, wizards custom   │
│  • Config instance   │  • Toutes les versions    │  • Logique métier propre  │
│                      │    téléchargées           │    au projet              │
├──────────────────────┴───────────────────────────┴───────────────────────────┤
│  + Contexte projet (notes libres injectées dans chaque prompt)               │
│  + Fichiers Markdown routés selon la question                                │
│  + Profil consultant et configuration provider / modèle IA                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

Le **routeur de contexte** évite d'envoyer tous les fichiers Markdown à chaque question. Il sélectionne les sections utiles selon le dernier message utilisateur, la perspective active, la version Odoo et le mode migration.

Exemples :
- une question sur les factures charge les sections comptabilité et diagnostics ;
- une demande de compte-rendu charge `meeting-minute.md` ;
- une question Studio charge `studio.md` ;
- une question de migration charge `migration.md` et les notes de version pertinentes.

### Sources Odoo standard

**Rôle :** fournir le code source exact d'Odoo pour la version du client, y compris Enterprise si applicable.

L'IA dispose d'outils pour **grep et lire des fichiers** dans les sources téléchargées. Quand vous posez une question sur un modèle, elle commence par chercher sa définition dans les sources, puis répond avec les vrais noms de champs et méthodes.

**Règle :** téléchargez **toujours la même version** que celle de l'environnement client. Si le client est en 16.0 Community, téléchargez 16.0 Community. Une réponse basée sur la 17.0 peut être incorrecte.

**Ce que l'IA peut faire avec les sources :**
- Trouver la définition complète d'un modèle (`sale.order`, `account.move`…)
- Lister tous les champs d'un modèle avec leur type et leur description
- Lire l'implémentation d'une méthode Python
- Comparer la logique entre deux versions (si les deux sont téléchargées)
- Vérifier si un champ est compute, store, related ou standard

> **Conseil :** pour les clients Enterprise, assurez-vous que votre clé SSH GitHub a accès à `odoo/enterprise`. Sans Enterprise, l'IA répondra à côté sur tout ce qui est comptabilité, abonnements, eLearning, etc.

---

### Dépôt custom GitHub

**Rôle :** permettre à l'IA d'explorer les modules développés spécifiquement pour le client, qui n'existent nulle part ailleurs.

C'est la source la plus impactante pour les projets en production avec des développements spécifiques. Sans elle, l'IA ignore tout de ce qui a été codé sur mesure : elle ne peut pas voir les héritages, les champs ajoutés, les overrides de méthodes.

**Ce que l'IA peut faire avec le dépôt custom :**
- Lister tous les modules custom installés (lecture des `__manifest__.py`)
- Trouver où un modèle Odoo a été étendu (`_inherit`)
- Lire le code d'une méthode override pour comprendre un comportement spécifique
- Chercher comment un champ custom a été défini
- Identifier des dépendances entre modules custom

**Comment le connecter :**  
Dans la modal de l'environnement → section "Source complémentaire" → `organisation/repo` + branche → **Cloner**.

**Bonne pratique — branche :**  
Pointez sur la **branche de production** (pas develop). L'IA lit ce qui tourne réellement chez le client, pas ce qui est en cours de développement.

**Maintenir à jour :**  
Après chaque déploiement de nouveaux modules, revenez dans la modal et cliquez **Mettre à jour** (git pull). Une IA qui lit du code obsolète répond sur une réalité passée.

**Indicateur visuel :**  
Quand un dépôt est cloné et actif, le badge **✓ ⎇ nom-du-repo** s'affiche dans la barre de contexte de l'assistant.

---

### Contexte projet

**Rôle :** transmettre à l'IA des informations métier et structurelles qui ne se déduisent pas du code.

Le **contexte projet** est un champ texte libre sur chaque projet, injecté dans **tous les prompts** de ce projet. C'est l'endroit pour documenter ce que l'IA ne peut pas découvrir seule.

Pour éviter qu'un contexte projet trop long écrase les autres sources, il dispose d'un budget dédié dans le prompt. Gardez-le structuré et centré sur ce qui est vrai pour le client.

**Utiliser l'auto-complétion :**  
Le bouton **✨ Auto-compléter** génère un contexte de base à partir des données du projet :
- Version Odoo et modules installés
- Nom de la société
- Modules custom détectés dans le dépôt cloné (noms et descriptions des `__manifest__.py`)

Le contexte généré distingue maintenant les **faits observés**, les **hypothèses raisonnables**, les **périmètres à prioriser**, les **customisations / intégrations**, les **risques** et les **questions ouvertes**.

Ce contexte auto-généré est un **point de départ** — enrichissez-le avec ce que vous savez du projet.

**Ce qui vaut la peine d'être ajouté manuellement :**

```
Exemple de contexte projet enrichi :
─────────────────────────────────────
Client : Acme SA — Distribution industrielle, ~80 utilisateurs
Secteur : négoce B2B, cycles de vente longs, remises clients complexes
Version : 16.0 Enterprise

Modules custom actifs :
- acme_sale : override du calcul de remise (logique en cascade par famille produit)
- acme_stock : règles de réservation personnalisées (priorité par client Gold/Silver)
- acme_account : génération automatique de factures proforma

Points d'attention :
- Le champ x_priorite sur sale.order est utilisé pour le dispatch logistique
- Les remises ne passent PAS par pricelist, elles sont calculées dans acme_sale
- L'environnement staging est une copie de prod du 2024-01 — les données récentes n'y sont pas
```

**Ce que l'IA fait avec ce contexte :**  
Elle ne cherche pas dans les sources si elle sait déjà. Un contexte bien rédigé évite des appels d'outils inutiles et oriente directement la réponse vers la réalité du projet.

---

### Inspection Studio

**Rôle :** inventorier les personnalisations réalisées via Odoo Studio sur l'instance connectée.

L'IA dispose d'un outil dédié `inspect_studio` qui interroge l'instance pour récupérer :
- **Modèles custom** (`state='manual'` — typiquement préfixés `x_`)
- **Champs custom** par modèle (type, stocké, compute, related…)
- **Vues modifiées** via Studio (overlays sur les vues standard)
- **Menus** créés par Studio
- **Actions serveur** (boutons custom dans les formulaires)
- **Actions planifiées** (`ir.cron`)
- **Automatisations** (`base.automation` — déclencheurs sur écriture, création…)
- **Règles d'accès et règles d'enregistrement** créées par Studio

L'outil est déclenché automatiquement quand vous posez des questions du type :
> *« Qu'est-ce qui a été fait via Studio ? »*, *« Donne-moi l'inventaire des champs custom »*, *« Analyse l'impact Studio avant la migration »*

Il est également possible de personnaliser le guide d'interprétation via le fichier **`studio.md`** dans les Paramètres → Fichiers de contexte.

---

### Données live Odoo

**Rôle :** interroger directement la base de données du client via XML-RPC pour obtenir de vraies valeurs.

L'IA peut exécuter des recherches sur n'importe quel modèle Odoo, lire des enregistrements, compter des résultats, lire la configuration. Elle ne modifie jamais de données — elle est en lecture seule.

**Ce que l'IA peut faire avec les données live :**
- Compter des enregistrements avec des filtres (`[('state','=','draft')]`)
- Lire les champs d'un ou plusieurs enregistrements
- Vérifier la configuration d'un module (ex: `stock.warehouse`, `account.journal`)
- Détecter des anomalies dans des volumes de données
- Inspecter les personnalisations Studio (modèles, champs, vues, automatisations)

**Prérequis :** une [clé API Odoo](https://www.odoo.com/documentation/17.0/developer/reference/external_api.html#api-keys) avec les droits suffisants. Une clé en lecture seule est conseillée en production.

**Ce que l'IA ne peut pas faire :**  
Écrire, modifier ou supprimer des enregistrements. Elle ne peut pas non plus exécuter du SQL direct ni appeler des méthodes qui modifient l'état.

---

### Checklist — obtenir les meilleures réponses

Avant de commencer à travailler sur un projet, vérifiez que chaque source est configurée :

```
Sources IA — checklist par environnement
─────────────────────────────────────────────────────────────
[ ] Sources Odoo téléchargées      → page Sources, même version que le client
[ ] Enterprise téléchargée         → si le client a Odoo Enterprise
[ ] Profil consultant complété     → nom, poste, équipe, préférences utiles
[ ] Providers IA configurés        → clés API, modèles pertinents activés
[ ] Dépôt custom cloné             → si le client a des modules spécifiques
[ ] Branche du dépôt = production  → pas develop/staging
[ ] Dépôt à jour (pull récent)     → après chaque déploiement
[ ] Contexte projet renseigné      → au moins les modules custom et leurs rôles
[ ] Clé API Odoo testée            → ✓ vert dans la modal d'environnement
[ ] studio.md personnalisé         → optionnel, guide l'interprétation Studio
```

**Indicateurs visuels dans l'assistant :**

```
Barre de contexte — ce que vous devriez voir sur un projet bien configuré :
┌───────────────────────────────────────────────────────────────────────┐
│  Claude · Sonnet ▼  │  Production ▼  │  ✓ Sources v16.0 · C+E  │  ✓ ⎇ acme-custom  │
└───────────────────────────────────────────────────────────────────────┘
                                           ↑                       ↑
                               Sources standard OK         Dépôt custom actif
```

**Si une source est absente :**  
L'IA le signale elle-même dans sa réponse ("Je n'ai pas accès aux sources…") et vous pouvez l'ignorer en connaissance de cause ou aller la configurer avant de continuer.

---

## Architecture & développement

### Structure du projet

```
better_odoo_consultant/
├── odoo_consultant_portal/
│   ├── api/
│   │   └── routes/          # Endpoints FastAPI
│   │       ├── profiles.py  # Projets, environnements, repos
│   │       ├── ai.py        # Chat IA (SSE streaming)
│   │       ├── sources.py   # Sources Odoo (clone/pull)
│   │       ├── queries.py   # Requêtes Odoo
│   │       └── settings.py  # Profil utilisateur
│   ├── core/
│   │   ├── models.py        # Modèles SQLModel (Profile, Project…)
│   │   ├── database.py      # SQLite async + migrations
│   │   └── config.py        # Configuration
│   └── services/
│       ├── ai_service.py    # Outils IA, system prompts, providers
│       │                    # (query_odoo, count_odoo, search/read sources,
│       │                    #  count_source_lines, inspect_studio)
│       ├── odoo_client.py   # XML-RPC Odoo
│       ├── profile_manager.py # Keyring, résolution d'environnement
│       └── source_manager.py  # Gestion sources git
├── frontend/
│   └── src/
│       ├── pages/           # React pages (Assistant, Profiles, Sources…)
│       ├── api/client.ts    # Appels API axios
│       └── theme.ts         # Design tokens (couleurs, rayons, ombres)
├── install.sh               # Installation automatique
└── start.sh                 # Lancement
```

### Stack technique

| Couche | Technologie |
|---|---|
| Backend | FastAPI, SQLModel, SQLite (async) |
| Frontend | React, TanStack Query, Vite |
| Secrets | Keyring système (Keychain macOS / Secret Service Linux) |
| IA | Anthropic SDK, OpenAI SDK, Google GenerativeAI |
| Sources | GitPython, subprocess git |

### Lancer en mode développement

```bash
# Terminal 1 — Backend avec rechargement automatique
source .venv/bin/activate
odoo-portal serve --reload

# Terminal 2 — Frontend Vite
cd frontend
npm run dev
# → http://localhost:5173 (proxy vers :8765)
```

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `ODOO_PORTAL_DATA_DIR` | `~/.odoo-consultant` | Dossier données (DB, exports, repos clonés) |
| `ODOO_PORTAL_API_PORT` | `8765` | Port de l'API |

### Tests

```bash
source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

### Sécurité & données

- Les **clés API Odoo et IA** sont stockées dans le keyring système — jamais en clair dans la base de données
- La **base SQLite** ne contient que les métadonnées (noms, URLs, préférences) — pas de données Odoo
- Les **sources Odoo** et **dépôts custom** sont clonés localement — aucun code ne transite par un serveur tiers
- Seuls les **messages envoyés à l'IA** transitent par internet, vers le provider que vous avez choisi

---

## Licence

MIT
