import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { listProfiles, getAiProviders, checkAllSources, getModelConfig, getProfileApps } from '../api/client'
import { t, btn } from '../theme'
import PageHeader from '../components/PageHeader'

import { ODOO_APPS } from '../constants/odooApps'

function OdooAppIcon({ name, size = 16 }: { name: string; size?: number }) {
  const def = ODOO_APPS[name]
  if (!def) return null
  return (
    <img
      src={def.iconUrl}
      alt={def.label}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

function AppBadgesAsst({ apps, max = 6 }: { apps: { name: string; shortdesc: string }[]; max?: number }) {
  const known = apps.filter(a => ODOO_APPS[a.name])
  const shown = known.slice(0, max)
  const rest  = known.length - max
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
      {shown.map(a => {
        const def = ODOO_APPS[a.name]
        return (
          <span key={a.name} title={a.shortdesc} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 4,
            background: `${def.color}15`, border: `1px solid ${def.color}40`,
            fontSize: 10, fontWeight: 600, color: def.color,
          }}>
            <OdooAppIcon name={a.name} size={12} />
            {def.label}
          </span>
        )
      })}
      {rest > 0 && (
        <span style={{
          padding: '2px 7px', borderRadius: 4,
          background: '#F3F4F6', border: '1px solid #E5E7EB',
          fontSize: 10, color: '#6B7280',
        }}>+{rest}</span>
      )}
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────

interface Profile { id: number; name: string; company_name?: string; company_logo?: string; odoo_version?: string; company_ids?: string; selected_company_id?: number; user_access_info?: string }
interface CompanyOption { id: number; name: string }

interface AiEvent {
  type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'done' | 'end'
  name?: string
  args?: Record<string, unknown>
  count?: number
  records?: Record<string, unknown>[]
  content?: string
  msg?: string
  model?: string
  ok?: boolean
  input_tokens?: number
  output_tokens?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text?: string
  events?: AiEvent[]
  loading?: boolean
  timestamp?: number
  inputTokens?: number
  outputTokens?: number
}

interface SavedConv {
  id: string
  title: string
  messages: Message[]
  version?: string   // Odoo version at time of save
  createdAt: number
  updatedAt: number
}

interface ModelDef { id: string; label: string; desc: string; tags?: string[]; recommended?: boolean }

// ── Conversation history helpers ───────────────────────────────
const LS_HISTORY = 'odoo-conv-history'
const LS_ACTIVE  = 'odoo-active-convs'

function loadHistory(): Record<string, SavedConv[]> {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) ?? '{}') } catch { return {} }
}
function persistHistory(h: Record<string, SavedConv[]>) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)) } catch { /* quota */ }
}
function loadActiveConvs(): Record<string, Message[]> {
  try { return JSON.parse(localStorage.getItem(LS_ACTIVE) ?? '{}') } catch { return {} }
}
function persistActiveConvs(c: Record<string, Message[]>) {
  try { localStorage.setItem(LS_ACTIVE, JSON.stringify(c)) } catch { /* quota */ }
}
function autoTitle(msgs: Message[]): string {
  const text = msgs.find(m => m.role === 'user')?.text ?? 'Conversation'
  return text.length > 60 ? text.slice(0, 60) + '…' : text
}
function fmtDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return d.toLocaleDateString('fr', { weekday: 'short' })
  return d.toLocaleDateString('fr', { day: 'numeric', month: 'short' })
}

