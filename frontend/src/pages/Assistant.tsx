import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUp, Bot, Building2, Check, CheckCheck, ChevronDown, Copy, FileText, Globe2, History, Lock, Paperclip, Settings, Square, Timer, TriangleAlert, X } from 'lucide-react'
import { listProfiles, getAiProviders, checkAllSources, getModelConfig, getUserProfile } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { Perspective, PerspectiveMode, loadPerspective, savePerspective } from '../components/PerspectiveToggle'
import MascotThinking from '../components/MascotThinking'
import ConversationContextPanel from '../components/ConversationContextPanel'
import { useWorkspaceContext } from '../components/Layout'

import { ODOO_APPS } from '../constants/odooApps'
import { PROVIDERS } from '../constants/providers'
import { useUiLanguage } from '../i18n'
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MAX_TOTAL_CHARS,
  attachmentMeta,
  attachmentPayload,
  fileKind,
  fileToBase64,
  formatFileSize,
  type AttachmentDraft,
  type AttachmentMeta,
} from '../utils/attachments'
import { routedContextFiles, useResolvedPerspective } from '../utils/aiContext'
import { countryFlag } from '../utils/countryFlag'
import { streamingSignals } from '../utils/streamingSignals'

// Module-level buffer: message arrays survive component unmount so streams
// that finish after navigation are captured and shown on remount.
const _msgBuffer = new Map<string, Message[]>()

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

// ── Types ─────────────────────────────────────────────────────

interface Profile { id: number; name: string; company_name?: string; company_logo?: string; odoo_version?: string; company_ids?: string; selected_company_id?: number; user_access_info?: string; environments?: string; active_env_id?: string; technical_complexity?: string }
interface EnvEntry { id: string; name: string; db_url: string; db_name: string; login: string; odoo_version?: string; branch?: string; github_repo?: string; repo_branch?: string }
interface L10nModule { name: string; source?: string; path?: string }
interface CompanyOption {
  id: number
  name: string
  country_code?: string
  country_name?: string
  currency?: string
  chart_template?: string
  installed_l10n_modules?: string[]
  available_l10n_modules?: L10nModule[]
}

interface AiEvent {
  type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'warning' | 'done' | 'end'
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
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text?: string
  attachments?: AttachmentMeta[]
  events?: AiEvent[]
  loading?: boolean
  timestamp?: number
  startTime?: number
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

// ── Conversation history helpers ───────────────────────────────
const LS_HISTORY = 'odoo-conv-history'
const LS_ACTIVE  = 'odoo-active-convs'

function loadHistory(): Record<string, SavedConv[]> {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) ?? '{}') } catch { return {} }
}

function parseCompanies(raw?: string): CompanyOption[] {
  try { return JSON.parse(raw ?? '[]') as CompanyOption[] } catch { return [] }
}

