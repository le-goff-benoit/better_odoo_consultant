import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, Copy, Database, Eye, EyeOff, FileText, FolderOpen, Globe2, HardDrive, KeyRound, LayoutPanelTop, Lock, Loader2, Network, RefreshCw, Search, Server, Settings2, Sparkles, Terminal, UserRound, Workflow, Wrench, X, Zap } from 'lucide-react'
import { getAiProviders, saveAiKey, deleteAiKey, testAiKey, copilotLogin, copilotPoll, listContextFiles, getContextFile, saveContextFile, deleteContextFile, getModelConfig, saveModelConfig, getToolConfig, saveToolConfig, getAiSkills, getSkillDiagram, getSkillMarkdown, getSkillReference, getSkillTemplate, getSkillExample, getSkillEvalQueries, getUserProfile, saveUserProfile, getDataDir, openDataFolder } from '../api/client'
import { PROVIDERS as AI_PROVIDERS } from '../constants/providers'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import Markdown from '../components/Markdown'
import { applyBrandColor, applyThemeMode } from '../App'
import { WIDTH_OPTIONS, WIDTH_KEY, getStoredWidth, type ContentWidth } from '../components/Layout'
import { Tabs } from '../components/ui'
import { useUiLanguage, type UiLanguage } from '../i18n'

interface ProviderDef {
  id: string
  label: string
  color: string
  textColor?: string
  logoUrl: string
  placeholder: string
  docsUrl: string
  docsLabel: string
  description: string
  note?: string
  oauthFlow?: boolean
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    color: '#D97706',
    textColor: '#0a0a0a',
    logoUrl: 'https://www.anthropic.com/favicon.ico',
    placeholder: 'sk-ant-api03-…',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com',
    description: 'Le meilleur pour l\'analyse de données complexes et les synthèses. Modèles : Opus (puissant), Sonnet (quotidien), Haiku (rapide).',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT-4o)',
    color: '#16A34A',
    textColor: '#0a0a0a',
    logoUrl: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64',
    placeholder: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com',
    description: 'Très polyvalent. Modèles : GPT-4o (puissant), GPT-4o mini (économique), o1 mini (raisonnement).',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    color: '#2563EB',
    logoUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
    placeholder: 'AIzaSy…',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'aistudio.google.com',
    description: 'Idéal pour les très longs contextes. Modèles : 2.0 Flash (rapide), 1.5 Pro (long contexte).',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    color: '#24292f',
    logoUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    placeholder: 'ghp_… ou github_pat_…',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    description: 'Accès à GPT-4o, Claude, Llama, Mistral via votre compte GitHub. Inclus dans GitHub Free/Pro.',
    note: 'Token GitHub personnel (classic ou fine-grained). Permission "models: read" si fine-grained.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot Business',
    color: '#6e40c9',
    logoUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    placeholder: '',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    description: 'Accès via votre abonnement Copilot Business/Enterprise. Modèles GPT-4o, Claude, o1 selon votre plan.',
    note: 'Expérimental — API non officielle. Requiert un abonnement Copilot Business/Enterprise actif.',
    oauthFlow: true,
  },
]

interface CopilotFlowState {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  status: 'waiting' | 'error'
  error?: string
}

type SettingsTab = 'profile' | 'api' | 'context' | 'interface' | 'storage' | 'skills'

export default function Settings() {
  const lang = useUiLanguage()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const c = {
    fr: {
      title: 'Paramètres',
      tabs: { profile: 'Profil', api: 'Clés API', context: 'Contexte IA', interface: 'Interface', storage: 'Stockage', skills: 'Skills' },
      profileIntro: "Personnalisez votre identité et l'apparence de l'interface. Le nom et le poste sont injectés dans le contexte de l'assistant IA.",
      contextIntro: "Ces fichiers Markdown sont injectés dans le prompt système de l'assistant. Modifiez-les pour adapter le contexte métier.",
    },
    en: {
      title: 'Settings',
      tabs: { profile: 'Profile', api: 'API keys', context: 'AI context', interface: 'Interface', storage: 'Storage', skills: 'Skills' },
      profileIntro: 'Customize your identity and interface appearance. Your name and role are injected into the AI assistant context.',
      contextIntro: 'These Markdown files are injected into the assistant system prompt. Edit them to adapt the business context.',
    },
  }[lang]

  const tabs = [
    { id: 'profile' as const,   label: c.tabs.profile, icon: <UserRound size={15} /> },
    { id: 'api' as const,       label: c.tabs.api, icon: <KeyRound size={15} /> },
    { id: 'context' as const,   label: c.tabs.context, icon: <FileText size={15} /> },
    { id: 'skills' as const,    label: c.tabs.skills, icon: <Zap size={15} /> },
    { id: 'interface' as const, label: c.tabs.interface, icon: <LayoutPanelTop size={15} /> },
    { id: 'storage' as const,   label: c.tabs.storage, icon: <Database size={15} /> },
  ]

  return (
    <div className="page-stack">
      <PageHeader title={c.title} />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <section className="settings-panel">
          <p className="settings-intro">
            {c.profileIntro}
          </p>
          <UserProfileEditor />
        </section>
      )}

      {tab === 'api' && <div className="settings-panel settings-panel-plain"><ApiSection /></div>}

      {tab === 'context' && (
        <section className="settings-panel settings-panel-plain">
          <p className="settings-intro">
            {c.contextIntro}
          </p>
          <ContextEditor />
        </section>
      )}

      {tab === 'interface' && <InterfaceSection />}

      {tab === 'storage' && <StorageSection />}

      {tab === 'skills' && <SkillsSection />}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  )
}

// ── Storage section ───────────────────────────────────────────────