const PROVIDERS: { id: string; label: string; color: string; models: ModelDef[] }[] = [
  {
    id: 'claude', label: 'Claude', color: '#D97706',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', recommended: true,
        desc: 'Meilleur rapport qualité/prix selon Anthropic — développement, analyse et génération de contenu',
        tags: ['usage quotidien', 'développement', 'analyse'] },
      { id: 'claude-opus-4-7', label: 'Opus 4.7',
        desc: 'Modèle le plus puissant d\'Anthropic — raisonnement avancé, recherche approfondie, tâches complexes',
        tags: ['analyse complexe', 'recherche', 'raisonnement'] },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',
        desc: 'Le plus rapide et économique d\'Anthropic — questions simples, classification, résumés',
        tags: ['rapide', 'économique', 'questions simples'] },
    ],
  },
  {
    id: 'openai', label: 'GPT', color: '#16A34A',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', recommended: true,
        desc: 'Modèle phare d\'OpenAI — multimodal et polyvalent, recommandé pour la plupart des tâches',
        tags: ['usage quotidien', 'polyvalent', 'multimodal'] },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini',
        desc: 'Version légère et rapide d\'OpenAI — recommandée pour les tâches simples et les volumes importants',
        tags: ['rapide', 'économique', 'volume'] },
      { id: 'o1-mini', label: 'o1 mini',
        desc: 'Modèle de raisonnement d\'OpenAI — analyse étape par étape, idéal pour les maths et les problèmes complexes',
        tags: ['raisonnement', 'maths', 'développement'] },
    ],
  },
  {
    id: 'gemini', label: 'Gemini', color: '#2563EB',
    models: [
      { id: 'gemini-2.0-flash', label: '2.0 Flash', recommended: true,
        desc: 'Dernière génération Flash de Google — rapide, efficace et très bon pour l\'appel d\'outils',
        tags: ['rapide', 'usage quotidien', 'outils'] },
      { id: 'gemini-1.5-pro', label: '1.5 Pro',
        desc: 'Contexte jusqu\'à 2 millions de tokens — idéal pour analyser de longs documents ou une base de code entière',
        tags: ['contexte long', 'documents', 'développement'] },
      { id: 'gemini-1.5-flash', label: '1.5 Flash',
        desc: 'Flash équilibré de Google — rapide et efficace pour la grande majorité des requêtes',
        tags: ['rapide', 'économique'] },
    ],
  },
  {
    id: 'copilot', label: 'Copilot', color: '#6e40c9',
    models: [
      { id: 'gpt-4o',                     label: 'GPT-4o',           recommended: true,
        desc: 'GPT-4o polyvalent via Copilot Business — bon choix par défaut pour la plupart des tâches',
        tags: ['usage quotidien', 'polyvalent'] },
      { id: 'gpt-4o-mini',                label: 'GPT-4o mini',
        desc: 'Rapide et économique via Copilot — adapté aux questions simples et aux tâches répétitives',
        tags: ['rapide', 'économique'] },
      { id: 'gpt-5-mini',                 label: 'GPT-5 mini',
        desc: 'GPT-5 mini — nouvelle génération OpenAI, rapide et efficace',
        tags: ['rapide', 'nouvelle génération'] },
      { id: 'gpt-5.2',                    label: 'GPT-5.2',
        desc: 'GPT-5.2 via Copilot — capacités avancées de la gamme GPT-5',
        tags: ['polyvalent', 'GPT-5'] },
      { id: 'gpt-5.4',                    label: 'GPT-5.4',
        desc: 'GPT-5.4 — version la plus performante de la gamme GPT-5 via Copilot',
        tags: ['puissant', 'GPT-5'] },
      { id: 'gpt-5.2-codex',              label: 'GPT-5.2 Codex',
        desc: 'Codex GPT-5.2 — spécialisé par OpenAI pour la compréhension et la génération de code',
        tags: ['développement', 'technique'] },
      { id: 'gpt-5.3-codex',              label: 'GPT-5.3 Codex',
        desc: 'Codex GPT-5.3 — version améliorée du Codex, pour les tâches de développement avancées',
        tags: ['développement', 'technique'] },
      { id: 'o1-mini',                    label: 'o1 mini',
        desc: 'Modèle de raisonnement d\'OpenAI — résolution de problèmes complexes par étapes',
        tags: ['raisonnement', 'maths', 'développement'] },
      { id: 'o3-mini',                    label: 'o3 mini',
        desc: 'o3 mini — dernier modèle de raisonnement OpenAI, très performant sur les tâches analytiques',
        tags: ['raisonnement', 'analyse'] },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet',
        desc: 'Claude 3.5 Sonnet (oct. 2024) via Copilot — développement et analyse générale',
        tags: ['développement', 'analyse'] },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet',
        desc: 'Claude 3.7 Sonnet — alliance entre raisonnement approfondi et réponse rapide (Anthropic)',
        tags: ['développement', 'raisonnement'] },
      { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5',
        desc: 'Claude Sonnet 4.5 — quatrième génération Anthropic, développement et analyse',
        tags: ['développement', 'analyse'] },
      { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6',
        desc: 'Claude Sonnet 4.6 — meilleur Sonnet d\'Anthropic disponible via Copilot Business',
        tags: ['usage quotidien', 'développement'] },
      { id: 'claude-opus-4-5',            label: 'Claude Opus 4.5',
        desc: 'Claude Opus 4.5 — très puissant pour les tâches longues et complexes via Copilot',
        tags: ['analyse complexe', 'raisonnement'] },
      { id: 'claude-opus-4-6',            label: 'Claude Opus 4.6',
        desc: 'Claude Opus 4.6 — encore plus puissant, recherche et synthèse avancées',
        tags: ['analyse complexe', 'recherche'] },
      { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7',
        desc: 'Claude Opus 4.7 — le plus puissant d\'Anthropic disponible via Copilot',
        tags: ['analyse complexe', 'recherche'] },
      { id: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5',
        desc: 'Claude Haiku 4.5 — ultra-rapide et très économique via Copilot',
        tags: ['rapide', 'économique'] },
      { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro',
        desc: 'Gemini 2.5 Pro via Copilot — grand contexte de Google, idéal pour les tâches complexes',
        tags: ['contexte long', 'analyse'] },
      { id: 'gemini-3.1-pro',             label: 'Gemini 3.1 Pro',
        desc: 'Gemini 3.1 Pro — dernière génération Google, très performant',
        tags: ['polyvalent', 'nouvelle génération'] },
      { id: 'gemini-3-flash',             label: 'Gemini 3 Flash',
        desc: 'Gemini 3 Flash — troisième génération Google, rapide via Copilot',
        tags: ['rapide'] },
      { id: 'grok-code-fast-1',           label: 'Grok Code Fast',
        desc: 'xAI Grok Code — conçu par xAI pour la compréhension et la génération de code',
        tags: ['développement', 'rapide'] },
    ],
  },
  {
    id: 'github', label: 'GitHub', color: '#24292f',
    models: [
      { id: 'gpt-4o',                        label: 'GPT-4o',           recommended: true,
        desc: 'GPT-4o via GitHub Models — inclus dans les abonnements GitHub Free et Pro' },
      { id: 'gpt-4o-mini',                   label: 'GPT-4o mini',
        desc: 'Ultra-rapide et économique via GitHub Models' },
      { id: 'claude-3-5-sonnet-20241022',    label: 'Claude 3.5',
        desc: 'Claude 3.5 Sonnet via GitHub Models — bon équilibre entre qualité et vitesse' },
      { id: 'claude-3-7-sonnet-20250219',    label: 'Claude 3.7',
        desc: 'Claude 3.7 Sonnet via GitHub Models — raisonnement approfondi' },
      { id: 'Llama-3.2-90B-Vision-Instruct', label: 'Llama 3.2 90B',
        desc: 'Open source Meta — alternative gratuite et performante via GitHub Models' },
      { id: 'Llama-3.1-405B-Instruct',       label: 'Llama 3.1 405B',
        desc: 'Le plus grand modèle Llama open source — très performant' },
      { id: 'mistral-large-2407',             label: 'Mistral Large',
        desc: 'Mistral Large via GitHub Models — modèle européen, efficace et polyvalent' },
      { id: 'Phi-3.5-mini-instruct',          label: 'Phi-3.5 mini',
        desc: 'Modèle compact de Microsoft — ultra-rapide pour les tâches simples' },
    ],
  },
]

const SUGGESTIONS = [
  'Combien de factures impayées ?',
  "Quel est le CA du mois en cours ?",
  'Montre les 10 dernières commandes',
  'Combien de clients actifs ?',
  'Liste les opportunités CRM ouvertes',
]

const SUGGESTIONS_GENERAL = [
  'Quels sont les modèles de la comptabilité ?',
  'Comment fonctionne le workflow des ventes ?',
  'Quelles sont les nouveautés de cette version ?',
  'Comment migrer depuis la version précédente ?',
  'Montre la structure du modèle stock.move',
]

const ODOO_VERSIONS_BASE = ['19.0', '18.0', '17.0', '16.0', '15.0']

const GENERAL_KEY = 'general'

// ── Main page ─────────────────────────────────────────────────

