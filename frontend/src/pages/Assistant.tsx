import React, { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUp, Bot, Building2, Check, ChevronDown, FileText, FolderCode, Globe2, History, Lock, Paperclip, Settings, Square, TriangleAlert, X } from 'lucide-react'
import { listProfiles, getAiProviders, checkAllSources, getModelConfig } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import PerspectiveToggle, { Perspective, loadPerspective, savePerspective } from '../components/PerspectiveToggle'

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

// ── Types ─────────────────────────────────────────────────────

interface Profile { id: number; name: string; company_name?: string; company_logo?: string; odoo_version?: string; company_ids?: string; selected_company_id?: number; user_access_info?: string; environments?: string; active_env_id?: string }
interface EnvEntry { id: string; name: string; db_url: string; db_name: string; login: string; odoo_version?: string; branch?: string; github_repo?: string; repo_branch?: string }
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
  attachments?: AttachmentMeta[]
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

type AttachmentKind = 'text' | 'pdf'
type AttachmentStatus = 'ready' | 'error'

interface AttachmentPayload {
  name: string
  mime_type: string
  size: number
  kind: AttachmentKind
  text?: string
  content_base64?: string
}

interface AttachmentMeta {
  name: string
  size: number
  kind: AttachmentKind
}

interface AttachmentDraft extends AttachmentPayload {
  id: string
  status: AttachmentStatus
  error?: string
}

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
const ATTACHMENT_MAX_FILES = 5
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
const ATTACHMENT_TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'xml', 'py', 'log'])
const ATTACHMENT_MAX_TOTAL_CHARS = 40_000

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function fileKind(file: File): AttachmentKind | null {
  const ext = fileExt(file.name)
  if (ext === 'pdf') return 'pdf'
  if (ATTACHMENT_TEXT_EXTENSIONS.has(ext)) return 'text'
  return null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'))
    reader.readAsDataURL(file)
  })
}

