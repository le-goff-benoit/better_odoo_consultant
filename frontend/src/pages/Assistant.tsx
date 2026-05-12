import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { listProfiles, getAiProviders, checkAllSources, getModelConfig, getProfileApps } from '../api/client'
import { t } from '../theme'

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

interface Profile { id: number; name: string; company_name?: string; company_logo?: string; odoo_version?: string }

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
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text?: string
  events?: AiEvent[]
  loading?: boolean
}

interface ModelDef { id: string; label: string; speed: number; desc: string; recommended?: boolean }

const PROVIDERS: { id: string; label: string; color: string; models: ModelDef[] }[] = [
  {
    id: 'claude', label: 'Claude', color: '#D97706',
    models: [
      { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6',  speed: 2, recommended: true,
        desc: 'Excellent rapport qualité/vitesse — idéal pour le quotidien' },
      { id: 'claude-opus-4-7',           label: 'Opus 4.7',    speed: 1,
        desc: 'Le plus puissant — analyses complexes, synthèses longues' },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',   speed: 3,
        desc: 'Ultra-rapide et économique — questions simples, filtres rapides' },
    ],
  },
  {
    id: 'openai', label: 'GPT-4o', color: '#16A34A',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o',      speed: 2, recommended: true,
        desc: 'Très capable et rapide — usage polyvalent' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', speed: 3,
        desc: 'Rapide et économique — questions simples et filtres' },
      { id: 'o1-mini',     label: 'o1 mini',      speed: 1,
        desc: 'Raisonnement avancé — problèmes analytiques complexes' },
    ],
  },
  {
    id: 'gemini', label: 'Gemini', color: '#2563EB',
    models: [
      { id: 'gemini-2.0-flash', label: '2.0 Flash', speed: 3, recommended: true,
        desc: 'Dernier modèle Flash — rapide et très performant' },
      { id: 'gemini-1.5-pro',   label: '1.5 Pro',   speed: 2,
        desc: 'Long contexte — grandes quantités de données' },
      { id: 'gemini-1.5-flash', label: '1.5 Flash', speed: 3,
        desc: 'Rapide et efficace — bon pour la majorité des requêtes' },
    ],
  },
  {
    id: 'copilot', label: 'Copilot', color: '#6e40c9',
    models: [
      { id: 'gpt-4o',                     label: 'GPT-4o',         speed: 2, recommended: true,
        desc: 'Copilot — GPT-4o via votre abonnement GitHub' },
      { id: 'gpt-4o-mini',                label: 'GPT-4o mini',    speed: 3,
        desc: 'Rapide et économique via Copilot' },
      { id: 'claude-3.5-sonnet',          label: 'Claude 3.5',     speed: 2,
        desc: 'Claude Sonnet via Copilot Business' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 (2410)', speed: 2,
        desc: 'Claude 3.5 Sonnet (octobre 2024) via Copilot' },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7',     speed: 2,
        desc: 'Claude 3.7 Sonnet via Copilot Business (si disponible)' },
      { id: 'o1-mini',                    label: 'o1 mini',         speed: 1,
        desc: 'Raisonnement avancé — analyses complexes via Copilot' },
      { id: 'o3-mini',                    label: 'o3 mini',         speed: 1,
        desc: 'Dernier modèle de raisonnement OpenAI via Copilot' },
    ],
  },
  {
    id: 'github', label: 'GitHub', color: '#24292f',
    models: [
      { id: 'gpt-4o',                        label: 'GPT-4o',           speed: 2, recommended: true,
        desc: 'GPT-4o via GitHub Models (inclus GitHub Free/Pro)' },
      { id: 'gpt-4o-mini',                   label: 'GPT-4o mini',      speed: 3,
        desc: 'Ultra-rapide et économique via GitHub Models' },
      { id: 'claude-3-5-sonnet-20241022',    label: 'Claude 3.5',       speed: 2,
        desc: 'Claude via GitHub Models — bon équilibre qualité/vitesse' },
      { id: 'claude-3-7-sonnet-20250219',    label: 'Claude 3.7',       speed: 2,
        desc: 'Claude 3.7 Sonnet via GitHub Models' },
      { id: 'Llama-3.2-90B-Vision-Instruct', label: 'Llama 3.2 90B',   speed: 2,
        desc: 'Open source Meta — alternative gratuite via GitHub Models' },
      { id: 'Llama-3.1-405B-Instruct',       label: 'Llama 3.1 405B',  speed: 1,
        desc: 'Le plus grand Llama open source — très capable' },
      { id: 'mistral-large-2407',             label: 'Mistral Large',    speed: 2,
        desc: 'Mistral Large via GitHub Models' },
      { id: 'Phi-3.5-mini-instruct',          label: 'Phi-3.5 mini',    speed: 3,
        desc: 'Modèle compact Microsoft — ultra-rapide pour les tâches simples' },
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

const ODOO_VERSIONS = ['19.0', '18.0', '17.0', '16.0', '15.0']

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
  const [generalVersion, setGeneralVersion] = useState('19.0')

  // Conversations keyed by string (profile id as string, or 'general')
  const [conversations, setConversations] = useState<Record<string, Message[]>>({})
  const convKey = profileId !== null ? String(profileId) : null
  const messages = convKey ? (conversations[convKey] ?? []) : []

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
    const timer = setTimeout(() => sendWithText(text, ver), 100)
    return () => clearTimeout(timer)
  }, [provider, profileId, streaming])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isGeneralMode = profileId === GENERAL_KEY
  const selectedProfile = profiles.find(p => p.id === profileId)
  const currentProv = PROVIDERS.find(p => p.id === provider)

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
  const sourcesInstalled = activeVersion ? sourcesStatus[activeVersion]?.installed === true : false

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
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: '📋 Générer le compte-rendu de réunion' }
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', events: [], loading: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const body = isGeneralMode
        ? { provider, profile_id: null, version: generalVersion, messages: history, model: modelId }
        : { provider, profile_id: profileId, messages: history, model: modelId }
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
              if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, events: [...(last.events ?? []), evt], loading: evt.type !== 'done' && evt.type !== 'error' }
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

    const userMsg: Message      = { id: Date.now().toString(), role: 'user', text }
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', events: [], loading: true }

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
        : { provider, profile_id: profileId, messages: history, model: modelId }

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

  const resetCurrentConversation = () => {
    abortRef.current?.abort()
    if (convKey) setConversations(prev => ({ ...prev, [convKey]: [] }))
    setStreaming(false)
  }

  const switchProvider = (id: string) => {
    const p = PROVIDERS.find(pv => pv.id === id)!
    setProvider(id)
    setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0].id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 2 }}>Assistant IA</h1>
          <p style={{ fontSize: 13, color: t.muted }}>Posez des questions sur vos données Odoo en langage naturel.</p>
        </div>
        <Link to="/settings" style={{
          padding: '6px 14px', background: t.bgMuted, border: `1px solid ${t.border}`,
          borderRadius: t.radius, fontSize: 12, color: t.textSub, textDecoration: 'none', fontWeight: 500,
        }}>⚙ Paramètres</Link>
      </div>

      {/* Project + General tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* General mode tab */}
        {(() => {
          const isActive = isGeneralMode
          const msgCount = (conversations[GENERAL_KEY] ?? []).filter(m => m.role === 'user').length
          return (
            <button onClick={() => setProfileId(GENERAL_KEY)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              background: isActive ? t.bgCard : 'transparent',
              border: `1px solid ${isActive ? '#6366f1' : t.border}`,
              borderRadius: t.radiusFull,
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? '#6366f1' : t.muted,
              cursor: 'pointer',
              boxShadow: isActive ? t.shadow : 'none',
              transition: 'all .15s',
            }}>
              🌐 Odoo Général
              {msgCount > 0 && (
                <span style={{
                  background: isActive ? '#6366f1' : t.borderLight,
                  color: isActive ? '#fff' : t.muted,
                  borderRadius: t.radiusFull, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>{msgCount}</span>
              )}
            </button>
          )
        })()}

        {/* Project tabs */}
        {profiles.map(p => {
          const msgs = conversations[String(p.id)] ?? []
          const msgCount = msgs.filter(m => m.role === 'user').length
          const isActive = p.id === profileId
          return (
            <button key={p.id} onClick={() => setProfileId(p.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px',
              background: isActive ? t.bgCard : 'transparent',
              border: `1px solid ${isActive ? t.brand : t.border}`,
              borderRadius: t.radiusFull,
              fontSize: 12, fontWeight: isActive ? 600 : 400,
              color: isActive ? t.brand : t.muted,
              cursor: 'pointer',
              boxShadow: isActive ? t.shadow : 'none',
              transition: 'all .15s',
            }}>
              {p.company_logo && (
                <img src={p.company_logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3 }} />
              )}
              {p.company_name || p.name}
              {msgCount > 0 && (
                <span style={{
                  background: isActive ? t.brand : t.borderLight,
                  color: isActive ? '#fff' : t.muted,
                  borderRadius: t.radiusFull, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>{msgCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Version selector for general mode */}
      {isGeneralMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: t.muted, fontWeight: 500 }}>Version Odoo :</span>
          {ODOO_VERSIONS.map(v => (
            <button key={v} onClick={() => setGeneralVersion(v)} style={{
              padding: '3px 12px',
              background: generalVersion === v ? '#6366f110' : 'transparent',
              border: `1px solid ${generalVersion === v ? '#6366f1' : t.border}`,
              borderRadius: t.radiusFull,
              fontSize: 12, fontWeight: generalVersion === v ? 700 : 400,
              color: generalVersion === v ? '#6366f1' : t.muted,
              cursor: 'pointer', transition: 'all .15s',
            }}>{v}</button>
          ))}
        </div>
      )}

      {/* Provider + model toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
        {configuredProviders.length === 0 ? (
          <div style={{ fontSize: 13, color: t.muted }}>
            Aucun fournisseur IA configuré —{' '}
            <Link to="/settings" style={{ color: t.brand, fontWeight: 600 }}>ajouter une clé API →</Link>
          </div>
        ) : (
          <>
            {/* Provider tabs */}
            <div style={{ display: 'flex', gap: 3, background: t.bgMuted, borderRadius: t.radius, padding: 3 }}>
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

            {/* Model dropdown */}
            {currentProv && (
              <ModelDropdown
                provider={currentProv}
                selected={modelId}
                onChange={setModelId}
              />
            )}

            <div style={{ flex: 1 }} />

            {messages.length > 0 && (
              <>
                <button onClick={makeMeetingMinute} disabled={streaming}
                  style={{ padding: '5px 12px', background: 'none', border: `1px solid ${t.brand}60`, borderRadius: t.radius, fontSize: 12, cursor: 'pointer', color: t.brand, fontWeight: 600 }}>
                  📋 Meeting Minute
                </button>
                <button onClick={resetCurrentConversation}
                  style={{ padding: '5px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, cursor: 'pointer', color: t.muted }}>
                  ✕ Nouvelle conversation
                </button>
              </>
            )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg }}>
              {selectedProfile.company_logo && (
                <img src={selectedProfile.company_logo} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: t.bgMuted, padding: 3, border: `1px solid ${t.border}` }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{selectedProfile.company_name || selectedProfile.name}</div>
                {currentProv && (
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 1 }}>
                    {currentProv.label} · {PROVIDERS.find(p => p.id === provider)?.models.find(m => m.id === modelId)?.label}
                  </div>
                )}
                <AppBadgesAsst apps={profileApps} />
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
            ? <UserBubble key={msg.id} text={msg.text ?? ''} />
            : <AssistantBubble key={msg.id} events={msg.events ?? []} loading={msg.loading} provider={provider} />
        ))}
        <div ref={bottomRef} />
      </div>

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
              : 'Posez une question… (Entrée pour envoyer, Maj+Entrée pour sauter une ligne)'
          }
          disabled={configuredProviders.length === 0 || profileId === null}
          rows={2}
          style={{
            flex: 1, padding: '10px 14px', border: `1px solid ${t.border}`,
            borderRadius: t.radiusLg, fontSize: 14, resize: 'none',
            color: t.text, background: t.bgCard, outline: 'none',
            fontFamily: t.font, lineHeight: 1.5,
          }}
        />
        <button
          onClick={streaming ? () => abortRef.current?.abort() : send}
          disabled={configuredProviders.length === 0 || profileId === null || (!streaming && !input.trim())}
          style={{
            padding: '10px 20px', background: streaming ? t.danger : t.brand,
            color: '#fff', border: 'none', borderRadius: t.radiusLg,
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            opacity: (configuredProviders.length === 0 || profileId === null || (!streaming && !input.trim())) ? .5 : 1,
            transition: 'background .15s',
          }}
        >
          {streaming ? '⏹' : '↑'}
        </button>
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
        <span style={{ opacity: .6 }}>{'⚡'.repeat(current.speed)}</span>
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
                <span style={{ fontSize: 11, opacity: .7 }}>{'⚡'.repeat(m.speed)}</span>
                {m.recommended && (
                  <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700, marginLeft: 2 }}>
                    Recommandé
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bubbles ──────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: '78%', padding: '10px 14px',
        background: t.brand, color: '#fff',
        borderRadius: `${t.radiusLg} ${t.radiusLg} 4px ${t.radiusLg}`,
        fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {text}
      </div>
    </div>
  )
}