export default function Assistant() {
  const location = useLocation()
  const { data: profData }  = useQuery({ queryKey: ['profiles'],      queryFn: listProfiles })
  const { data: provData }  = useQuery({ queryKey: ['ai-providers'],  queryFn: getAiProviders })
  const { data: srcData }   = useQuery({ queryKey: ['sources-all'],   queryFn: checkAllSources, staleTime: 30_000 })
  const { data: modelCfg }  = useQuery({ queryKey: ['model-config'],  queryFn: getModelConfig })

  const profiles: Profile[] = profData?.data ?? []
  const allProviders: Record<string, boolean> = provData?.data ?? {}

  const modelConfig: Record<string, string[]> = modelCfg?.data ?? {}

  // Only show configured providers, with models filtered by user preferences
  const configuredProviders = PROVIDERS
    .filter(p => allProviders[p.id])
    .map(p => {
      const enabled = modelConfig[p.id]
      if (!enabled || enabled.length === 0) return p
      return { ...p, models: p.models.filter(m => enabled.includes(m.id)) }
    })
    .filter(p => p.models.length > 0)

  const [provider,  setProvider]  = useState('')
  const [modelId,   setModelId]   = useState('')
  // profileId: number = project tab, GENERAL_KEY = general tab, null = not yet selected
  const [profileId, setProfileId] = useState<number | typeof GENERAL_KEY | null>(null)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [generalVersion, setGeneralVersion] = useState('19.0')

  // Conversations keyed by string (profile id as string, or 'general')
  // Initialized from localStorage so they survive page refresh
  const [conversations, setConversations] = useState<Record<string, Message[]>>(() => loadActiveConvs())
  const [savedConvs,    setSavedConvs]    = useState<Record<string, SavedConv[]>>(() => loadHistory())
  const [showHistory,   setShowHistory]   = useState(false)

  const convKey = profileId !== null ? String(profileId) : null
  const messages = convKey ? (conversations[convKey] ?? []) : []

  // Auto-persist active conversations to localStorage
  useEffect(() => { persistActiveConvs(conversations) }, [conversations])

  const [input,     setInput]    = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Init provider when providers load
  useEffect(() => {
    if (configuredProviders.length && !provider) {
      const p = configuredProviders[0]
      setProvider(p.id)
      setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0].id)
    }
  }, [allProviders])

  // Auto-select first profile (or general if no profiles)
  useEffect(() => {
    if (profileId === null) {
      if (profiles.length) setProfileId(profiles[0].id)
      else setProfileId(GENERAL_KEY)
    }
  }, [profiles])

  // Sync selectedCompanyId when active profile changes
  useEffect(() => {
    const p = profiles.find(p => p.id === profileId)
    setSelectedCompanyId(p?.selected_company_id ?? null)
  }, [profileId, profiles])

  // Pending auto-send: text to send once provider/mode are ready
  const pendingSendRef = useRef<{ text: string; version: string } | null>(null)

  // Pre-fill input from navigation state (e.g. from Sources "IA" button)
  useEffect(() => {
    const state = location.state as { prefill?: string; version?: string; autoSend?: boolean } | null
    if (!state?.prefill) return
    const { prefill, version: navVersion, autoSend } = state
    window.history.replaceState({}, '')
    if (navVersion) setGeneralVersion(navVersion)
    setProfileId(GENERAL_KEY)
    setInput(prefill)
    if (autoSend && navVersion) pendingSendRef.current = { text: prefill, version: navVersion }
  }, [location.state])

  // Fire pending auto-send once provider is available and we're in general mode
  useEffect(() => {
    const pending = pendingSendRef.current
    if (!pending || streaming || !provider || profileId !== GENERAL_KEY) return
    pendingSendRef.current = null
    const { text, version: ver } = pending
    setInput('')
    const timer = setTimeout(() => sendWithText(text, ver), 100)
    return () => clearTimeout(timer)
  }, [provider, profileId, streaming])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isGeneralMode = profileId === GENERAL_KEY
  const selectedProfile = profiles.find(p => p.id === profileId)
  const currentProv = configuredProviders.find(p => p.id === provider)

  const { data: profileAppsData } = useQuery({
    queryKey: ['profile-apps', typeof profileId === 'number' ? profileId : null],
    queryFn: () => typeof profileId === 'number' ? getProfileApps(profileId) : Promise.resolve(null),
    enabled: typeof profileId === 'number',
    staleTime: 300_000,
    retry: false,
  })
  const profileApps: { name: string; shortdesc: string }[] = profileAppsData?.data?.apps ?? []

  const sourcesStatus: Record<string, { installed: boolean }> = srcData?.data ?? {}
  const activeVersion = isGeneralMode ? generalVersion : (selectedProfile?.odoo_version ?? null)
  // Sources installed = community OR enterprise variant found on disk
  const sourcesInstalled = activeVersion
    ? (sourcesStatus[activeVersion]?.installed === true || sourcesStatus[`${activeVersion}-enterprise`]?.installed === true)
    : false
  const enterpriseInstalled = activeVersion ? sourcesStatus[`${activeVersion}-enterprise`]?.installed === true : false
  const communityInstalled  = activeVersion ? sourcesStatus[activeVersion]?.installed === true : false

  // Deduplicate versions: strip -enterprise suffix, keep one entry per base version
  // Show community + enterprise availability indicators in the dropdown
  const installedVersions: string[] = [...new Set([
    ...ODOO_VERSIONS_BASE,
    ...Object.keys(sourcesStatus)
      .filter(v => sourcesStatus[v]?.installed)
      .map(v => v.replace(/-enterprise$/, '')),
  ])].sort((a, b) => {
    const [aMaj, aMin = 0] = a.split('.').map(Number)
    const [bMaj, bMin = 0] = b.split('.').map(Number)
    if (aMaj !== bMaj) return bMaj - aMaj
    if (aMin === 0 && bMin !== 0) return -1   // x.0 before x.y within same major
    if (bMin === 0 && aMin !== 0) return 1
    return bMin - aMin
  })

  // Company access guard — block send if selected company is not accessible for the Odoo user
  const companyAccessBlocked = (() => {
    if (isGeneralMode || !selectedProfile || !selectedCompanyId) return false
    const accessInfo = (() => { try { return selectedProfile.user_access_info ? JSON.parse(selectedProfile.user_access_info) : null } catch { return null } })()
    if (!accessInfo) return false
    return !accessInfo.accessible_company_ids.includes(selectedCompanyId)
  })()

  const setMessages = (fn: (prev: Message[]) => Message[]) => {
    if (!convKey) return
    setConversations(prev => ({
      ...prev,
      [convKey]: fn(prev[convKey] ?? []),
    }))
  }

  const makeMeetingMinute = async () => {
    if (streaming || profileId === null || !provider || messages.length === 0) return
    const history = messages
      .filter(m => !m.loading)
      .map(m => ({
        role: m.role,
        content: m.role === 'user'
          ? (m.text ?? '')
          : (m.events?.find(e => e.type === 'text')?.content ?? ''),
      }))
      .filter(m => m.content)
    const prompt = `En utilisant le modèle de compte-rendu de réunion défini dans tes instructions (fichier meeting-minute.md), génère un compte-rendu structuré basé sur la conversation ci-dessus. Si aucun modèle n'est disponible, utilise un format professionnel standard avec : titre, date, participants, points discutés, décisions prises, actions de suivi avec responsables et échéances.`
    history.push({ role: 'user', content: prompt })
    const crNow = Date.now()
    const userMsg: Message = { id: String(crNow), role: 'user', text: '📋 Générer le compte-rendu de réunion', timestamp: crNow }
    const assistantMsg: Message = { id: String(crNow + 1), role: 'assistant', events: [], loading: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const body = isGeneralMode
        ? { provider, profile_id: null, version: generalVersion, messages: history, model: modelId }
        : { provider, profile_id: profileId, company_id: selectedCompanyId ?? undefined, messages: history, model: modelId }
      const res = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const evt: AiEvent = JSON.parse(line.slice(5).trim())
            if (evt.type === 'end') break
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              if (last?.role === 'assistant') {
                const extra = evt.type === 'done'
                  ? { timestamp: Date.now(), inputTokens: evt.input_tokens, outputTokens: evt.output_tokens }
                  : {}
                msgs[msgs.length - 1] = { ...last, ...extra, events: [...(last.events ?? []), evt], loading: evt.type !== 'done' && evt.type !== 'error' }
              }
              return msgs
            })
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setMessages(prev => { const msgs = [...prev]; const last = msgs[msgs.length - 1]; if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, events: [{ type: 'error', msg: String(e) }], loading: false }; return msgs })
      }
    } finally { setStreaming(false) }
  }

  const sendWithText = async (text: string, overrideVersion?: string) => {
    if (!text.trim() || streaming || profileId === null || !provider) return

    const now = Date.now()
    const userMsg: Message      = { id: String(now), role: 'user', text, timestamp: now }
    const assistantMsg: Message = { id: String(now + 1), role: 'assistant', events: [], loading: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    const history = messages
      .filter(m => !m.loading)
      .map(m => ({
        role: m.role,
        content: m.role === 'user'
          ? (m.text ?? '')
          : (m.events?.find(e => e.type === 'text')?.content ?? ''),
      }))
      .filter(m => m.content)
    history.push({ role: 'user', content: text })

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const useVersion = overrideVersion ?? generalVersion
    const useGeneral = overrideVersion != null ? true : isGeneralMode

    try {
      const body = useGeneral
        ? { provider, profile_id: null, version: useVersion, messages: history, model: modelId }
        : { provider, profile_id: profileId, company_id: selectedCompanyId ?? undefined, messages: history, model: modelId }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        appendEvent(assistantMsg.id, { type: 'error', msg: err.detail ?? `HTTP ${res.status}` })
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt: AiEvent
          try { evt = JSON.parse(line.slice(6)) } catch { continue }
          if (evt.type === 'done') {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id
              ? { ...m, timestamp: Date.now(), inputTokens: evt.input_tokens, outputTokens: evt.output_tokens }
              : m
            ))
          }
          if (evt.type !== 'end') appendEvent(assistantMsg.id, evt)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      appendEvent(assistantMsg.id, { type: 'error', msg: String(err) })
    } finally {
      setStreaming(false)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, loading: false } : m
      ))
    }
  }

  const send = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput('')
    await sendWithText(text)
  }

  const appendEvent = (msgId: string, evt: AiEvent) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, events: [...(m.events ?? []), evt] } : m
    ))
  }

  const saveToHistory = (key: string, msgs: Message[], version?: string) => {
    if (msgs.filter(m => !m.loading).length === 0) return
    const conv: SavedConv = {
      id: Date.now().toString(),
      title: autoTitle(msgs),
      messages: msgs.filter(m => !m.loading),
      version,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSavedConvs(prev => {
      const updated = { ...prev, [key]: [conv, ...(prev[key] ?? [])].slice(0, 50) }
      persistHistory(updated)
      return updated
    })
  }

  const resetCurrentConversation = () => {
    abortRef.current?.abort()
    if (convKey && messages.length > 0) {
      saveToHistory(convKey, messages, isGeneralMode ? generalVersion : selectedProfile?.odoo_version)
    }
    if (convKey) setConversations(prev => ({ ...prev, [convKey]: [] }))
    setStreaming(false)
  }

  const resumeConv = (conv: SavedConv) => {
    if (!convKey) return
    // Save current if it has content
    if (messages.length > 0) {
      saveToHistory(convKey, messages, isGeneralMode ? generalVersion : selectedProfile?.odoo_version)
    }
    setConversations(prev => ({ ...prev, [convKey]: conv.messages }))
    if (conv.version && isGeneralMode) setGeneralVersion(conv.version)
    setShowHistory(false)
    setStreaming(false)
  }

  const deleteConv = (key: string, id: string) => {
    setSavedConvs(prev => {
      const updated = { ...prev, [key]: (prev[key] ?? []).filter(c => c.id !== id) }
      persistHistory(updated)
      return updated
    })
  }

  const switchProvider = (id: string) => {
    const p = configuredProviders.find(pv => pv.id === id)!
    setProvider(id)
    setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0].id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, maxWidth: 900 }}>

      <PageHeader
        title="Assistant IA"
        description="Posez des questions sur vos données Odoo en langage naturel."
        action={<Link to="/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }}>⚙ Paramètres</Link>}
      />

      {/* ── Unified context bar ── */}
      <div style={{
        background: t.bgCard, border: `1px solid ${t.border}`,
        borderRadius: t.radiusLg, marginBottom: 12, flexShrink: 0,
      }}>

        {/* Row 1 — Project tabs + Version */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 10px', flexWrap: 'wrap' }}>
          {/* General tab */}
          {(() => {
            const isActive = isGeneralMode
            const msgCount = (conversations[GENERAL_KEY] ?? []).filter(m => m.role === 'user').length
            return (
              <button onClick={() => setProfileId(GENERAL_KEY)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 11px',
                background: isActive ? '#6366f115' : 'transparent',
                border: `1px solid ${isActive ? '#6366f1' : t.border}`,
                borderRadius: t.radiusFull,
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                color: isActive ? '#6366f1' : t.muted,
                cursor: 'pointer', transition: 'all .15s',
              }}>
                🌐 Odoo Général
                {msgCount > 0 && (
                  <span style={{
                    background: isActive ? '#6366f1' : t.borderLight, color: isActive ? '#fff' : t.muted,
                    borderRadius: t.radiusFull, fontSize: 10, fontWeight: 700, padding: '1px 5px',
                  }}>{msgCount}</span>
                )}
              </button>
            )
          })()}

          {/* Project tabs */}
          {profiles.map(p => {
            const msgCount = (conversations[String(p.id)] ?? []).filter(m => m.role === 'user').length
            const isActive = p.id === profileId
            return (
              <button key={p.id} onClick={() => setProfileId(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 11px',
                background: isActive ? t.brand20 : 'transparent',
                border: `1px solid ${isActive ? t.brand40 : t.border}`,
                borderRadius: t.radiusFull,
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                color: isActive ? t.brand : t.muted,
                cursor: 'pointer', transition: 'all .15s',
              }}>
                {p.company_logo
                  ? <img src={p.company_logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 2 }} />
                  : <span style={{ fontSize: 11 }}>🏢</span>
                }
                {p.name}
                {msgCount > 0 && (
                  <span style={{
                    background: isActive ? t.brand : t.borderLight, color: isActive ? '#fff' : t.muted,
                    borderRadius: t.radiusFull, fontSize: 10, fontWeight: 700, padding: '1px 5px',
                  }}>{msgCount}</span>
                )}
              </button>
            )
          })}

          <div style={{ flex: 1 }} />

          {/* Version — dropdown (general) or badge (project) */}
          {isGeneralMode ? (
            <VersionDropdown
              value={generalVersion}
              onChange={setGeneralVersion}
              versions={installedVersions}
              sourcesStatus={sourcesStatus}
            />
          ) : activeVersion ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 11px', borderRadius: t.radiusFull, fontSize: 12, fontWeight: 600,
              background: t.brand20, border: `1px solid ${t.brand40}`, color: t.brand,
            }}>
              Odoo {activeVersion}
              <span style={{ fontSize: 10, color: t.muted, fontWeight: 400 }}>projet</span>
            </span>
          ) : null}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: t.border }} />

        {/* Row 2 — Model + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', flexWrap: 'wrap' }}>
          {configuredProviders.length === 0 ? (
            <div style={{ fontSize: 13, color: t.muted }}>
              Aucun fournisseur IA configuré —{' '}
              <Link to="/settings" style={{ color: t.brand, fontWeight: 600 }}>ajouter une clé API →</Link>
            </div>
          ) : (
            <>
              {/* Provider segmented control */}
              <div style={{ display: 'flex', gap: 2, background: t.bgMuted, borderRadius: t.radius, padding: 2 }}>
                {configuredProviders.map(p => (
                  <button key={p.id} onClick={() => switchProvider(p.id)} style={{
                    padding: '4px 12px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: 'none',
                    background: provider === p.id ? t.bgCard : 'transparent',
                    color: provider === p.id ? p.color : t.muted,
                    boxShadow: provider === p.id ? t.shadow : 'none',
                    transition: 'all .15s',
                  }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {currentProv && <ModelDropdown provider={currentProv} selected={modelId} onChange={setModelId} />}

              <div style={{ flex: 1 }} />

              {/* Sources badge (project mode) */}
              {selectedProfile && !isGeneralMode && activeVersion && (
                <span
                  title={sourcesInstalled
                    ? `Code source Odoo ${activeVersion} installé${communityInstalled && enterpriseInstalled ? ' (Community + Enterprise)' : communityInstalled ? ' (Community)' : ' (Enterprise)'}`
                    : `Code source Odoo ${activeVersion} non installé — les questions sur le code source ne fonctionneront pas`}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: t.radiusFull,
                    background: sourcesInstalled ? `${t.success}15` : '#fef3c7',
                    color: sourcesInstalled ? t.success : '#b45309',
                    border: `1px solid ${sourcesInstalled ? `${t.success}40` : '#f59e0b'}`,
                    cursor: 'help',
                  }}>
                  {sourcesInstalled
                    ? `Sources v${activeVersion} ✓${communityInstalled && enterpriseInstalled ? ' C+E' : communityInstalled ? ' C' : ' E'}`
                    : `⚠ Sources v${activeVersion} manquantes`}
                </span>
              )}

            </>
          )}
        </div>

        {/* Row 3 — Conversation actions (only when there's something to act on) */}
        {(messages.length > 0 || (convKey && (savedConvs[convKey] ?? []).length > 0)) && (
          <>
            <div style={{ height: 1, background: t.border }} />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px',
              background: t.bgMuted,
              borderRadius: `0 0 ${t.radiusLg} ${t.radiusLg}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>
                Conversation
              </span>
              {messages.length > 0 && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={makeMeetingMinute} disabled={streaming}
                    title="Générer un compte-rendu structuré de cette conversation">
                    📝 Compte-rendu
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={resetCurrentConversation}
                    title="Démarrer une nouvelle conversation (sauvegarde automatique de l'actuelle)">
                    🗒️ Nouvelle conv.
                  </button>
                </>
              )}
              {convKey && (savedConvs[convKey] ?? []).length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(h => !h)}
                  title={`${(savedConvs[convKey] ?? []).length} conversation(s) sauvegardée(s)`}
                  style={showHistory ? { background: t.brand20, borderColor: t.brand40, color: t.brand } : {}}>
                  🕐 Historique ({(savedConvs[convKey] ?? []).length})
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Sources warning banner */}
      {activeVersion && !sourcesInstalled && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          background: '#fef3c7', border: '1px solid #f59e0b',
          borderRadius: t.radius, marginBottom: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div style={{ fontSize: 12, color: '#92400e', flex: 1 }}>
            <strong>Code source Odoo {activeVersion} non installé</strong> — les questions sur le code source ne fonctionneront pas.{' '}
            <Link to="/sources" style={{ color: '#b45309', fontWeight: 600 }}>Installer les sources →</Link>
          </div>
        </div>
      )}

      {/* Main content row: chat + optional history panel */}
      <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>

      {/* Chat history */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {messages.length === 0 && isGeneralMode && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '10px 14px', background: t.bgCard, border: '1px solid #6366f130', borderRadius: t.radiusLg }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#6366f115', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌐</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Mode général — Odoo {generalVersion}</div>
                {currentProv && (
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 1 }}>
                    {currentProv.label} · {currentProv.models.find(m => m.id === modelId)?.label} · Questions générales sans connexion client
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13, color: t.muted, marginBottom: 10 }}>Suggestions :</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS_GENERAL.map(s => (
                <button key={s} onClick={() => setInput(s)} style={{
                  padding: '7px 14px', background: t.bgCard,
                  border: `1px solid ${t.border}`, borderRadius: t.radiusFull,
                  fontSize: 13, cursor: 'pointer', color: t.textSub, transition: 'border-color .15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && selectedProfile && !isGeneralMode && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 20, padding: '14px 16px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {selectedProfile.company_logo
                  ? <img src={selectedProfile.company_logo} alt="" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 8, background: t.bgMuted, padding: 4, border: `1px solid ${t.border}`, flexShrink: 0 }} />
                  : <div style={{ width: 40, height: 40, borderRadius: 8, background: t.brand20, border: `1px solid ${t.brand40}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏢</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 2 }}>{selectedProfile.name}</div>
                  {selectedProfile.company_name && (
                    <div style={{ fontSize: 12, color: t.textSub, marginBottom: 4 }}>{selectedProfile.company_name}</div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                    {currentProv && (
                      <span style={{ fontSize: 11, color: t.muted }}>
                        {currentProv.label} · {currentProv.models.find(m => m.id === modelId)?.label}
                      </span>
                    )}
                    {activeVersion && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        borderRadius: t.radiusFull,
                        background: sourcesInstalled ? `${t.success}15` : '#fef3c7',
                        color: sourcesInstalled ? t.success : '#b45309',
                        border: `1px solid ${sourcesInstalled ? `${t.success}40` : '#f59e0b'}`,
                      }}>
                        {sourcesInstalled ? `📁 Sources v${activeVersion} ✓` : `⚠ Sources v${activeVersion} manquantes`}
                      </span>
                    )}
                  </div>
                  <AppBadgesAsst apps={profileApps} />
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: t.muted, marginBottom: 10 }}>Suggestions :</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setInput(s)} style={{
                  padding: '7px 14px', background: t.bgCard,
                  border: `1px solid ${t.border}`, borderRadius: t.radiusFull,
                  fontSize: 13, cursor: 'pointer', color: t.textSub, transition: 'border-color .15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = t.brand)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          msg.role === 'user'
            ? <UserBubble key={msg.id} text={msg.text ?? ''} timestamp={msg.timestamp} />
            : <AssistantBubble key={msg.id} events={msg.events ?? []} loading={msg.loading} provider={provider} timestamp={msg.timestamp} inputTokens={msg.inputTokens} outputTokens={msg.outputTokens} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* History panel */}
      {showHistory && convKey && (
        <div style={{
          width: 280, flexShrink: 0, overflowY: 'auto',
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, padding: '12px 0',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '0 14px 10px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Historique</span>
            <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
          {(savedConvs[convKey] ?? []).length === 0
            ? <div style={{ padding: '20px 14px', fontSize: 12, color: t.muted, textAlign: 'center' }}>Aucune conversation sauvegardée</div>
            : (savedConvs[convKey] ?? []).map(conv => (
              <div key={conv.id} style={{
                padding: '10px 14px', borderBottom: `1px solid ${t.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.text, lineHeight: 1.4, flex: 1 }}
                    title={conv.title}>{conv.title}</span>
                  <button onClick={() => deleteConv(convKey, conv.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 13, flexShrink: 0, lineHeight: 1, padding: '1px 2px' }}>×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: t.muted }}>{fmtDate(conv.updatedAt)}</span>
                  {conv.version && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: t.brand20, color: t.brand }}>
                      v{conv.version}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: t.muted, marginLeft: 'auto' }}>
                    {conv.messages.filter(m => m.role === 'user').length} msg
                  </span>
                </div>
                <button className="btn btn-primary" onClick={() => resumeConv(conv)}
                  style={{ marginTop: 2, fontSize: 11, padding: '4px 10px' }}>
                  ↩ Reprendre
                </button>
              </div>
            ))
          }
        </div>
      )}

      </div>{/* end content row */}

      {/* Company selector bar (shown when profile has multiple companies) */}
      {selectedProfile && !isGeneralMode && (() => {
        const companies: CompanyOption[] = (() => { try { return JSON.parse(selectedProfile.company_ids ?? '[]') } catch { return [] } })()
        if (companies.length <= 1) return null
        const activeId = selectedCompanyId ?? companies[0]?.id ?? null
        const accessInfo = (() => { try { return selectedProfile.user_access_info ? JSON.parse(selectedProfile.user_access_info) : null } catch { return null } })()
        const activeCompanyAccessible = !accessInfo || !activeId || accessInfo.accessible_company_ids.includes(activeId)
        return (
          <>
            <div style={{ flexShrink: 0, paddingTop: 8, paddingBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>Société :</span>
              {companies.map(c => {
                const isActive = activeId === c.id
                const isAccessible = !accessInfo || accessInfo.accessible_company_ids.includes(c.id)
                return (
                  <button key={c.id}
                    onClick={() => isAccessible && setSelectedCompanyId(c.id)}
                    disabled={!isAccessible}
                    title={!isAccessible ? `L'utilisateur ${accessInfo?.user_name} n'a pas accès à cette société` : undefined}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 4,
                      border: `1px solid ${!isAccessible ? t.border : isActive ? t.brand : t.border}`,
                      background: !isAccessible ? t.bgMuted : isActive ? t.brand : t.bgMuted,
                      color: !isAccessible ? t.muted : isActive ? '#fff' : t.textSub,
                      cursor: !isAccessible ? 'not-allowed' : 'pointer',
                      opacity: !isAccessible ? 0.5 : 1,
                    }}>
                    {!isAccessible ? '🔒 ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
            {!activeCompanyAccessible && (
              <div style={{
                flexShrink: 0, padding: '10px 14px', marginBottom: 4,
                background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: t.radius,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 2 }}>
                    Société inaccessible pour cet utilisateur
                  </div>
                  <div style={{ fontSize: 12, color: '#991b1b' }}>
                    L'utilisateur <strong>{accessInfo?.user_name}</strong> n'a pas accès à la société sélectionnée.
                    Sélectionnez une société accessible ou modifiez les droits de l'utilisateur dans Odoo.
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Input area */}
      <div style={{ flexShrink: 0, paddingTop: 12, borderTop: `1px solid ${t.border}`, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={
            configuredProviders.length === 0
              ? 'Configurez un fournisseur IA dans les Paramètres'
              : profileId === null
              ? 'Sélectionnez un onglet ci-dessus'
              : isGeneralMode
              ? `Question générale sur Odoo ${generalVersion}… (Entrée pour envoyer)`
              : 'Posez une question… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)'
          }
          disabled={configuredProviders.length === 0 || profileId === null}
          rows={3}
          style={{
            flex: 1, padding: '12px 16px', border: `1px solid ${t.border}`,
            borderRadius: t.radiusLg, fontSize: 14, resize: 'none',
            color: t.text, background: t.bgCard, outline: 'none',
            fontFamily: t.font, lineHeight: 1.6,
            transition: 'border-color .15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = t.brand)}
          onBlur={e => (e.currentTarget.style.borderColor = t.border)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={configuredProviders.length === 0 || profileId === null || (!streaming && (!input.trim() || companyAccessBlocked))}
            title={companyAccessBlocked ? 'Société inaccessible — changez de société' : undefined}
            style={{
              padding: '10px 18px', minWidth: 90,
              background: streaming ? t.danger : t.brand,
              color: '#fff', border: 'none', borderRadius: t.radiusLg,
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: (configuredProviders.length === 0 || profileId === null || (!streaming && (!input.trim() || companyAccessBlocked))) ? .45 : 1,
              transition: 'background .15s, filter .15s',
            }}
            onMouseEnter={e => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = '' }}
          >
            {streaming
              ? <><span style={{ fontSize: 16 }}>⏹</span> Arrêter</>
              : <><span style={{ fontSize: 16 }}>↑</span> Envoyer</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Model dropdown ─────────────────────────────────────────────

function ModelDropdown({ provider, selected, onChange }: {
  provider: typeof PROVIDERS[0]; selected: string; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = provider.models.find(m => m.id === selected) ?? provider.models[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', background: t.bgCard,
        border: `1px solid ${provider.color}50`,
        borderRadius: t.radius, fontSize: 12, cursor: 'pointer',
        color: provider.color, fontWeight: 600,
      }}>
        <span>{current.label}</span>
        {current.recommended && <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>★</span>}
        <span style={{ fontSize: 9, color: t.muted, marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          minWidth: 280, overflow: 'hidden',
        }}>
          {provider.models.map(m => (
            <button key={m.id} onClick={() => { onChange(m.id); setOpen(false) }} style={{
              width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
              padding: '10px 14px', border: 'none', cursor: 'pointer',
              background: m.id === selected ? `${provider.color}10` : 'transparent',
              borderLeft: m.id === selected ? `3px solid ${provider.color}` : '3px solid transparent',
              transition: 'background .1s',
            }}
              onMouseEnter={e => { if (m.id !== selected) e.currentTarget.style.background = t.bgMuted }}
              onMouseLeave={e => { if (m.id !== selected) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: m.id === selected ? provider.color : t.text }}>
                  {m.label}
                </span>
                {m.recommended && (
                  <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 2 }}>
                    Recommandé
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>
              {m.tags && m.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                  {m.tags.map(tag => (
                    <span key={tag} style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 10,
                      background: `${provider.color}18`, color: provider.color,
                      border: `1px solid ${provider.color}30`, fontWeight: 600,
                    }}>{tag}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Version dropdown ───────────────────────────────────────────

function VersionDropdown({ value, onChange, versions, sourcesStatus = {} }: {
  value: string; onChange: (v: string) => void; versions: string[]
  sourcesStatus?: Record<string, { installed: boolean }>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasCommunity  = (v: string) => sourcesStatus[v]?.installed === true
  const hasEnterprise = (v: string) => sourcesStatus[`${v}-enterprise`]?.installed === true
  const isIntermediate = (v: string) => { const [, min = '0'] = v.split('.'); return parseInt(min) > 0 }

  const currentC = hasCommunity(value)
  const currentE = hasEnterprise(value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 11px', borderRadius: t.radiusFull,
        background: '#6366f115', border: '1px solid #6366f1',
        fontSize: 12, fontWeight: 700, color: '#6366f1', cursor: 'pointer',
      }}>
        Odoo {value}
        {(currentC || currentE) && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6366f1', opacity: 0.7 }}>
            {currentC && currentE ? 'C+E' : currentC ? 'C' : 'E'}
          </span>
        )}
        <span style={{ fontSize: 9, opacity: .6 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: t.shadowMd, minWidth: 160, overflow: 'hidden',
        }}>
          {versions.map(v => {
            const hasC = hasCommunity(v)
            const hasE = hasEnterprise(v)
            const isInter = isIntermediate(v)
            const isActive = v === value
            return (
              <button key={v} onClick={() => { onChange(v); setOpen(false) }} style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', border: 'none', cursor: 'pointer',
                background: isActive ? '#6366f110' : 'transparent',
                borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                fontSize: 12, fontWeight: isActive ? 700 : 400,
                color: isActive ? '#6366f1' : t.text,
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.bgMuted }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ flex: 1 }}>
                  {isInter ? <span style={{ fontSize: 11, color: t.muted }}>↳ </span> : null}
                  {v}
                </span>
                <span style={{ display: 'flex', gap: 3 }}>
                  {hasC && (
                    <span title="Community installé" style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                      background: '#dbeafe', color: '#1d4ed8',
                    }}>C</span>
                  )}
                  {hasE && (
                    <span title="Enterprise installé" style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                      background: '#fef3c7', color: '#92400e',
                    }}>E</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Bubbles ──────────────────────────────────────────────────

function fmtTime(ts?: number) {
  if (!ts) return null
  const d = new Date(ts)
  return d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function fmtTokens(input?: number, output?: number) {
  if (!input && !output) return null
  const total = (input ?? 0) + (output ?? 0)
  const parts = []
  if (input)  parts.push(`↑${input.toLocaleString()}`)
  if (output) parts.push(`↓${output.toLocaleString()}`)
  return `${total.toLocaleString()} tokens (${parts.join(' · ')})`
}

function UserBubble({ text, timestamp }: { text: string; timestamp?: number }) {
  const time = fmtTime(timestamp)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '10px 14px',
          background: t.brand, color: '#fff',
          borderRadius: `${t.radiusLg} ${t.radiusLg} 4px ${t.radiusLg}`,
          fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
        {time && (
          <div style={{ textAlign: 'right', fontSize: 10, color: t.muted, marginTop: 3, paddingRight: 2 }}>
            {time}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantBubble({ events, loading, provider, timestamp, inputTokens, outputTokens }: {
  events: AiEvent[]; loading?: boolean; provider: string
  timestamp?: number; inputTokens?: number; outputTokens?: number
}) {
  const prov = PROVIDERS.find(p => p.id === provider)
  const textEvt   = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt  = events.find(e => e.type === 'error')
  const time   = fmtTime(timestamp)
  const tokens = fmtTokens(inputTokens, outputTokens)

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: prov ? `${prov.color}20` : t.bgMuted,
        color: prov?.color ?? t.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
        marginTop: 4,
      }}>
        {prov?.label[0] ?? 'AI'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} />}

        {textEvt?.content && (
          <div style={{
            background: t.bgCard, border: `1px solid ${t.border}`,
            borderRadius: `4px ${t.radiusLg} ${t.radiusLg} ${t.radiusLg}`,
            padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: t.text,
          }}>
            <Markdown text={textEvt.content} />
          </div>
        )}

        {errorEvt && (
          <div style={{
            background: t.dangerBg, border: `1px solid ${t.danger}40`,
            borderRadius: t.radius, padding: '10px 14px', fontSize: 13, color: t.danger,
          }}>
            ⚠ {errorEvt.msg}
          </div>
        )}

        {loading && !textEvt && !errorEvt && toolEvents.length === 0 && (
          <div style={{ color: t.muted, fontSize: 13, padding: '8px 0' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>⟳</span> Réflexion en cours…
          </div>
        )}

        {(time || tokens) && !loading && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: t.muted, paddingLeft: 2 }}>
            {time && <span>{time}</span>}
            {tokens && <span title="Tokens utilisés (entrée ↑ + sortie ↓)">{tokens}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// Human-readable French labels for common Odoo models
const ODOO_MODEL_LABELS: Record<string, string> = {
  // Accounting
  'account.move':              'Factures',
  'account.move.line':         'Lignes de facture',
  'account.payment':           'Paiements',
  'account.payment.term':      'Conditions de paiement',
  'account.analytic.line':     'Lignes analytiques',
  'account.journal':           'Journaux comptables',
  'account.account':           'Plan comptable',
  'account.tax':               'Taxes',
  // Sales
  'sale.order':                'Commandes clients',
  'sale.order.line':           'Lignes de commande',
  'sale.report':               'Analyse des ventes',
  'crm.lead':                  'Opportunités CRM',
  'crm.stage':                 'Étapes CRM',
  // Purchase
  'purchase.order':            'Commandes fournisseurs',
  'purchase.order.line':       'Lignes d\'achat',
  // Inventory / Stock
  'stock.picking':             'Transferts de stock',
  'stock.move':                'Mouvements de stock',
  'stock.quant':               'Niveaux de stock',
  'stock.warehouse':           'Entrepôts',
  'stock.location':            'Emplacements',
  'stock.route':               'Routes de stock',
  'stock.warehouse.orderpoint':'Règles de réapprovisionnement',
  'stock.lot':                 'Lots / Numéros de série',
  // Products
  'product.template':          'Produits',
  'product.product':           'Variantes de produit',
  'product.category':          'Catégories de produit',
  'product.pricelist':         'Listes de prix',
  // Partners
  'res.partner':               'Contacts',
  'res.company':               'Sociétés',
  'res.users':                 'Utilisateurs',
  // HR
  'hr.employee':               'Employés',
  'hr.leave':                  'Congés',
  'hr.leave.allocation':       'Allocations de congés',
  'hr.payslip':                'Bulletins de salaire',
  'hr.contract':               'Contrats',
  // Project
  'project.project':           'Projets',
  'project.task':              'Tâches',
  'project.task.type':         'Étapes des tâches',
  // Manufacturing
  'mrp.production':            'Ordres de fabrication',
  'mrp.bom':                   'Nomenclatures',
  'mrp.workcenter':            'Postes de travail',
  // Other
  'ir.rule':                   'Règles d\'accès',
  'ir.model':                  'Modèles techniques',
  'ir.model.fields':           'Champs techniques',
  'res.currency':              'Devises',
  'res.country':               'Pays',
  'uom.uom':                   'Unités de mesure',
  'mail.message':              'Messages',
  'mail.activity':             'Activités',
}

function humanModel(model: string): string {
  return ODOO_MODEL_LABELS[model] ?? model
}

function getToolMeta(name: string, args?: Record<string, unknown>) {
  if (name === 'query_odoo') {
    const model = (args?.model as string) ?? ''
    const prefix = model.split('.')[0]
    const app = ODOO_APPS[prefix]
    const label = humanModel(model)
    return {
      icon: app ? app.icon : '🗄️',
      appName: app ? prefix : null,
      color: app ? app.color : '#64748b',
      loadingLabel: model ? `Interrogation — ${label}…` : 'Interrogation Odoo…',
      doneLabel: label || 'Odoo',
    }
  }
  if (name === 'count_odoo') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔢', appName: null, color: '#0891b2',
      loadingLabel: model ? `Comptage — ${label}…` : 'Comptage…',
      doneLabel: model ? `Comptage · ${label}` : 'Comptage',
    }
  }
  if (name === 'get_odoo_fields') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔬', appName: null, color: '#059669',
      loadingLabel: model ? `Découverte des champs — ${label}…` : 'Découverte des champs…',
      doneLabel: model ? `Champs · ${label}` : 'Champs',
    }
  }
  if (name === 'search_odoo_source') {
    const ver = args?.version as string
    const pat = args?.pattern as string ?? ''
    const shortPat = pat.length > 30 ? pat.slice(0, 30) + '…' : pat
    return {
      icon: '🔎', appName: null, color: '#2563EB',
      loadingLabel: `Recherche dans les sources${ver ? ` v${ver}` : ''}…`,
      doneLabel: ver ? `Sources v${ver}` : 'Sources Odoo',
      hint: shortPat || undefined,
    }
  }
  if (name === 'read_odoo_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📄', appName: null, color: '#7C3AED',
      loadingLabel: `Lecture de ${file}…`,
      doneLabel: file,
    }
  }
  return {
    icon: '🔧', appName: null, color: '#64748b',
    loadingLabel: `${name}…`,
    doneLabel: name,
  }
}

function ToolCallGroup({ events }: { events: AiEvent[] }) {
  const [open, setOpen] = useState(false)
  const calls   = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')

  // Deduplicate: group calls by tool name + key argument (version for sources, model for odoo)
  const dedupedCalls = calls.reduce<{ call: AiEvent; count: number; key: string }[]>((acc, c) => {
    const key = c.name === 'search_odoo_source'
      ? `search_odoo_source:${c.args?.version ?? ''}`
      : c.name === 'query_odoo'
      ? `query_odoo:${c.args?.model ?? ''}`
      : `${c.name}`
    const existing = acc.find(a => a.key === key)
    if (existing) { existing.count++; return acc }
    return [...acc, { call: c, count: 1, key }]
  }, [])

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: open ? 8 : 0 }}>
        {dedupedCalls.map(({ call: c, count }, idx) => {
          const meta = getToolMeta(c.name!, c.args)
          const res  = results.find(r => r.name === c.name)
          const done = !!res
          const hasRecords = done && res!.records && res!.records.length > 0

          return (
            <button
              key={`${c.name}-${idx}`}
              onClick={() => hasRecords && setOpen(p => !p)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: done ? `${meta.color}12` : `${meta.color}06`,
                border: `1px solid ${done ? `${meta.color}45` : `${meta.color}30`}`,
                borderRadius: t.radiusFull, padding: '5px 12px 5px 8px',
                cursor: hasRecords ? 'pointer' : 'default',
                fontSize: 12, color: done ? meta.color : t.textSub, fontWeight: done ? 600 : 500,
                transition: 'all .2s', maxWidth: 340,
              }}
            >
              {/* Status dot / spinner */}
              {done ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%',
                  background: meta.color, color: '#fff', fontSize: 9, fontWeight: 800, flexShrink: 0,
                }}>
                  {c.name === 'query_odoo' || c.name === 'count_odoo' ? 'O'
                    : c.name === 'search_odoo_source' ? '⌕'
                    : c.name === 'get_odoo_fields' ? '≡'
                    : c.name === 'read_odoo_file' ? '§'
                    : '◈'}
                </span>
              ) : (
                <span style={{
                  display: 'inline-block', flexShrink: 0,
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${meta.color}`, borderTopColor: 'transparent',
                  animation: 'toolSpin .6s linear infinite',
                }} />
              )}

              {/* App icon when done */}
              {done && meta.appName && <OdooAppIcon name={meta.appName} size={13} />}
              {done && !meta.appName && <span style={{ fontSize: 12, flexShrink: 0 }}>{meta.icon}</span>}

              {/* Label */}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {done ? meta.doneLabel : meta.loadingLabel}
              </span>

              {/* Count badge */}
              {done && res!.count !== undefined && (
                <span style={{
                  background: `${meta.color}28`, borderRadius: 9999,
                  padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {res!.count}
                </span>
              )}

              {/* Deduplicated call count */}
              {count > 1 && (
                <span title={`${count} appels`} style={{
                  background: `${meta.color}22`, borderRadius: 9999,
                  padding: '1px 5px', fontSize: 10, flexShrink: 0,
                }}>×{count}</span>
              )}

              {/* Expand/done indicator */}
              {done && (
                <span style={{ fontSize: 10, color: t.muted, flexShrink: 0 }}>
                  {hasRecords ? (open ? '▲' : '▼') : '✓'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {open && results.map((r, i) => r.records && r.records.length > 0 && (
        <div key={i} style={{
          background: '#1e1e2e', borderRadius: t.radius,
          padding: '10px 12px', overflowX: 'auto', maxHeight: 220, overflowY: 'auto',
          marginTop: 4,
        }}>
          <RecordsTable records={r.records} />
        </div>
      ))}

      <style>{`
        @keyframes toolPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes toolSpin  { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function RecordsTable({ records }: { records: Record<string, unknown>[] }) {
  if (!records.length) return null
  const cols = Object.keys(records[0]).slice(0, 8)
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#cdd6f4', minWidth: '100%' }}>
      <thead>
        <tr>{cols.map(c => <th key={c} style={{ padding: '3px 10px', textAlign: 'left', borderBottom: '1px solid #45475a', color: '#89b4fa', fontWeight: 600 }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#1a1a2e' }}>
            {cols.map(c => (
              <td key={c} style={{ padding: '3px 10px', borderBottom: '1px solid #313244', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(r[c] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Markdown table with CSV export ────────────────────────────

function MarkdownTable({ headers, dataRows }: { headers: string[]; dataRows: string[][] }) {
  const [hovered, setHovered] = useState(false)

  const downloadCsv = () => {
    const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      headers.map(escape).join(','),
      ...dataRows.map(row => row.map(escape).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{ overflowX: 'auto', margin: '8px 0', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button
          onClick={downloadCsv}
          title="Exporter en CSV"
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', fontSize: 11, fontWeight: 600,
            background: t.bgCard, color: t.action,
            border: `1px solid ${t.brand40}`, borderRadius: t.radius,
            cursor: 'pointer', boxShadow: t.shadow,
            transition: 'opacity .15s',
          }}
        >
          ↓ CSV
        </button>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, j) => (
              <th key={j} style={{ padding: '6px 12px', textAlign: 'left', background: t.bgMuted, borderBottom: `2px solid ${t.border}`, fontWeight: 600, color: t.textSub }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? t.bgCard : t.bgMuted }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '5px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      result.push(
        <pre key={i} style={{ background: '#1e1e2e', borderRadius: t.radiusSm, padding: '10px 14px', overflowX: 'auto', margin: '8px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: '#cdd6f4' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const rows = tableLines.filter(l => !l.match(/^\|[-| :]+\|$/))
      if (rows.length) {
        const headers = rows[0].split('|').filter(Boolean).map(s => s.trim())
        const dataRows = rows.slice(1).map(row => row.split('|').filter(Boolean).map(c => c.trim()))
        const tableKey = i
        result.push(
          <MarkdownTable key={tableKey} headers={headers} dataRows={dataRows} />
        )
      }
      continue
    }

    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      const sizes = [18, 16, 14]
      result.push(<div key={i} style={{ fontSize: sizes[hMatch[1].length - 1], fontWeight: 700, color: t.text, margin: '12px 0 4px' }}>{hMatch[2]}</div>)
      i++; continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brand, flexShrink: 0 }}>•</span>
          <span>{inlineMarkdown(listMatch[1])}</span>
        </div>
      )
      i++; continue
    }

    if (!line.trim()) { result.push(<div key={i} style={{ height: 8 }} />); i++; continue }

    result.push(<p key={i} style={{ margin: '0 0 4px' }}>{inlineMarkdown(line)}</p>)
    i++
  }

  return <>{result}</>
}

function inlineMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}
