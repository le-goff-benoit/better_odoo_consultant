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

type BadgeKind = 'User' | 'Provider' | 'Markdown' | 'Repo' | 'Odoo' | 'Prompt' | 'Tool'

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
  User: { fg: '#0f766e', bg: '#ecfdf5', border: '#99f6e4' },
  Provider: { fg: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  Markdown: { fg: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  Repo: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Odoo: { fg: '#be185d', bg: '#fdf2f8', border: '#fbcfe8' },
  Prompt: { fg: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
  Tool: { fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
}

const steps: DiagramStep[] = [
  {
    title: '1. Paramètres utilisateur',
    subtitle: 'Identité consultant et préférences d’interface',
    icon: UserRound,
    badges: ['User'],
    details: [
      'Le profil consultant fournit le nom, le poste et l’équipe affichés dans l’application.',
      'Le thème, l’avatar, la couleur primaire et les préférences visuelles ajustent l’expérience sans changer les données projet.',
      'L’identité consultant peut être injectée en tête du contexte système pour orienter le ton et la posture des réponses.',
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
      'Les providers configurés déterminent quels moteurs peuvent répondre : Claude, OpenAI, Gemini, Copilot ou GitHub Models.',
      'Les modèles activés ou désactivés dans les paramètres filtrent les sélecteurs de l’assistant et de la migration.',
      'Au moment de l’envoi, le provider et le modèle choisis pilotent le streaming, les capacités et le coût de la réponse.',
    ],
    technicalRefs: ['Settings → API', 'constants/providers.ts', 'ChatRequest.provider', 'ChatRequest.model'],
    inputs: ['Clés API', 'Provider actif', 'Modèle sélectionné', 'Modèles activés'],
    outputs: ['Sélecteurs filtrés', 'Provider appelé', 'Réponse streamée'],
  },
  {
    title: '3. Perspective de réponse',
    subtitle: 'Bascule AM/BA ou Archi/Dev à la volée',
    icon: ToggleLeft,
    badges: ['Prompt'],
    details: [
      'Le toggle change la nature de la réponse pour la requête en cours.',
      'AM/BA privilégie parcours utilisateur, processus métier, configuration, impacts rôles et formation.',
      'Archi/Dev privilégie modèles, champs, vues XML, code, performance, migration et preuves techniques.',
    ],
    technicalRefs: ['PerspectiveToggle.tsx', 'ChatRequest.perspective', '_perspective_block()'],
    inputs: ['Mode functional', 'Mode technical'],
    outputs: ['Instructions système adaptées', 'Suggestions et format de réponse orientés'],
  },
  {
    title: '4. Fichiers Markdown de contexte',
    subtitle: 'Connaissance éditable injectée selon la demande',
    icon: FileText,
    badges: ['Markdown'],
    details: [
      'Les fichiers de contexte décrivent les règles de réponse, modèles Odoo fréquents, migration, Studio, compte-rendu et notes de version.',
      'Ils sont éditables depuis les Paramètres et servent d’aide-mémoire, pas de vérité absolue.',
      'Le routeur sélectionne uniquement les sections utiles pour éviter de saturer le prompt.',
    ],
    technicalRefs: ['~/.odoo-consultant/context/', 'skills.md', 'studio.md', 'migration.md', 'meeting-minute.md', 'odoo-*.md'],
    inputs: ['Markdown personnalisés', 'Defaults embarqués'],
    outputs: ['Sections de contexte prêtes à router'],
  },
  {
    title: '5. Projet client',
    subtitle: 'Instance, société active, environnement et contexte projet',
    icon: BriefcaseBusiness,
    badges: ['User', 'Odoo', 'Markdown'],
    details: [
      'Chaque projet stocke l’URL, la base, la version, les environnements, les sociétés accessibles et le contexte projet.',
      'La société active filtre les requêtes Odoo avec allowed_company_ids quand elle est disponible.',
      'Le contexte projet complète ce que l’IA ne peut pas deviner : vocabulaire client, contraintes, intégrations et décisions.',
    ],
    technicalRefs: ['Profile', 'project_context', 'active_env_id', 'allowed_company_ids'],
    inputs: ['Projet', 'Environnement', 'Société active', 'Contexte projet'],
    outputs: ['Instance ciblée', 'Contexte client injecté', 'Requêtes scopées société'],
  },
  {
    title: '6. Sources locales Odoo',
    subtitle: 'Code source standard pour vérifier modèles, champs et comportements',
    icon: Database,
    badges: ['Odoo', 'Tool'],
    details: [
      'Les sources Odoo téléchargées localement permettent à l’IA de vérifier la vraie structure de la version sélectionnée.',
      'En mode général ou projet, elles évitent d’inventer des noms de modèles, champs ou méthodes.',
      'En migration, les sources version source et version cible sont comparées pour identifier les changements.',
    ],
    technicalRefs: ['~/.odoo-consultant/sources/<version>', 'search_odoo_source', 'read_odoo_file', 'search_target_source'],
    inputs: ['Version Odoo', 'Sources Community / Enterprise'],
    outputs: ['Preuves code standard', 'Comparaisons source/cible'],
  },
  {
    title: '7. Repo client',
    subtitle: 'Code custom cloné depuis GitHub pour comprendre les adaptations',
    icon: GitBranch,
    badges: ['Repo', 'Tool'],
    details: [
      'Un environnement projet peut pointer vers un dépôt GitHub cloné localement.',
      'L’IA inspecte les manifests, modèles, vues, contrôleurs et données des modules custom.',
      'Ces informations aident à distinguer standard Odoo, Studio et développement spécifique client.',
    ],
    technicalRefs: ['~/.odoo-consultant/repos/<projet>/<env>', '__manifest__.py', 'search_project_source', 'read_project_file'],
    inputs: ['URL repo', 'Branche', 'Modules custom'],
    outputs: ['Inventaire custom', 'Fichiers citables', 'Impact migration ou support'],
  },
  {
    title: '8. Message utilisateur',
    subtitle: 'Prompt, pièces jointes et contexte conversationnel',
    icon: MessageSquareText,
    badges: ['Prompt', 'Markdown'],
    details: [
      'La demande utilisateur détermine le mode général, projet ou migration.',
      'Les pièces jointes texte, Markdown, JSON, XML, Python, logs ou PDF textuels sont ajoutées au dernier message utilisateur.',
      'Le dernier prompt sert aussi à choisir les sections de contexte pertinentes.',
    ],
    technicalRefs: ['ChatRequest.messages', 'ChatRequest.attachments', '_inject_attachments()'],
    inputs: ['Question', 'Conversation', 'Pièces jointes', 'Version', 'Mode migration'],
    outputs: ['Message enrichi', 'Intention détectable par le routeur'],
  },
  {
    title: '9. Routeur de contexte',
    subtitle: 'Sélection ciblée des informations utiles avant génération',
    icon: Workflow,
    badges: ['Markdown', 'Prompt', 'Tool'],
    details: [
      'Le routeur découpe les Markdown par sections et conserve les sous-sections opérationnelles.',
      'Il charge les domaines pertinents, le modèle de compte-rendu, Studio ou les notes de version uniquement quand c’est utile.',
      'La priorité reste : données live et code source d’abord, contexte Markdown ensuite.',
    ],
    technicalRefs: ['load_context_for_prompt()', '_markdown_sections()', '_fit_context_budget()'],
    inputs: ['Dernier prompt', 'Perspective', 'Version', 'Mode migration'],
    outputs: ['Contexte compact', 'Budget maîtrisé', 'Moins de bruit dans le prompt'],
  },
  {
    title: '10. Prompt système + outils IA',
    subtitle: 'Assemblage final envoyé au provider choisi',
    icon: BrainCircuit,
    badges: ['Provider', 'Tool', 'Odoo', 'Repo'],
    details: [
      'Le système assemble perspective, instance, sources disponibles, contexte Markdown routé, contexte projet et identité consultant.',
      'Les outils exposés changent selon le mode : données Odoo live, code source Odoo, repo client, Studio, comptage de lignes.',
      'L’IA doit utiliser les outils pour vérifier les faits au lieu de répondre uniquement depuis sa mémoire.',
    ],
    technicalRefs: ['build_system()', 'build_system_general()', 'build_system_migration()', 'stream_chat()'],
    inputs: ['Contexte routé', 'Projet', 'Sources', 'Provider', 'Modèle'],
    outputs: ['Prompt système', 'Tools disponibles', 'Appel provider'],
  },
  {
    title: '11. Réponse IA',
    subtitle: 'Streaming, preuves, actions et historique',
    icon: Sparkles,
    badges: ['Provider', 'Tool'],
    details: [
      'La réponse est streamée dans l’interface avec les appels d’outils et résultats quand ils existent.',
      'Selon la perspective, elle met l’accent sur les parcours métier ou les détails techniques.',
      'Les conversations peuvent être conservées dans l’historique et réutilisées pour générer un compte-rendu.',
    ],
    technicalRefs: ['SSE / chat stream', 'tool_call', 'tool_result', 'Historique conversation'],
    inputs: ['Texte streamé', 'Résultats outils', 'Format demandé'],
    outputs: ['Réponse exploitable', 'Actions recommandées', 'Historique / compte-rendu'],
  },
]

const qualityTips = [
  'Compléter le profil utilisateur pour que le ton et l’identité consultant soient cohérents.',
  'Configurer les bons providers IA et désactiver les modèles inutiles pour garder des sélecteurs propres.',
  'Renseigner le contexte projet avec les contraintes métier, décisions et vocabulaire client.',
  'Cloner les repos custom pour permettre à l’IA de vérifier les modules spécifiques.',
  'Installer les sources Odoo correspondant aux versions réellement utilisées.',
  'Joindre les fichiers ponctuels utiles au prompt plutôt que les copier dans le contexte permanent.',
  'Choisir AM/BA pour les arbitrages métier, Archi/Dev pour le code, les champs et la migration.',
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
      'The consultant identity can be injected into the system context to steer the tone and posture of answers.',
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
      'When sending a message, the selected provider and model drive streaming, capabilities and answer cost.',
    ],
    technicalRefs: ['Settings → API', 'constants/providers.ts', 'ChatRequest.provider', 'ChatRequest.model'],
    inputs: ['API keys', 'Active provider', 'Selected model', 'Enabled models'],
    outputs: ['Filtered selectors', 'Provider call', 'Streamed answer'],
  },
  {
    title: '3. Response perspective',
    subtitle: 'AM/BA or Archi/Dev toggle for each request',
    icon: ToggleLeft,
    badges: ['Prompt'],
    details: [
      'The toggle changes the nature of the answer for the current request.',
      'AM/BA prioritizes user journeys, business processes, configuration, role impacts and training.',
      'Archi/Dev prioritizes models, fields, XML views, code, performance, migration and technical evidence.',
    ],
    technicalRefs: ['PerspectiveToggle.tsx', 'ChatRequest.perspective', '_perspective_block()'],
    inputs: ['Functional mode', 'Technical mode'],
    outputs: ['Adapted system instructions', 'Oriented suggestions and answer format'],
  },
  {
    title: '4. Markdown context files',
    subtitle: 'Editable knowledge injected according to the request',
    icon: FileText,
    badges: ['Markdown'],
    details: [
      'Context files describe answer rules, common Odoo patterns, migration, Studio, meeting minutes and release notes.',
      'They are editable from Settings and act as a working memory, not as the only source of truth.',
      'The context router selects only useful sections to avoid saturating the prompt.',
    ],
    technicalRefs: ['~/.odoo-consultant/context/en/', 'skills.md', 'studio.md', 'migration.md', 'meeting-minute.md', 'odoo-*.md'],
    inputs: ['Custom Markdown files', 'Bundled defaults'],
    outputs: ['Context sections ready for routing'],
  },
  {
    title: '5. Client project',
    subtitle: 'Instance, active company, environment and project context',
    icon: BriefcaseBusiness,
    badges: ['User', 'Odoo', 'Markdown'],
    details: [
      'Each project stores URL, database, version, environments, accessible companies and project context.',
      'The active company scopes Odoo requests with allowed_company_ids when available.',
      'Project context adds what the AI cannot guess: client vocabulary, constraints, integrations and decisions.',
    ],
    technicalRefs: ['Profile', 'project_context', 'active_env_id', 'allowed_company_ids'],
    inputs: ['Project', 'Environment', 'Active company', 'Project context'],
    outputs: ['Targeted instance', 'Injected client context', 'Company-scoped requests'],
  },
  {
    title: '6. Local Odoo sources',
    subtitle: 'Standard code used to verify models, fields and behavior',
    icon: Database,
    badges: ['Odoo', 'Tool'],
    details: [
      'Local Odoo sources let the AI verify the real structure of the selected version.',
      'In general or project mode, they avoid invented model, field or method names.',
      'In migration mode, source and target versions can be compared to identify changes.',
    ],
    technicalRefs: ['~/.odoo-consultant/sources/<version>', 'search_odoo_source', 'read_odoo_file', 'search_target_source'],
    inputs: ['Odoo version', 'Community / Enterprise sources'],
    outputs: ['Standard-code evidence', 'Source/target comparisons'],
  },
  {
    title: '7. Client repository',
    subtitle: 'Custom code cloned from GitHub to understand adaptations',
    icon: GitBranch,
    badges: ['Repo', 'Tool'],
    details: [
      'A project environment can point to a locally cloned GitHub repository.',
      'The AI inspects manifests, models, views, controllers and data files from custom modules.',
      'This helps distinguish standard Odoo, Studio customizations and client-specific development.',
    ],
    technicalRefs: ['~/.odoo-consultant/repos/<project>/<env>', '__manifest__.py', 'search_project_source', 'read_project_file'],
    inputs: ['Repo URL', 'Branch', 'Custom modules'],
    outputs: ['Custom inventory', 'Citable files', 'Migration or support impact'],
  },
  {
    title: '8. User message',
    subtitle: 'Prompt, attachments and conversation context',
    icon: MessageSquareText,
    badges: ['Prompt', 'Markdown'],
    details: [
      'The user request determines general, project or migration mode.',
      'Text, Markdown, JSON, XML, Python, logs or textual PDF attachments are appended to the latest user message.',
      'The latest prompt is also used to choose relevant context sections.',
    ],
    technicalRefs: ['ChatRequest.messages', 'ChatRequest.attachments', '_inject_attachments()'],
    inputs: ['Question', 'Conversation', 'Attachments', 'Version', 'Migration mode'],
    outputs: ['Enriched message', 'Intent detectable by the router'],
  },
  {
    title: '9. Context router',
    subtitle: 'Targeted selection of useful information before generation',
    icon: Workflow,
    badges: ['Markdown', 'Prompt', 'Tool'],
    details: [
      'The router splits Markdown files by section and keeps operational subsections.',
      'It loads relevant domains, meeting minutes, Studio or release notes only when useful.',
      'Priority remains: live data and source code first, Markdown context second.',
    ],
    technicalRefs: ['load_context_for_prompt()', '_markdown_sections()', '_fit_context_budget()'],
    inputs: ['Latest prompt', 'Perspective', 'Version', 'Migration mode'],
    outputs: ['Compact context', 'Controlled budget', 'Less noise in the prompt'],
  },
  {
    title: '10. System prompt + AI tools',
    subtitle: 'Final assembly sent to the selected provider',
    icon: BrainCircuit,
    badges: ['Provider', 'Tool', 'Odoo', 'Repo'],
    details: [
      'The system prompt assembles perspective, instance, available sources, routed Markdown context, project context and consultant identity.',
      'Exposed tools change by mode: live Odoo data, Odoo source code, client repo, Studio and line counting.',
      'The AI should use tools to verify facts instead of answering only from memory.',
    ],
    technicalRefs: ['build_system()', 'build_system_general()', 'build_system_migration()', 'stream_chat()'],
    inputs: ['Routed context', 'Project', 'Sources', 'Provider', 'Model'],
    outputs: ['System prompt', 'Available tools', 'Provider call'],
  },
  {
    title: '11. AI answer',
    subtitle: 'Streaming, evidence, actions and history',
    icon: Sparkles,
    badges: ['Provider', 'Tool'],
    details: [
      'The answer streams into the interface with tool calls and results when available.',
      'Depending on the perspective, it emphasizes business workflows or technical details.',
      'Conversations can be kept in history and reused to generate meeting minutes.',
    ],
    technicalRefs: ['SSE / chat stream', 'tool_call', 'tool_result', 'Conversation history'],
    inputs: ['Streamed text', 'Tool results', 'Requested format'],
    outputs: ['Actionable answer', 'Recommended actions', 'History / meeting minutes'],
  },
]

const qualityTipsEn = [
  'Complete the user profile so tone and consultant identity stay consistent.',
  'Configure the right AI providers and disable unused models to keep selectors clean.',
  'Fill the project context with business constraints, decisions and client vocabulary.',
  'Clone custom repositories so the AI can verify client-specific modules.',
  'Install Odoo sources for the exact versions used by the client.',
  'Attach one-off files to the prompt instead of copying them into permanent context.',
  'Choose AM/BA for business trade-offs, Archi/Dev for code, fields and migration.',
]

const pageCopy = {
  fr: {
    title: 'Fonctionnement',
    description: 'Vue d’ensemble du flux de contexte IA : paramètres, Markdown, sources Odoo, repos client, outils et réponse finale.',
    heroTitle: 'Du paramétrage à la réponse IA',
    heroText: 'L’application ne se contente pas d’envoyer votre question au modèle. Elle assemble un contexte contrôlé : identité consultant, provider, projet client, sources locales, repo custom, fichiers Markdown et outils de vérification.',
    aria: "Diagramme vertical du fonctionnement de l'application",
    tipsTitle: 'Comment améliorer la qualité des réponses',
    inputs: 'Entrées',
    outputs: 'Sorties',
  },
  en: {
    title: 'How it works',
    description: 'Overview of the AI context flow: settings, Markdown, Odoo sources, client repositories, tools and final answer.',
    heroTitle: 'From setup to AI answer',
    heroText: 'The application does not simply send your question to the model. It assembles controlled context: consultant identity, provider, client project, local sources, custom repository, Markdown files and verification tools.',
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
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

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
  page: {
    maxWidth: 980,
    margin: '0 auto',
    paddingBottom: 36,
  },
  heroBand: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg,
    padding: 18,
    boxShadow: t.shadow,
    marginBottom: 22,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    background: t.brand10,
    color: t.brand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: 750,
    color: t.text,
    marginBottom: 5,
  },
  heroText: {
    margin: 0,
    color: t.textSub,
    fontSize: 13,
    lineHeight: 1.65,
  },
  diagram: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  nodeWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  node: {
    width: '100%',
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg,
    boxShadow: t.shadow,
    overflow: 'hidden',
  },
  nodeHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    padding: '16px 18px',
    borderBottom: `1px solid ${t.borderLight}`,
  },
  nodeIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    background: t.bgMuted,
    border: `1px solid ${t.border}`,
    color: t.brand,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    padding: '0 7px',
    border: '1px solid',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 750,
    letterSpacing: 0,
  },
  nodeTitle: {
    margin: 0,
    color: t.text,
    fontSize: 17,
    lineHeight: 1.25,
  },
  nodeSubtitle: {
    margin: '4px 0 0',
    color: t.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  nodeBody: {
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  detailBlock: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
    gap: 10,
  },
  detailText: {
    margin: 0,
    color: t.textSub,
    fontSize: 13,
    lineHeight: 1.55,
    background: t.bgMuted,
    border: `1px solid ${t.borderLight}`,
    borderRadius: t.radius,
    padding: '10px 11px',
  },
  sideGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 12,
  },
  miniPanel: {
    border: `1px solid ${t.border}`,
    borderRadius: t.radius,
    padding: 12,
    background: t.bgCard,
  },
  miniTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    color: t.text,
    fontSize: 12,
    fontWeight: 750,
    marginBottom: 9,
  },
  miniItems: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  miniChip: {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    minHeight: 22,
    padding: '2px 7px',
    borderRadius: 5,
    background: t.bgMuted,
    color: t.textSub,
    border: `1px solid ${t.borderLight}`,
    fontSize: 11,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  refs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
  },
  refChip: {
    fontSize: 11,
    color: t.textSub,
    background: t.bgMuted,
    border: `1px solid ${t.border}`,
    borderRadius: 5,
    padding: '4px 7px',
    overflowWrap: 'anywhere',
  },
  connector: {
    width: 42,
    height: 42,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: t.brand,
  },
  connectorLine: {
    width: 2,
    height: 22,
    background: t.brand40,
  },
  connectorArrow: {
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1,
    marginTop: -2,
  },
  tipsBand: {
    marginTop: 22,
    background: t.bgCard,
    border: `1px solid ${t.border}`,
    borderRadius: t.radiusLg,
    boxShadow: t.shadow,
    padding: 18,
  },
  tipsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: t.brand,
    marginBottom: 14,
  },
  tipsTitle: {
    margin: 0,
    color: t.text,
    fontSize: 16,
  },
  tipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 10,
  },
  tipItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    color: t.textSub,
    fontSize: 13,
    lineHeight: 1.5,
    padding: 11,
    borderRadius: t.radius,
    background: t.bgMuted,
    border: `1px solid ${t.borderLight}`,
  },
  tipDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: t.brand,
    marginTop: 6,
    flexShrink: 0,
  },
}