function companyLocalizationLabel(company?: CompanyOption | null) {
  if (!company) return undefined
  const parts = [company.country_code, company.currency].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

function technicalComplexityLabel(raw?: string) {
  try {
    const value = JSON.parse(raw ?? '{}')
    return value.label || undefined
  } catch {
    return undefined
  }
}
function persistHistory(h: Record<string, SavedConv[]>) {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(h)) } catch { /* quota */ }
}
function finalizeOrphanedMessages(msgs: Message[]): Message[] {
  return msgs.map(m => {
    if (!m.loading) return m
    const events = m.events ?? []
    const calls   = events.filter(e => e.type === 'tool_call')
    const results = events.filter(e => e.type === 'tool_result')
    const extraResults: AiEvent[] = calls
      .filter(c => !results.find(r => r.name === c.name))
      .map(c => ({ type: 'tool_result' as const, name: c.name, ok: false }))
    return {
      ...m,
      loading: false,
      events: [...events, ...extraResults, { type: 'error' as const, msg: 'Session interrompue — relancez la question.' }],
    }
  })
}
function loadActiveConvs(): Record<string, Message[]> {
  try {
    const raw: Record<string, Message[]> = JSON.parse(localStorage.getItem(LS_ACTIVE) ?? '{}')
    const activeKeys = new Set(streamingSignals.getAll().map(([k]) => k))
    const cleaned: Record<string, Message[]> = {}
    let dirty = false
    for (const [k, msgs] of Object.entries(raw)) {
      const isLive = activeKeys.has(k)
      const c = isLive ? msgs : finalizeOrphanedMessages(msgs)
      cleaned[k] = c
      if (!isLive && c !== msgs) dirty = true
    }
    if (dirty) try { localStorage.setItem(LS_ACTIVE, JSON.stringify(cleaned)) } catch { /* quota */ }
    return cleaned
  } catch { return {} }
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

const SUGGESTIONS_EN = [
  'How many unpaid invoices are there?',
  'What is the current month revenue?',
  'Show the last 10 orders',
  'How many active customers?',
  'List open CRM opportunities',
]

const SUGGESTIONS_GENERAL_EN = [
  'What are the accounting models?',
  'How does the sales workflow work?',
  'What is new in this version?',
  'How do I migrate from the previous version?',
  'Show the stock.move model structure',
]

const assistantCopy = {
  fr: {
    title: 'Assistant IA',
    description: 'Posez des questions sur vos données Odoo en langage naturel.',
    settings: 'Paramètres',
    general: 'Odoo Général',
    addApi: 'ajouter une clé API →',
    noProvider: 'Aucun fournisseur IA configuré —',
    sourcesInstalled: (v: string) => `Code source Odoo ${v} installé`,
    sourcesMissing: (v: string) => `Sources Odoo ${v} non installées`,
    repoTitle: (repo: string) => `Dépôt projet : ${repo} — source complémentaire active`,
    meetingTitle: 'Générer un compte-rendu structuré de cette conversation',
    meeting: 'Compte-rendu',
    newConvTitle: "Démarrer une nouvelle conversation (sauvegarde automatique de l'actuelle)",
    newConv: 'Nouvelle conv.',
    history: 'Historique',
    savedConversations: (n: number) => `${n} conversation(s) sauvegardée(s)`,
    sourceWarningStrong: (v: string) => `Code source Odoo ${v} non installé`,
    sourceWarning: 'les questions sur le code source ne fonctionneront pas.',
    installSources: 'Installer les sources →',
    company: 'Société :',
    inaccessibleCompany: 'Société inaccessible pour cet utilisateur',
    inaccessibleDetail: (user: string) => `L'utilisateur ${user} n'a pas accès à la société sélectionnée. Sélectionnez une société accessible ou modifiez les droits de l'utilisateur dans Odoo.`,
    removeAttachment: (name: string) => `Retirer ${name}`,
    analyzeAttachments: 'Analyse les pièces jointes.',
    configureProvider: 'Configurez un fournisseur IA dans les Paramètres',
    selectTab: 'Sélectionnez un onglet ci-dessus',
    generalPlaceholder: (v: string) => `Question générale sur Odoo ${v}… (Entrée pour envoyer)`,
    ask: 'Posez une question… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)',
    attach: 'Joindre un fichier',
    stop: 'Arrêter la génération',
    companyBlocked: 'Société inaccessible — changez de société',
    send: 'Envoyer (Entrée)',
    meta: 'Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne',
    files: 'fichier(s)',
    truncated: 'texte tronqué côté serveur',
    emptyHistory: 'Aucune conversation sauvegardée',
    close: 'Fermer',
    deleteConversation: 'Supprimer la conversation',
    resume: 'Reprendre',
    activeEnv: 'Environnement actif',
    default: 'défaut',
    recommended: 'Recommandé',
    copyTitle: 'Copier la réponse',
    thinking: 'Réflexion en cours…',
    analyzing: 'Analyse des résultats et rédaction de la réponse…',
    tokens: 'Tokens utilisés (entrée ↑ + sortie ↓)',
    copied: 'Copié !',
    copy: 'Copier',
  },
  en: {
    title: 'AI Assistant',
    description: 'Ask questions about your Odoo data in natural language.',
    settings: 'Settings',
    general: 'Odoo General',
    addApi: 'add an API key →',
    noProvider: 'No AI provider configured —',
    sourcesInstalled: (v: string) => `Odoo ${v} source code installed`,
    sourcesMissing: (v: string) => `Odoo ${v} sources not installed`,
    repoTitle: (repo: string) => `Project repository: ${repo} — additional source active`,
    meetingTitle: 'Generate structured meeting minutes from this conversation',
    meeting: 'Meeting minutes',
    newConvTitle: 'Start a new conversation (current one is saved automatically)',
    newConv: 'New conv.',
    history: 'History',
    savedConversations: (n: number) => `${n} saved conversation(s)`,
    sourceWarningStrong: (v: string) => `Odoo ${v} source code not installed`,
    sourceWarning: 'source-code questions will not work.',
    installSources: 'Install sources →',
    company: 'Company:',
    inaccessibleCompany: 'Company inaccessible for this user',
    inaccessibleDetail: (user: string) => `User ${user} does not have access to the selected company. Select an accessible company or update the user's rights in Odoo.`,
    removeAttachment: (name: string) => `Remove ${name}`,
    analyzeAttachments: 'Analyze the attachments.',
    configureProvider: 'Configure an AI provider in Settings',
    selectTab: 'Select a tab above',
    generalPlaceholder: (v: string) => `General question about Odoo ${v}… (Enter to send)`,
    ask: 'Ask a question… (Enter to send, Shift+Enter for a new line)',
    attach: 'Attach a file',
    stop: 'Stop generation',
    companyBlocked: 'Company inaccessible — change company',
    send: 'Send (Enter)',
    meta: 'Enter to send · Shift+Enter for a new line',
    files: 'file(s)',
    truncated: 'text truncated server-side',
    emptyHistory: 'No saved conversations',
    close: 'Close',
    deleteConversation: 'Delete conversation',
    resume: 'Resume',
    activeEnv: 'Active environment',
    default: 'default',
    recommended: 'Recommended',
    copyTitle: 'Copy answer',
    thinking: 'Thinking…',
    analyzing: 'Analyzing results and drafting the answer…',
    tokens: 'Tokens used (input ↑ + output ↓)',
    copied: 'Copied!',
    copy: 'Copy',
  },
}

const ODOO_VERSIONS_BASE = ['19.0', '18.0', '17.0', '16.0', '15.0']

const GENERAL_KEY = 'general'
// ── Main page ─────────────────────────────────────────────────

export default function Assistant() {
  const lang = useUiLanguage()
  const { contextOpen } = useWorkspaceContext()
  const c = assistantCopy[lang]
  const location = useLocation()
  const { data: profData }  = useQuery({ queryKey: ['profiles'],      queryFn: listProfiles })
  const { data: provData }  = useQuery({ queryKey: ['ai-providers'],  queryFn: getAiProviders })
  const { data: srcData }   = useQuery({ queryKey: ['sources-all'],   queryFn: checkAllSources, staleTime: 30_000 })
  const { data: modelCfg }  = useQuery({ queryKey: ['model-config'],  queryFn: getModelConfig })
  const { data: userProfileData } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile })
  const userProfile = userProfileData?.data as { mascotType?: 'robot' | 'cat' | 'dog'; mascotColor?: string } | undefined

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
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null)   // null = use profile default
  const [generalVersion, setGeneralVersion] = useState('19.0')

  // Conversations keyed by string (profile id as string, or 'general')
  // Initialized from localStorage so they survive page refresh
  const [conversations, setConversations] = useState<Record<string, Message[]>>(() => loadActiveConvs())
  const [savedConvs,    setSavedConvs]    = useState<Record<string, SavedConv[]>>(() => loadHistory())
  const [showHistory,   setShowHistory]   = useState(false)

  const convKey = profileId !== null ? String(profileId) : null
  // On convKey change: if the buffer has fresher messages (from a stream that
  // completed while we were on another page), merge them into React state.
  useEffect(() => {
    if (!convKey) return
    const buffered = _msgBuffer.get(convKey)
    if (buffered && buffered.length > 0) {
      setConversations(prev => {
        const existing = prev[convKey] ?? []
        if (buffered.length > existing.length) return { ...prev, [convKey]: buffered }
        return prev
      })
    }
  }, [convKey])
  const messages = convKey ? (conversations[convKey] ?? []) : []

  // Auto-persist active conversations to localStorage
  useEffect(() => { persistActiveConvs(conversations) }, [conversations])

  // Subscribe to streaming signals so tab dots re-render when streams complete
  const [, _rerenderSig] = useState(0)
  useEffect(() => streamingSignals.subscribe(() => _rerenderSig(n => n + 1)), [])

  // Track mount state so we know if the user is watching when a stream ends
  const isMountedRef = useRef(true)
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false } }, [])

  // Clear done signal as soon as user opens this page (they're now reading it)
  useEffect(() => {
    if (!convKey) return
    const sig = streamingSignals.getAll().find(([k]) => k === convKey)?.[1]
    if (sig?.status === 'done') streamingSignals.clear(convKey)
  }, [convKey])

  const [input,     setInput]    = useState('')
  const [streaming, setStreaming] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const streamingRef = useRef(false)

  // Keep streamingRef in sync so the scroll handler never reads stale state
  useEffect(() => { streamingRef.current = streaming }, [streaming])

  // Collapse top bar on scroll — frozen during streaming to prevent header oscillation
  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const onScroll = () => {
      if (streamingRef.current) return
      const top = el.scrollTop
      setIsScrolled(prev => {
        if (!prev && top > 80) return true
        if (prev && top < 20) return false
        return prev
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const [perspectiveMode, setPerspectiveState] = useState<PerspectiveMode>(() => loadPerspective('assistant', 'auto'))
  const perspectivePrompt = input.trim() || [...messages].reverse().find(m => m.role === 'user')?.text || ''
  const perspective = useResolvedPerspective(perspectiveMode, perspectivePrompt, 'business_analyst')
  const setPerspective = (p: PerspectiveMode) => { setPerspectiveState(p); savePerspective('assistant', p) }

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
    setActiveEnvId(null)  // reset env override when switching profiles
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

  const assistantRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id ?? null

  // When a brand-new assistant response appears, anchor the viewport at its TOP
  // so the user sees the start of the response (not the bottom).
  useEffect(() => {
    if (!lastAssistantId) return
    const el = assistantRefs.current.get(lastAssistantId)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [lastAssistantId])

  // During streaming, keep scrolling to bottom unless the user has scrolled up
  useEffect(() => {
    if (!streaming) return
    const el = messageListRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 120) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  const isGeneralMode = profileId === GENERAL_KEY
  const selectedProfile = profiles.find(p => p.id === profileId)
  const currentProv = configuredProviders.find(p => p.id === provider)

  const promptSuggestions =
    messages.length === 0 && profileId !== null && !input.trim()
      ? (lang === 'en'
        ? (isGeneralMode ? SUGGESTIONS_GENERAL_EN : SUGGESTIONS_EN)
        : (isGeneralMode ? SUGGESTIONS_GENERAL : SUGGESTIONS))
      : []

  const sourcesStatus: Record<string, { installed: boolean }> = srcData?.data ?? {}
  const activeVersion = isGeneralMode ? generalVersion : (selectedProfile?.odoo_version ?? null)
  // Sources installed = community OR enterprise variant found on disk
  const sourcesInstalled = activeVersion
    ? (sourcesStatus[activeVersion]?.installed === true || sourcesStatus[`${activeVersion}-enterprise`]?.installed === true)
    : false
  const enterpriseInstalled = activeVersion ? sourcesStatus[`${activeVersion}-enterprise`]?.installed === true : false
  const communityInstalled  = activeVersion ? sourcesStatus[activeVersion]?.installed === true : false

  // Active env repo detection
  const activeEnvObj = (() => {
    if (!selectedProfile) return null
    const envs: EnvEntry[] = (() => { try { return JSON.parse(selectedProfile.environments ?? '[]') as EnvEntry[] } catch { return [] } })()
    const effectiveId = activeEnvId ?? selectedProfile.active_env_id ?? envs[0]?.id
    return envs.find(e => e.id === effectiveId) ?? envs[0] ?? null
  })()
  const activeEnvRepo = activeEnvObj?.github_repo ?? null
  const activeCompany = (() => {
    if (!selectedProfile) return null
    const companies = parseCompanies(selectedProfile.company_ids)
    if (companies.length === 0) return null
    const activeId = selectedCompanyId ?? selectedProfile.selected_company_id ?? companies[0]?.id
    return companies.find(company => company.id === activeId) ?? companies[0] ?? null
  })()
  const activeCompanyName = activeCompany?.name
  const activeCompanyLocalization = companyLocalizationLabel(activeCompany)
  const activeComplexity = technicalComplexityLabel(selectedProfile?.technical_complexity)
  const complexityParsed = (() => { try { return JSON.parse(selectedProfile?.technical_complexity ?? '{}') } catch { return {} } })()
  const repoIsCloned = ((complexityParsed?.dev?.repositories ?? []) as Array<{ cloned: boolean }>).some(r => r.cloned)
  const contextFiles = routedContextFiles({
    prompt: perspectivePrompt,
    perspective,
    version: activeVersion,
    migration: false,
  })
  const conversationSources = [
    activeVersion && sourcesInstalled ? `Sources Odoo ${activeVersion}${communityInstalled && enterpriseInstalled ? ' C+E' : communityInstalled ? ' Community' : ' Enterprise'}` : null,
    activeEnvRepo && repoIsCloned ? activeEnvRepo.split('/').slice(-2).join('/').replace(/\.git$/, '') : null,
  ].filter(Boolean) as string[]

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
    setConversations(prev => {
      const next = fn(prev[convKey] ?? [])
      _msgBuffer.set(convKey, next)  // survives unmount
      return { ...prev, [convKey]: next }
    })
  }

  const addAttachmentError = (file: File, error: string) => {
    const kind = fileKind(file) ?? 'text'
    setAttachments(prev => [
      ...prev,
      {
        id: `${Date.now()}-${file.name}-error`,
        name: file.name,
        mime_type: file.type,
        size: file.size,
        kind,
        status: 'error',
        error,
      },
    ])
  }

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length || streaming) return

    const currentReady = attachments.filter(a => a.status === 'ready').length
    const slots = ATTACHMENT_MAX_FILES - currentReady
    if (slots <= 0) {
      addAttachmentError(files[0], `Maximum ${ATTACHMENT_MAX_FILES} fichiers par message`)
      return
    }

    for (const file of files.slice(0, slots)) {
      const kind = fileKind(file)
      if (!kind) {
        addAttachmentError(file, 'Format non supporté')
        continue
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        addAttachmentError(file, 'Fichier supérieur à 5 MB')
        continue
      }

      try {
        const base = {
          id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          mime_type: file.type || (kind === 'pdf' ? 'application/pdf' : 'text/plain'),
          size: file.size,
          kind,
          status: 'ready' as const,
        }
        const draft: AttachmentDraft = kind === 'pdf'
          ? { ...base, content_base64: await fileToBase64(file) }
          : { ...base, text: await file.text() }
        setAttachments(prev => [...prev.filter(a => a.status === 'ready'), draft].slice(0, ATTACHMENT_MAX_FILES))
      } catch (err) {
        addAttachmentError(file, err instanceof Error ? err.message : 'Lecture impossible')
      }
    }

    if (files.length > slots) {
      addAttachmentError(files[slots], `Maximum ${ATTACHMENT_MAX_FILES} fichiers par message`)
    }
  }

  const readyAttachments = attachments.filter(a => a.status === 'ready')
  const attachmentChars = readyAttachments.reduce((sum, a) => sum + (a.text?.length ?? 0), 0)

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
    const assistantMsg: Message = { id: String(crNow + 1), role: 'assistant', events: [], loading: true, startTime: crNow }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const body = isGeneralMode
        ? { provider, profile_id: null, version: generalVersion, messages: history, model: modelId, perspective }
        : { provider, profile_id: profileId, company_id: selectedCompanyId ?? undefined, active_env_id: activeEnvId ?? undefined, messages: history, model: modelId, perspective }
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

  const sendWithText = async (text: string, overrideVersion?: string, attached: AttachmentDraft[] = []) => {
    if ((!text.trim() && attached.length === 0) || streaming || profileId === null || !provider) return

    const now = Date.now()
    const attachedMeta = attached.map(attachmentMeta)
    const userMsg: Message      = { id: String(now), role: 'user', text, attachments: attachedMeta, timestamp: now }
    const assistantMsg: Message = { id: String(now + 1), role: 'assistant', events: [], loading: true, startTime: now }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    if (convKey) {
      const sigLabel = isGeneralMode ? `Odoo ${generalVersion}` : (selectedProfile?.name ?? convKey)
      streamingSignals.set(convKey, { status: 'streaming', label: sigLabel, pageKey: 'assistant' })
    }

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
      const cleanAttachments = attached.map(attachmentPayload)
      const body = useGeneral
        ? { provider, profile_id: null, version: useVersion, messages: history, model: modelId, perspective }
        : { provider, profile_id: profileId, company_id: selectedCompanyId ?? undefined, active_env_id: activeEnvId ?? undefined, messages: history, model: modelId, perspective }
      if (cleanAttachments.length > 0) {
        Object.assign(body, { attachments: cleanAttachments })
      }

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
      if (attached.length > 0) setAttachments([])

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
      if (err instanceof Error && err.name === 'AbortError') { if (convKey) streamingSignals.clear(convKey); return }
      appendEvent(assistantMsg.id, { type: 'error', msg: String(err) })
    } finally {
      setStreaming(false)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, loading: false } : m
      ))
      // If user is watching right now, no need for the "done" indicator — clear directly
      if (convKey) {
        if (isMountedRef.current) streamingSignals.clear(convKey)
        else streamingSignals.done(convKey)
      }
    }
  }

  const send = async () => {
    const attached = readyAttachments
    if (!input.trim() && attached.length === 0) return
    const text = input.trim() || c.analyzeAttachments
    setInput('')
    await sendWithText(text, undefined, attached)
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
    if (convKey) {
      setConversations(prev => ({ ...prev, [convKey]: [] }))
      _msgBuffer.delete(convKey)
      streamingSignals.clear(convKey)
    }
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
    <div className={`assistant-shell${isScrolled ? ' is-scrolled' : ''}`}>

      <PageHeader
        title={c.title}
        description={c.description}
        action={<Link to="/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }}><Settings size={15} /> {c.settings}</Link>}
      />

      {/* ── Context bar ── */}
      <div className="assistant-context">

        {/* ── Row 1 : Project tabs + version selector ── */}
        {/* Outer wrapper keeps the version dropdown OUTSIDE the overflow:auto tabs area */}
        <div className="assistant-project-row">
          {/* Scrollable tabs area */}
          <div className="assistant-tabs">
          {/* General tab */}
          {(() => {
            const isActive = isGeneralMode
            const sig = streamingSignals.getAll().find(([k]) => k === GENERAL_KEY)?.[1]
            return (
              <button onClick={() => setProfileId(GENERAL_KEY)} className={`assistant-tab-button${isActive ? ' is-active' : ''}`}>
                <Globe2 size={14} /> {c.general}
                {sig && <span className={`stream-dot stream-dot--${sig.status}`} aria-hidden />}
              </button>
            )
          })()}

          {/* Separator dot */}
          {profiles.length > 0 && (
            <span style={{ alignSelf: 'center', color: t.border, fontSize: 13, userSelect: 'none', padding: '0 2px' }}>│</span>
          )}

          {/* Project tabs */}
          {profiles.map(p => {
            const isActive = p.id === profileId
            const tabSigEntry = streamingSignals.getAll().find(([k]) => k === String(p.id))
            const tabSig = tabSigEntry?.[1]
            return (
              <button key={p.id} onClick={() => setProfileId(p.id)} className={`assistant-tab-button${isActive ? ' is-active' : ''}`}>
                {p.company_logo
                  ? <img src={p.company_logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain', borderRadius: 2 }} />
                  : <Building2 size={14} />
                }
                {p.name}
                {tabSig && <span className={`stream-dot stream-dot--${tabSig.status}`} aria-hidden />}
              </button>
            )
          })}
          </div>{/* end scrollable tabs */}

          {/* Version badge / dropdown — outside overflow:auto so its dropdown isn't clipped */}
          <div className="assistant-version-slot">
            {isGeneralMode ? (
              <VersionDropdown
                value={generalVersion}
                onChange={setGeneralVersion}
                versions={installedVersions}
                sourcesStatus={sourcesStatus}
              />
            ) : activeVersion ? (
              <span className="assistant-version-badge">
                Odoo {activeVersion}
                {(communityInstalled || enterpriseInstalled) && (
                  <span style={{ fontSize: 9, opacity: 0.7 }}>
                    {communityInstalled && enterpriseInstalled ? 'C+E' : communityInstalled ? 'C' : 'E'}
                  </span>
                )}
              </span>
            ) : null}
          </div>{/* end version dropdown container */}
        </div>{/* end row 1 outer wrapper */}

        {/* ── Row 2 : AI config + conversation actions ── */}
        <div className="assistant-control-row">
          {configuredProviders.length === 0 ? (
            <div style={{ fontSize: 13, color: t.muted }}>
              {c.noProvider}{' '}
              <Link to="/settings" style={{ color: t.brand, fontWeight: 600 }}>{c.addApi}</Link>
            </div>
          ) : (
            <>
              <AiSelector
                providers={configuredProviders}
                provider={provider}
                modelId={modelId}
                switchProvider={switchProvider}
                setModelId={setModelId}
              />

              {/* Env selector — project mode only */}
              {selectedProfile && !isGeneralMode && (
                <EnvSelector
                  profile={selectedProfile}
                  activeEnvId={activeEnvId}
                  onChange={setActiveEnvId}
                />
              )}

              <div className="assistant-control-spacer" />

              {/* Conversation action buttons */}
              {(messages.length > 0 || (convKey && (savedConvs[convKey] ?? []).length > 0)) && (
                <div className="assistant-control-group">
                  {messages.length > 0 && (
                    <>
                      <button
                        onClick={makeMeetingMinute} disabled={streaming}
                        title={c.meetingTitle}
                        className="assistant-soft-action">
                        <FileText size={13} /> <span>{c.meeting}</span>
                      </button>
                      <button
                        onClick={resetCurrentConversation}
                        title={c.newConvTitle}
                        className="assistant-soft-action">
                        <Bot size={13} /> <span>{c.newConv}</span>
                      </button>
                    </>
                  )}
                  {convKey && (savedConvs[convKey] ?? []).length > 0 && (
                    <button
                      onClick={() => setShowHistory(h => !h)}
                      title={c.savedConversations((savedConvs[convKey] ?? []).length)}
                      className={`assistant-soft-action${showHistory ? ' is-active' : ''}`}>
                      <History size={13} /> <span>{c.history} ({(savedConvs[convKey] ?? []).length})</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sources warning banner */}
      {activeVersion && !sourcesInstalled && (
        <div className="assistant-source-warning">
          <TriangleAlert size={17} />
          <div style={{ fontSize: 12, flex: 1 }}>
            <strong>{c.sourceWarningStrong(activeVersion)}</strong> — {c.sourceWarning}{' '}
            <Link to="/sources" style={{ color: t.warning, fontWeight: 600 }}>{c.installSources}</Link>
          </div>
        </div>
      )}

      {/* Main content row: chat + optional history panel */}
      <div className="assistant-main">
      <div className="assistant-chat-panel">

      {/* Chat history */}
      <div className="assistant-message-list" ref={messageListRef}>

        {messages.map(msg => (
          msg.role === 'user'
            ? <UserBubble key={msg.id} text={msg.text ?? ''} attachments={msg.attachments} timestamp={msg.timestamp} />
            : (
              <div
                key={msg.id}
                ref={el => { assistantRefs.current.set(msg.id, el) }}
                style={{ scrollMarginTop: 8 }}
              >
                <AssistantBubble events={msg.events ?? []} loading={msg.loading} provider={provider} timestamp={msg.timestamp} startTime={msg.startTime} inputTokens={msg.inputTokens} outputTokens={msg.outputTokens} projectName={isGeneralMode ? undefined : selectedProfile?.name} mascotType={userProfile?.mascotType} mascotColor={userProfile?.mascotColor} />
              </div>
            )
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Company selector bar (shown when profile has multiple companies) */}
      {selectedProfile && !isGeneralMode && (() => {
        const companies = parseCompanies(selectedProfile.company_ids)
        if (companies.length <= 1) return null
        const activeId = selectedCompanyId ?? companies[0]?.id ?? null
        const accessInfo = (() => { try { return selectedProfile.user_access_info ? JSON.parse(selectedProfile.user_access_info) : null } catch { return null } })()
        const activeCompanyAccessible = !accessInfo || !activeId || accessInfo.accessible_company_ids.includes(activeId)
        return (
          <>
            <div className="assistant-company-bar">
              <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>{c.company}</span>
              {companies.map(c => {
                const isActive = activeId === c.id
                const isAccessible = !accessInfo || accessInfo.accessible_company_ids.includes(c.id)
                return (
                  <button key={c.id}
                    onClick={() => isAccessible && setSelectedCompanyId(c.id)}
                    disabled={!isAccessible}
                    title={!isAccessible ? `L'utilisateur ${accessInfo?.user_name} n'a pas accès à cette société` : (c.country_name ?? undefined)}
                    className={`assistant-company-button${isActive ? ' is-active' : ''}`}>
                    {!isAccessible && <Lock size={11} />}
                    {countryFlag(c.country_code) && <span style={{ fontSize: 13, lineHeight: 1 }}>{countryFlag(c.country_code)}</span>}
                    {c.name}
                    {companyLocalizationLabel(c) && <small>{companyLocalizationLabel(c)}</small>}
                  </button>
                )
              })}
            </div>
            {!activeCompanyAccessible && (
              <div style={{
                flexShrink: 0, padding: '10px 14px', marginBottom: 4,
                background: t.dangerBg, border: `1px solid ${t.danger}`, borderRadius: t.radius,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Lock size={18} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.danger, marginBottom: 2 }}>{c.inaccessibleCompany}</div>
                  <div style={{ fontSize: 12, color: t.danger }}>
                    {c.inaccessibleDetail(accessInfo?.user_name ?? '')}
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Input area */}
      <div className="assistant-composer">
        <div
          className={`assistant-composer-inner${draggingFiles ? ' is-dragging' : ''}`}
          onDragEnter={e => { e.preventDefault(); setDraggingFiles(true) }}
          onDragOver={e => { e.preventDefault(); setDraggingFiles(true) }}
          onDragLeave={e => { if (e.currentTarget === e.target) setDraggingFiles(false) }}
          onDrop={e => {
            e.preventDefault()
            setDraggingFiles(false)
            addFiles(e.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,.json,.xml,.py,.log,.pdf,text/plain,text/markdown,text/csv,application/json,application/xml,text/xml,application/pdf"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files) addFiles(e.target.files)
              e.currentTarget.value = ''
            }}
          />
          {promptSuggestions.length > 0 && (
            <div className="assistant-composer-suggestions">
              {promptSuggestions.map(s => (
                <button key={s} type="button" onClick={() => setInput(s)} className="assistant-composer-suggestion">
                  {s}
                </button>
              ))}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="assistant-attachments">
              {attachments.map(att => (
                <div key={att.id} className={`assistant-attachment-chip${att.status === 'error' ? ' is-error' : ''}`} title={att.error ?? att.name}>
                  {att.kind === 'pdf' ? <FileText size={13} /> : <Paperclip size={13} />}
                  <span className="assistant-attachment-name">{att.name}</span>
                  <span className="assistant-attachment-size">{formatFileSize(att.size)}</span>
                  {att.status === 'error' && <span className="assistant-attachment-error">{att.error}</span>}
                  <button type="button" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} aria-label={c.removeAttachment(att.name)}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={
              configuredProviders.length === 0
                ? c.configureProvider
                : profileId === null
                ? c.selectTab
                : isGeneralMode
                ? c.generalPlaceholder(generalVersion)
                : c.ask
            }
            disabled={configuredProviders.length === 0 || profileId === null}
            rows={3}
            className="assistant-textarea"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || readyAttachments.length >= ATTACHMENT_MAX_FILES}
            title={c.attach}
            className="assistant-attach-button"
          >
            <Paperclip size={16} />
          </button>
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={configuredProviders.length === 0 || profileId === null || (!streaming && ((!input.trim() && readyAttachments.length === 0) || companyAccessBlocked))}
            title={streaming ? c.stop : companyAccessBlocked ? c.companyBlocked : c.send}
            className={`assistant-send-button${streaming ? ' is-streaming' : ''}`}
          >
            {streaming ? <Square size={15} /> : <ArrowUp size={18} />}
          </button>
        </div>
        <div className="assistant-composer-meta">
          <span>
            {c.meta}
            {readyAttachments.length > 0 && ` · ${readyAttachments.length}/${ATTACHMENT_MAX_FILES} ${c.files}`}
            {attachmentChars > ATTACHMENT_MAX_TOTAL_CHARS && ` · ${c.truncated}`}
          </span>
          {currentProv && <span>{currentProv.label} · {currentProv.models.find(m => m.id === modelId)?.label}</span>}
        </div>
      </div>
      </div>

      {/* History panel */}
      {showHistory && convKey && (
        <div className="assistant-history-panel">
          <div style={{ padding: '12px 14px 10px', borderBottom: `var(--neo-border-w) solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: t.text, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <History size={14} /> {c.history}
            </span>
            <button onClick={() => setShowHistory(false)} className="ui-icon-button" aria-label={c.close} title={c.close}><X size={15} /></button>
          </div>
          {(savedConvs[convKey] ?? []).length === 0
            ? <div style={{ padding: '20px 14px', fontSize: 12, color: t.muted, textAlign: 'center' }}>{c.emptyHistory}</div>
            : (savedConvs[convKey] ?? []).map(conv => (
              <div key={conv.id} style={{
                padding: '11px 14px', borderBottom: `1px solid ${t.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 650, color: t.text, lineHeight: 1.4, flex: 1 }}
                    title={conv.title}>{conv.title}</span>
                  <button onClick={() => deleteConv(convKey, conv.id)}
                    className="ui-icon-button" aria-label={c.deleteConversation} title={c.deleteConversation}><X size={14} /></button>
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
                  style={{ marginTop: 3, fontSize: 11, padding: '5px 10px' }}>
                  <History size={12} /> {c.resume}
                </button>
              </div>
            ))
          }
        </div>
      )}
      {contextOpen && (
        <ConversationContextPanel
          mode={perspectiveMode}
          effectivePerspective={perspective}
          onModeChange={setPerspective}
          disabled={streaming}
          provider={currentProv?.label}
          model={currentProv?.models.find(m => m.id === modelId)?.label}
          project={isGeneralMode ? undefined : selectedProfile?.name}
          environment={activeEnvObj?.name}
          company={activeCompanyName}
          countryCode={activeCompany?.country_code}
          localization={activeCompanyLocalization}
          complexity={activeComplexity}
          version={activeVersion}
          repo={activeEnvRepo}
          contextFiles={contextFiles}
          sources={conversationSources}
          attachments={readyAttachments.map(a => a.name)}
        />
      )}
      </div>
    </div>
  )
}

// ── Model dropdown ─────────────────────────────────────────────

// ── Environment selector (per-conversation override) ─────────────

function EnvSelector({ profile, activeEnvId, onChange }: {
  profile: Profile
  activeEnvId: string | null
  onChange: (id: string | null) => void
}) {
  const lang = useUiLanguage()
  const c = assistantCopy[lang]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const envs: EnvEntry[] = (() => { try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] } })()
  if (envs.length === 0) return null

  const defaultId = profile.active_env_id ?? envs[0]?.id
  const currentId = activeEnvId ?? defaultId
  const currentEnv = envs.find(e => e.id === currentId) ?? envs[0]
  const isOverridden = activeEnvId !== null && activeEnvId !== defaultId
  const isProd = currentEnv.id === envs[0]?.id

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (envs.length === 1) {
    return (
      <span className="assistant-env-trigger" style={{ cursor: 'default', pointerEvents: 'none' }}>
        {currentEnv.name}
      </span>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className={`assistant-env-trigger${isOverridden ? ' is-override' : ''}`}>
        {isOverridden && <span style={{ fontSize: 9 }}>⚡</span>}
        {currentEnv.name}
        {currentEnv.odoo_version && (
          <span style={{ fontSize: 9, opacity: 0.7 }}>v{currentEnv.odoo_version.split('.')[0]}</span>
        )}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div className="assistant-dropdown-panel align-right" style={{ minWidth: 220 }}>
          <div className="assistant-dropdown-header">{c.activeEnv}</div>
          {envs.map(env => {
            const isActive = env.id === currentId
            const isDefault = env.id === defaultId
            return (
              <button key={env.id}
                onClick={() => { onChange(env.id === defaultId ? null : env.id); setOpen(false) }}
                className={`assistant-dropdown-item${isActive ? ' is-active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{env.name}</span>
                  {isDefault && (
                    <span style={{ fontSize: 9, color: t.muted, background: t.bgMuted, padding: '1px 5px', fontFamily: 'var(--font-mono)' }}>
                      {c.default}
                    </span>
                  )}
                  {isActive && !isDefault && (
                    <span style={{ fontSize: 9, color: t.warning, background: t.warningBg, padding: '1px 5px', fontFamily: 'var(--font-mono)' }}>
                      ⚡
                    </span>
                  )}
                  {isActive && <Check size={11} />}
                </div>
                <div style={{ fontSize: 10, color: t.muted, fontFamily: 'var(--font-mono)' }}>
                  {env.db_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  {env.odoo_version && ` · v${env.odoo_version.split('.')[0]}`}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Unified AI provider + model selector ──────────────────────────

function AiSelector({ providers, provider, modelId, switchProvider, setModelId }: {
  providers: typeof PROVIDERS
  provider: string
  modelId: string
  switchProvider: (id: string) => void
  setModelId: (id: string) => void
}) {
  const lang = useUiLanguage()
  const c = assistantCopy[lang]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentProv = providers.find(p => p.id === provider)
  const currentModel = currentProv?.models.find(m => m.id === modelId) ?? currentProv?.models[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentProv) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="assistant-env-trigger">
        <span style={{ fontWeight: 700, color: currentProv.color }}>{currentProv.label}</span>
        <span style={{ color: t.border }}>·</span>
        <span style={{ fontWeight: 600 }}>{currentModel?.label}</span>
        {currentModel?.recommended && (
          <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', padding: '1px 4px', fontWeight: 700 }}>★</span>
        )}
        <ChevronDown size={11} color={t.muted} style={{ marginLeft: 1 }} />
      </button>

      {open && (
        <div className="assistant-dropdown-panel" style={{ minWidth: 300, maxHeight: 420, overflowY: 'auto' }}>
          {providers.map((prov, pi) => (
            <div key={prov.id}>
              {pi > 0 && <div style={{ height: 1, background: t.border }} />}
              <div className="assistant-dropdown-header" style={{ color: prov.color, background: `${prov.color}08` }}>
                {prov.label}
              </div>
              {prov.models.map(m => {
                const isSelected = provider === prov.id && modelId === m.id
                return (
                  <button key={m.id}
                    onClick={() => { if (provider !== prov.id) switchProvider(prov.id); setModelId(m.id); setOpen(false) }}
                    className={`assistant-dropdown-item${isSelected ? ' is-active' : ''}`}
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                      borderLeftColor: isSelected ? prov.color : 'transparent',
                      background: isSelected ? `${prov.color}10` : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: isSelected ? prov.color : t.text }}>{m.label}</span>
                      {m.recommended && (
                        <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', padding: '1px 5px', fontWeight: 700 }}>{c.recommended}</span>
                      )}
                    </div>
                    {m.desc && <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>}
                    {m.tags && m.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {m.tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 9, padding: '1px 6px',
                            background: `${prov.color}18`, color: prov.color,
                            border: `1px solid ${prov.color}30`, fontWeight: 600,
                          }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function ModelDropdown({ provider, selected, onChange }: {
  provider: typeof PROVIDERS[0]; selected: string; onChange: (id: string) => void
}) {
  const lang = useUiLanguage()
  const c = assistantCopy[lang]
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
        {current.recommended && <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>★</span>}
        <ChevronDown size={12} color={t.muted} style={{ marginLeft: 2 }} />
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
                  <span style={{ fontSize: 9, background: t.successSolid, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 2 }}>
                    {c.recommended}
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
      <button onClick={() => setOpen(o => !o)} className="assistant-version-trigger">
        Odoo {value}
        {(currentC || currentE) && (
          <span style={{ fontSize: 9, opacity: 0.78 }}>
            {currentC && currentE ? 'C+E' : currentC ? 'C' : 'E'}
          </span>
        )}
        <ChevronDown size={11} style={{ opacity: .6 }} />
      </button>
      {open && (
        <div className="assistant-dropdown-panel align-right" style={{ minWidth: 160 }}>
          {versions.map(v => {
            const hasC = hasCommunity(v)
            const hasE = hasEnterprise(v)
            const isInter = isIntermediate(v)
            const isActive = v === value
            return (
              <button key={v} onClick={() => { onChange(v); setOpen(false) }}
                className={`assistant-dropdown-item${isActive ? ' is-active' : ''}`}
              >
                <span style={{ flex: 1 }}>
                  {isInter ? <span style={{ fontSize: 11, color: t.muted }}>↳ </span> : null}
                  {v}
                </span>
                <span style={{ display: 'flex', gap: 3 }}>
                  {hasC && (
                    <span title="Community installé" style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', background: t.infoBg, color: t.info }}>C</span>
                  )}
                  {hasE && (
                    <span title="Enterprise installé" style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', background: t.warningBg, color: t.warning }}>E</span>
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

function UserBubble({ text, attachments, timestamp }: { text: string; attachments?: AttachmentMeta[]; timestamp?: number }) {
  const time = fmtTime(timestamp)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--brand)', color: 'var(--brand-contrast)',
          borderRadius: `${t.radiusLg} ${t.radiusLg} 4px ${t.radiusLg}`,
          fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {text}
          {attachments && attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {attachments.map(att => (
                <span key={`${att.name}-${att.size}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 7px', borderRadius: 999,
                  background: 'rgba(0,0,0,.18)', border: '1px solid rgba(0,0,0,.22)',
                  color: 'var(--brand-contrast)', fontSize: 11, fontWeight: 650, maxWidth: 260,
                }}>
                  <Paperclip size={12} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                  <span style={{ opacity: .72, flexShrink: 0 }}>{formatFileSize(att.size)}</span>
                </span>
              ))}
            </div>
          )}
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

function AssistantBubble({ events, loading, provider, timestamp, startTime, inputTokens, outputTokens, projectName, mascotType, mascotColor }: {
  events: AiEvent[]; loading?: boolean; provider: string
  timestamp?: number; startTime?: number; inputTokens?: number; outputTokens?: number
  projectName?: string
  mascotType?: 'robot' | 'cat' | 'dog'
  mascotColor?: string
}) {
  const lang = useUiLanguage()
  const c = assistantCopy[lang]
  const prov = PROVIDERS.find(p => p.id === provider)
  const textEvt   = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt  = events.find(e => e.type === 'error')
  const warningEvts = events.filter(e => e.type === 'warning')
  const time   = fmtTime(timestamp)
  const tokens = fmtTokens(inputTokens, outputTokens)
  const elapsed = (timestamp && startTime && timestamp > startTime)
    ? (() => { const s = (timestamp - startTime) / 1000; return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` })()
    : null
  const [copied, setCopied] = useState(false)

  function copyText() {
    if (!textEvt?.content) return
    navigator.clipboard.writeText(textEvt.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
        {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} projectName={projectName} />}

        {textEvt?.content && (
          <div style={{
            position: 'relative',
            background: t.bgCard, border: `1px solid ${t.border}`,
            borderRadius: `4px ${t.radiusLg} ${t.radiusLg} ${t.radiusLg}`,
            padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: t.text,
          }}>
            <button
              onClick={copyText}
              title={c.copyTitle}
              style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, border: `1px solid ${t.border}`,
                borderRadius: t.radius, background: t.bg, cursor: 'pointer',
                color: copied ? t.success : t.muted, opacity: 0.8,
                transition: 'opacity .15s, color .15s',
              }}
            >
              {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
            </button>
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

        {warningEvts.map((w, i) => (
          <div key={i} style={{
            background: t.bgMuted, border: `1px solid ${t.border}`,
            borderRadius: t.radius, padding: '8px 12px', fontSize: 12, color: t.textSub,
            marginTop: 6,
          }}>
            ⚠ {w.msg}
          </div>
        ))}

        {loading && !textEvt && !errorEvt && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginTop: toolEvents.length > 0 ? 10 : 0,
            padding: '8px 14px 8px 8px',
            background: t.bgMuted,
            border: `1px solid ${t.border}`,
            borderRadius: t.radiusLg,
            fontSize: 13, color: t.textSub,
          }}>
            <MascotThinking size={44} mascot={mascotType} color={mascotColor} />
            <span style={{ fontWeight: 500 }}>
              {toolEvents.length > 0 ? c.analyzing : c.thinking}
            </span>
          </div>
        )}

        {(time || tokens || elapsed || textEvt?.content) && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 10, color: t.muted, paddingLeft: 2 }}>
            {time && <span>{time}</span>}
            {elapsed && <span title={lang === 'fr' ? 'Temps de réponse' : 'Response time'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Timer size={10} />{elapsed}</span>}
            {tokens && <span title={c.tokens}>{tokens}</span>}
            {textEvt?.content && (
              <button
                onClick={copyText}
                title={c.copyTitle}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                  border: `1px solid ${t.border}`, borderRadius: t.radius,
                  background: 'transparent', cursor: 'pointer', padding: '2px 7px',
                  color: copied ? t.success : t.muted, fontSize: 10, fontWeight: 600,
                  transition: 'color .15s',
                }}
              >
                {copied ? <CheckCheck size={11} /> : <Copy size={11} />}
                {copied ? c.copied : c.copy}
              </button>
            )}
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
      loadingLabel: model ? `Lecture base client — ${label}…` : 'Lecture base client…',
      doneLabel: label || 'Odoo',
      liveDb: true,
    }
  }
  if (name === 'count_odoo') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔢', appName: null, color: '#0891b2',
      loadingLabel: model ? `Comptage — ${label}…` : 'Comptage…',
      doneLabel: model ? `${label} (nb)` : 'Comptage',
      liveDb: true,
    }
  }
  if (name === 'get_odoo_fields') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔬', appName: null, color: '#059669',
      loadingLabel: model ? `Structure de ${label}…` : 'Structure du modèle…',
      doneLabel: model ? `Structure · ${label}` : 'Structure',
    }
  }
  if (name === 'search_odoo_source') {
    const ver = args?.version as string
    const pat = (args?.pattern as string) ?? ''
    const shortPat = pat.length > 28 ? pat.slice(0, 28) + '…' : pat
    return {
      icon: '🔍', appName: null, color: '#2563EB',
      loadingLabel: `Recherche dans les sources${ver ? ` v${ver}` : ''}…`,
      doneLabel: shortPat ? `« ${shortPat} » dans sources${ver ? ` v${ver}` : ''}` : `Sources Odoo${ver ? ` v${ver}` : ''}`,
    }
  }
  if (name === 'read_odoo_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📄', appName: null, color: '#2563EB',
      loadingLabel: `Lecture — ${file}…`,
      doneLabel: file,
    }
  }
  if (name === 'search_project_source') {
    const pat = (args?.pattern as string) ?? ''
    const shortPat = pat.length > 28 ? pat.slice(0, 28) + '…' : pat
    return {
      icon: '⧗', appName: null, color: '#0891b2',
      loadingLabel: 'Recherche dans le code custom…',
      doneLabel: shortPat ? `« ${shortPat} » dans code custom` : 'Code custom',
    }
  }
  if (name === 'read_project_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📁', appName: null, color: '#0891b2',
      loadingLabel: `Lecture code custom — ${file}…`,
      doneLabel: file,
    }
  }
  if (name === 'count_source_lines') {
    const scope = (args?.scope as string) ?? ''
    const path  = (args?.path as string) ?? ''
    const groupBy = (args?.group_by as string) ?? 'extension'
    const groupByLabels: Record<string, string> = { extension: 'par type', module: 'par module', directory: 'par dossier', none: 'total' }
    const scopeLabels: Record<string, string> = { odoo: 'sources Odoo', target: 'sources cible', project: 'code custom' }
    const scopeLbl = scopeLabels[scope] ?? scope
    return {
      icon: '📊', appName: null, color: '#0EA5E9',
      loadingLabel: `Volumétrie — ${scopeLbl}${path ? ` / ${path}` : ''}…`,
      doneLabel: `Volumétrie · ${scopeLbl}${path ? ` / ${path}` : ''} (${groupByLabels[groupBy] ?? groupBy})`,
    }
  }
  if (name === 'inspect_studio') {
    const sections = (args?.sections as string[]) ?? ['all']
    const sectLabel = sections.includes('all') ? 'tout' : sections.join(', ')
    const modelFilter = (args?.model_filter as string) ?? ''
    return {
      icon: '🎨', appName: null, color: '#7C3AED',
      loadingLabel: `Inspection Studio — ${sectLabel}${modelFilter ? ` (${modelFilter})` : ''}…`,
      doneLabel: `Personnalisations Studio${modelFilter ? ` · ${modelFilter}` : ''}`,
      liveDb: true,
    }
  }
  return {
    icon: '⚙️', appName: null, color: '#64748b',
    loadingLabel: `${name}…`,
    doneLabel: name,
  }
}

function ToolCallGroup({ events, projectName }: { events: AiEvent[]; projectName?: string }) {
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

              {/* Live DB — project name badge */}
              {'liveDb' in meta && meta.liveDb && projectName && (
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: '1px 6px',
                  borderRadius: 3, flexShrink: 0,
                  background: t.warningBg, color: t.warning,
                  border: `1px solid ${t.warning}`,
                  maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>↗ {projectName}</span>
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

    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brand, flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{olMatch[1]}.</span>
          <span>{inlineMarkdown(olMatch[2])}</span>
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
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: 'color-mix(in srgb, var(--brand) 40%, var(--th-text))' }}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}