function StorageSection() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intro: 'All local data is centralized in one folder. You can back it up, move it, or delete it without touching the application.',
      contents: 'Data folder contents',
      open: 'Open in file explorer',
      securityTitle: 'Security:',
      security: 'API keys (Odoo and AI) are stored in the system keyring (Keychain on macOS, Secret Service on Linux), never in this folder. The database only contains non-sensitive metadata.',
      rows: [
        ['Main folder', 'Database, configuration, encryption keys.'],
        ['Odoo sources', 'Local git clones of Community and Enterprise sources.'],
        ['Client custom repositories', 'GitHub repositories for custom modules, one folder per project and environment.'],
        ['AI context', 'Markdown files injected into the assistant system prompt.'],
        ['Model configuration', 'Enabled AI models and selection preferences.'],
      ],
    }
    : {
      intro: "Toutes les données locales sont centralisées dans un seul dossier. Vous pouvez le sauvegarder, le déplacer ou le supprimer sans toucher à l'application.",
      contents: 'Contenu du dossier de données',
      open: "Ouvrir dans l'explorateur",
      securityTitle: 'Sécurité :',
      security: 'Les clés API (Odoo et IA) sont stockées dans le keyring système (Keychain sur macOS, Secret Service sur Linux) — jamais dans ce dossier. La base de données ne contient que des métadonnées non sensibles.',
      rows: [
        ['Dossier principal', 'Base de données, configuration, clés de chiffrement.'],
        ['Sources Odoo', 'Dépôts git des sources Community et Enterprise clonés localement.'],
        ['Dépôts custom clients', 'Dépôts GitHub des modules custom, un dossier par projet et environnement.'],
        ['Contexte IA', "Fichiers Markdown injectés dans le prompt système de l'assistant."],
        ['Configuration modèles', 'Modèles IA activés et préférences de sélection.'],
      ],
    }
  const { data } = useQuery({ queryKey: ['data-dir'], queryFn: getDataDir })
  const dataDir: string = data?.data?.path ?? '~/.odoo-consultant'

  const rows: { label: string; path: string; description: string }[] = [
    {
      label: c.rows[0][0],
      path: dataDir,
      description: c.rows[0][1],
    },
    {
      label: c.rows[1][0],
      path: `${dataDir}/sources/`,
      description: c.rows[1][1],
    },
    {
      label: c.rows[2][0],
      path: `${dataDir}/repos/`,
      description: c.rows[2][1],
    },
    {
      label: c.rows[3][0],
      path: `${dataDir}/context/`,
      description: c.rows[3][1],
    },
    {
      label: c.rows[4][0],
      path: `${dataDir}/model-config.json`,
      description: c.rows[4][1],
    },
  ]

  return (
    <section className="settings-panel">
      <p style={{ fontSize: 13, color: t.muted, marginBottom: 24, lineHeight: 1.6 }}>
        {c.intro}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{c.contents}</div>
        <button
          onClick={() => openDataFolder()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px',
            background: `var(--brand-10, ${t.brand}15)`,
            color: `var(--brand, ${t.brand})`,
            border: `1px solid var(--brand-40, ${t.brand}40)`,
            borderRadius: t.radius, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'filter .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
          onMouseLeave={e => (e.currentTarget.style.filter = '')}
        >
          <FolderOpen size={16} /> {c.open}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(row => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '12px 16px', background: t.bgCard,
            border: `1px solid ${t.border}`, borderRadius: t.radius,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{row.description}</div>
              <code style={{
                fontSize: 11, color: t.muted, background: t.bgMuted,
                padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{row.path}</code>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 20, padding: '12px 16px', background: t.bgMuted,
        borderRadius: t.radius, fontSize: 12, color: t.muted, lineHeight: 1.6,
      }}>
        <strong style={{ color: t.text }}>{c.securityTitle}</strong> {c.security}
      </div>
    </section>
  )
}

// ── Skills section ────────────────────────────────────────────────

type SkillGroup = 'core' | 'live' | 'src' | 'target' | 'repo'
type SkillScope = 'core' | 'project' | 'user' | 'organization' | 'experimental'
type SkillStatus = 'active' | 'disabled' | 'error'
type SkillHealthStatus = 'ok' | 'warning' | 'error' | 'unknown'
type SkillContentKind = 'reference' | 'template' | 'example'

interface SkillEvalQuery {
  query: string
  expected_skill?: string
  should_trigger: boolean
  category?: 'positive' | 'near_miss' | 'negative' | string
  language?: string
  notes?: string
  modes?: string[]
}

interface SkillUsageItem {
  id: string
  source: string
  title: string
  prompt: string
  updatedAt: number
  matches: number
}

interface AiEventLike {
  type?: string
  name?: string
  skills?: string[]
}

interface StoredMessageLike {
  role?: string
  text?: string
  events?: AiEventLike[]
  timestamp?: number
}

interface SkillPermissionsMeta {
  filesystem: 'none' | 'read' | 'write'
  network: boolean
  scripts: boolean
  odoo: 'none' | 'read' | 'write'
}

interface SkillMeta {
  label: string
  labelEn: string
  group: SkillGroup
  desc: string
  descEn: string
  req: string
  reqEn: string
  kind?: 'core' | 'tool'
  builtin?: boolean
  locked?: boolean
  hasDiagram?: boolean
  version?: string
  author?: string
  permissions?: SkillPermissionsMeta
  references?: string[]
  templates?: { name: string; label: string; triggers?: string[] }[]
  examples?: string[]
  scripts?: string[]
  modes?: string[]
  keywords?: string[]
  tags?: string[]
  readOnly?: boolean
  riskLevel?: 'low' | 'medium' | 'high'
}

interface ApiSkill {
  name: string
  label: string
  label_en: string
  group: SkillGroup
  description: string
  description_en: string
  requirement: string
  requirement_en: string
  kind?: 'core' | 'tool'
  builtin?: boolean
  locked?: boolean
  diagram?: unknown
  version?: string
  author?: string
  permissions?: SkillPermissionsMeta
  references?: string[]
  templates?: { name: string; label: string; triggers?: string[] }[]
  examples?: string[]
  scripts?: string[]
  modes?: string[]
  keywords?: string[]
  tags?: string[]
  read_only?: boolean
  risk_level?: 'low' | 'medium' | 'high'
}

interface SkillRegistryDiagnostic {
  severity: 'warning' | 'error'
  skill?: string
  folder?: string
  code: string
  message: string
  field?: string
}

const SKILLS_META: Record<string, SkillMeta> = {
  odoo_query_records: {
    label: 'Requêter Odoo', labelEn: 'Query Odoo',
    group: 'live',
    desc: 'Rechercher des enregistrements via search_read (commandes, factures, contacts…)',
    descEn: 'Fetch records via search_read (orders, invoices, contacts…)',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_count_records: {
    label: 'Compter enregistrements', labelEn: 'Count records',
    group: 'live',
    desc: 'Compter les enregistrements correspondant à un domaine de filtrage',
    descEn: 'Count records matching a filter domain',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_aggregate_records: {
    label: 'Agréger des données', labelEn: 'Aggregate data',
    group: 'live',
    desc: 'Calculer des agrégats fiables par période, statut, commercial, journal...',
    descEn: 'Compute reliable aggregates by period, status, salesperson, journal...',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_fields: {
    label: 'Inspecter les champs', labelEn: 'Inspect fields',
    group: 'live',
    desc: 'Lister les champs d\'un modèle, y compris les champs custom Studio (x_*)',
    descEn: 'List model fields, including Studio custom fields (x_*)',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_modules: {
    label: 'Modules installés', labelEn: 'Installed modules',
    group: 'live',
    desc: 'Lister applications, modules techniques, versions et modules custom probables',
    descEn: 'List apps, technical modules, versions and likely custom modules',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_security: {
    label: 'Inspecter la sécurité', labelEn: 'Inspect security',
    group: 'live',
    desc: 'Lire ACL, record rules et groupes associés à un modèle',
    descEn: 'Read ACLs, record rules and groups attached to a model',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_navigation: {
    label: 'Menus et actions', labelEn: 'Menus and actions',
    group: 'live',
    desc: 'Retrouver les menus et actions qui exposent un modèle ou un écran',
    descEn: 'Find menus and actions exposing a model or screen',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_studio: {
    label: 'Audit Studio', labelEn: 'Studio audit',
    group: 'live',
    desc: 'Inventorier toutes les personnalisations Odoo Studio : modèles, champs, vues, menus, automations',
    descEn: 'Inventory all Odoo Studio customizations: models, fields, views, menus, automations',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_view: {
    label: 'Inspecter une vue', labelEn: 'Inspect a view',
    group: 'live',
    desc: 'Lire l\'arch XML assemblé d\'une vue (form, liste, kanban…) après héritage complet',
    descEn: 'Read the assembled XML arch of a view (form, list, kanban…) after full inheritance',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  odoo_inspect_report: {
    label: 'Inspecter un rapport', labelEn: 'Inspect a report',
    group: 'live',
    desc: 'Lire le template QWeb et la mise en page d\'un rapport PDF de l\'instance',
    descEn: 'Read the QWeb template and layout of a PDF report from the instance',
    req: 'Connexion Odoo active', reqEn: 'Active Odoo connection',
  },
  source_search_odoo: {
    label: 'Chercher dans les sources', labelEn: 'Search source code',
    group: 'src',
    desc: 'Grep dans le code source Odoo Community/Enterprise téléchargé localement',
    descEn: 'Grep in locally downloaded Odoo Community/Enterprise source code',
    req: 'Sources Odoo téléchargées', reqEn: 'Downloaded Odoo sources',
  },
  source_read_odoo_file: {
    label: 'Lire un fichier source', labelEn: 'Read a source file',
    group: 'src',
    desc: 'Lire le contenu d\'un fichier des sources Odoo (modèle, vue, controller…)',
    descEn: 'Read the content of an Odoo source file (model, view, controller…)',
    req: 'Sources Odoo téléchargées', reqEn: 'Downloaded Odoo sources',
  },
  source_show_commit: {
    label: 'Voir un commit', labelEn: 'Show a commit',
    group: 'src',
    desc: 'Afficher le diff complet d\'un commit Odoo ou projet par son SHA',
    descEn: 'Display the full diff of an Odoo or project commit by its SHA',
    req: 'Sources Odoo téléchargées', reqEn: 'Downloaded Odoo sources',
  },
  migration_search_target_source: {
    label: 'Chercher dans la cible', labelEn: 'Search target source',
    group: 'target',
    desc: 'Rechercher dans les sources Odoo de la version cible en migration',
    descEn: 'Search Odoo source code for the migration target version',
    req: 'Sources cible téléchargées', reqEn: 'Downloaded target sources',
  },
  migration_read_target_file: {
    label: 'Lire un fichier cible', labelEn: 'Read target file',
    group: 'target',
    desc: 'Lire un fichier des sources Odoo de la version cible',
    descEn: 'Read a source file from the migration target version',
    req: 'Sources cible téléchargées', reqEn: 'Downloaded target sources',
  },
  repo_search_code: {
    label: 'Chercher dans le projet', labelEn: 'Search project code',
    group: 'repo',
    desc: 'Grep dans le dépôt custom du client (modules, overrides, configurations)',
    descEn: 'Grep in the client\'s custom repository (modules, overrides, configurations)',
    req: 'Dépôt GitHub cloné', reqEn: 'Cloned GitHub repository',
  },
  repo_read_file: {
    label: 'Lire un fichier projet', labelEn: 'Read a project file',
    group: 'repo',
    desc: 'Lire un fichier du module custom du client',
    descEn: 'Read a file from the client\'s custom module',
    req: 'Dépôt GitHub cloné', reqEn: 'Cloned GitHub repository',
  },
  repo_list_modules: {
    label: 'Modules projet', labelEn: 'Project modules',
    group: 'repo',
    desc: 'Parser les manifests du dépôt client pour lister modules et dépendances',
    descEn: 'Parse client repository manifests to list modules and dependencies',
    req: 'Dépôt GitHub cloné', reqEn: 'Cloned GitHub repository',
  },
  repo_count_source_lines: {
    label: 'Compter les lignes', labelEn: 'Count lines',
    group: 'repo',
    desc: 'Comptage exhaustif des LOC par module, extension ou dossier',
    descEn: 'Exhaustive LOC count by module, extension or directory',
    req: 'Sources ou dépôt disponible', reqEn: 'Sources or repository available',
  },
}

const SKILL_GROUPS: { id: SkillGroup; label: string; labelEn: string; color: string }[] = [
  { id: 'core', label: 'Cœur de l\'app',   labelEn: 'App core',     color: '#7C3AED' },
  { id: 'live', label: 'Données live',    labelEn: 'Live data',    color: '#2563EB' },
  { id: 'src',  label: 'Code source',     labelEn: 'Source code',  color: '#7C3AED' },
  { id: 'target', label: 'Migration cible', labelEn: 'Migration target', color: '#9333EA' },
  { id: 'repo', label: 'Code projet',     labelEn: 'Project code', color: '#D97706' },
]

function SkillToggle({ enabled, disabled = false, onChange }: { enabled: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center',
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: enabled ? 'var(--brand, #2563EB)' : 'var(--th-border)',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
      title={disabled ? 'Verrouillé' : enabled ? 'Désactiver' : 'Activer'}
    >
      <span style={{
        position: 'absolute', left: enabled ? 20 : 2, top: 2,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

function SkillsSection() {
  const lang = useUiLanguage()
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<SkillGroup>>(new Set(['core', 'live', 'src', 'target', 'repo']))
  const [detailsFor, setDetailsFor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: skillsData } = useQuery({ queryKey: ['ai-skills'], queryFn: getAiSkills })
  const { data: providerData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders, staleTime: 60_000 })

  const c = lang === 'en' ? {
    title: 'AI Skill Registry',
    intro: 'Readable registry of assistant capabilities. Open Details to inspect SKILL.md, diagram, references, templates, examples, providers and usage history.',
    enabled: 'Active',
    disabled: 'Disabled',
    req: 'Dependencies',
    trigger: 'Trigger',
    resources: 'Resources',
    health: 'Health',
    diagram: 'Diagram',
    references: 'References',
    templates: 'Templates',
    examples: 'Examples',
    details: 'Details',
    runs: 'Runs',
    noRuns: 'No run history yet',
    providerCompatibility: 'Providers',
    search: 'Search skills…',
    allEnabled: 'All active',
    builtin: 'Locked',
    skillMd: 'SKILL.md',
    usageHistory: 'Usage history',
    noResults: 'No skill matches these filters.',
    diagnosticsTitle: 'Registry diagnostics',
    diagnosticsOk: 'Registry healthy: no warning or error reported by the backend.',
    diagnosticsIntro: (errors: number, warnings: number) => `${errors} error${errors > 1 ? 's' : ''} · ${warnings} warning${warnings > 1 ? 's' : ''}`,
    metadata: 'Skill metadata',
    permissions: 'Access rights',
    permFs: 'Filesystem',
    permNet: 'Network',
    permScripts: 'Scripts',
    permOdoo: 'Odoo',
    summary: (active: number, errors: number, warnings: number) => `${active} active · ${errors} error${errors > 1 ? 's' : ''} · ${warnings} warning${warnings > 1 ? 's' : ''}`,
    someDisabled: (n: number) => `${n} skill${n > 1 ? 's' : ''} disabled`,
    confirmDisableCore: (label: string) => `"${label}" is a core skill of the app. Disabling it removes the corresponding capability from every answer. Continue?`,
  } : {
    title: 'Skill Registry IA',
    intro: 'Catalogue lisible des capacités de l’assistant. Ouvrez Détails pour consulter SKILL.md, diagramme, références, templates, exemples, providers et historique d’utilisation.',
    enabled: 'Actif',
    disabled: 'Désactivé',
    req: 'Dépendances',
    trigger: 'Trigger',
    resources: 'Ressources',
    health: 'Santé',
    diagram: 'Diagramme',
    references: 'Références',
    templates: 'Templates',
    examples: 'Exemples',
    details: 'Détails',
    runs: 'Runs',
    noRuns: 'Pas encore d’historique d’exécution',
    providerCompatibility: 'Providers',
    search: 'Rechercher un skill…',
    allEnabled: 'Tous actifs',
    builtin: 'Verrouillé',
    skillMd: 'SKILL.md',
    usageHistory: 'Historique d’utilisation',
    noResults: 'Aucun skill ne correspond aux filtres.',
    diagnosticsTitle: 'Diagnostics du registre',
    diagnosticsOk: 'Registre sain : aucun warning ni erreur remonté par le backend.',
    diagnosticsIntro: (errors: number, warnings: number) => `${errors} erreur${errors > 1 ? 's' : ''} · ${warnings} warning${warnings > 1 ? 's' : ''}`,
    metadata: 'Métadonnées du skill',
    permissions: 'Droits d’accès',
    permFs: 'Système de fichiers',
    permNet: 'Réseau',
    permScripts: 'Scripts',
    permOdoo: 'Odoo',
    summary: (active: number, errors: number, warnings: number) => `${active} actifs · ${errors} erreur${errors > 1 ? 's' : ''} · ${warnings} warning${warnings > 1 ? 's' : ''}`,
    someDisabled: (n: number) => `${n} skill${n > 1 ? 's' : ''} désactivé${n > 1 ? 's' : ''}`,
    confirmDisableCore: (label: string) => `« ${label} » est un skill cœur de l'application. Le désactiver retire la capacité correspondante de toutes les réponses. Continuer ?`,
  }

  useEffect(() => {
    getToolConfig().then(r => {
      const disabled: string[] = r.data?.disabled_tools ?? []
      setDisabledTools(new Set(disabled))
    }).catch(() => {})
  }, [])

  const persistDebounced = useCallback((next: Set<string>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      setSaving(true)
      saveToolConfig({ disabled_tools: Array.from(next) })
        .finally(() => setSaving(false))
    }, 500)
  }, [])

  const toggleSkill = useCallback((name: string, enabled: boolean, meta?: SkillMeta) => {
    if (!enabled && meta?.locked) return
    if (!enabled && meta?.builtin) {
      const label = lang === 'en' ? meta.labelEn : meta.label
      if (!confirm(c.confirmDisableCore(label))) return
    }
    setDisabledTools(prev => {
      const next = new Set(prev)
      if (enabled) next.delete(name)
      else next.add(name)
      persistDebounced(next)
      return next
    })
  }, [persistDebounced, lang, c])

  const toggleGroup = (id: SkillGroup) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const disabledCount = disabledTools.size
  const skillsLoaded = !!skillsData
  const apiSkills: ApiSkill[] = skillsData?.data?.skills ?? []
  const registryDiagnostics: SkillRegistryDiagnostic[] = skillsData?.data?.diagnostics ?? []
  const diagnosticErrors = registryDiagnostics.filter(item => item.severity === 'error').length
  const diagnosticWarnings = registryDiagnostics.filter(item => item.severity === 'warning').length
  const skillEntries: [string, SkillMeta][] = apiSkills.length
    ? apiSkills.map(s => [s.name, {
      label: s.label,
      labelEn: s.label_en,
      group: s.group,
      desc: s.description,
      descEn: s.description_en,
      req: s.requirement,
      reqEn: s.requirement_en,
      kind: s.kind,
      builtin: s.builtin,
      locked: s.locked ?? s.builtin,
      hasDiagram: !!s.diagram,
      version: s.version,
      author: s.author,
      permissions: s.permissions,
      references: s.references ?? [],
      templates: s.templates ?? [],
      examples: s.examples ?? [],
      scripts: s.scripts ?? [],
      modes: s.modes ?? [],
      keywords: s.keywords ?? [],
      tags: s.tags ?? [],
      readOnly: s.read_only,
      riskLevel: s.risk_level,
    }])
    : []

  const providerLabels = PROVIDERS
    .filter(p => providerData?.data?.configured?.[p.id])
    .map(p => p.label.replace(' (Anthropic)', '').replace(' (GPT-4o)', ''))
  const providersSummary = providerLabels.length ? providerLabels.join(' · ') : 'OpenAI · Claude · Gemini · Generic'
  const enrichedSkills = skillEntries.map(([name, meta]) => {
    const enabled = !disabledTools.has(name)
    const status = getSkillStatus(enabled)
    const health = getSkillHealth(meta, enabled, lang)
    const scope = getSkillScope(meta)
    return { name, meta, enabled, status, health, scope }
  })
  const filteredSkills = enrichedSkills.filter(s => {
    const q = search.trim().toLowerCase()
    const haystack = [s.name, s.meta.label, s.meta.labelEn, s.meta.desc, s.meta.descEn, ...(s.meta.keywords ?? [])].join(' ').toLowerCase()
    return !q || haystack.includes(q)
  })

  return (
    <section className="settings-panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--th-text)' }}>{c.title}</h3>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--th-muted)', lineHeight: 1.5, maxWidth: 560 }}>{c.intro}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {saving && <Loader2 size={14} style={{ color: 'var(--th-muted)', animation: 'spin 1s linear infinite' }} />}
          <span style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
            background: disabledCount === 0 ? 'var(--th-success, #16A34A)20' : 'var(--th-warning, #D97706)20',
            color: disabledCount === 0 ? 'var(--th-success, #16A34A)' : 'var(--th-warning, #D97706)',
            border: `1px solid ${disabledCount === 0 ? 'var(--th-success, #16A34A)40' : 'var(--th-warning, #D97706)40'}`,
          }}>
            {disabledCount === 0 ? c.allEnabled : c.someDisabled(disabledCount)}
          </span>
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr)', gap: 8,
        marginBottom: 14,
      }}>
        <label style={filterBoxStyle}>
          <Search size={14} style={{ color: 'var(--th-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={c.search}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--th-text)', width: '100%', fontSize: 12 }}
          />
        </label>
      </div>

      {skillsLoaded && apiSkills.length === 0 && (
        <div style={{
          padding: '14px 18px', marginBottom: 16,
          background: 'var(--th-warning-bg, rgba(217,119,6,0.1))',
          border: '1px solid var(--th-warning-fg, #D97706)',
          borderRadius: 8, color: 'var(--th-warning-fg, #D97706)',
          fontSize: 13, lineHeight: 1.5,
        }}>
          {lang === 'en'
            ? 'No skill returned by the API. Restart the backend (./scripts/start.sh) to reload the skill registry, then refresh this page.'
            : 'Aucun skill renvoyé par l\'API. Redémarrez le backend (./scripts/start.sh) pour recharger le registre des skills, puis rafraîchissez cette page.'}
        </div>
      )}
      {skillsLoaded && (
        <SkillRegistryDiagnosticsPanel
          diagnostics={registryDiagnostics}
          labels={{ title: c.diagnosticsTitle, ok: c.diagnosticsOk, intro: c.diagnosticsIntro(diagnosticErrors, diagnosticWarnings) }}
          lang={lang}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SKILL_GROUPS.map(group => {
          const skills = filteredSkills.filter(s => s.meta.group === group.id)
          const totalInGroup = enrichedSkills.filter(s => s.meta.group === group.id).length
          const isOpen = openGroups.has(group.id)
          const groupDisabled = skills.filter(s => disabledTools.has(s.name)).length
          if (totalInGroup === 0) return null
          return (
            <div key={group.id} style={{ border: '1px solid var(--th-border)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => toggleGroup(group.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: 'var(--th-bg-muted)', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 6, background: `${group.color}18`,
                  color: group.color, flexShrink: 0,
                }}>
                  <Wrench size={13} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--th-text)', flex: 1 }}>
                  {lang === 'en' ? group.labelEn : group.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--th-muted)', marginRight: 6 }}>
                  {groupDisabled > 0
                    ? (lang === 'en' ? `${groupDisabled} disabled` : `${groupDisabled} désactivé${groupDisabled > 1 ? 's' : ''}`)
                    : (lang === 'en' ? `${skills.length}/${totalInGroup} shown` : `${skills.length}/${totalInGroup} affichés`)
                  }
                </span>
                {isOpen ? <ChevronDown size={14} style={{ color: 'var(--th-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--th-muted)' }} />}
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--th-border)' }}>
                  {skills.length === 0 && (
                    <div style={{ padding: '18px 14px', color: 'var(--th-muted)', fontSize: 12 }}>{c.noResults}</div>
                  )}
                  {skills.map(({ name, meta, enabled, health, scope }, idx) => {
                    const triggerText = getSkillTrigger(meta, lang)
                    return (
                      <div key={name} style={{
                        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14,
                        padding: '14px',
                        borderBottom: idx < skills.length - 1 ? '1px solid var(--th-border)' : 'none',
                        background: enabled ? 'transparent' : 'var(--th-bg-muted)',
                        transition: 'background 0.15s',
                        opacity: enabled ? 1 : 0.65,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--th-text)' }}>
                              {lang === 'en' ? meta.labelEn : meta.label}
                            </span>
                            <RegistryBadge color={group.color}>{name}</RegistryBadge>
                            <RegistryBadge color={scope === 'project' ? '#D97706' : scope === 'experimental' ? '#DC2626' : '#7C3AED'}>{skillScopeLabel(scope)}</RegistryBadge>
                            {meta.locked && <RegistryBadge color="#D97706"><Lock size={9} /> {c.builtin}</RegistryBadge>}
                            {!enabled && <RegistryBadge color="#64748B">{c.disabled}</RegistryBadge>}
                            {meta.version && meta.version !== '0.1.0' && (
                              <span style={{ fontSize: 10, color: 'var(--th-muted)' }}>
                                v{meta.version}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--th-muted)', lineHeight: 1.5 }}>
                            {lang === 'en' ? meta.descEn : meta.desc}
                          </p>
                          <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                            <SkillLine label={c.trigger} value={triggerText} color="#2563EB" />
                            <SkillLine label={c.req} value={lang === 'en' ? meta.reqEn : meta.req} color={group.color} />
                            <SkillLine label={c.health} value={health.message} color={healthColor(health.status)} />
                            <SkillLine label={c.providerCompatibility} value="OpenAI · Claude · Gemini · GitHub/Copilot · Generic" color="#16A34A" />
                            {meta.permissions && <PermissionLine label={c.permissions} perms={meta.permissions} labels={c} />}
                          </div>
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'stretch', gap: 12,
                          paddingTop: 2, flexShrink: 0,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignSelf: 'flex-start' }}>
                            <button onClick={() => setDetailsFor(name)} title={c.details} style={contentButtonStyle(false, group.color)}>
                              <LayoutPanelTop size={12} /> {c.details}
                            </button>
                          </div>
                          <span aria-hidden="true" style={{
                            width: 1,
                            alignSelf: 'stretch',
                            minHeight: 38,
                            background: 'var(--th-border)',
                            opacity: 0.9,
                          }} />
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <SkillToggle enabled={enabled} disabled={!!meta.locked} onChange={v => toggleSkill(name, v, meta)} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {detailsFor && (() => {
        const item = enrichedSkills.find(s => s.name === detailsFor)
        if (!item) return null
        return (
          <SkillDetailModal
            open={true}
            name={item.name}
            meta={item.meta}
            enabled={item.enabled}
            scope={item.scope}
            health={item.health}
            providersSummary={providersSummary}
            labels={c}
            usageHistory={loadSkillUsageHistory(item.name, lang)}
            onClose={() => setDetailsFor(null)}
          />
        )
      })()}
    </section>
  )
}

function contentButtonStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 9px',
    border: `1px solid ${active ? accent : 'var(--th-border)'}`,
    borderRadius: 5,
    background: active ? `${accent}15` : 'transparent',
    color: active ? accent : 'var(--th-muted)',
    fontSize: 11, fontWeight: 650,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

function SkillRegistryDiagnosticsPanel({ diagnostics, labels, lang }: {
  diagnostics: SkillRegistryDiagnostic[]
  labels: { title: string; ok: string; intro: string }
  lang: UiLanguage
}) {
  const hasIssues = diagnostics.length > 0
  const tone = diagnostics.some(item => item.severity === 'error') ? '#DC2626' : diagnostics.some(item => item.severity === 'warning') ? '#D97706' : '#16A34A'
  return (
    <section style={{
      marginBottom: 16,
      border: `1px solid ${hasIssues ? `${tone}55` : 'var(--th-border)'}`,
      background: hasIssues ? `${tone}10` : 'var(--th-bg-card)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasIssues ? 10 : 0 }}>
        <AlertTriangle size={15} style={{ color: tone }} />
        <strong style={{ color: 'var(--th-text)', fontSize: 13 }}>{labels.title}</strong>
        <span style={{ marginLeft: 'auto', color: hasIssues ? tone : 'var(--th-muted)', fontSize: 11, fontWeight: 700 }}>
          {hasIssues ? labels.intro : (lang === 'en' ? 'OK' : 'OK')}
        </span>
      </div>
      {!hasIssues ? (
        <p style={{ margin: '6px 0 0 23px', color: 'var(--th-muted)', fontSize: 12, lineHeight: 1.45 }}>{labels.ok}</p>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {diagnostics.slice(0, 6).map((item, index) => (
            <div key={`${item.code}-${item.skill ?? item.folder ?? index}`} style={{
              display: 'grid', gap: 3,
              padding: '8px 10px', borderRadius: 7,
              background: 'var(--th-bg-card)', border: '1px solid var(--th-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <RegistryBadge color={item.severity === 'error' ? '#DC2626' : '#D97706'}>{item.severity}</RegistryBadge>
                <code style={{ color: 'var(--th-muted)', fontSize: 11 }}>{item.code}</code>
                {(item.skill || item.folder) && <span style={{ color: 'var(--th-muted)', fontSize: 11 }}>{item.skill || item.folder}</span>}
              </div>
              <span style={{ color: 'var(--th-text)', fontSize: 12, lineHeight: 1.45 }}>{item.message}</span>
            </div>
          ))}
          {diagnostics.length > 6 && (
            <span style={{ color: 'var(--th-muted)', fontSize: 11, paddingLeft: 2 }}>
              {lang === 'en' ? `+${diagnostics.length - 6} more issue(s)` : `+${diagnostics.length - 6} autre(s) diagnostic(s)`}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

const filterBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '8px 10px', border: '1px solid var(--th-border)', borderRadius: 8,
  background: 'var(--th-bg-card)', minWidth: 0,
}

function getSkillScope(meta: SkillMeta): SkillScope {
  if (meta.tags?.includes('experimental')) return 'experimental'
  if (meta.group === 'repo' || meta.group === 'target') return 'project'
  return 'core'
}

function skillScopeLabel(scope: SkillScope): string {
  if (scope === 'organization') return 'ORG'
  return scope.toUpperCase()
}

function getSkillStatus(enabled: boolean): SkillStatus {
  return enabled ? 'active' : 'disabled'
}

function getSkillResources(meta: SkillMeta) {
  return {
    references: meta.references?.length ?? 0,
    scripts: meta.scripts?.length ?? 0,
    templates: meta.templates?.length ?? 0,
    examples: meta.examples?.length ?? 0,
  }
}

function getSkillHealth(meta: SkillMeta, enabled: boolean, lang: UiLanguage): { status: SkillHealthStatus; message: string } {
  const en = lang === 'en'
  if (!enabled) return { status: 'unknown', message: en ? 'Disabled · not evaluated' : 'Désactivé · non évalué' }
  if (!meta.desc && !meta.descEn) return { status: 'error', message: en ? 'Error · missing description' : 'Erreur · description manquante' }
  if (!meta.examples?.length) return { status: 'warning', message: en ? 'Warning · no documented example' : 'Attention · aucun exemple documenté' }
  return { status: 'ok', message: en ? `OK · ${meta.examples.length} documented example${meta.examples.length > 1 ? 's' : ''}` : `OK · ${meta.examples.length} exemple${meta.examples.length > 1 ? 's' : ''} documenté${meta.examples.length > 1 ? 's' : ''}` }
}

function healthColor(status: SkillHealthStatus): string {
  if (status === 'ok') return '#16A34A'
  if (status === 'warning') return '#D97706'
  if (status === 'error') return '#DC2626'
  return '#64748B'
}

function getSkillTrigger(meta: SkillMeta, lang: UiLanguage): string {
  const desc = lang === 'en' ? meta.descEn : meta.desc
  const keywords = meta.keywords?.slice(0, 5).join(', ')
  if (desc.toLowerCase().startsWith('use this skill when') || desc.toLowerCase().startsWith('utiliser ce skill quand')) {
    return desc
  }
  if (keywords) {
    return lang === 'en'
      ? `Keyword or intent match: ${keywords}`
      : `Match par intention ou mots-clés : ${keywords}`
  }
  return lang === 'en' ? 'Implicit routing by the backend skill dispatcher.' : 'Routage implicite par le dispatcher backend.'
}

function loadSkillUsageHistory(skillName: string, lang: UiLanguage): SkillUsageItem[] {
  if (typeof localStorage === 'undefined') return []
  const usage: SkillUsageItem[] = []
  const addMessages = (source: string, title: string, updatedAt: number, messages: StoredMessageLike[]) => {
    messages.forEach((message, index) => {
      if (message.role !== 'assistant') return
      const events = message.events ?? []
      const matches = events.filter(event => eventMentionsSkill(event, skillName)).length
      if (matches === 0) return
      const previousPrompt = [...messages.slice(0, index)].reverse().find(item => item.role === 'user' && item.text)?.text ?? title
      usage.push({
        id: `${source}-${index}-${updatedAt}-${usage.length}`,
        source,
        title,
        prompt: previousPrompt.length > 140 ? `${previousPrompt.slice(0, 137)}…` : previousPrompt,
        updatedAt: message.timestamp ?? updatedAt,
        matches,
      })
    })
  }
  const parse = <T,>(key: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
  }
  const activeAssistant = parse<Record<string, StoredMessageLike[]>>('odoo-active-convs', {})
  Object.entries(activeAssistant).forEach(([key, messages]) => {
    addMessages(lang === 'en' ? 'Active assistant' : 'Assistant actif', key === 'general' ? 'Général' : `Profil ${key}`, Date.now(), messages)
  })
  const savedAssistant = parse<Record<string, { title?: string; messages?: StoredMessageLike[]; updatedAt?: number }[]>>('odoo-conv-history', {})
  Object.entries(savedAssistant).forEach(([key, conversations]) => {
    conversations.forEach(conversation => addMessages(lang === 'en' ? 'Saved assistant' : 'Assistant sauvegardé', conversation.title ?? (key === 'general' ? 'Général' : `Profil ${key}`), conversation.updatedAt ?? Date.now(), conversation.messages ?? []))
  })
  const activeMigration = parse<Record<string, StoredMessageLike[]>>('odoo-migration-active', {})
  Object.entries(activeMigration).forEach(([key, messages]) => {
    addMessages(lang === 'en' ? 'Active migration' : 'Migration active', key, Date.now(), messages)
  })
  const savedMigration = parse<{ title?: string; messages?: StoredMessageLike[]; updatedAt?: number }[]>('odoo-migration-history', [])
  savedMigration.forEach(conversation => addMessages(lang === 'en' ? 'Saved migration' : 'Migration sauvegardée', conversation.title ?? 'Migration', conversation.updatedAt ?? Date.now(), conversation.messages ?? []))
  return usage.sort((a, b) => b.updatedAt - a.updatedAt)
}

function eventMentionsSkill(event: AiEventLike, skillName: string): boolean {
  const wanted = normalizeSkillName(skillName)
  if (event.type === 'skills_selected' && Array.isArray(event.skills)) {
    return event.skills.some(name => normalizeSkillName(name) === wanted)
  }
  return !!event.name && normalizeSkillName(event.name) === wanted
}

function normalizeSkillName(name: string): string {
  return name.replace(/-/g, '_')
}

function RegistryBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 750, letterSpacing: 0.25, textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: 5,
      background: `${color}15`, color, border: `1px solid ${color}40`,
    }}>
      {children}
    </span>
  )
}

function SkillLine({ label, value, color }: {
  label: string
  value: string
  color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, lineHeight: 1.45 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 88, color: 'var(--th-muted)', fontWeight: 650 }}>
        {label}:
      </span>
      <span style={{ color, fontWeight: 550 }}>{value || '—'}</span>
    </div>
  )
}

function PermissionLine({ label, perms, labels }: {
  label: string
  perms: SkillPermissionsMeta
  labels: { permFs: string; permNet: string; permScripts: string; permOdoo: string }
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, lineHeight: 1.45 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 88, color: 'var(--th-muted)', fontWeight: 650 }}>
        {label}:
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <PermissionBadges perms={perms} labels={labels} />
      </span>
    </div>
  )
}

function SkillDetailModal({ open, name, meta, enabled, scope, health, providersSummary, labels, usageHistory, onClose }: {
  open: boolean
  name: string
  meta: SkillMeta
  enabled: boolean
  scope: SkillScope
  health: { status: SkillHealthStatus; message: string }
  providersSummary: string
  labels: {
    details: string; enabled: string; disabled: string; req: string; trigger: string; resources: string; health: string; diagram: string; references: string; templates: string; examples: string; providerCompatibility: string; runs: string; noRuns: string; skillMd: string; usageHistory: string
  }
  usageHistory: SkillUsageItem[]
  onClose: () => void
}) {
  const lang = useUiLanguage()
  const [tab, setTab] = useState<'overview' | 'skill' | 'diagram' | 'reference' | 'template' | 'example' | 'evalQueries' | 'providers' | 'usage'>('overview')
  const evalQueriesQuery = useQuery({
    queryKey: ['skill-eval-queries', name],
    queryFn: () => getSkillEvalQueries(name).then(r => r.data as { name: string; queries: SkillEvalQuery[]; available: boolean }),
    staleTime: 60_000,
    enabled: open,
  })
  const evalQueries = evalQueriesQuery.data?.queries ?? []
  const evalAvailable = evalQueriesQuery.data?.available ?? false

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const label = lang === 'en' ? meta.labelEn : meta.label
  const desc = lang === 'en' ? meta.descEn : meta.desc
  const req = lang === 'en' ? meta.reqEn : meta.req
  const trigger = getSkillTrigger(meta, lang)
  const resources = getSkillResources(meta)
  const tabs: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'overview', label: lang === 'en' ? 'Overview' : 'Vue d’ensemble' },
    { id: 'skill', label: labels.skillMd },
    ...(meta.hasDiagram ? [{ id: 'diagram' as const, label: labels.diagram }] : []),
    ...((meta.references?.length ?? 0) > 0 ? [{ id: 'reference' as const, label: labels.references, count: meta.references?.length }] : []),
    ...((meta.templates?.length ?? 0) > 0 ? [{ id: 'template' as const, label: labels.templates, count: meta.templates?.length }] : []),
    ...((meta.examples?.length ?? 0) > 0 ? [{ id: 'example' as const, label: labels.examples, count: meta.examples?.length }] : []),
    ...(evalAvailable ? [{ id: 'evalQueries' as const, label: lang === 'en' ? 'Eval queries' : 'Tests routing', count: evalQueries.length }] : []),
    { id: 'providers', label: labels.providerCompatibility },
    { id: 'usage', label: labels.usageHistory, count: usageHistory.length },
  ]

  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(8, 10, 14, 0.78)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'flex-end' }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100vw)', height: '100%', background: 'var(--th-bg)', color: 'var(--th-text)', borderLeft: '1px solid var(--th-border)', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,0.35)' }}>
        <header style={{ padding: '18px 22px', borderBottom: '1px solid var(--th-border)', background: 'var(--th-bg-card)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, background: 'var(--brand-bg, rgba(37,99,235,0.12))', color: 'var(--brand, #2563EB)' }}><Zap size={19} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>{label}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <RegistryBadge color="#64748B">{name}</RegistryBadge>
                <RegistryBadge color={scope === 'project' ? '#D97706' : '#7C3AED'}>{skillScopeLabel(scope)}</RegistryBadge>
                <RegistryBadge color={enabled ? '#16A34A' : '#64748B'}>{enabled ? labels.enabled : labels.disabled}</RegistryBadge>
                {meta.locked && <RegistryBadge color="#D97706"><Lock size={9} /> {lang === 'en' ? 'LOCKED' : 'VERROUILLÉ'}</RegistryBadge>}
              </div>
            </div>
            <button type="button" className="ui-icon-button" onClick={onClose} aria-label={lang === 'en' ? 'Close' : 'Fermer'}><X size={18} /></button>
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 6, padding: '10px 18px', borderBottom: '1px solid var(--th-border)', background: 'var(--th-bg-card)', overflowX: 'auto' }}>
          {tabs.map(({ id, label: tabLabel, count }) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid ' + (tab === id ? 'var(--brand, #2563EB)' : 'var(--th-border)'), background: tab === id ? 'var(--brand-bg, rgba(37,99,235,0.12))' : 'transparent', color: tab === id ? 'var(--brand, #2563EB)' : 'var(--th-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {tabLabel}
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 22 }}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <section style={detailPanelStyle}>
                <h3 style={detailTitleStyle}>Description</h3>
                <p style={{ margin: 0, color: 'var(--th-text-sub)', lineHeight: 1.6, fontSize: 13 }}>{desc}</p>
              </section>
              <section style={detailPanelStyle}>
                <h3 style={detailTitleStyle}>{labels.trigger}</h3>
                <p style={{ margin: 0, color: 'var(--th-text-sub)', lineHeight: 1.6, fontSize: 13 }}>{trigger}</p>
              </section>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <section style={detailPanelStyle}><h3 style={detailTitleStyle}>{labels.req}</h3><p style={detailTextStyle}>{req || '—'}</p></section>
                <section style={detailPanelStyle}><h3 style={detailTitleStyle}>{labels.health}</h3><p style={{ ...detailTextStyle, color: healthColor(health.status) }}>{health.message}</p></section>
                <section style={detailPanelStyle}><h3 style={detailTitleStyle}>{labels.resources}</h3><p style={detailTextStyle}>{resources.references} refs · {resources.scripts} scripts · {resources.templates} templates · {resources.examples} examples</p></section>
                <section style={detailPanelStyle}><h3 style={detailTitleStyle}>Metadata</h3><p style={detailTextStyle}>v{meta.version ?? '—'} · {meta.author ?? '—'}</p></section>
              </div>
              <section style={detailPanelStyle}>
                <h3 style={detailTitleStyle}>{labels.runs}</h3>
                <SkillUsageList items={usageHistory} emptyLabel={labels.noRuns} />
              </section>
            </div>
          )}

          {tab === 'skill' && <SkillMarkdownViewer skillName={name} />}
          {tab === 'diagram' && <SkillDiagramInline skillName={name} />}
          {tab === 'reference' && <SkillFileViewer skillName={name} kind="reference" files={meta.references ?? []} />}
          {tab === 'template' && <SkillFileViewer skillName={name} kind="template" files={(meta.templates ?? []).map(tpl => `${tpl.name}.md`)} />}
          {tab === 'example' && <SkillFileViewer skillName={name} kind="example" files={meta.examples ?? []} />}
          {tab === 'evalQueries' && <SkillEvalQueriesPanel skillName={name} queries={evalQueries} loading={evalQueriesQuery.isLoading} lang={lang} />}
          {tab === 'usage' && (
            <section style={detailPanelStyle}>
              <h3 style={detailTitleStyle}>{labels.usageHistory}</h3>
              <SkillUsageList items={usageHistory} emptyLabel={labels.noRuns} />
            </section>
          )}

          {tab === 'providers' && (
            <section style={detailPanelStyle}>
              <h3 style={detailTitleStyle}>{labels.providerCompatibility}</h3>
              <ProviderCompatibilityRow provider="OpenAI" status="supported" />
              <ProviderCompatibilityRow provider="Claude / Anthropic" status="supported" />
              <ProviderCompatibilityRow provider="Gemini" status="supported" />
              <ProviderCompatibilityRow provider="GitHub Models / Copilot" status="partial" />
              <ProviderCompatibilityRow provider="Generic" status="supported" />
              <p style={{ ...detailTextStyle, marginTop: 12 }}>Configured: {providersSummary}</p>
            </section>
          )}
        </main>
      </div>
    </div>,
    document.body,
  )
}

function SkillMarkdownViewer({ skillName }: { skillName: string }) {
  const lang = useUiLanguage()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill-markdown', skillName],
    queryFn: () => getSkillMarkdown(skillName).then(r => r.data as { content: string }),
    staleTime: 60_000,
  })
  const parsed = data?.content ? parseSkillMarkdown(data.content) : null
  return (
    <section style={detailPanelStyle}>
      <h3 style={detailTitleStyle}>SKILL.md</h3>
      {isLoading && <InlineLoading label={lang === 'en' ? 'Loading SKILL.md…' : 'Chargement de SKILL.md…'} />}
      {isError && <p style={{ ...detailTextStyle, color: 'var(--th-danger, #DC2626)' }}>{lang === 'en' ? 'Unable to load SKILL.md.' : 'Impossible de charger SKILL.md.'}</p>}
      {parsed && (
        <>
          {parsed.metadata.length > 0 && <SkillMetadataPanel entries={parsed.metadata} lang={lang} />}
          <Markdown text={parsed.body} />
        </>
      )}
    </section>
  )
}

interface SkillMarkdownParts {
  metadata: { key: string; value: string }[]
  body: string
}

function parseSkillMarkdown(content: string): SkillMarkdownParts {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/)
  if (!match) return { metadata: [], body: content }
  return {
    metadata: parseSkillFrontmatter(match[1]),
    body: match[2].trimStart(),
  }
}

function parseSkillFrontmatter(frontmatter: string): { key: string; value: string }[] {
  const readableKeys = new Set(['name', 'aliases', 'label', 'label_en', 'kind', 'group', 'builtin', 'locked', 'allow_implicit_invocation', 'read_only', 'risk_level', 'description', 'description_en', 'requirement', 'requirement_en', 'version', 'author', 'modes', 'keywords', 'tags'])
  const entries: { key: string; value: string }[] = []
  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    if (!readableKeys.has(key)) continue
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    if (!rawValue) continue
    entries.push({ key, value: formatSkillMetadataValue(rawValue) })
  }
  return entries
}

function formatSkillMetadataValue(value: string): string {
  const unquoted = value.replace(/^['"]|['"]$/g, '')
  if (unquoted.startsWith('[') && unquoted.endsWith(']')) {
    return unquoted.slice(1, -1).split(',').map(part => part.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).join(' · ')
  }
  if (unquoted === 'true') return 'oui'
  if (unquoted === 'false') return 'non'
  return unquoted
}

function SkillMetadataPanel({ entries, lang }: { entries: { key: string; value: string }[]; lang: UiLanguage }) {
  const title = lang === 'en' ? 'Skill metadata' : 'Métadonnées du skill'
  return (
    <div style={{ ...detailPanelStyle, background: 'var(--th-bg-muted)', marginBottom: 14 }}>
      <h4 style={{ ...detailTitleStyle, marginBottom: 10 }}>{title}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {entries.map(entry => (
          <div key={entry.key} style={{ border: '1px solid var(--th-border)', borderRadius: 8, padding: '8px 10px', background: 'var(--th-bg)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--th-muted)', fontWeight: 700 }}>{skillMetadataLabel(entry.key, lang)}</div>
            <div style={{ fontSize: 12, color: 'var(--th-text)', marginTop: 3, lineHeight: 1.4 }}>{entry.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function skillMetadataLabel(key: string, lang: UiLanguage): string {
  const labels: Record<string, { fr: string; en: string }> = {
    name: { fr: 'Nom technique', en: 'Technical name' },
    aliases: { fr: 'Alias', en: 'Aliases' },
    label: { fr: 'Libellé', en: 'Label' },
    label_en: { fr: 'Libellé EN', en: 'English label' },
    kind: { fr: 'Type', en: 'Type' },
    group: { fr: 'Groupe', en: 'Group' },
    builtin: { fr: 'Skill cœur', en: 'Core skill' },
    locked: { fr: 'Verrouillé', en: 'Locked' },
    allow_implicit_invocation: { fr: 'Invocation implicite', en: 'Implicit invocation' },
    read_only: { fr: 'Lecture seule', en: 'Read-only' },
    risk_level: { fr: 'Risque', en: 'Risk' },
    description: { fr: 'Description', en: 'Description' },
    description_en: { fr: 'Description EN', en: 'English description' },
    requirement: { fr: 'Pré-requis', en: 'Requirement' },
    requirement_en: { fr: 'Pré-requis EN', en: 'English requirement' },
    version: { fr: 'Version', en: 'Version' },
    author: { fr: 'Auteur', en: 'Author' },
    modes: { fr: 'Modes', en: 'Modes' },
    keywords: { fr: 'Mots-clés', en: 'Keywords' },
    tags: { fr: 'Tags', en: 'Tags' },
  }
  return labels[key]?.[lang] ?? key
}

interface DiagramPayload {
  inputs: string[]
  steps: string[]
  outputs: string[]
  inputs_en?: string[]
  steps_en?: string[]
  outputs_en?: string[]
  notes?: string | null
  notes_en?: string | null
}

function SkillDiagramInline({ skillName }: { skillName: string }) {
  const lang = useUiLanguage()
  const en = lang === 'en'
  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill-diagram', skillName],
    queryFn: () => getSkillDiagram(skillName).then(r => r.data as { diagram: DiagramPayload }),
    staleTime: 5 * 60_000,
  })
  const diagram = data?.diagram
  const inputs = diagram ? (en && diagram.inputs_en?.length ? diagram.inputs_en : diagram.inputs) : []
  const steps = diagram ? (en && diagram.steps_en?.length ? diagram.steps_en : diagram.steps) : []
  const outputs = diagram ? (en && diagram.outputs_en?.length ? diagram.outputs_en : diagram.outputs) : []
  const notes = diagram ? (en && diagram.notes_en ? diagram.notes_en : diagram.notes) : null
  const labels = en
    ? { inputs: 'Inputs', logic: 'Logic', outputs: 'Outputs', empty: 'No diagram defined for this skill yet.', error: 'Unable to load the diagram.' }
    : { inputs: 'Entrées', logic: 'Logique', outputs: 'Sorties', empty: 'Aucun diagramme défini pour ce skill.', error: 'Impossible de charger le diagramme.' }
  return (
    <section style={detailPanelStyle}>
      <h3 style={detailTitleStyle}>{en ? 'Diagram' : 'Diagramme'}</h3>
      {isLoading && <InlineLoading label={en ? 'Loading diagram…' : 'Chargement du diagramme…'} />}
      {isError && <p style={{ ...detailTextStyle, color: 'var(--th-danger, #DC2626)' }}>{labels.error}</p>}
      {!isLoading && !isError && !diagram && <p style={detailTextStyle}>{labels.empty}</p>}
      {diagram && <InlineDiagramBoard labels={labels} inputs={inputs} steps={steps} outputs={outputs} />}
      {notes && <p style={{ ...detailTextStyle, marginTop: 12 }}>{notes}</p>}
    </section>
  )
}

function InlineDiagramBoard({ labels, inputs, steps, outputs }: {
  labels: { inputs: string; logic: string; outputs: string }
  inputs: string[]
  steps: string[]
  outputs: string[]
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 28px minmax(0, 1.25fr) 28px minmax(0, 1fr)', gap: 0, alignItems: 'stretch' }}>
      <InlineDiagramColumn title={labels.inputs} accent="#16A34A" items={inputs} />
      <InlineDiagramArrow />
      <InlineDiagramColumn title={labels.logic} accent="#2563EB" items={steps} numbered />
      <InlineDiagramArrow />
      <InlineDiagramColumn title={labels.outputs} accent="#D97706" items={outputs} />
    </div>
  )
}

function InlineDiagramColumn({ title, accent, items, numbered }: { title: string; accent: string; items: string[]; numbered?: boolean }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${accent}55`, background: `${accent}0c`, borderRadius: 10 }}>
      <h4 style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: accent }}>{title}</h4>
      {items.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--th-muted)', fontStyle: 'italic' }}>—</p>}
      {items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 9px', background: 'var(--th-bg-card)', border: '1px solid var(--th-border)', borderRadius: 7, fontSize: 12.5, lineHeight: 1.45, color: 'var(--th-text)' }}>
          {numbered && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: accent, color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>}
          <span>{item}</span>
        </div>
      ))}
    </section>
  )
}

function InlineDiagramArrow() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--th-muted)' }}><ArrowRight size={18} /></div>
}

const SKILL_CONTENT_FETCHERS: Record<SkillContentKind, (skill: string, file: string) => Promise<{ data: { content: string } }>> = {
  reference: getSkillReference,
  template: getSkillTemplate,
  example: getSkillExample,
}

function SkillEvalQueriesPanel({ skillName, queries, loading, lang }: { skillName: string; queries: SkillEvalQuery[]; loading: boolean; lang: 'fr' | 'en' }) {
  if (loading) {
    return <p style={{ color: 'var(--th-muted)', fontSize: 13 }}>{lang === 'en' ? 'Loading eval queries…' : 'Chargement des tests routing…'}</p>
  }
  if (queries.length === 0) {
    return (
      <section style={detailPanelStyle}>
        <h3 style={detailTitleStyle}>{lang === 'en' ? 'Eval queries' : 'Tests routing'}</h3>
        <p style={detailTextStyle}>{lang === 'en'
          ? 'No eval_queries.json declared for this skill yet.'
          : 'Aucun eval_queries.json déclaré pour ce skill.'}</p>
      </section>
    )
  }
  const positives = queries.filter(q => q.should_trigger)
  const negatives = queries.filter(q => !q.should_trigger)
  const categoryColor = (cat?: string) => cat === 'positive' ? '#16A34A' : cat === 'near_miss' ? '#D97706' : '#DC2626'
  const categoryLabel = (cat?: string) => {
    if (cat === 'positive') return lang === 'en' ? 'positive' : 'positif'
    if (cat === 'near_miss') return lang === 'en' ? 'near-miss' : 'piège proche'
    if (cat === 'negative') return lang === 'en' ? 'negative' : 'négatif'
    return cat ?? '—'
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={detailPanelStyle}>
        <h3 style={detailTitleStyle}>{lang === 'en' ? 'Routing regression tests' : 'Tests de régression routing'}</h3>
        <p style={{ ...detailTextStyle, marginBottom: 10 }}>
          {lang === 'en'
            ? `These prompts are replayed against the dispatcher in CI. Owner skill = ${skillName}.`
            : `Ces prompts sont rejoués contre le dispatcher en CI. Skill owner = ${skillName}.`}
        </p>
        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--th-muted)' }}>
          <span><strong style={{ color: '#16A34A' }}>{positives.length}</strong> {lang === 'en' ? 'should trigger' : 'doivent déclencher'}</span>
          <span>·</span>
          <span><strong style={{ color: '#DC2626' }}>{negatives.length}</strong> {lang === 'en' ? 'should NOT trigger' : 'ne doivent PAS déclencher'}</span>
        </div>
      </section>
      <section style={detailPanelStyle}>
        <h3 style={detailTitleStyle}>{lang === 'en' ? `${positives.length} positives` : `${positives.length} positifs`}</h3>
        {positives.length === 0 ? (
          <p style={detailTextStyle}>—</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {positives.map((q, i) => (
              <li key={i} style={{ border: '1px solid var(--th-border)', borderRadius: 8, padding: '8px 10px', background: 'var(--th-bg-card)' }}>
                <div style={{ fontSize: 13, color: 'var(--th-text)' }}>{q.query}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <RegistryBadge color={categoryColor(q.category)}>{categoryLabel(q.category)}</RegistryBadge>
                  {q.language && <RegistryBadge color="#64748B">{q.language}</RegistryBadge>}
                  {q.modes && q.modes.map(m => <RegistryBadge key={m} color="#7C3AED">{m}</RegistryBadge>)}
                </div>
                {q.notes && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--th-muted)', fontStyle: 'italic' }}>{q.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section style={detailPanelStyle}>
        <h3 style={detailTitleStyle}>{lang === 'en' ? `${negatives.length} near-misses / negatives` : `${negatives.length} pièges proches / négatifs`}</h3>
        {negatives.length === 0 ? (
          <p style={detailTextStyle}>—</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {negatives.map((q, i) => (
              <li key={i} style={{ border: '1px solid var(--th-border)', borderRadius: 8, padding: '8px 10px', background: 'var(--th-bg-card)' }}>
                <div style={{ fontSize: 13, color: 'var(--th-text)' }}>{q.query}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  <RegistryBadge color={categoryColor(q.category)}>{categoryLabel(q.category)}</RegistryBadge>
                  {q.language && <RegistryBadge color="#64748B">{q.language}</RegistryBadge>}
                  {q.expected_skill && q.expected_skill !== skillName && (
                    <RegistryBadge color="#2563EB">→ {q.expected_skill}</RegistryBadge>
                  )}
                </div>
                {q.notes && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--th-muted)', fontStyle: 'italic' }}>{q.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SkillFileViewer({ skillName, kind, files }: { skillName: string; kind: SkillContentKind; files: string[] }) {
  const lang = useUiLanguage()
  const [active, setActive] = useState<string | null>(files[0] ?? null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setActive(files[0] ?? null) }, [kind, files])
  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill-detail-content', skillName, kind, active],
    queryFn: () => SKILL_CONTENT_FETCHERS[kind](skillName, active as string).then(r => r.data),
    enabled: !!active,
    staleTime: 60_000,
  })
  const onCopy = async () => {
    if (!data?.content) return
    try {
      await navigator.clipboard.writeText(data.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  const title = kind === 'reference' ? (lang === 'en' ? 'References' : 'Références') : kind === 'template' ? 'Templates' : (lang === 'en' ? 'Examples' : 'Exemples')
  const empty = lang === 'en' ? 'No file for this section.' : 'Aucun fichier pour cette section.'
  return (
    <section style={{ ...detailPanelStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderBottom: '1px solid var(--th-border)' }}>
        <h3 style={{ ...detailTitleStyle, margin: 0, flex: 1 }}>{title}</h3>
        {active && <button type="button" className="ui-button ui-button-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onCopy} disabled={!data?.content}><Copy size={12} /> {copied ? (lang === 'en' ? 'Copied' : 'Copié') : (lang === 'en' ? 'Copy' : 'Copier')}</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: files.length > 1 ? '220px minmax(0, 1fr)' : '1fr', minHeight: 380 }}>
        {files.length > 1 && (
          <aside style={{ borderRight: '1px solid var(--th-border)', background: 'var(--th-bg-muted)', padding: 10, overflow: 'auto' }}>
            {files.map(file => (
              <button key={file} onClick={() => setActive(file)} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '7px 8px', marginBottom: 4, border: `1px solid ${file === active ? 'var(--brand, #2563EB)' : 'transparent'}`, borderRadius: 6, background: file === active ? 'var(--brand-bg, rgba(37,99,235,0.12))' : 'transparent', color: file === active ? 'var(--brand, #2563EB)' : 'var(--th-text)', fontSize: 12, textAlign: 'left', cursor: 'pointer' }}>
                <FileText size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
              </button>
            ))}
          </aside>
        )}
        <div style={{ padding: 16, overflow: 'auto' }}>
          {files.length === 0 && <p style={detailTextStyle}>{empty}</p>}
          {isLoading && <InlineLoading label={lang === 'en' ? 'Loading…' : 'Chargement…'} />}
          {isError && <p style={{ ...detailTextStyle, color: 'var(--th-danger, #DC2626)' }}>{lang === 'en' ? 'Unable to load this file.' : 'Impossible de charger ce fichier.'}</p>}
          {data?.content && <Markdown text={data.content} />}
        </div>
      </div>
    </section>
  )
}

function SkillUsageList({ items, emptyLabel }: { items: SkillUsageItem[]; emptyLabel: string }) {
  if (items.length === 0) return <p style={detailTextStyle}>{emptyLabel}</p>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.slice(0, 8).map(item => (
        <div key={item.id} style={{ padding: '10px 11px', border: '1px solid var(--th-border)', borderRadius: 8, background: 'var(--th-bg-muted)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <strong style={{ fontSize: 12.5, color: 'var(--th-text)' }}>{item.title}</strong>
            <span style={{ fontSize: 11, color: 'var(--th-muted)', whiteSpace: 'nowrap' }}>{new Date(item.updatedAt).toLocaleString()}</span>
          </div>
          <p style={{ ...detailTextStyle, marginBottom: 4 }}>{item.prompt}</p>
          <span style={{ fontSize: 11, color: 'var(--th-muted)' }}>{item.source} · {item.matches} match{item.matches > 1 ? 'es' : ''}</span>
        </div>
      ))}
    </div>
  )
}

function InlineLoading({ label }: { label: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--th-muted)', fontSize: 13 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {label}</div>
}

const detailPanelStyle: React.CSSProperties = {
  border: '1px solid var(--th-border)', borderRadius: 10, padding: 14, background: 'var(--th-bg-card)',
}

const detailTitleStyle: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--th-muted)',
}

const detailTextStyle: React.CSSProperties = {
  margin: 0, color: 'var(--th-text-sub)', fontSize: 13, lineHeight: 1.55,
}

function ProviderCompatibilityRow({ provider, status }: { provider: string; status: 'supported' | 'partial' | 'unsupported' }) {
  const color = status === 'supported' ? '#16A34A' : status === 'partial' ? '#D97706' : '#DC2626'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 120px', gap: 12, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--th-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--th-text)', fontWeight: 650 }}>{provider}</span>
      <RegistryBadge color={color}>{status}</RegistryBadge>
    </div>
  )
}

function PermissionBadges({ perms, labels }: {
  perms: SkillPermissionsMeta
  labels: { permFs: string; permNet: string; permScripts: string; permOdoo: string }
}) {
  const lang = useUiLanguage()
  const badges: { icon: typeof HardDrive; label: string; value: string; color: string }[] = []
  if (perms.filesystem !== 'none') {
    badges.push({
      icon: HardDrive,
      label: labels.permFs,
      value: accessValueLabel(perms.filesystem, lang),
      color: perms.filesystem === 'write' ? '#DC2626' : '#16A34A',
    })
  }
  if (perms.network) {
    badges.push({ icon: Network, label: labels.permNet, value: lang === 'en' ? 'on' : 'actif', color: '#DC2626' })
  }
  if (perms.scripts) {
    badges.push({ icon: Terminal, label: labels.permScripts, value: lang === 'en' ? 'allowed' : 'autorisé', color: '#D97706' })
  }
  if (perms.odoo !== 'none') {
    badges.push({
      icon: Server,
      label: labels.permOdoo,
      value: accessValueLabel(perms.odoo, lang),
      color: perms.odoo === 'write' ? '#DC2626' : '#16A34A',
    })
  }
  if (badges.length === 0) return null
  return (
    <>
      {badges.map((b, i) => {
        const Icon = b.icon
        return (
          <span
            key={i}
            title={`${b.label}: ${b.value}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, fontWeight: 600,
              padding: '1px 5px', borderRadius: 4,
              background: `${b.color}15`, color: b.color,
              border: `1px solid ${b.color}40`,
            }}
          >
            <Icon size={9} /> {b.label}: {b.value}
          </span>
        )
      })}
    </>
  )
}

function accessValueLabel(value: 'read' | 'write', lang: UiLanguage): string {
  if (lang === 'en') return value === 'write' ? 'write' : 'read'
  return value === 'write' ? 'écriture' : 'lecture'
}

// ── Interface settings ────────────────────────────────────────────

function InterfaceSection() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { intro: 'Adjust content width to match your screen and reading preferences.', title: 'Content width', active: 'Active' }
    : { intro: 'Ajustez la largeur du contenu selon votre écran et vos préférences de lecture.', title: 'Largeur du contenu', active: 'Actif' }
  const [currentWidth, setCurrentWidth] = useState<ContentWidth>(() => getStoredWidth())

  const applyWidth = (id: ContentWidth) => {
    localStorage.setItem(WIDTH_KEY, id)
    setCurrentWidth(id)
    window.dispatchEvent(new Event('app-width-change'))
  }

  return (
    <section className="settings-panel">
      <p className="settings-intro">
        {c.intro}
      </p>

      <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 14 }}>{c.title}</div>

      <div className="settings-width-grid">
        {WIDTH_OPTIONS.map(opt => {
          const isActive = currentWidth === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => applyWidth(opt.id)}
              className={`settings-width-option${isActive ? ' is-active' : ''}`}
            >
              {/* Width visualisation */}
              <div className="settings-width-preview">
                <div className="settings-width-preview-inner" style={{
                  width: opt.id === 'narrow' ? '55%' : opt.id === 'medium' ? '70%' : opt.id === 'wide' ? '85%' : '100%',
                }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? `var(--brand, ${t.brand})` : t.text }}>
                  {lang === 'en' ? opt.labelEn : opt.label}
                </div>
                {opt.px > 0 && (
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{opt.px} px</div>
                )}
              </div>
              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px',
                  background: `var(--brand, ${t.brand})`, color: t.brandContrast, borderRadius: 9999,
                }}>{c.active}</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── API keys + model config tab ───────────────────────────────────

