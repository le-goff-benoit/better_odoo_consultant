import {
  Bot,
  Braces,
  BrainCircuit,
  BriefcaseBusiness,
  Code2,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Layers,
  MessageSquareText,
  Settings2,
  Sparkles,
  ToggleLeft,
  UserRound,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import PageHeader from '../components/PageHeader'
import { useUiLanguage } from '../i18n'
import { t } from '../theme'

type BadgeKind = 'User' | 'Provider' | 'Markdown' | 'Repo' | 'Odoo' | 'Prompt' | 'Tool' | 'Context'

type DiagramStep = {
  title: string
  subtitle: string
  icon: LucideIcon
  badges: BadgeKind[]
  details: string[]
  technicalRefs: string[]
  inputs: string[]
  outputs: string[]
}

const badgeColors: Record<BadgeKind, { fg: string; bg: string; border: string }> = {
  User:     { fg: '#0f766e', bg: '#ecfdf5', border: '#99f6e4' },
  Provider: { fg: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  Markdown: { fg: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  Repo:     { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Odoo:     { fg: '#be185d', bg: '#fdf2f8', border: '#fbcfe8' },
  Prompt:   { fg: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  Tool:     { fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
  Context:  { fg: '#92400e', bg: '#fff7ed', border: '#fed7aa' },
}

const steps: DiagramStep[] = [
  {
    title: '1. Paramètres utilisateur',
    subtitle: "Identité consultant et préférences d'interface",
    icon: UserRound,
    badges: ['User'],
    details: [
      "Le profil consultant fournit le nom, le poste et l'équipe affichés dans l'application.",
      "Le thème, l'avatar, la couleur primaire et les préférences visuelles ajustent l'expérience sans changer les données projet.",
      "L'identité consultant est injectée en tête du contexte système pour orienter le ton et la posture des réponses.",
    ],
    technicalRefs: ['Settings → Profil', 'getUserProfile()', 'USER_PROFILE_FILE'],
    inputs: ['Nom', 'Poste', 'Équipe', 'Avatar', 'Thème', 'Couleur primaire'],
    outputs: ['UI personnalisée', 'Identité consultant disponible pour le prompt'],
  },
  {
    title: '2. Configuration IA',
    subtitle: 'Providers, clés API, modèles disponibles et modèle actif',
    icon: KeyRound,
    badges: ['Provider'],
    details: [
      "Les providers configurés déterminent quels moteurs peuvent répondre : Claude, OpenAI, Gemini, Copilot ou GitHub Models.",
      "Les modèles activés ou désactivés dans les paramètres filtrent les sélecteurs de l'assistant et de la migration.",
      "Au moment de l'envoi, le provider et le modèle choisis pilotent le streaming, les capacités et le coût de la réponse.",
    ],
    technicalRefs: ['Settings → API', 'constants/providers.ts', 'ChatRequest.provider', 'ChatRequest.model'],
    inputs: ['Clés API', 'Provider actif', 'Modèle sélectionné', 'Modèles activés'],
    outputs: ['Sélecteurs filtrés', 'Provider appelé', 'Réponse streamée'],
  },
  {
    title: '3. Perspective de réponse',
    subtitle: '4 profils consultant + détection automatique selon la question',
    icon: ToggleLeft,
    badges: ['Prompt'],
    details: [
      "Quatre profils adaptent le ton et la structure des réponses : Support (incidents, diagnostics P1-P4), Business Analyst (processus, configuration, formation), Architecte (trajectoire, risques, multi-société) et Développeur (ORM, code, traceback, migration).",
      "Le mode Automatique analyse le texte du prompt par score de termes : chaque profil dispose d'une liste de termes-clés pondérés ; le profil avec le score le plus élevé est sélectionné. Un signal fort (bloc de code, _inherit, traceback, @api.) court-circuite le scoring et force le profil Développeur.",
      "Un fichier Markdown dédié par profil (profile-support.md, profile-ba.md, profile-architect.md, profile-developer.md) est injecté dans le contexte pour aligner encore plus la réponse sur les attentes du rôle.",
    ],
    technicalRefs: ['PerspectiveToggle.tsx', 'inferPerspective()', 'resolvePerspective()', 'SUPPORT_TERMS / BA_TERMS / ARCH_TERMS / DEV_TERMS', 'profile-*.md', '_perspective_block()'],
    inputs: ['Prompt utilisateur', 'Mode (Auto / Manuel)', 'Profil sélectionné'],
    outputs: ['Profil effectif', 'Instructions système adaptées', 'Fichier Markdown de profil injecté'],
  },
  {
    title: '4. Fichiers Markdown de contexte',
    subtitle: 'Connaissance éditable injectée selon la demande — budget 36 000 car.',
    icon: FileText,
    badges: ['Markdown'],
    details: [
      "Les fichiers de contexte décrivent les règles de réponse, patterns Odoo, Studio, compte-rendu, migration et notes de version. Chaque fichier est éditable depuis les Paramètres.",
      "Un routeur analyse le dernier prompt, la perspective et la version pour n'inclure que les sections pertinentes. Les notes de version Odoo (v15→v19) sont chargées uniquement si la version est active.",
      "Un budget de 36 000 caractères est géré pour le contexte combiné. Le contexte projet est tronqué en priorité pour laisser de la place aux données live et au code source.",
    ],
    technicalRefs: ['~/.odoo-consultant/context/', 'skills.md', 'studio.md', 'migration.md', 'meeting-minute.md', 'odoo-v*.md', 'profile-*.md', 'load_context_for_prompt()', '_fit_context_budget()'],
    inputs: ['Fichiers Markdown personnalisés', 'Defaults embarqués', 'Prompt', 'Perspective', 'Version'],
    outputs: ['Sections routées ≤ 36 k car.', 'Notes de version ciblées', 'Guide de profil consultant'],
  },
  {
    title: '5. Projet client',
    subtitle: 'Instance, sociétés, environnement, contexte projet et localisation fiscale',
    icon: BriefcaseBusiness,
    badges: ['User', 'Odoo', 'Markdown'],
    details: [
      "Chaque projet stocke l'URL, la base, la version, les environnements, les sociétés accessibles et le contexte projet libre. La société active filtre les requêtes Odoo avec allowed_company_ids.",
      "Le contexte projet est une zone de texte libre (jusqu'à 6 000 car.) pour y consigner vocabulaire client, contraintes, intégrations, décisions et risques connus — tout ce que l'IA ne peut pas deviner.",
      "Un drapeau emoji (🇫🇷 🇧🇪 🇨🇭…) est affiché à côté de chaque société à partir du code ISO pays ; la localisation fiscale détectée (ex. : l10n_fr) est présentée dans le panneau contextuel.",
    ],
    technicalRefs: ['Profile', 'project_context', 'active_env_id', 'allowed_company_ids', 'country_code', 'countryFlag()', 'ConversationContextPanel'],
    inputs: ['Projet', 'Environnement', 'Société active', 'Code pays', 'Contexte projet'],
    outputs: ['Instance ciblée', 'Contexte client injecté', 'Requêtes scopées société', 'Drapeau affiché'],
  },
  {
    title: '6. Analyse de complexité technique',
    subtitle: 'Détection Studio, modules custom et modules communautaires (OCA)',
    icon: Layers,
    badges: ['Odoo', 'Repo', 'Context'],
    details: [
      "L'analyse inspecte Studio (modèles custom, champs x_, vues, menus, règles, actions serveur) et les modules installés. Elle est déclenchée depuis la fiche projet et stockée dans le profil.",
      "Les modules sont classés en trois buckets : Odoo standard (auteur contient \"Odoo S.A.\" / \"Odoo SA\"), Communautaires OCA (OCA, Camptocamp, Akretion, Tecnativa…) et Custom (tout le reste). Seuls les modules du troisième bucket déclenchent le flag \"Dev\".",
      "Quatre niveaux résultants guident la stratégie IA : Standard (proposer config), Studio (inspecter avant de coder), Dev (vérifier le repo), Studio + Dev (combiner les deux). Un seuil de 3 signaux Studio évite les faux positifs.",
    ],
    technicalRefs: ['technical_complexity_service.py', 'inspect_studio_customizations()', 'STUDIO_SIGNAL_THRESHOLD=3', 'COMMUNITY_AUTHOR_TOKENS', '_is_odoo_author()', 'MODE_LABELS'],
    inputs: ['Modules installés', 'Signaux Studio', 'Auteurs des modules'],
    outputs: ['Mode : Standard / Studio / Dev / Studio+Dev', 'Stratégie injectée dans le prompt', 'Sources panel enrichi'],
  },
  {
    title: '7. Sources locales Odoo',
    subtitle: 'Code source standard pour vérifier modèles, champs et comportements',
    icon: Database,
    badges: ['Odoo', 'Tool'],
    details: [
      "Les sources Odoo téléchargées localement permettent à l'IA de vérifier la vraie structure de la version sélectionnée, sans inventer de noms de modèles ou de méthodes.",
      "Community et Enterprise sont gérés séparément. Le panneau Sources affiche le badge \"C+E\", \"Community\" ou \"Enterprise\" selon ce qui est installé.",
      "En migration, les sources version source et version cible sont montées en parallèle pour comparer champs, modèles et comportements entre versions.",
    ],
    technicalRefs: ['~/.odoo-consultant/sources/<version>', 'search_odoo_source', 'read_odoo_file', 'search_target_source', 'count_source_lines'],
    inputs: ['Version Odoo', 'Sources Community / Enterprise'],
    outputs: ['Badge sources (C/E/C+E) dans le panneau', 'Preuves code standard', 'Comparaisons source/cible'],
  },
  {
    title: '8. Repo client',
    subtitle: 'Code custom cloné depuis GitHub pour comprendre les adaptations',
    icon: GitBranch,
    badges: ['Repo', 'Tool'],
    details: [
      "Un environnement projet peut pointer vers un dépôt GitHub cloné localement via SSH. Le clone et les mises à jour se pilotent depuis la modal d'environnement avec flux SSE en temps réel.",
      "Quand le repo est cloné, il apparaît dans le panneau \"Sources utilisées\" (badge vert) aux côtés des sources Odoo standard, signalant à l'IA qu'elle peut l'utiliser comme référence.",
      "L'IA explore les manifests, modèles, vues, contrôleurs et données des modules custom pour distinguer ce qui vient du standard, de Studio ou du code spécifique au client.",
    ],
    technicalRefs: ['~/.odoo-consultant/repos/<projet>/<env>', '__manifest__.py', 'search_project_source', 'read_project_file', 'conversationSources[]', 'dev.repositories[].cloned'],
    inputs: ['URL repo', 'Branche', 'Modules custom clonés'],
    outputs: ['Badge repo dans Sources utilisées', 'Inventaire custom', 'Fichiers citables', 'Impact migration/support'],
  },
  {
    title: '9. Message utilisateur',
    subtitle: 'Prompt, pièces jointes et contexte conversationnel',
    icon: MessageSquareText,
    badges: ['Prompt', 'Markdown'],
    details: [
      "La demande utilisateur détermine le mode (général, projet ou migration) et déclenche la détection automatique de perspective si le mode Auto est actif.",
      "Les pièces jointes (texte, code, configs, .po, classeurs Excel, PDF et images) sont ajoutées au dernier message. Images et PDF sont analysés visuellement (vision) ; les classeurs Excel sont convertis en tableaux Markdown.",
      "L'historique de la conversation peut être sauvegardé et relancé depuis l'historique, ou converti en compte-rendu de réunion.",
    ],
    technicalRefs: ['ChatRequest.messages', 'ChatRequest.attachments', '_inject_attachments()', 'perspectivePrompt', 'Historique conversation'],
    inputs: ['Question', 'Conversation', 'Pièces jointes', 'Version', 'Mode migration'],
    outputs: ['Message enrichi', 'Perspective auto-détectée', 'Intention détectable par le routeur'],
  },
  {
    title: '10. Panneau contextuel',
    subtitle: 'Vue en temps réel de tout ce qui est actif pour la réponse',
    icon: Settings2,
    badges: ['Context'],
    details: [
      "Le panneau contextuel (colonne droite) affiche en permanence : profil de réponse effectif, provider IA, projet / environnement / société active, version, complexité technique, repo, fichiers Markdown chargés et sources utilisées.",
      "Il distingue clairement mode Auto et mode Manuel pour la perspective, et montre en temps réel le profil inféré par auto-détection. Le drapeau pays de la société active est affiché à côté du nom.",
      "Ce panneau permet de vérifier d'un coup d'œil que le bon contexte est actif avant d'envoyer une question, évitant les réponses hors-sol.",
    ],
    technicalRefs: ['ConversationContextPanel.tsx', 'conversationSources[]', 'contextFiles[]', 'effectivePerspective', 'countryFlag()'],
    inputs: ['Perspective effective', 'Provider / Modèle', 'Projet / Société', 'Sources', 'Fichiers Markdown'],
    outputs: ['Transparence totale sur le contexte actif', "Détection rapide d'une mauvaise config"],
  },
  {
    title: '11. Routeur de contexte',
    subtitle: 'Sélection ciblée des informations utiles avant génération',
    icon: Workflow,
    badges: ['Markdown', 'Prompt', 'Tool'],
    details: [
      "Le routeur découpe les Markdown par sections et conserve uniquement les sous-sections opérationnelles pertinentes pour le prompt en cours.",
      "Il charge le guide de profil consultant adapté, les notes de version Odoo (source + cible si migration), Studio si besoin, le modèle de compte-rendu si la demande le suggère.",
      "Les tokens ambigus (pos, custom, mrp, of…) sont matchés avec word-boundaries pour éviter les faux positifs comme « propose » → POS ou « customer » → Customizations.",
      "Cache mtime-aware sur les lectures de fichiers Markdown : un tour chat ne re-lit plus 5-6 fichiers depuis le disque à chaque fois — la moindre édition depuis les Paramètres invalide automatiquement le cache.",
      "Budget strict : l'ensemble du contexte (profils, notes, projet, instructions) est limité à 36 000 caractères avant d'être envoyé au provider.",
    ],
    technicalRefs: ['load_context_for_prompt()', '_markdown_sections()', '_fit_context_budget()', '_term_matches()', '_BOUNDARY_TOKENS', 'routedContextFiles()', 'CONTEXT_BUDGET=36000'],
    inputs: ['Dernier prompt', 'Perspective', 'Version source + cible', 'Mode migration'],
    outputs: ['Contexte compact ≤ 36 k', 'Budget maîtrisé', 'Profil + notes + Markdown routé'],
  },
  {
    title: '12. Prompt système + outils IA',
    subtitle: 'Assemblage scindé stable / variable pour le cache Anthropic',
    icon: BrainCircuit,
    badges: ['Provider', 'Tool', 'Odoo', 'Repo'],
    details: [
      "Le system prompt est désormais scindé en DEUX blocs : (1) STABLE — identité consultant, instance Odoo, instructions sources, modèles fréquents, contexte projet ; (2) VARIABLE — langue de réponse, perspective, contexte Markdown routé.",
      "En mode Claude, un cache_control: ephemeral est posé à la frontière stable/variable — la moitié stable est mise en cache par Anthropic (~$0.075/Mtok au lieu de $3/Mtok sur Sonnet 4.6) et réutilisée à chaque tour.",
      "Boucle outils : un cache_control est aussi posé sur le DERNIER tool_result de chaque itération. Les tours conversationnels ET les tours outils profitent tous les deux du caching.",
      "Instructions sources DRY : un seul helper _source_instructions() émet le texte 'utilise SYSTÉMATIQUEMENT search_*_source' identique pour les 3 modes (général / projet / migration) — la moindre divergence casserait le cache.",
      "Les outils exposés varient selon le mode : données Odoo live (search_read, get_fields…), code source Odoo, repo client, Studio (inspect_studio_customizations), comptage de lignes. search_odoo_source accepte case_sensitive (true par défaut pour les patterns de code) et retourne des suggestions de fallback si 0 hit.",
    ],
    technicalRefs: ['build_system()', 'build_system_general()', 'build_system_migration()', '_source_instructions()', '_build_variable_block()', 'cache_control ephemeral', 'stream_chat()'],
    inputs: ['Contexte routé', 'Projet + complexité', 'Sources', 'Provider', 'Modèle', 'Langue'],
    outputs: ['Système (stable + variable)', 'Tools disponibles', 'Appel provider avec cache'],
  },
  {
    title: '13. Réponse IA',
    subtitle: 'Streaming, observabilité du cache, et garde-fous stop_reason',
    icon: Sparkles,
    badges: ['Provider', 'Tool'],
    details: [
      "La réponse est streamée dans l'interface avec les appels d'outils et résultats visibles, garantissant la traçabilité des vérifications effectuées.",
      "Observabilité cache : l'événement done SSE remonte cache_creation_input_tokens et cache_read_input_tokens pour mesurer en temps réel l'efficacité du caching.",
      "Stop reasons surveillés : max_tokens et refusal Claude émettent un événement warning SSE, affiché en bulle grise sous la réponse — fin des troncatures silencieuses.",
      "_trim_history sécurisé : à la coupure de fenêtre, les tool_result orphelins (Anthropic) ou messages role:tool (OpenAI) sont retirés en tête — évite les 400 du provider quand un cycle outil est coupé en deux par le trim.",
      "Selon la perspective effective, la réponse met l'accent sur les parcours métier, les grilles de diagnostic, les décisions d'architecture ou les détails techniques ORM.",
    ],
    technicalRefs: ['SSE chat stream', 'tool_call / tool_result', '_trim_history()', '_is_orphan_tool_message()', 'cache_read_input_tokens', 'warning event', 'meeting-minute.md'],
    inputs: ['Texte streamé', 'Résultats outils', 'Format demandé'],
    outputs: ['Réponse exploitable', 'Actions recommandées', 'Stats cache + warnings'],
  },
]

const qualityTips = [
  "Compléter le profil utilisateur et le contexte projet avec le vocabulaire client, les contraintes et les décisions prises.",
  "Utiliser le mode Auto de la perspective : il détecte Support, BA, Architecte ou Développeur à partir de vos mots-clés et des signaux forts (code, traceback, _inherit). L'hystérésis 350 ms évite le flicker pendant la frappe.",
  "Lancer l'analyse de complexité sur chaque projet pour que l'IA adapte sa stratégie (standard, Studio ou custom) sans hypothèses erronées.",
  "Cloner les repos custom pour que l'IA puisse citer et vérifier le code spécifique au client — le badge repo s'affiche alors dans Sources utilisées.",
  "Installer les sources Odoo Community + Enterprise pour la version exacte du client (badge C+E dans le panneau Sources).",
  "Vérifier le panneau contextuel avant d'envoyer : il montre en un coup d'œil le profil actif, les sources chargées et la société sélectionnée.",
  "Joindre les fichiers ponctuels (logs, config, export) au prompt plutôt que de les copier dans le contexte permanent.",
  "Choisir BA pour les arbitrages métier, Architecte pour les risques de trajectoire, Développeur pour le code, Support pour les diagnostics d'incident.",
  "Garder une conversation longue plutôt que multiplier les nouveaux chats : le cache Anthropic réutilise la moitié stable du system prompt (~5-10× moins de coût input par tour). Observable via cache_read_input_tokens dans l'événement done.",
]

const stepsEn: DiagramStep[] = [
  {
    title: '1. User settings',
    subtitle: 'Consultant identity and interface preferences',
    icon: UserRound,
    badges: ['User'],
    details: [
      'The consultant profile provides the name, role and team displayed in the application.',
      'Theme, avatar, primary color and visual preferences adjust the experience without changing project data.',
      'The consultant identity is injected at the top of the system context to steer the tone and posture of answers.',
    ],
    technicalRefs: ['Settings → Profile', 'getUserProfile()', 'USER_PROFILE_FILE'],
    inputs: ['Name', 'Role', 'Team', 'Avatar', 'Theme', 'Primary color'],
    outputs: ['Personalized UI', 'Consultant identity available for the prompt'],
  },
  {
    title: '2. AI configuration',
    subtitle: 'Providers, API keys, available models and active model',
    icon: KeyRound,
    badges: ['Provider'],
    details: [
      'Configured providers determine which engines can answer: Claude, OpenAI, Gemini, Copilot or GitHub Models.',
      'Models enabled or disabled in settings filter the assistant and migration model selectors.',
      "When sending, the selected provider and model drive streaming, capabilities and answer cost.",
    ],
    technicalRefs: ['Settings → API', 'constants/providers.ts', 'ChatRequest.provider', 'ChatRequest.model'],
    inputs: ['API keys', 'Active provider', 'Selected model', 'Enabled models'],
    outputs: ['Filtered selectors', 'Provider call', 'Streamed answer'],
  },
  {
    title: '3. Response perspective',
    subtitle: '4 consultant profiles + automatic detection from the question',
    icon: ToggleLeft,
    badges: ['Prompt'],
    details: [
      'Four profiles adapt tone and structure: Support (incidents, P1–P4 diagnostics), Business Analyst (processes, configuration, training), Architect (roadmap, risks, multi-company) and Developer (ORM, code, traceback, migration).',
      'Auto mode scores the prompt against per-profile term lists and picks the highest-scoring profile. A strong signal (code block, _inherit, traceback, @api.) bypasses scoring and forces the Developer profile.',
      'A dedicated Markdown file per profile (profile-support.md, profile-ba.md, profile-architect.md, profile-developer.md) is injected into context to align the answer with role expectations.',
    ],
    technicalRefs: ['PerspectiveToggle.tsx', 'inferPerspective()', 'resolvePerspective()', 'SUPPORT_TERMS / BA_TERMS / ARCH_TERMS / DEV_TERMS', 'profile-*.md', '_perspective_block()'],
    inputs: ['User prompt', 'Mode (Auto / Manual)', 'Selected profile'],
    outputs: ['Effective profile', 'Adapted system instructions', 'Profile Markdown injected'],
  },
  {
    title: '4. Markdown context files',
    subtitle: 'Editable knowledge injected by the router — 36 000 char budget',
    icon: FileText,
    badges: ['Markdown'],
    details: [
      'Context files describe answer rules, common Odoo patterns, Studio, meeting minutes, migration and version release notes. Each file is editable from Settings.',
      'A router analyses the latest prompt, perspective and version to include only relevant sections. Odoo version notes (v15→v19) are loaded only when the matching version is active.',
      'A 36 000-character budget is enforced across the combined context. Project context is truncated first to preserve room for live data and source code.',
    ],
    technicalRefs: ['~/.odoo-consultant/context/en/', 'skills.md', 'studio.md', 'migration.md', 'meeting-minute.md', 'odoo-v*.md', 'profile-*.md', 'load_context_for_prompt()', '_fit_context_budget()'],
    inputs: ['Custom Markdown files', 'Bundled defaults', 'Prompt', 'Perspective', 'Version'],
    outputs: ['Routed sections ≤ 36 k chars', 'Targeted version notes', 'Consultant profile guide'],
  },
  {
    title: '5. Client project',
    subtitle: 'Instance, companies, environment, project context and fiscal localisation',
    icon: BriefcaseBusiness,
    badges: ['User', 'Odoo', 'Markdown'],
    details: [
      'Each project stores URL, database, version, environments, accessible companies and a free-text project context. The active company scopes Odoo queries with allowed_company_ids.',
      'The free-text project context (up to 6 000 chars) holds client vocabulary, constraints, integrations, decisions and known risks — everything the AI cannot guess from data alone.',
      'A flag emoji (🇫🇷 🇧🇪 🇨🇭…) is shown next to each company using its ISO country code. The detected fiscal localisation (e.g. l10n_fr) is visible in the context panel.',
    ],
    technicalRefs: ['Profile', 'project_context', 'active_env_id', 'allowed_company_ids', 'country_code', 'countryFlag()', 'ConversationContextPanel'],
    inputs: ['Project', 'Environment', 'Active company', 'Country code', 'Project context'],
    outputs: ['Targeted instance', 'Injected client context', 'Company-scoped queries', 'Country flag displayed'],
  },
  {
    title: '6. Technical complexity analysis',
    subtitle: 'Studio detection, custom modules vs. OCA community modules',
    icon: Layers,
    badges: ['Odoo', 'Repo', 'Context'],
    details: [
      'The analysis inspects Studio (custom models, x_ fields, views, menus, rules, server actions) and installed modules. It is triggered from the project card and stored in the profile.',
      'Modules are split into three buckets: Odoo standard (author contains "Odoo S.A." / "Odoo SA"), Community OCA (OCA, Camptocamp, Akretion, Tecnativa…) and Custom (everything else). Only the third bucket triggers the "Dev" flag.',
      'Four resulting levels guide AI strategy: Standard (suggest config), Studio (inspect before coding), Dev (check repo), Studio + Dev (combine both). A threshold of 3 Studio signals prevents false positives.',
    ],
    technicalRefs: ['technical_complexity_service.py', 'inspect_studio_customizations()', 'STUDIO_SIGNAL_THRESHOLD=3', 'COMMUNITY_AUTHOR_TOKENS', '_is_odoo_author()', 'MODE_LABELS'],
    inputs: ['Installed modules', 'Studio signals', 'Module authors'],
    outputs: ['Mode: Standard / Studio / Dev / Studio+Dev', 'Strategy injected in system prompt', 'Sources panel enriched'],
  },
  {
    title: '7. Local Odoo sources',
    subtitle: 'Standard code used to verify models, fields and behavior',
    icon: Database,
    badges: ['Odoo', 'Tool'],
    details: [
      'Local Odoo sources let the AI verify the real structure for the selected version, avoiding invented model or method names.',
      'Community and Enterprise are managed separately. The Sources panel shows a "C+E", "Community" or "Enterprise" badge depending on what is installed.',
      'In migration mode, source and target versions are mounted side by side to compare fields, models and behaviors between versions.',
    ],
    technicalRefs: ['~/.odoo-consultant/sources/<version>', 'search_odoo_source', 'read_odoo_file', 'search_target_source', 'count_source_lines'],
    inputs: ['Odoo version', 'Community / Enterprise sources'],
    outputs: ['Sources badge in panel (C/E/C+E)', 'Standard-code evidence', 'Source/target comparisons'],
  },
  {
    title: '8. Client repository',
    subtitle: 'Custom code cloned from GitHub to understand adaptations',
    icon: GitBranch,
    badges: ['Repo', 'Tool'],
    details: [
      'A project environment can point to a locally cloned GitHub repository via SSH. Clone and pull are managed from the environment modal with real-time SSE progress.',
      'When the repo is cloned, it appears in the "Sources used" panel (green badge) alongside Odoo standard sources, signaling to the AI that it can use it as a reference.',
      'The AI inspects manifests, models, views, controllers and data files to distinguish standard Odoo, Studio customizations and client-specific development.',
    ],
    technicalRefs: ['~/.odoo-consultant/repos/<project>/<env>', '__manifest__.py', 'search_project_source', 'read_project_file', 'conversationSources[]', 'dev.repositories[].cloned'],
    inputs: ['Repo URL', 'Branch', 'Cloned custom modules'],
    outputs: ['Repo badge in Sources used', 'Custom inventory', 'Citable files', 'Migration / support impact'],
  },
  {
    title: '9. User message',
    subtitle: 'Prompt, attachments and conversation context',
    icon: MessageSquareText,
    badges: ['Prompt', 'Markdown'],
    details: [
      'The user request determines mode (general, project or migration) and triggers automatic perspective detection when Auto mode is active.',
      'Attachments (text, code, configs, .po files, Excel workbooks, PDFs and images) are appended to the latest user message. Images and PDFs are analysed visually (vision); Excel workbooks are converted to Markdown tables.',
      'Conversations can be saved in history and reused, or converted into a formatted Markdown meeting-minute report.',
    ],
    technicalRefs: ['ChatRequest.messages', 'ChatRequest.attachments', '_inject_attachments()', 'perspectivePrompt', 'Conversation history'],
    inputs: ['Question', 'Conversation', 'Attachments', 'Version', 'Migration mode'],
    outputs: ['Enriched message', 'Auto-detected perspective', 'Intent detectable by the router'],
  },
  {
    title: '10. Context panel',
    subtitle: 'Real-time view of everything active for the current answer',
    icon: Settings2,
    badges: ['Context'],
    details: [
      'The context panel (right column) always shows: effective response profile, AI provider, project / environment / active company, version, technical complexity, repo, loaded Markdown files and sources used.',
      'It clearly separates Auto and Manual mode for the perspective, and shows the profile inferred by auto-detection in real time. The active company country flag is displayed next to its name.',
      'The panel lets you verify at a glance that the right context is active before sending a question, preventing off-target answers.',
    ],
    technicalRefs: ['ConversationContextPanel.tsx', 'conversationSources[]', 'contextFiles[]', 'effectivePerspective', 'countryFlag()'],
    inputs: ['Effective perspective', 'Provider / Model', 'Project / Company', 'Sources', 'Markdown files'],
    outputs: ['Full transparency on active context', 'Fast detection of a misconfiguration'],
  },
  {
    title: '11. Context router',
    subtitle: 'Targeted selection of useful information before generation',
    icon: Workflow,
    badges: ['Markdown', 'Prompt', 'Tool'],
    details: [
      'The router splits Markdown files by section and keeps only operational subsections relevant to the current prompt.',
      'It loads the appropriate consultant profile guide, Odoo version notes (source + target in migration mode), Studio when relevant, and the meeting-minute template when the request calls for it.',
      'Ambiguous tokens (pos, custom, mrp, of…) are matched with word boundaries to avoid false positives like "propose" → POS or "customer" → Customizations.',
      'mtime-aware cache on Markdown reads: a single chat turn no longer re-reads 5-6 files from disk every time — any edit from Settings invalidates the cache automatically.',
      'Strict budget: the combined context (profiles, notes, project, instructions) is capped at 36 000 characters before being sent to the provider.',
    ],
    technicalRefs: ['load_context_for_prompt()', '_markdown_sections()', '_fit_context_budget()', '_term_matches()', '_BOUNDARY_TOKENS', 'routedContextFiles()', 'CONTEXT_BUDGET=36000'],
    inputs: ['Latest prompt', 'Perspective', 'Source + target version', 'Migration mode'],
    outputs: ['Compact context ≤ 36 k', 'Controlled budget', 'Profile + notes + routed Markdown'],
  },
  {
    title: '12. System prompt + AI tools',
    subtitle: 'Stable / variable split for Anthropic prompt caching',
    icon: BrainCircuit,
    badges: ['Provider', 'Tool', 'Odoo', 'Repo'],
    details: [
      'The system prompt is now split into TWO blocks: (1) STABLE — consultant identity, Odoo instance, source instructions, common models reference, project context; (2) VARIABLE — response language, perspective, routed Markdown context.',
      'On Claude, an ephemeral cache_control breakpoint is placed at the stable/variable boundary — the stable half is cached by Anthropic (~$0.075/Mtok instead of $3/Mtok on Sonnet 4.6) and reused every turn.',
      'Tool loop: cache_control is also placed on the LAST tool_result of each iteration. Both conversational turns AND tool turns benefit from caching.',
      'Single-source-of-truth instructions: a unified _source_instructions() helper emits identical "always use search_*_source" guidance across the 3 modes (general / project / migration) — any divergence would break the cache.',
      'Exposed tools vary by mode: live Odoo data (search_read, get_fields…), Odoo source code, client repo, Studio (inspect_studio_customizations) and line counting. search_odoo_source accepts case_sensitive (true by default for code patterns) and returns fallback suggestions when 0 hit.',
    ],
    technicalRefs: ['build_system()', 'build_system_general()', 'build_system_migration()', '_source_instructions()', '_build_variable_block()', 'cache_control ephemeral', 'stream_chat()'],
    inputs: ['Routed context', 'Project + complexity', 'Sources', 'Provider', 'Model', 'Language'],
    outputs: ['System (stable + variable)', 'Available tools', 'Provider call with cache'],
  },
  {
    title: '13. AI answer',
    subtitle: 'Streaming, cache observability, and stop_reason safeguards',
    icon: Sparkles,
    badges: ['Provider', 'Tool'],
    details: [
      'The answer streams into the interface with visible tool calls and results, guaranteeing traceability of verifications performed.',
      'Cache observability: the done SSE event exposes cache_creation_input_tokens and cache_read_input_tokens to measure caching efficiency in real time.',
      'Stop reasons monitored: Claude max_tokens and refusal emit a warning SSE event, rendered as a muted bubble below the answer — no more silent truncations.',
      'Secured _trim_history: when the window is cut, orphan tool_result blocks (Anthropic) or role:tool messages (OpenAI) at the head are dropped — avoids provider 400s when a tool cycle is split by the trim.',
      'Depending on the effective perspective, the answer emphasizes business workflows, diagnostic grids, architecture decisions or technical ORM details.',
    ],
    technicalRefs: ['SSE chat stream', 'tool_call / tool_result', '_trim_history()', '_is_orphan_tool_message()', 'cache_read_input_tokens', 'warning event', 'meeting-minute.md'],
    inputs: ['Streamed text', 'Tool results', 'Requested format'],
    outputs: ['Actionable answer', 'Recommended actions', 'Cache stats + warnings'],
  },
]

const qualityTipsEn = [
  'Fill the user profile and project context with client vocabulary, constraints and decisions already made.',
  'Use Auto mode for the perspective: it detects Support, BA, Architect or Developer from your keywords and strong signals (code, traceback, _inherit). The 350 ms hysteresis prevents flicker during typing.',
  'Run the complexity analysis on each project so the AI adapts its strategy (standard, Studio or custom) without wrong assumptions.',
  'Clone custom repositories so the AI can cite and verify client-specific code — the repo badge then appears in Sources used.',
  'Install Odoo Community + Enterprise sources for the exact version used by the client (C+E badge in the Sources panel).',
  'Check the context panel before sending: it shows at a glance the active profile, loaded sources and selected company.',
  'Attach one-off files (logs, config, exports) to the prompt instead of copying them into permanent context.',
  'Choose BA for business trade-offs, Architect for roadmap risks, Developer for code, Support for incident diagnostics.',
  'Keep a long conversation rather than starting fresh chats: the Anthropic cache reuses the stable half of the system prompt (~5-10× lower input cost per turn). Observable via cache_read_input_tokens in the done event.',
]

const pageCopy = {
  fr: {
    title: 'Fonctionnement',
    description: "Vue d'ensemble du flux de contexte IA : paramètres, Markdown, sources Odoo, repos client, outils et réponse finale.",
    heroTitle: 'Du paramétrage à la réponse IA',
    heroText: "L'application ne se contente pas d'envoyer votre question au modèle. Elle assemble un contexte contrôlé : identité consultant, provider, projet client, complexité technique, sources locales, repo custom, fichiers Markdown et outils de vérification. Le panneau contextuel vous permet de voir en temps réel ce qui est actif.",
    aria: "Diagramme vertical du fonctionnement de l'application",
    tipsTitle: 'Comment améliorer la qualité des réponses',
    inputs: 'Entrées',
    outputs: 'Sorties',
  },
  en: {
    title: 'How it works',
    description: 'Overview of the AI context flow: settings, Markdown, Odoo sources, client repositories, tools and final answer.',
    heroTitle: 'From setup to AI answer',
    heroText: 'The application does not simply send your question to the model. It assembles controlled context: consultant identity, provider, client project, technical complexity, local sources, custom repository, Markdown files and verification tools. The context panel lets you see what is active in real time.',
    aria: 'Vertical diagram explaining how the application works',
    tipsTitle: 'How to improve answer quality',
    inputs: 'Inputs',
    outputs: 'Outputs',
  },
}

export default function HowItWorks() {
  const lang = useUiLanguage()
  const copy = pageCopy[lang]
  const displayedSteps = lang === 'en' ? stepsEn : steps
  const displayedTips = lang === 'en' ? qualityTipsEn : qualityTips

  return (
    <div style={styles.page}>
      <PageHeader title={copy.title} description={copy.description} />

      <section style={styles.heroBand}>
        <div style={styles.heroIcon}><Bot size={26} /></div>
        <div>
          <div style={styles.heroTitle}>{copy.heroTitle}</div>
          <p style={styles.heroText}>{copy.heroText}</p>
        </div>
      </section>

      <section style={styles.diagram} aria-label={copy.aria}>
        {displayedSteps.map((step, index) => (
          <DiagramNode key={step.title} step={step} isLast={index === displayedSteps.length - 1} labels={copy} />
        ))}
      </section>

      <section style={styles.tipsBand}>
        <div style={styles.tipsHeader}>
          <Sparkles size={18} />
          <h2 style={styles.tipsTitle}>{copy.tipsTitle}</h2>
        </div>
        <div style={styles.tipGrid}>
          {displayedTips.map(tip => (
            <div key={tip} style={styles.tipItem}>
              <span style={styles.tipDot} />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function DiagramNode({ step, isLast, labels }: { step: DiagramStep; isLast: boolean; labels: { inputs: string; outputs: string } }) {
  const Icon = step.icon
  return (
    <div style={styles.nodeWrap}>
      <article style={styles.node}>
        <div style={styles.nodeHead}>
          <div style={styles.nodeIcon}><Icon size={22} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={styles.badgeRow}>
              {step.badges.map(badge => <Badge key={badge} kind={badge} />)}
            </div>
            <h2 style={styles.nodeTitle}>{step.title}</h2>
            <p style={styles.nodeSubtitle}>{step.subtitle}</p>
          </div>
        </div>

        <div style={styles.nodeBody}>
          <div style={styles.detailBlock}>
            {step.details.map(detail => (
              <p key={detail} style={styles.detailText}>{detail}</p>
            ))}
          </div>
          <div style={styles.sideGrid}>
            <MiniPanel title={labels.inputs} items={step.inputs} icon={Braces} />
            <MiniPanel title={labels.outputs} items={step.outputs} icon={Code2} />
          </div>
          <div style={styles.refs}>
            {step.technicalRefs.map(ref => (
              <code key={ref} style={styles.refChip}>{ref}</code>
            ))}
          </div>
        </div>
      </article>
      {!isLast && (
        <div style={styles.connector} aria-hidden>
          <div style={styles.connectorLine} />
          <div style={styles.connectorArrow}>↓</div>
        </div>
      )}
    </div>
  )
}

function Badge({ kind }: { kind: BadgeKind }) {
  const cfg = badgeColors[kind]
  return (
    <span style={{ ...styles.badge, color: cfg.fg, background: cfg.bg, borderColor: cfg.border }}>
      {kind}
    </span>
  )
}

function MiniPanel({ title, items, icon: Icon }: { title: string; items: string[]; icon: LucideIcon }) {
  return (
    <div style={styles.miniPanel}>
      <div style={styles.miniTitle}>
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <div style={styles.miniItems}>
        {items.map(item => <span key={item} style={styles.miniChip}>{item}</span>)}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { width: '100%', paddingBottom: 36 },
  heroBand: {
    display: 'flex', gap: 16, alignItems: 'flex-start',
    background: t.bgCard, border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg, padding: 18, boxShadow: t.shadow, marginBottom: 22,
  },
  heroIcon: {
    width: 44, height: 44, borderRadius: 8, background: t.brand10, color: t.brandFg,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroTitle: { fontSize: 16, fontWeight: 750, color: t.text, marginBottom: 5 },
  heroText: { margin: 0, color: t.textSub, fontSize: 13, lineHeight: 1.65 },
  diagram: { display: 'flex', flexDirection: 'column', alignItems: 'stretch' },
  nodeWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  node: {
    width: '100%', background: t.bgCard, border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg, boxShadow: t.shadow, overflow: 'hidden',
  },
  nodeHead: {
    display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px',
    borderBottom: `1px solid ${t.borderLight}`,
  },
  nodeIcon: {
    width: 42, height: 42, borderRadius: 8, background: t.bgMuted, border: `1px solid ${t.border}`,
    color: t.brandFg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  badge: {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px',
    border: '1px solid', borderRadius: 999, fontSize: 10, fontWeight: 750, letterSpacing: 0,
  },
  nodeTitle: { margin: 0, color: t.text, fontSize: 17, lineHeight: 1.25 },
  nodeSubtitle: { margin: '4px 0 0', color: t.muted, fontSize: 12, lineHeight: 1.45 },
  nodeBody: { padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  detailBlock: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 },
  detailText: {
    margin: 0, color: t.textSub, fontSize: 13, lineHeight: 1.55,
    background: t.bgMuted, border: `1px solid ${t.borderLight}`, borderRadius: t.radius, padding: '10px 11px',
  },
  sideGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 },
  miniPanel: { border: `1px solid ${t.border}`, borderRadius: t.radius, padding: 12, background: t.bgCard },
  miniTitle: { display: 'flex', alignItems: 'center', gap: 7, color: t.text, fontSize: 12, fontWeight: 750, marginBottom: 9 },
  miniItems: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  miniChip: {
    display: 'inline-flex', alignItems: 'center', maxWidth: '100%', minHeight: 22,
    padding: '2px 7px', borderRadius: 5, background: t.bgMuted, color: t.textSub,
    border: `1px solid ${t.borderLight}`, fontSize: 11, lineHeight: 1.35, overflowWrap: 'anywhere',
  },
  refs: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  refChip: {
    fontSize: 11, color: t.textSub, background: t.bgMuted, border: `1px solid ${t.border}`,
    borderRadius: 5, padding: '4px 7px', overflowWrap: 'anywhere',
  },
  connector: {
    width: 42, height: 42, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', color: t.brandFg,
  },
  connectorLine: { width: 2, height: 22, background: t.brand40 },
  connectorArrow: { fontSize: 16, fontWeight: 800, lineHeight: 1, marginTop: -2 },
  tipsBand: {
    marginTop: 22, background: t.bgCard, border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg, boxShadow: t.shadow, padding: 18,
  },
  tipsHeader: { display: 'flex', alignItems: 'center', gap: 8, color: t.brandFg, marginBottom: 14 },
  tipsTitle: { margin: 0, color: t.text, fontSize: 16 },
  tipGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 },
  tipItem: {
    display: 'flex', alignItems: 'flex-start', gap: 9, color: t.textSub, fontSize: 13,
    lineHeight: 1.5, padding: 11, borderRadius: t.radius, background: t.bgMuted, border: `1px solid ${t.borderLight}`,
  },
  tipDot: { width: 7, height: 7, borderRadius: 999, background: t.brand, marginTop: 6, flexShrink: 0 },
}