function attachmentMeta(att: AttachmentDraft): AttachmentMeta {
  return { name: att.name, size: att.size, kind: att.kind }
}

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
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null)   // null = use profile default
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
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  const [perspective, setPerspectiveState] = useState<Perspective>(() => loadPerspective('assistant', 'technical'))
  const setPerspective = (p: Perspective) => { setPerspectiveState(p); savePerspective('assistant', p) }

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

  const isGeneralMode = profileId === GENERAL_KEY
  const selectedProfile = profiles.find(p => p.id === profileId)
  const currentProv = configuredProviders.find(p => p.id === provider)

  const promptSuggestions =
    messages.length === 0 && profileId !== null && !input.trim()
      ? (isGeneralMode ? SUGGESTIONS_GENERAL : SUGGESTIONS)
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
    const assistantMsg: Message = { id: String(crNow + 1), role: 'assistant', events: [], loading: true }
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
      const cleanAttachments = attached.map(({ id: _id, status: _status, error: _error, ...payload }) => payload)
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
    const attached = readyAttachments
    if (!input.trim() && attached.length === 0) return
    const text = input.trim() || 'Analyse les pièces jointes.'
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
    <div className="assistant-shell">

      <PageHeader
        title="Assistant IA"
        description="Posez des questions sur vos données Odoo en langage naturel."
        action={<Link to="/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }}><Settings size={15} /> Paramètres</Link>}
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
            const msgCount = (conversations[GENERAL_KEY] ?? []).filter(m => m.role === 'user').length
            return (
              <button onClick={() => setProfileId(GENERAL_KEY)} className={`assistant-tab-button${isActive ? ' is-active' : ''}`}>
                <Globe2 size={14} /> Odoo Général
                {msgCount > 0 && (
                  <span className="assistant-tab-count">{msgCount}</span>
                )}
              </button>
            )
          })()}

          {/* Separator dot */}
          {profiles.length > 0 && (
            <span style={{ alignSelf: 'center', color: t.border, fontSize: 13, userSelect: 'none', padding: '0 2px' }}>│</span>
          )}

          {/* Project tabs */}
          {profiles.map(p => {
            const msgCount = (conversations[String(p.id)] ?? []).filter(m => m.role === 'user').length
            const isActive = p.id === profileId
            return (
              <button key={p.id} onClick={() => setProfileId(p.id)} className={`assistant-tab-button${isActive ? ' is-active' : ''}`}>
                {p.company_logo
                  ? <img src={p.company_logo} alt="" style={{ width: 15, height: 15, objectFit: 'contain', borderRadius: 2 }} />
                  : <Building2 size={14} />
                }
                {p.name}
                {msgCount > 0 && (
                  <span className="assistant-tab-count">{msgCount}</span>
                )}
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
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: t.radiusFull, fontSize: 11, fontWeight: 600,
                background: t.brand20, border: `1px solid ${t.brand40}`, color: t.brand,
              }}>
                Odoo {activeVersion}
                {(communityInstalled || enterpriseInstalled) && (
                  <span style={{ fontSize: 10, color: t.muted, fontWeight: 400 }}>
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
              Aucun fournisseur IA configuré —{' '}
              <Link to="/settings" style={{ color: t.brand, fontWeight: 600 }}>ajouter une clé API →</Link>
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

              {/* Sources badge */}
              {selectedProfile && !isGeneralMode && activeVersion && (
                <span
                  title={sourcesInstalled
                    ? `Code source Odoo ${activeVersion} installé`
                    : `Sources Odoo ${activeVersion} non installées`}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: t.radiusFull,
                    background: sourcesInstalled ? `${t.success}15` : '#fef3c7',
                    color: sourcesInstalled ? t.success : '#b45309',
                    border: `1px solid ${sourcesInstalled ? `${t.success}40` : '#f59e0b'}`,
                    cursor: 'help',
                  }}>
                  {sourcesInstalled
                    ? <><Check size={12} /> Sources v{activeVersion}{communityInstalled && enterpriseInstalled ? ' · C+E' : communityInstalled ? ' · C' : ' · E'}</>
                    : <><TriangleAlert size={12} /> Sources v{activeVersion}</>}
                </span>
              )}

              {/* Repo badge — shown when active env has a linked GitHub repo */}
              {selectedProfile && !isGeneralMode && activeEnvRepo && (
                <span
                  title={`Dépôt projet : ${activeEnvRepo} — source complémentaire active`}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: t.radiusFull,
                    background: `${t.brand}12`, color: t.brand,
                    border: `1px solid ${t.brand40}`,
                    cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                  <Check size={12} /> <FolderCode size={12} /> {activeEnvRepo.split('/')[1] ?? activeEnvRepo}
                </span>
              )}

              {/* Conversation action buttons */}
              {(messages.length > 0 || (convKey && (savedConvs[convKey] ?? []).length > 0)) && (
                <div className="assistant-control-group">
                  {messages.length > 0 && (
                    <>
                      <button
                        onClick={makeMeetingMinute} disabled={streaming}
                        title="Générer un compte-rendu structuré de cette conversation"
                        className="assistant-soft-action">
                        <FileText size={13} /> <span>Compte-rendu</span>
                      </button>
                      <button
                        onClick={resetCurrentConversation}
                        title="Démarrer une nouvelle conversation (sauvegarde automatique de l'actuelle)"
                        className="assistant-soft-action">
                        <Bot size={13} /> <span>Nouvelle conv.</span>
                      </button>
                    </>
                  )}
                  {convKey && (savedConvs[convKey] ?? []).length > 0 && (
                    <button
                      onClick={() => setShowHistory(h => !h)}
                      title={`${(savedConvs[convKey] ?? []).length} conversation(s) sauvegardée(s)`}
                      className={`assistant-soft-action${showHistory ? ' is-active' : ''}`}>
                      <History size={13} /> <span>Historique ({(savedConvs[convKey] ?? []).length})</span>
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
            <strong>Code source Odoo {activeVersion} non installé</strong> — les questions sur le code source ne fonctionneront pas.{' '}
            <Link to="/sources" style={{ color: '#b45309', fontWeight: 600 }}>Installer les sources →</Link>
          </div>
        </div>
      )}

      {/* Main content row: chat + optional history panel */}
      <div className="assistant-main">
      <div className="assistant-chat-panel">

      {/* Chat history */}
      <div className="assistant-message-list">

        {messages.map(msg => (
          msg.role === 'user'
            ? <UserBubble key={msg.id} text={msg.text ?? ''} attachments={msg.attachments} timestamp={msg.timestamp} />
            : (
              <div
                key={msg.id}
                ref={el => { assistantRefs.current.set(msg.id, el) }}
                style={{ scrollMarginTop: 8 }}
              >
                <AssistantBubble events={msg.events ?? []} loading={msg.loading} provider={provider} timestamp={msg.timestamp} inputTokens={msg.inputTokens} outputTokens={msg.outputTokens} projectName={isGeneralMode ? undefined : selectedProfile?.name} />
              </div>
            )
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Company selector bar (shown when profile has multiple companies) */}
      {selectedProfile && !isGeneralMode && (() => {
        const companies: CompanyOption[] = (() => { try { return JSON.parse(selectedProfile.company_ids ?? '[]') } catch { return [] } })()
        if (companies.length <= 1) return null
        const activeId = selectedCompanyId ?? companies[0]?.id ?? null
        const accessInfo = (() => { try { return selectedProfile.user_access_info ? JSON.parse(selectedProfile.user_access_info) : null } catch { return null } })()
        const activeCompanyAccessible = !accessInfo || !activeId || accessInfo.accessible_company_ids.includes(activeId)
        return (
          <>
            <div className="assistant-company-bar">
              <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>Société :</span>
              {companies.map(c => {
                const isActive = activeId === c.id
                const isAccessible = !accessInfo || accessInfo.accessible_company_ids.includes(c.id)
                return (
                  <button key={c.id}
                    onClick={() => isAccessible && setSelectedCompanyId(c.id)}
                    disabled={!isAccessible}
                    title={!isAccessible ? `L'utilisateur ${accessInfo?.user_name} n'a pas accès à cette société` : undefined}
                    className={`assistant-company-button${isActive ? ' is-active' : ''}`}>
                    {!isAccessible && <Lock size={11} />}{c.name}
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
                <Lock size={18} />
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
                  <button type="button" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} aria-label={`Retirer ${att.name}`}>
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
                ? 'Configurez un fournisseur IA dans les Paramètres'
                : profileId === null
                ? 'Sélectionnez un onglet ci-dessus'
                : isGeneralMode
                ? `Question générale sur Odoo ${generalVersion}… (Entrée pour envoyer)`
                : 'Posez une question… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)'
            }
            disabled={configuredProviders.length === 0 || profileId === null}
            rows={3}
            className="assistant-textarea"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || readyAttachments.length >= ATTACHMENT_MAX_FILES}
            title="Joindre un fichier"
            className="assistant-attach-button"
          >
            <Paperclip size={16} />
          </button>
          <div className="assistant-perspective-slot">
            <PerspectiveToggle
              value={perspective}
              onChange={setPerspective}
              size="sm"
              disabled={streaming}
            />
          </div>
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={configuredProviders.length === 0 || profileId === null || (!streaming && ((!input.trim() && readyAttachments.length === 0) || companyAccessBlocked))}
            title={streaming ? 'Arrêter la génération' : companyAccessBlocked ? 'Société inaccessible — changez de société' : 'Envoyer (Entrée)'}
            className={`assistant-send-button${streaming ? ' is-streaming' : ''}`}
          >
            {streaming ? <Square size={15} /> : <ArrowUp size={18} />}
          </button>
        </div>
        <div className="assistant-composer-meta">
          <span>
            Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne
            {readyAttachments.length > 0 && ` · ${readyAttachments.length}/${ATTACHMENT_MAX_FILES} fichier(s)`}
            {attachmentChars > ATTACHMENT_MAX_TOTAL_CHARS && ' · texte tronqué côté serveur'}
          </span>
          {currentProv && <span>{currentProv.label} · {currentProv.models.find(m => m.id === modelId)?.label}</span>}
        </div>
      </div>
      </div>

      {/* History panel */}
      {showHistory && convKey && (
        <div className="assistant-history-panel">
          <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>Historique</span>
            <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
          {(savedConvs[convKey] ?? []).length === 0
            ? <div style={{ padding: '20px 14px', fontSize: 12, color: t.muted, textAlign: 'center' }}>Aucune conversation sauvegardée</div>
            : (savedConvs[convKey] ?? []).map(conv => (
              <div key={conv.id} style={{
                padding: '11px 14px', borderBottom: `1px solid ${t.borderLight}`,
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 650, color: t.text, lineHeight: 1.4, flex: 1 }}
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
                  style={{ marginTop: 3, fontSize: 11, padding: '5px 10px' }}>
                  <History size={12} /> Reprendre
                </button>
              </div>
            ))
          }
        </div>
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
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: t.radiusFull,
        background: t.bgMuted, border: `1px solid ${t.border}`, color: t.textSub,
      }}>
        {currentEnv.name}
      </span>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: t.radiusFull, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        background: isOverridden ? '#fff8ed' : isProd ? t.bgMuted : '#fff8ed',
        border: `1px solid ${isOverridden ? '#f59e0b' : isProd ? t.border : '#f59e0b'}`,
        color: isOverridden ? '#b45309' : isProd ? t.textSub : '#b45309',
        transition: 'all .15s',
      }}>
        {isOverridden && <span style={{ fontSize: 9 }}>⚡</span>}
        {currentEnv.name}
        {currentEnv.odoo_version && (
          <span style={{ fontSize: 9, opacity: 0.7 }}>v{currentEnv.odoo_version.split('.')[0]}</span>
        )}
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 300,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: t.shadowMd, minWidth: 200,
        }}>
          <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.muted }}>
            Environnement actif
          </div>
          {envs.map(env => {
            const isActive = env.id === currentId
            const isDefault = env.id === defaultId
            return (
              <button key={env.id}
                onClick={() => { onChange(env.id === defaultId ? null : env.id); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  background: isActive ? `${t.brand}10` : 'transparent',
                  borderLeft: isActive ? `3px solid ${t.brand}` : '3px solid transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = t.bgMuted }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? t.brand : t.text }}>
                      {env.name}
                    </span>
                    {isDefault && (
                      <span style={{ fontSize: 9, color: t.muted, background: t.bgMuted, padding: '1px 5px', borderRadius: 3 }}>
                        défaut
                      </span>
                    )}
                    {isActive && !isDefault && (
                      <span style={{ fontSize: 9, color: '#b45309', background: '#fff8ed', padding: '1px 5px', borderRadius: 3, border: '1px solid #f59e0b' }}>
                        override
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: t.muted, marginTop: 1 }}>
                    {env.db_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    {env.odoo_version && ` · Odoo ${env.odoo_version}`}
                  </div>
                </div>
                {isActive && <Check size={12} color={t.brand} />}
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
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 12px', borderRadius: t.radius, cursor: 'pointer',
        background: t.bgCard, border: `1px solid ${t.border}`,
        transition: 'border-color .15s',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: currentProv.color }}>{currentProv.label}</span>
        <span style={{ color: t.border, fontSize: 13 }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{currentModel?.label}</span>
        {currentModel?.recommended && (
          <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>★</span>
        )}
        <ChevronDown size={12} color={t.muted} style={{ marginLeft: 1 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 300,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: t.shadowMd,
          minWidth: 300, maxHeight: 420, overflowY: 'auto',
        }}>
          {providers.map((prov, pi) => (
            <div key={prov.id}>
              {pi > 0 && <div style={{ height: 1, background: t.border }} />}
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: prov.color, background: `${prov.color}08`,
              }}>
                {prov.label}
              </div>
              {prov.models.map(m => {
                const isSelected = provider === prov.id && modelId === m.id
                return (
                  <button key={m.id}
                    onClick={() => { if (provider !== prov.id) switchProvider(prov.id); setModelId(m.id); setOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '9px 14px', border: 'none', cursor: 'pointer',
                      background: isSelected ? `${prov.color}10` : 'transparent',
                      borderLeft: isSelected ? `3px solid ${prov.color}` : '3px solid transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.bgMuted }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: isSelected ? prov.color : t.text }}>{m.label}</span>
                      {m.recommended && (
                        <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>Recommandé</span>
                      )}
                    </div>
                    {m.desc && <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>}
                    {m.tags && m.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {m.tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 10,
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
        <ChevronDown size={12} style={{ opacity: .6 }} />
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

function UserBubble({ text, attachments, timestamp }: { text: string; attachments?: AttachmentMeta[]; timestamp?: number }) {
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
          {attachments && attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {attachments.map(att => (
                <span key={`${att.name}-${att.size}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 7px', borderRadius: 999,
                  background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.24)',
                  color: '#fff', fontSize: 11, fontWeight: 650, maxWidth: 260,
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

function AssistantBubble({ events, loading, provider, timestamp, inputTokens, outputTokens, projectName }: {
  events: AiEvent[]; loading?: boolean; provider: string
  timestamp?: number; inputTokens?: number; outputTokens?: number
  projectName?: string
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
        {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} projectName={projectName} />}

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

        {loading && !textEvt && !errorEvt && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginTop: toolEvents.length > 0 ? 10 : 0,
            padding: '10px 16px',
            background: t.bgMuted,
            border: `1px solid ${t.border}`,
            borderRadius: t.radiusLg,
            fontSize: 13, color: t.textSub,
          }}>
            {/* Animated dots */}
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: t.brand,
                  display: 'inline-block',
                  animation: `toolPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.7,
                }} />
              ))}
            </span>
            <span style={{ fontWeight: 500 }}>
              {toolEvents.length > 0 ? 'Analyse des résultats et rédaction de la réponse…' : 'Réflexion en cours…'}
            </span>
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
                  background: '#f9731620', color: '#ea6c0a',
                  border: '1px solid #f9731640',
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