function ApiSection() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intro: 'Keys are stored in the system keyring, never in clear text in the database.',
      configured: 'Configured',
      addProvider: 'Add a provider',
      modelsTitle: 'Available models',
      modelsIntro: 'Hide models that are not included in your subscription.',
      expired: 'Code expired. Start again.',
      denied: 'Access denied on GitHub.',
      testing: 'Testing…',
      test: 'Test connection',
      reconnect: 'Reconnect',
      replace: 'Replace',
      delete: 'Delete',
      init: 'Initializing…',
      connectGithub: 'Connect with GitHub',
      cancel: 'Cancel',
      enterCode: 'Enter this code on GitHub. The page opened in a new tab:',
      openDevice: 'Open github.com/login/device →',
      waiting: 'Waiting for your approval…',
      save: 'Save',
      getKey: 'Get your key from',
    }
    : {
      intro: 'Les clés sont stockées dans le trousseau système (keyring) — jamais en clair dans la base de données.',
      configured: 'Configurés',
      addProvider: 'Ajouter un fournisseur',
      modelsTitle: 'Modèles disponibles',
      modelsIntro: 'Masquez les modèles non inclus dans votre abonnement.',
      expired: 'Code expiré. Recommencez.',
      denied: 'Accès refusé sur GitHub.',
      testing: 'Test en cours…',
      test: 'Tester la connexion',
      reconnect: 'Reconnecter',
      replace: 'Remplacer',
      delete: 'Supprimer',
      init: 'Initialisation…',
      connectGithub: 'Se connecter avec GitHub',
      cancel: 'Annuler',
      enterCode: "Entrez ce code sur GitHub — la page s'est ouverte dans un nouvel onglet :",
      openDevice: 'Ouvrir github.com/login/device →',
      waiting: 'En attente de votre validation…',
      save: 'Sauvegarder',
      getKey: 'Obtenez votre clé sur',
    }
  const qc = useQueryClient()
  const { data: provData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const configured: Record<string, boolean> = provData?.data ?? {}

  const [keys,       setKeys]       = useState<Record<string, string>>({})
  const [editing,    setEditing]    = useState<Record<string, boolean>>({})
  const [showKey,    setShowKey]    = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({})
  const [testing,    setTesting]    = useState<Record<string, boolean>>({})
  const [copilotFlow, setCopilotFlow] = useState<CopilotFlowState | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startCopilotLogin = async () => {
    setCopilotLoading(true)
    if (pollRef.current) clearInterval(pollRef.current)
    try {
      const res = await copilotLogin()
      const flow = res.data as { device_code: string; user_code: string; verification_uri: string; interval: number }
      setCopilotFlow({ ...flow, status: 'waiting' })
      window.open(flow.verification_uri, '_blank', 'noopener')
      pollRef.current = setInterval(async () => {
        try {
          const poll = await copilotPoll(flow.device_code)
          const st = poll.data.status as string
          if (st === 'ok') {
            clearInterval(pollRef.current!)
            setCopilotFlow(null)
            qc.invalidateQueries({ queryKey: ['ai-providers'] })
          } else if (st === 'expired_token') {
            clearInterval(pollRef.current!)
            setCopilotFlow(f => f ? { ...f, status: 'error', error: c.expired } : null)
          } else if (st === 'access_denied') {
            clearInterval(pollRef.current!)
            setCopilotFlow(f => f ? { ...f, status: 'error', error: c.denied } : null)
          }
        } catch { /* keep polling */ }
      }, (flow.interval + 1) * 1000)
    } catch (e: any) {
      setCopilotFlow({ device_code: '', user_code: '', verification_uri: '', interval: 5, status: 'error', error: e.response?.data?.detail ?? e.message })
    } finally {
      setCopilotLoading(false)
    }
  }

  const runTest = async (provider: string) => {
    setTesting(p => ({ ...p, [provider]: true }))
    setTestResult(p => ({ ...p, [provider]: null }))
    try {
      const res = await testAiKey(provider)
      setTestResult(p => ({ ...p, [provider]: res.data }))
    } catch (e: any) {
      setTestResult(p => ({ ...p, [provider]: { ok: false, msg: e.response?.data?.detail ?? e.message } }))
    } finally {
      setTesting(p => ({ ...p, [provider]: false }))
    }
  }

  const save = useMutation({
    mutationFn: ({ provider, key }: { provider: string; key: string }) => saveAiKey(provider, key),
    onSuccess: (_, { provider }) => {
      qc.invalidateQueries({ queryKey: ['ai-providers'] })
      setEditing(p => ({ ...p, [provider]: false }))
      setKeys(p => ({ ...p, [provider]: '' }))
    },
  })

  const del = useMutation({
    mutationFn: (provider: string) => deleteAiKey(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })

  const configuredList = PROVIDERS.filter(p => configured[p.id])
  const unconfiguredList = PROVIDERS.filter(p => !configured[p.id])

  return (
    <div>
      <p style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>
        {c.intro}
      </p>

      {configuredList.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.success, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            {c.configured} ({configuredList.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {configuredList.map(p => renderProvider(p, true))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          {c.addProvider}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unconfiguredList.map(p => renderProvider(p, false))}
        </div>
      </div>

      {configuredList.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {c.modelsTitle}
          </div>
          <p style={{ fontSize: 13, color: t.muted, marginBottom: 16 }}>
            {c.modelsIntro}
          </p>
          <ModelConfigEditor configuredProviderIds={configuredList.map(p => p.id)} />
        </div>
      )}
    </div>
  )

  function renderProvider(p: ProviderDef, isConfigured: boolean) {
    const isEditing = editing[p.id] ?? false
    const keyVal    = keys[p.id] ?? ''



            return (
              <div key={p.id} style={{
                background: t.bgCard, border: `1px solid ${isConfigured ? `${t.success}50` : t.border}`,
                borderRadius: t.radiusLg, overflow: 'hidden',
              }}>
                <div style={{ height: 3, background: p.color }} />

                <div style={{ padding: '16px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                      <ProviderLogo logoUrl={p.logoUrl} label={p.label} color={p.color} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{p.label}</div>
                        <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.5 }}>{p.description}</div>
                        {p.note && (
                          <div style={{
                            marginTop: 6, fontSize: 11, color: t.warning,
                            background: t.warningBg, border: `1px solid ${t.warning}30`,
                            borderRadius: t.radiusSm, padding: '3px 8px', display: 'inline-block',
                          }}>
                            {p.note}
                          </div>
                        )}
                      </div>
                    </div>
                    <StatusBadge configured={isConfigured} />
                  </div>

                  {/* Actions */}
                  {isConfigured && !isEditing ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => runTest(p.id)}
                          disabled={testing[p.id]}
                          style={{ ...btnOutline(p.color), background: testing[p.id] ? `${p.color}10` : 'transparent' }}>
                          {testing[p.id] ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} /> : <Settings2 size={13} />}
                          {testing[p.id] ? c.testing : c.test}
                        </button>
                        {p.oauthFlow ? (
                          <button onClick={() => { startCopilotLogin(); setEditing(e => ({ ...e, [p.id]: true })) }}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> {c.reconnect}
                          </button>
                        ) : (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: true }))}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> {c.replace}
                          </button>
                        )}
                        <button onClick={() => { del.mutate(p.id); setTestResult(r => ({ ...r, [p.id]: null })) }}
                          style={btnOutline(t.danger)}>
                          {c.delete}
                        </button>
                      </div>
                      {testResult[p.id] && (
                        <div style={{
                          marginTop: 8, padding: '7px 12px', borderRadius: t.radius, fontSize: 12,
                          background: testResult[p.id]!.ok ? `${t.success}12` : `${t.danger}10`,
                          border: `1px solid ${testResult[p.id]!.ok ? `${t.success}40` : `${t.danger}30`}`,
                          color: testResult[p.id]!.ok ? t.success : t.danger,
                          fontWeight: 500,
                        }}>
                          {testResult[p.id]!.ok ? <Check size={13} /> : <X size={13} />} {testResult[p.id]!.msg}
                        </div>
                      )}
                    </div>

                  ) : p.oauthFlow ? (
                    /* ── Copilot OAuth flow ── */
                    <div style={{ marginTop: 12 }}>
                      {!copilotFlow ? (
                        <button
                          onClick={startCopilotLogin}
                          disabled={copilotLoading}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 18px', background: p.color, color: p.textColor ?? '#fff',
                            border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13,
                            cursor: copilotLoading ? 'default' : 'pointer', opacity: copilotLoading ? 0.7 : 1,
                          }}>
                          <GitHubIcon />
                          {copilotLoading ? c.init : c.connectGithub}
                        </button>
                      ) : copilotFlow.status === 'error' ? (
                        <div>
                          <div style={{ padding: '8px 12px', borderRadius: t.radius, fontSize: 12, background: `${t.danger}10`, border: `1px solid ${t.danger}30`, color: t.danger, marginBottom: 8 }}>
                            <X size={13} /> {copilotFlow.error}
                          </div>
                          <button onClick={() => { setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                            style={btnOutline(t.muted)}>
                            {c.cancel}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>
                            {c.enterCode}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <div style={{
                              fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
                              letterSpacing: '0.15em', color: p.color,
                              background: `${p.color}12`, border: `2px solid ${p.color}40`,
                              borderRadius: t.radius, padding: '8px 18px',
                            }}>
                              {copilotFlow.user_code}
                            </div>
                            <a href={copilotFlow.verification_uri} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: t.brandFg, fontWeight: 500 }}>
                              {c.openDevice}
                            </a>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.muted }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s infinite' }} />
                            {c.waiting}
                            <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                              style={{ marginLeft: 'auto', ...btnOutline(t.muted), padding: '3px 10px' }}>
                              {c.cancel}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  ) : (
                    /* ── Standard API key input ── */
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type={showKey[p.id] ? 'text' : 'password'}
                            placeholder={p.placeholder}
                            value={keyVal}
                            onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && keyVal.trim()) save.mutate({ provider: p.id, key: keyVal }) }}
                            autoFocus={isEditing}
                            style={{
                              width: '100%', padding: '8px 36px 8px 12px',
                              border: `1px solid ${t.border}`, borderRadius: t.radius,
                              fontSize: 13, color: t.text, boxSizing: 'border-box',
                            }}
                          />
                          <button onClick={() => setShowKey(s => ({ ...s, [p.id]: !s[p.id] }))}
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 12 }}>
                            {showKey[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button
                          disabled={!keyVal.trim() || save.isPending}
                          onClick={() => save.mutate({ provider: p.id, key: keyVal })}
                          style={{
                            padding: '8px 16px', background: keyVal.trim() ? p.color : t.borderLight,
                            color: keyVal.trim() ? (p.textColor ?? '#fff') : t.muted,
                            border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                          {save.isPending ? '…' : c.save}
                        </button>
                        {isEditing && (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: false }))}
                            style={{ padding: '8px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, cursor: 'pointer', color: t.muted }}>
                            {c.cancel}
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: t.muted }}>
                        {c.getKey}{' '}
                        <a href={p.docsUrl} target="_blank" rel="noreferrer" style={{ color: t.brandFg, fontWeight: 500 }}>
                          {p.docsLabel} →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
  } // end renderProvider
} // end ApiSection

