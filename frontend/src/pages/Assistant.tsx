import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listProfiles, getAiProviders, saveAiKey, deleteAiKey } from '../api/client'
import { t } from '../theme'

// ── Types ─────────────────────────────────────────────────────

interface Profile { id: number; name: string; company_name?: string; company_logo?: string }

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
  text?: string          // user message
  events?: AiEvent[]    // assistant events
  loading?: boolean
}

const PROVIDERS = [
  { id: 'claude', label: 'Claude',  color: '#D97706', placeholder: 'sk-ant-api03-…' },
  { id: 'openai', label: 'GPT-4o',  color: '#16A34A', placeholder: 'sk-…' },
  { id: 'gemini', label: 'Gemini',  color: '#2563EB', placeholder: 'AIza…' },
]

const SUGGESTIONS = [
  'Combien de factures impayées ?',
  "Quel est le CA du mois en cours ?",
  'Montre les 10 dernières commandes',
  'Combien de clients actifs ?',
  'Liste les opportunités CRM ouvertes',
]

// ── Main page ─────────────────────────────────────────────────

export default function Assistant() {
  const { data: profData }  = useQuery({ queryKey: ['profiles'],     queryFn: listProfiles })
  const { data: provData, refetch: refetchProviders } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })

  const profiles: Profile[] = profData?.data ?? []
  const providers: Record<string, boolean> = provData?.data ?? {}

  const [provider,   setProvider]   = useState('claude')
  const [profileId,  setProfileId]  = useState<number | null>(null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [input,      setInput]      = useState('')
  const [streaming,  setStreaming]  = useState(false)
  const [showKeys,   setShowKeys]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Auto-select first profile
  useEffect(() => {
    if (profiles.length && !profileId) setProfileId(profiles[0].id)
  }, [profiles])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectedProfile = profiles.find(p => p.id === profileId)

  const send = async () => {
    if (!input.trim() || streaming || !profileId) return
    const text = input.trim()
    setInput('')

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text }
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', events: [], loading: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    // Build history for the API
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

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, profile_id: profileId, messages: history }),
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

  const appendEvent = (msgId: string, evt: AiEvent) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, events: [...(m.events ?? []), evt] } : m
    ))
  }

  const reset = () => {
    abortRef.current?.abort()
    setMessages([])
    setStreaming(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', maxWidth: 860 }}>

      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 2 }}>Assistant IA</h1>
          <p style={{ fontSize: 13, color: t.muted }}>Posez des questions sur vos données Odoo en langage naturel.</p>
        </div>
        <button onClick={() => setShowKeys(p => !p)}
          style={{ padding: '6px 14px', background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, cursor: 'pointer', color: t.textSub }}>
          ⚙ Clés API
        </button>
      </div>

      {/* API key panel */}
      {showKeys && (
        <KeyPanel providers={providers} onSaved={() => { refetchProviders(); setShowKeys(false) }} />
      )}

      {/* Selectors */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Provider tabs */}
        <div style={{ display: 'flex', gap: 4, background: t.bgMuted, borderRadius: t.radius, padding: 3 }}>
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)} style={{
              padding: '5px 14px', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: 'none',
              background: provider === p.id ? t.bgCard : 'transparent',
              color: provider === p.id ? p.color : t.muted,
              boxShadow: provider === p.id ? t.shadow : 'none',
              transition: 'all .15s',
              opacity: providers[p.id] ? 1 : 0.5,
            }}>
              {p.label}
              {!providers[p.id] && <span style={{ marginLeft: 4, fontSize: 10 }}>🔒</span>}
            </button>
          ))}
        </div>

        {/* Profile selector */}
        <select
          value={profileId ?? ''}
          onChange={e => setProfileId(Number(e.target.value))}
          style={{
            padding: '5px 12px', border: `1px solid ${t.border}`,
            borderRadius: t.radius, fontSize: 12, color: t.text, background: t.bgCard, cursor: 'pointer',
          }}
        >
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.company_name || p.name}</option>
          ))}
        </select>

        {messages.length > 0 && (
          <button onClick={reset}
            style={{ padding: '5px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, cursor: 'pointer', color: t.muted }}>
            ✕ Nouvelle conversation
          </button>
        )}
      </div>

      {/* Chat history */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 0',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {messages.length === 0 && (
          <div style={{ marginTop: 24 }}>
            {selectedProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                {selectedProfile.company_logo && (
                  <img src={selectedProfile.company_logo} alt="" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, background: t.bgMuted, padding: 3, border: `1px solid ${t.border}` }} />
                )}
                <div style={{ fontSize: 14, color: t.muted }}>
                  Connecté à <strong style={{ color: t.text }}>{selectedProfile.company_name || selectedProfile.name}</strong>
                </div>
              </div>
            )}
            <div style={{ fontSize: 13, color: t.muted, marginBottom: 12 }}>Suggestions :</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => { setInput(s) }}
                  style={{
                    padding: '7px 14px', background: t.bgCard,
                    border: `1px solid ${t.border}`, borderRadius: t.radiusFull,
                    fontSize: 13, cursor: 'pointer', color: t.textSub,
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = t.brand)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
                >
                  {s}
                </button>
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
      <div style={{
        flexShrink: 0, paddingTop: 12, borderTop: `1px solid ${t.border}`,
        display: 'flex', gap: 10, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={!providers[provider]
            ? `Configurez votre clé ${PROVIDERS.find(p => p.id === provider)?.label} ci-dessus`
            : 'Posez une question… (Entrée pour envoyer, Maj+Entrée pour sauter une ligne)'}
          disabled={!providers[provider] || !profileId}
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
          disabled={!providers[provider] || !profileId || (!streaming && !input.trim())}
          style={{
            padding: '10px 20px', background: streaming ? t.danger : t.brand,
            color: '#fff', border: 'none', borderRadius: t.radiusLg,
            fontWeight: 600, fontSize: 13, cursor: 'pointer',
            opacity: (!providers[provider] || !profileId || (!streaming && !input.trim())) ? .5 : 1,
            transition: 'background .15s',
          }}
        >
          {streaming ? '⏹' : '↑ Envoyer'}
        </button>
      </div>
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
  const textEvt = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt = events.find(e => e.type === 'error')

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
        {/* Tool events */}
        {toolEvents.length > 0 && (
          <ToolCallGroup events={toolEvents} />
        )}

        {/* Text response */}
        {textEvt?.content && (
          <div style={{
            background: t.bgCard, border: `1px solid ${t.border}`,
            borderRadius: `4px ${t.radiusLg} ${t.radiusLg} ${t.radiusLg}`,
            padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: t.text,
          }}>
            <Markdown text={textEvt.content} />
          </div>
        )}

        {/* Error */}
        {errorEvt && (
          <div style={{
            background: t.dangerBg, border: `1px solid ${t.danger}40`,
            borderRadius: t.radius, padding: '10px 14px', fontSize: 13, color: t.danger,
          }}>
            ⚠ {errorEvt.msg}
          </div>
        )}

        {/* Loading */}
        {loading && !textEvt && !errorEvt && toolEvents.length === 0 && (
          <div style={{ color: t.muted, fontSize: 13, padding: '8px 0' }}>
            <span style={{ animation: 'pulse 1s infinite' }}>⟳</span> Réflexion en cours…
          </div>
        )}
      </div>
    </div>
  )
}

function ToolCallGroup({ events }: { events: AiEvent[] }) {
  const [open, setOpen] = useState(false)
  const calls = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')

  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={() => setOpen(p => !p)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: `${t.brand}10`, border: `1px solid ${t.brand}30`,
        borderRadius: t.radius, padding: '4px 10px', cursor: 'pointer',
        fontSize: 12, color: t.brand, fontWeight: 600,
      }}>
        <span>🔍</span>
        {calls.map(c => {
          const res = results.find(r => r.name === c.name)
          return (
            <span key={c.name}>
              {c.name === 'query_odoo' ? (c.args?.model as string) : c.name}
              {res?.ok && res.count !== undefined && ` — ${res.count} résultat${res.count > 1 ? 's' : ''}`}
            </span>
          )
        })}
        <span style={{ marginLeft: 4, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && results.map((r, i) => r.records && r.records.length > 0 && (
        <div key={i} style={{
          marginTop: 6, background: '#1e1e2e', borderRadius: t.radius,
          padding: '10px 12px', overflowX: 'auto', maxHeight: 220, overflowY: 'auto',
        }}>
          <RecordsTable records={r.records} />
        </div>
      ))}
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

    // Fenced code block
    if (line.startsWith('```')) {
      const langMatch = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      result.push(
        <pre key={i} style={{ background: '#1e1e2e', borderRadius: t.radiusSm, padding: '10px 14px', overflowX: 'auto', margin: '8px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: '#cdd6f4' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

    // Table row
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const rows = tableLines.filter(l => !l.match(/^\|[-| :]+\|$/))
      if (rows.length) {
        const headers = rows[0].split('|').filter(Boolean).map(s => s.trim())
        const dataRows = rows.slice(1)
        result.push(
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr>{headers.map((h, j) => <th key={j} style={{ padding: '6px 12px', textAlign: 'left', background: t.bgMuted, borderBottom: `2px solid ${t.border}`, fontWeight: 600, color: t.textSub }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
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

    // Heading
    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      const level = hMatch[1].length
      const sizes = [18, 16, 14]
      result.push(<div key={i} style={{ fontSize: sizes[level-1], fontWeight: 700, color: t.text, margin: '12px 0 4px' }}>{hMatch[2]}</div>)
      i++; continue
    }

    // List item
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

    // Empty line
    if (!line.trim()) {
      result.push(<div key={i} style={{ height: 8 }} />)
      i++; continue
    }

    // Paragraph
    result.push(<p key={i} style={{ margin: '0 0 4px' }}>{inlineMarkdown(line)}</p>)
    i++
  }

  return <>{result}</>
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}

// ── Key panel ─────────────────────────────────────────────────

function KeyPanel({ providers, onSaved }: { providers: Record<string, boolean>; onSaved: () => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: ({ provider, key }: { provider: string; key: string }) => saveAiKey(provider, key),
    onSuccess: onSaved,
  })
  const del = useMutation({
    mutationFn: (provider: string) => deleteAiKey(provider),
    onSuccess: onSaved,
  })

  return (
    <div style={{
      background: t.bgCard, border: `1px solid ${t.border}`,
      borderRadius: t.radiusLg, padding: '18px 20px', marginBottom: 16,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: t.text, marginBottom: 14 }}>
        Clés API — stockées localement (keyring système)
      </div>
      {PROVIDERS.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: p.color, minWidth: 56 }}>{p.label}</span>
          {providers[p.id] ? (
            <>
              <span style={{ fontSize: 12, color: t.success }}>✓ Configurée</span>
              <button onClick={() => del.mutate(p.id)}
                style={{ fontSize: 11, color: t.danger, background: 'none', border: `1px solid ${t.danger}40`, borderRadius: t.radiusSm, padding: '2px 8px', cursor: 'pointer' }}>
                Supprimer
              </button>
            </>
          ) : (
            <>
              <input
                type="password"
                placeholder={p.placeholder}
                value={keys[p.id] ?? ''}
                onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                style={{ flex: 1, padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12 }}
              />
              <button
                disabled={!keys[p.id]?.trim() || save.isPending}
                onClick={() => save.mutate({ provider: p.id, key: keys[p.id] })}
                style={{
                  padding: '6px 14px', background: t.brand, color: '#fff',
                  border: 'none', borderRadius: t.radius, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  opacity: keys[p.id]?.trim() ? 1 : .4,
                }}
              >
                Sauver
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