function AssistantBubble({ events, loading, provider }: { events: AiEvent[]; loading?: boolean; provider: string }) {
  const prov = PROVIDERS.find(p => p.id === provider)
  const textEvt   = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt  = events.find(e => e.type === 'error')

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
      </div>
    </div>
  )
}

function getToolMeta(name: string, args?: Record<string, unknown>) {
  if (name === 'query_odoo') {
    const model = (args?.model as string) ?? ''
    const prefix = model.split('.')[0]
    const app = ODOO_APPS[prefix]
    return {
      icon: app ? app.icon : '🗄️',
      appName: app ? prefix : null,
      color: app ? app.color : '#64748b',
      label: model || 'query_odoo',
    }
  }
  if (name === 'search_odoo_source') {
    const ver = args?.version as string
    return { icon: '🔎', appName: null, color: '#2563EB', label: ver ? `Sources v${ver}` : 'Sources Odoo' }
  }
  if (name === 'read_odoo_file') {
    const path = args?.path as string ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return { icon: '📄', appName: null, color: '#7C3AED', label: file }
  }
  return { icon: '🔧', appName: null, color: '#64748b', label: name }
}

function ToolCallGroup({ events }: { events: AiEvent[] }) {
  const [open, setOpen] = useState(false)
  const calls   = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: open ? 8 : 0 }}>
        {calls.map((c, idx) => {
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
                background: done ? `${meta.color}12` : `${meta.color}08`,
                border: `1px solid ${done ? `${meta.color}40` : `${meta.color}25`}`,
                borderRadius: t.radiusFull, padding: '4px 10px 4px 6px',
                cursor: hasRecords ? 'pointer' : 'default',
                fontSize: 11, color: meta.color, fontWeight: 600,
                transition: 'all .2s',
              }}
            >
              {/* Odoo O badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                background: meta.color, color: '#fff', fontSize: 9, fontWeight: 800,
                flexShrink: 0,
                animation: done ? 'none' : 'toolPulse 1.2s ease-in-out infinite',
              }}>
                {c.name === 'query_odoo' ? 'O' : c.name === 'search_odoo_source' ? '⌕' : '◈'}
              </span>

              {/* App icon */}
              {meta.appName
                ? <OdooAppIcon name={meta.appName} size={14} />
                : <span style={{ fontSize: 12 }}>{meta.icon}</span>
              }

              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.label}
              </span>

              {/* Result count */}
              {done && res!.count !== undefined && (
                <span style={{
                  background: `${meta.color}25`, borderRadius: 9999,
                  padding: '1px 6px', fontSize: 10,
                }}>
                  {res!.count}
                </span>
              )}

              {/* State indicator */}
              {done ? (
                <span style={{ fontSize: 10, opacity: .7 }}>✓{hasRecords ? (open ? ' ▲' : ' ▼') : ''}</span>
              ) : (
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${meta.color}`, borderTopColor: 'transparent', animation: 'toolSpin .6s linear infinite', flexShrink: 0 }} />
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
        result.push(
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr>{headers.map((h, j) => <th key={j} style={{ padding: '6px 12px', textAlign: 'left', background: t.bgMuted, borderBottom: `2px solid ${t.border}`, fontWeight: 600, color: t.textSub }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? t.bgCard : t.bgMuted }}>
                    {row.split('|').filter(Boolean).map((cell, ci) => (
                      <td key={ci} style={{ padding: '5px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>{cell.trim()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