// ── Model config editor ──────────────────────────────────────────

const ALL_MODELS = AI_PROVIDERS.map(p => ({
  provider: p.id,
  label: `${p.label} (${p.id === 'claude' ? 'Anthropic' : p.id === 'openai' ? 'OpenAI' : p.id === 'gemini' ? 'Google' : p.id === 'copilot' ? 'GitHub' : p.id === 'github' ? 'GitHub Models' : p.id})`,
  color: p.color,
  models: p.models.map((m: { id: string; label: string }) => ({ id: m.id, label: m.label })),
}))

function ModelConfigEditor({ configuredProviderIds }: { configuredProviderIds: string[] }) {
  const lang = useUiLanguage()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })
  const [local, setLocal] = useState<Record<string, string[]>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLocal(data?.data ?? {}) }, [data])

  const visibleModels = ALL_MODELS.filter(p => configuredProviderIds.includes(p.provider))

  const toggle = (provider: string, modelId: string) => {
    setLocal(prev => {
      const providerModels = ALL_MODELS.find(p => p.provider === provider)!.models.map(m => m.id)
      const current: string[] = prev[provider] ?? providerModels
      const next = current.includes(modelId) ? current.filter(id => id !== modelId) : [...current, modelId]
      return { ...prev, [provider]: next }
    })
    setSaved(false)
  }

  const isEnabled = (provider: string, modelId: string) => {
    const providerModels = ALL_MODELS.find(p => p.provider === provider)!.models.map(m => m.id)
    return (local[provider] ?? providerModels).includes(modelId)
  }

  const handleSave = async () => {
    await saveModelConfig(local)
    qc.invalidateQueries({ queryKey: ['model-config'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (visibleModels.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {visibleModels.map(prov => (
        <div key={prov.provider} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: prov.color, marginBottom: 8 }}>{prov.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {prov.models.map(m => {
              const on = isEnabled(prov.provider, m.id)
              return (
                <button key={m.id} onClick={() => toggle(prov.provider, m.id)} className={`ui-chip-button${on ? ' is-active' : ''}`} style={{
                  background: on ? `${prov.color}15` : undefined,
                  borderColor: on ? prov.color : undefined,
                  color: on ? prov.color : undefined,
                }}>
                  <span style={{ fontSize: 10 }}>{on ? <Check size={11} /> : null}</span>
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div>
        <button onClick={handleSave} className="btn btn-primary btn-sm">
          {saved ? <Check size={13} /> : null}
          {saved ? (lang === 'en' ? 'Saved' : 'Enregistré') : (lang === 'en' ? 'Save' : 'Enregistrer')}
        </button>
      </div>
    </div>
  )
}

// ── Context files editor ─────────────────────────────────────────

type ContextFileGroup =
  | 'core'
  | 'profiles'
  | 'localization'
  | 'versions'

interface ContextFileMeta {
  name: string
  label: string
  labelEn: string
  icon: string
  desc: string
  descEn: string
  contextGroup: ContextFileGroup
}

const KNOWN_FILES: ContextFileMeta[] = [
  { name: 'skills.md',          label: 'Compétences consultant', labelEn: 'Consultant skills', icon: 'skills', desc: 'Connaissances métier, patterns courants, approche de diagnostic', descEn: 'Business knowledge, common patterns, diagnostic approach', contextGroup: 'core' },
  { name: 'meeting-minute.md',  label: 'Modèle compte-rendu', labelEn: 'Meeting minutes template', icon: 'document', desc: 'Template utilisé par le bouton "Meeting Minute" dans le chat', descEn: 'Template used by the "Meeting Minute" button in chat', contextGroup: 'core' },
  { name: 'migration.md',       label: 'Méthodologie migration', labelEn: 'Migration methodology', icon: 'workflow',  desc: 'Checklist et breaking changes injectés dans l\'assistant Migration', descEn: 'Checklist and breaking changes injected into the Migration assistant', contextGroup: 'core' },
  { name: 'studio.md',          label: 'Inspection Studio', labelEn: 'Studio inspection', icon: 'studio', desc: 'Guide d\'interprétation des personnalisations Studio (modèles, champs, vues, automatisations)', descEn: 'Interpretation guide for Studio customizations (models, fields, views, automations)', contextGroup: 'core' },
  { name: 'creation.md',        label: 'Méthodologie création', labelEn: 'Creation methodology', icon: 'skill', desc: 'Conventions et méthodologie injectées dans l\'outil Création (changeset Studio, dry-run, versions)', descEn: 'Conventions and methodology injected into the Creator tool (Studio changeset, dry-run, versions)', contextGroup: 'core' },
  { name: 'profile-support.md', label: 'Profil Support', labelEn: 'Support profile', icon: 'profile', desc: 'Guidelines de réponse orientées support incident et run.', descEn: 'Response guidelines focused on incident support and operations.', contextGroup: 'profiles' },
  { name: 'profile-business-analyst.md', label: 'Profil Business Analyst', labelEn: 'Business Analyst profile', icon: 'profile', desc: 'Guidelines orientées processus, projet et conseil.', descEn: 'Guidelines focused on process, project and consulting.', contextGroup: 'profiles' },
  { name: 'profile-architect.md', label: 'Profil Architecte', labelEn: 'Architect profile', icon: 'profile', desc: 'Guidelines architecture, sécurité, performance et migration.', descEn: 'Architecture, security, performance and migration guidance.', contextGroup: 'profiles' },
  { name: 'profile-developer.md', label: 'Profil Développeur', labelEn: 'Developer profile', icon: 'profile', desc: 'Guidelines techniques code, modèles, vues et tests.', descEn: 'Technical guidance for code, models, views and tests.', contextGroup: 'profiles' },
  { name: 'l10n_ch.md',          label: 'Localisation CH', labelEn: 'CH localization', icon: 'localization', desc: 'Mémo fiscal Suisse injecté quand le pays CH est sélectionné.', descEn: 'Swiss fiscal memo injected when country CH is selected.', contextGroup: 'localization' },
  { name: 'l10n_fr.md',          label: 'Localisation FR', labelEn: 'FR localization', icon: 'localization', desc: 'Mémo fiscal France injecté quand le pays FR est sélectionné.', descEn: 'French fiscal memo injected when country FR is selected.', contextGroup: 'localization' },
  { name: 'l10n_be.md',          label: 'Localisation BE', labelEn: 'BE localization', icon: 'localization', desc: 'Mémo fiscal Belgique injecté quand le pays BE est sélectionné.', descEn: 'Belgian fiscal memo injected when country BE is selected.', contextGroup: 'localization' },
  { name: 'l10n_lu.md',          label: 'Localisation LU', labelEn: 'LU localization', icon: 'localization', desc: 'Mémo fiscal Luxembourg injecté quand le pays LU est sélectionné.', descEn: 'Luxembourg fiscal memo injected when country LU is selected.', contextGroup: 'localization' },
  { name: 'odoo-19.0.md',       label: 'Odoo 19.0', labelEn: 'Odoo 19.0', icon: 'document', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models', contextGroup: 'versions' },
  { name: 'odoo-18.0.md',       label: 'Odoo 18.0', labelEn: 'Odoo 18.0', icon: 'document', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models', contextGroup: 'versions' },
  { name: 'odoo-17.0.md',       label: 'Odoo 17.0', labelEn: 'Odoo 17.0', icon: 'document', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models', contextGroup: 'versions' },
  { name: 'odoo-16.0.md',       label: 'Odoo 16.0', labelEn: 'Odoo 16.0', icon: 'document', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models', contextGroup: 'versions' },
  { name: 'odoo-15.0.md',       label: 'Odoo 15.0', labelEn: 'Odoo 15.0', icon: 'document', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models', contextGroup: 'versions' },
]

const CONTEXT_FILE_GROUPS: { id: ContextFileGroup; label: string; labelEn: string; icon: string }[] = [
  { id: 'core', label: 'Socle IA', labelEn: 'AI foundation', icon: 'skills' },
  { id: 'profiles', label: 'Profils de réponse', labelEn: 'Response profiles', icon: 'profile' },
  { id: 'localization', label: 'Localisations', labelEn: 'Localizations', icon: 'localization' },
  { id: 'versions', label: 'Notes Odoo', labelEn: 'Odoo notes', icon: 'document' },
]

function ContextFileIcon({ type, active }: { type?: string; active: boolean }) {
  const color = active ? t.brand : t.muted
  const props = { size: 15, strokeWidth: 1.8, color }
  const icon = (() => {
    switch (type) {
      case 'skills': return <Sparkles {...props} />
      case 'workflow': return <Workflow {...props} />
      case 'studio': return <Wrench {...props} />
      case 'profile': return <UserRound {...props} />
      case 'localization': return <Globe2 {...props} />
      case 'skill': return <Zap {...props} />
      case 'document':
      default: return <FileText {...props} />
    }
  })()
  return (
    <span style={{
      width: 22, height: 22, flexShrink: 0, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${active ? t.brand40 : t.border}`,
      background: active ? t.brand10 : t.bgMuted,
      borderRadius: 5,
    }}>
      {icon}
    </span>
  )
}

function ContextEditor() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intermediateNotes: 'Intermediate release notes',
      unsavedContinue: 'Unsaved changes. Continue?',
      resetConfirm: (name: string) => `Reset "${name}" to default content? Your changes will be lost.`,
      customized: '✓ Customized',
      default: '○ Default',
      language: 'Language',
      unsaved: '● Unsaved',
      reset: '↺ Reset',
      saved: '✓ Saved',
      save: 'Save',
      markdown: 'Markdown file',
      lines: 'lines',
      chars: 'characters',
      path: 'Path',
      languageChange: 'Unsaved changes. Change language?',
    }
    : {
      intermediateNotes: 'Notes de version intermédiaire',
      unsavedContinue: 'Modifications non sauvegardées. Continuer ?',
      resetConfirm: (name: string) => `Réinitialiser "${name}" au contenu par défaut ? Vos modifications seront perdues.`,
      customized: '✓ Personnalisé',
      default: '○ Par défaut',
      language: 'Langue',
      unsaved: '● Non sauvegardé',
      reset: '↺ Réinitialiser',
      saved: '✓ Sauvegardé',
      save: 'Sauvegarder',
      markdown: 'Fichier Markdown',
      lines: 'lignes',
      chars: 'caractères',
      path: 'Chemin',
      languageChange: 'Modifications non sauvegardées. Changer de langue ?',
    }
  const qc = useQueryClient()
  const [selected, setSelected] = useState('skills.md')
  const [locale, setLocale] = useState<'fr' | 'en'>('fr')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [openContextGroups, setOpenContextGroups] = useState<Set<ContextFileGroup>>(new Set())
  const { data: userData } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile })

  useEffect(() => {
    const preferred = userData?.data?.contextLanguage ?? userData?.data?.language
    if (preferred === 'fr' || preferred === 'en') setLocale(preferred)
  }, [userData])

  // Include intermediate/custom versions from Sources page
  const customVersions: string[] = (() => { try { return JSON.parse(localStorage.getItem('odoo-custom-versions') ?? '[]') } catch { return [] } })()
  const allFiles: ContextFileMeta[] = [
    ...KNOWN_FILES,
    ...customVersions
      .filter(v => !KNOWN_FILES.some(f => f.name === `odoo-${v}.md`))
      .sort((a, b) => {
        const [aMaj, aMin = 0] = a.split('.').map(Number)
        const [bMaj, bMin = 0] = b.split('.').map(Number)
        return bMaj !== aMaj ? bMaj - aMaj : bMin - aMin
      })
      .map((v): ContextFileMeta => ({
        name: `odoo-${v}.md`,
        label: `Odoo ${v}`,
        labelEn: `Odoo ${v}`,
        icon: 'document',
        desc: c.intermediateNotes,
        descEn: c.intermediateNotes,
        contextGroup: 'versions',
      })),
  ]
  const groupedFiles = CONTEXT_FILE_GROUPS
    .map(group => ({
      group,
      files: allFiles.filter(file => file.contextGroup === group.id),
    }))
    .filter(({ files }) => files.length > 0)

  const { data: filesData } = useQuery({ queryKey: ['context-files', locale], queryFn: () => listContextFiles(locale) })
  const existingNames: string[] = (filesData?.data ?? []).map((f: { name: string }) => f.name)

  useEffect(() => {
    setDirty(false)
    setSaved(false)
    getContextFile(selected, locale)
      .then(res => setContent(res.data.content))
      .catch(() => setContent(''))
  }, [selected, locale])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContextFile(selected, content, locale)
      setDirty(false)
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['context-files', locale] })
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(c.resetConfirm(selected))) return
    await deleteContextFile(selected, locale)
    qc.invalidateQueries({ queryKey: ['context-files', locale] })
    const res = await getContextFile(selected, locale)
    setContent(res.data.content)
    setDirty(false)
  }

  const isCustomized = existingNames.includes(selected)
  const currentFile = allFiles.find(f => f.name === selected)
  const currentLabel = lang === 'en' ? (currentFile?.labelEn ?? selected) : (currentFile?.label ?? selected)
  const currentDescription = lang === 'en' ? currentFile?.descEn : currentFile?.desc
  const selectFile = (name: string) => {
    if (dirty && !confirm(c.unsavedContinue)) return
    setSelected(name)
  }
  const toggleContextGroup = (id: ContextFileGroup) => {
    setOpenContextGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* File list */}
      <div style={{ width: 240, flexShrink: 0 }}>
        {groupedFiles.map(({ group, files }) => {
          const isOpen = openContextGroups.has(group.id)
          const hasActiveFile = files.some(f => f.name === selected)
          const customizedCount = files.filter(f => existingNames.includes(f.name)).length
          return (
            <div key={group.id} style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => toggleContextGroup(group.id)}
                style={{
                  width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 10px',
                  background: hasActiveFile ? t.brand10 : t.bgCard,
                  border: `1px solid ${hasActiveFile ? t.brand40 : t.border}`,
                  borderRadius: t.radius, cursor: 'pointer',
                  transition: 'all .15s',
                }}
              >
                {isOpen ? <ChevronDown size={14} color={hasActiveFile ? t.brand : t.muted} /> : <ChevronRight size={14} color={hasActiveFile ? t.brand : t.muted} />}
                <ContextFileIcon type={group.icon} active={hasActiveFile} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: hasActiveFile ? t.brand : t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lang === 'en' ? group.labelEn : group.label}
                  </div>
                  <div style={{ fontSize: 10, color: t.muted }}>
                    {files.length} {lang === 'en' ? (files.length > 1 ? 'files' : 'file') : (files.length > 1 ? 'fichiers' : 'fichier')}{customizedCount ? ` · ${customizedCount} ${lang === 'en' ? 'custom' : 'modifié'}` : ''}
                  </div>
                </div>
              </button>
              {isOpen && (
                <div style={{ marginTop: 4, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {files.map(f => {
                    const exists = existingNames.includes(f.name)
                    const isActive = f.name === selected
                    return (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => selectFile(f.name)}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px',
                          background: isActive ? t.brand10 : 'transparent',
                          border: `1px solid ${isActive ? t.brand40 : t.border}`,
                          borderRadius: t.radius, cursor: 'pointer',
                          transition: 'all .15s',
                        }}
                      >
                        <ContextFileIcon type={f.icon} active={isActive} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? t.brand : t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {lang === 'en' ? f.labelEn : f.label}
                          </div>
                          <div style={{ fontSize: 10, color: t.muted }}>
                            {exists ? c.customized : c.default}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{currentLabel}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{currentDescription}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.muted }}>
              {c.language}
              <select
                value={locale}
                onChange={e => {
                  if (dirty && !confirm(c.languageChange)) return
                  setLocale(e.target.value as 'fr' | 'en')
                }}
                style={{ ...selectStyle, width: 120, padding: '5px 8px', fontSize: 12 }}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            {dirty && <span style={{ fontSize: 11, color: t.warning }}>{c.unsaved}</span>}
            {isCustomized && !dirty && (
              <button onClick={handleReset} style={{
                padding: '5px 10px', background: 'transparent',
                border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 11, color: t.muted, cursor: 'pointer',
              }} title="Revenir au contenu par défaut">
                {c.reset}
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                padding: '6px 16px', background: dirty ? t.brand : t.borderLight,
                color: dirty ? '#fff' : t.muted,
                border: 'none', borderRadius: t.radius, fontSize: 12, fontWeight: 600,
                cursor: dirty ? 'pointer' : 'default',
              }}>
              {saving ? '…' : saved ? c.saved : c.save}
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true) }}
          spellCheck={false}
          style={{
            width: '100%', height: 480, padding: '12px 14px',
            border: `1px solid ${dirty ? t.brand + '60' : t.border}`,
            borderRadius: t.radiusLg, fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            lineHeight: 1.6, resize: 'vertical', color: t.text,
            background: t.bgCard, boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 11, color: t.muted }}>
          {c.markdown} · {content.split('\n').length} {c.lines} · {content.length} {c.chars}
          · {c.path} : <code style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px' }}>~/.odoo-consultant/context/{locale === 'fr' ? selected : `${locale}/${selected}`}</code>
        </div>
      </div>
    </div>
  )
}

// ── User profile editor ──────────────────────────────────────────

const ACCENT_PRESETS = [
  { id: 'boa-green', color: '#33f06f', labelFr: 'BOA vert', labelEn: 'BOA green' },
  { id: 'boa-cyan', color: '#48e7ff', labelFr: 'BOA cyan', labelEn: 'BOA cyan' },
  { id: 'boa-yellow', color: '#ffd735', labelFr: 'BOA jaune', labelEn: 'BOA yellow' },
  { id: 'boa-red', color: '#ff3341', labelFr: 'BOA rouge', labelEn: 'BOA red' },
  { id: 'boa-blue', color: '#114ee8', labelFr: 'BOA bleu', labelEn: 'BOA blue' },
]
const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: `1px solid ${t.border}`,
  borderRadius: t.radius,
  fontSize: 13,
  color: t.text,
  background: t.bgCard,
  boxSizing: 'border-box',
}

interface UserProfile {
  name?: string
  title?: string
  team?: string
  language?: 'fr' | 'en'
  assistantLanguage?: 'auto' | 'fr' | 'en'
  contextLanguage?: 'fr' | 'en'
  avatar?: string   // emoji or data-URI
  primaryColor?: string
  themeMode?: 'light' | 'dark' | 'sepia'
}

function UserProfileEditor() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      avatarTitle: 'Click to change avatar',
      avatarHint: 'or click the avatar',
      fullName: 'Full name',
      role: 'Role',
      team: 'Team / Firm',
      appLanguage: 'Application language',
      aiLanguage: 'AI response language',
      contextLanguage: 'AI context language',
      automatic: 'Automatic',
      primaryColor: 'Accent color',
      accentHint: 'Used for primary actions, active states and focus rings. Structural areas stay neutral.',
      other: 'Other',
      theme: 'Display theme',
      light: 'Light',
      dark: 'Dark',
      sepia: 'Sepia',
      color: 'Color',
      customColor: 'Custom color',
      saved: '✓ Saved',
      save: 'Save profile',
    }
    : {
      avatarTitle: "Cliquer pour changer l'avatar",
      avatarHint: "ou cliquer sur l'avatar",
      fullName: 'Nom complet',
      role: 'Poste',
      team: 'Équipe / Cabinet',
      appLanguage: "Langue de l'application",
      aiLanguage: 'Langue des réponses IA',
      contextLanguage: 'Langue du contexte IA',
      automatic: 'Automatique',
      primaryColor: "Couleur d'accent",
      accentHint: "Utilisée pour les actions principales, les états actifs et le focus. Les zones de structure restent neutres.",
      other: 'Autre',
      theme: "Thème d'affichage",
      light: 'Clair',
      dark: 'Sombre',
      sepia: 'Sépia',
      color: 'Couleur',
      customColor: 'Couleur personnalisée',
      saved: '✓ Enregistré',
      save: 'Sauvegarder le profil',
    }
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile })
  const [form, setForm] = useState<UserProfile>({})
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const p: UserProfile = data?.data ?? {}
    setForm(p)
    if (p.primaryColor) applyBrandColor(p.primaryColor)
    applyThemeMode(p.themeMode)
  }, [data])

  const set = (key: keyof UserProfile, val: string) => {
    setForm(f => ({ ...f, [key]: val }))
    if (key === 'primaryColor') applyBrandColor(val)
    if (key === 'themeMode') applyThemeMode(val)
  }

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('avatar', ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    await saveUserProfile(form)
    qc.invalidateQueries({ queryKey: ['user-profile'] })
    if (form.primaryColor) applyBrandColor(form.primaryColor)
    applyThemeMode(form.themeMode)
    document.documentElement.lang = form.language === 'en' ? 'en' : 'fr'
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const avatarIsImage = form.avatar?.startsWith('data:')

  return (
    <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg, padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div
            onClick={() => fileRef.current?.click()}
            title={c.avatarTitle}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: t.bgMuted,
              border: `1px solid ${t.border}`,
              boxShadow: `inset 0 -3px 0 ${form.primaryColor ?? t.brand}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: avatarIsImage ? 0 : 32, cursor: 'pointer',
              overflow: 'hidden', flexShrink: 0,
            }}
          >
            {avatarIsImage
              ? <img src={form.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (form.avatar || '👤')
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['👤', '🧑‍💻', '👨‍💼', '👩‍💼', '🦊'].map(em => (
              <button key={em} onClick={() => set('avatar', em)} style={{
                fontSize: 16, background: form.avatar === em ? t.bgMuted : 'transparent',
                border: `1px solid ${form.avatar === em ? t.textSub : t.border}`,
                borderRadius: 6, padding: '2px 4px', cursor: 'pointer',
              }}>{em}</button>
            ))}
          </div>
          <span style={{ fontSize: 10, color: t.muted }}>{c.avatarHint}</span>
        </div>

        {/* Form fields */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.fullName}</div>
              <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Benoît Le Goff"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.role}</div>
              <input value={form.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Consultant Odoo Senior"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
          </div>
          <label>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.team}</div>
            <input value={form.team ?? ''} onChange={e => set('team', e.target.value)} placeholder="Le Projet · Pôle ERP"
              style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.appLanguage}</div>
              <select value={form.language ?? 'fr'} onChange={e => set('language', e.target.value)} style={selectStyle}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.aiLanguage}</div>
              <select value={form.assistantLanguage ?? 'auto'} onChange={e => set('assistantLanguage', e.target.value)} style={selectStyle}>
                <option value="auto">{c.automatic}</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.contextLanguage}</div>
              <select value={form.contextLanguage ?? form.language ?? 'fr'} onChange={e => set('contextLanguage', e.target.value)} style={selectStyle}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          {/* Color picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>{c.primaryColor}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
              {ACCENT_PRESETS.map(accent => {
                const active = (form.primaryColor ?? '#33f06f').toLowerCase() === accent.color.toLowerCase()
                return (
                <button key={accent.id} onClick={() => set('primaryColor', accent.color)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  minHeight: 34, padding: '6px 9px',
                  borderRadius: t.radius, background: active ? t.bgMuted : t.bgCard,
                  border: `1px solid ${active ? accent.color : t.border}`,
                  color: active ? t.text : t.textSub,
                  cursor: 'pointer', fontSize: 12, fontWeight: active ? 650 : 500,
                  transition: 'background .15s, border-color .15s, color .15s',
                }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: accent.color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.45)' }} />
                  {lang === 'en' ? accent.labelEn : accent.labelFr}
                </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: t.muted, lineHeight: 1.45 }}>{c.accentHint}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.muted, cursor: 'pointer' }}>
                <input type="color" value={form.primaryColor ?? '#33f06f'}
                  onChange={e => set('primaryColor', e.target.value)}
                  style={{ width: 28, height: 28, border: `1px solid ${t.border}`, borderRadius: 6, padding: 2, cursor: 'pointer', background: t.bgCard }} />
                {c.customColor}
              </label>
            </div>
          </div>

          {/* Theme mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>{c.theme}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'light', label: c.light,  icon: '☀️' },
                { id: 'dark',  label: c.dark, icon: '🌙' },
                { id: 'sepia', label: c.sepia,  icon: '📜' },
              ] as const).map(m => {
                const active = (form.themeMode ?? 'light') === m.id
                return (
                  <button key={m.id} onClick={() => set('themeMode', m.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: t.radius, cursor: 'pointer',
                    border: `1px solid ${active ? t.brand40 : t.border}`,
                    background: active ? t.brand10 : t.bgMuted,
                    color: active ? t.text : t.muted,
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    transition: 'all .15s',
                  }}>
                    <span>{m.icon}</span> {m.label}
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} className="btn btn-primary">
          {saved ? c.saved : c.save}
        </button>
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  )
}

function ProviderLogo({ logoUrl, label, color }: { logoUrl: string; label: string; color: string }) {
  const initial = label.charAt(0).toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}20`, border: `1px solid ${color}30` }}>
      <img
        src={logoUrl}
        alt={label}
        width={20}
        height={20}
        style={{ objectFit: 'contain' }}
        onError={e => {
          const img = e.currentTarget
          img.style.display = 'none'
          const fallback = img.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'flex'
        }}
      />
      <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, fontWeight: 700, fontSize: 13, color }}>
        {initial}
      </span>
    </div>
  )
}

function StatusBadge({ configured }: { configured: boolean }) {
  const lang = useUiLanguage()
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: t.radiusFull, fontSize: 11, fontWeight: 600,
      background: configured ? `${t.success}15` : t.bgMuted,
      color: configured ? t.success : t.muted,
      border: `1px solid ${configured ? `${t.success}40` : t.border}`,
      flexShrink: 0,
    }}>
      <span>{configured ? <Check size={12} /> : null}</span>
      {configured ? (lang === 'en' ? 'Configured' : 'Configurée') : (lang === 'en' ? 'Not configured' : 'Non configurée')}
    </div>
  )
}

function btnOutline(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', background: 'transparent',
    border: `1px solid ${color}`, color,
    borderRadius: t.radius, fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }
}
