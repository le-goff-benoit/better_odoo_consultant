import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listProfiles, checkAllSources, getAiProviders, getModelConfig } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'

// ── Types ─────────────────────────────────────────────────────────

interface Profile {
  id: number
  name: string
  odoo_version: string | null
  environments: string | null
  active_env_id: string | null
}

interface EnvEntry {
  id: string
  name: string
  odoo_version?: string | null
  github_repo?: string | null
}

type SelectorMode = 'version' | 'environment'

interface SideConfig {
  mode: SelectorMode
  version: string     // when mode=version
  profileId: number | null  // when mode=environment
  envId: string | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ToolCall {
  name: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

interface MsgEntry {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: ToolCall[]
  tokens?: { input: number; output: number }
}

// ── Helpers ───────────────────────────────────────────────────────

function installedVersions(sourcesData: Record<string, { installed: boolean }> | undefined): string[] {
  if (!sourcesData) return []
  return Object.keys(sourcesData)
    .filter(k => !k.endsWith('-enterprise') && sourcesData[k]?.installed)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
}

function profileEnvs(profile: Profile | null): EnvEntry[] {
  if (!profile) return []
  try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] }
}

function resolveVersion(cfg: SideConfig, profiles: Profile[]): string | null {
  if (cfg.mode === 'version') return cfg.version || null
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return null
  if (cfg.envId) {
    const env = profileEnvs(p).find(e => e.id === cfg.envId)
    return env?.odoo_version ?? p.odoo_version
  }
  return p.odoo_version
}

function resolveLabel(cfg: SideConfig, profiles: Profile[]): string {
  if (cfg.mode === 'version') return cfg.version ? `Odoo ${cfg.version}` : '—'
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return '—'
  const envs = profileEnvs(p)
  const env = envs.find(e => e.id === cfg.envId)
  const ver = env?.odoo_version ?? p.odoo_version ?? '?'
  return `${p.name}${env ? ` · ${env.name}` : ''} (${ver})`
}

function resolveRepoPath(cfg: SideConfig, profiles: Profile[]): { profileId: number | null; envId: string | null } {
  if (cfg.mode !== 'environment') return { profileId: null, envId: null }
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return { profileId: null, envId: null }
  const envs = profileEnvs(p)
  const envId = cfg.envId ?? (envs[0]?.id ?? null)
  const env = envs.find(e => e.id === envId)
  if (!env?.github_repo) return { profileId: null, envId: null }
  return { profileId: p.id, envId }
}

// ── Side selector ─────────────────────────────────────────────────

function SideSelector({
  label, cfg, onChange, versions, profiles,
}: {
  label: string
  cfg: SideConfig
  onChange: (c: SideConfig) => void
  versions: string[]
  profiles: Profile[]
}) {
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: `1px solid ${t.border}`, borderRadius: t.radius,
    background: t.bgCard, color: t.text, outline: 'none',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

  const selectedProfile = profiles.find(p => p.id === cfg.profileId) ?? null
  const envs = profileEnvs(selectedProfile)

  return (
    <div style={{
      flex: 1, padding: '16px 18px', background: t.bgCard,
      border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: t.text, marginBottom: 14 }}>{label}</div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['version', 'environment'] as SelectorMode[]).map(m => (
          <button key={m} onClick={() => onChange({ ...cfg, mode: m })} style={{
            flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600,
            background: cfg.mode === m ? `var(--brand, ${t.brand})` : t.bgMuted,
            color: cfg.mode === m ? '#fff' : t.muted,
            border: `1px solid ${cfg.mode === m ? `var(--brand, ${t.brand})` : t.border}`,
            borderRadius: t.radius, cursor: 'pointer', transition: 'all .15s',
          }}>
            {m === 'version' ? 'Version Odoo' : 'Environnement'}
          </button>
        ))}
      </div>

      {cfg.mode === 'version' ? (
        <div>
          <div style={labelStyle}>Version</div>
          <select value={cfg.version} onChange={e => onChange({ ...cfg, version: e.target.value })} style={selectStyle}>
            <option value="">— Choisir —</option>
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {versions.length === 0 && (
            <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>
              Aucune source téléchargée. Allez dans Sources pour télécharger une version.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={labelStyle}>Projet</div>
            <select
              value={cfg.profileId ?? ''}
              onChange={e => onChange({ ...cfg, profileId: e.target.value ? Number(e.target.value) : null, envId: null })}
              style={selectStyle}
            >
              <option value="">— Choisir —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {envs.length > 0 && (
            <div>
              <div style={labelStyle}>Environnement</div>
              <select value={cfg.envId ?? ''} onChange={e => onChange({ ...cfg, envId: e.target.value || null })} style={selectStyle}>
                <option value="">— Défaut —</option>
                {envs.map(e => <option key={e.id} value={e.id}>{e.name} {e.odoo_version ? `(${e.odoo_version})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Version badge */}
      {resolveVersion(cfg, profiles) && (
        <div style={{ marginTop: 10, fontSize: 12, color: `var(--brand, ${t.brand})`, fontWeight: 600 }}>
          Odoo {resolveVersion(cfg, profiles)}
        </div>
      )}
    </div>
  )
}

// ── Message rendering ─────────────────────────────────────────────

function MsgBubble({ msg }: { msg: MsgEntry }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
      {msg.tool_calls && msg.tool_calls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          {msg.tool_calls.map((tc, i) => (
            <div key={i} style={{
              fontSize: 11, color: t.muted, background: t.bgMuted,
              border: `1px solid ${t.border}`, borderRadius: t.radius,
              padding: '4px 10px', fontFamily: 'monospace',
            }}>
              ⚙ {tc.name}({Object.entries(tc.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})
              {tc.result && !tc.result.ok && (
                <span style={{ color: t.danger, marginLeft: 8 }}>✗ {String((tc.result as Record<string, unknown>).error)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {msg.content && (
        <div style={{
          maxWidth: '88%', padding: '10px 14px',
          background: isUser ? `var(--brand, ${t.brand})` : t.bgCard,
          color: isUser ? '#fff' : t.text,
          border: isUser ? 'none' : `1px solid ${t.border}`,
          borderRadius: t.radiusLg,
          fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>
      )}
      {msg.tokens && (
        <div style={{ fontSize: 10, color: t.muted }}>
          {msg.tokens.input}↑ {msg.tokens.output}↓ tokens
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Migration() {
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const { data: sourcesData }  = useQuery({ queryKey: ['sources-all'], queryFn: checkAllSources })
  const { data: provData }     = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const { data: modelCfgData } = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })

  const profiles: Profile[] = profilesData?.data ?? []
  const versions = installedVersions(sourcesData?.data)
  const configuredProviders: string[] = Object.entries(provData?.data ?? {})
    .filter(([, ok]) => ok).map(([p]) => p)

  const modelConfig: Record<string, string[]> = modelCfgData?.data ?? {}
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')

  const provider = selectedProvider || configuredProviders[0] || ''
  const availableModels = modelConfig[provider] ?? []
  const model = selectedModel || availableModels[0] || ''

  const [source, setSource] = useState<SideConfig>({ mode: 'version', version: '', profileId: null, envId: null })
  const [target, setTarget] = useState<SideConfig>({ mode: 'version', version: '', profileId: null, envId: null })

  const [msgs, setMsgs] = useState<MsgEntry[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const sourceVersion = resolveVersion(source, profiles)
  const targetVersion = resolveVersion(target, profiles)
  const sourceLabel   = resolveLabel(source, profiles)
  const targetLabel   = resolveLabel(target, profiles)
  const sourceRepo    = resolveRepoPath(source, profiles)

  const ready = configuredProviders.length > 0 && (sourceVersion || targetVersion)

  async function send() {
    if (!input.trim() || streaming || !ready) return
    const userMsg: MsgEntry = { role: 'user', content: input.trim() }
    const newMsgs = [...msgs, userMsg]
    setMsgs(newMsgs)
    setInput('')
    setStreaming(true)

    const apiMessages: ChatMessage[] = newMsgs.map(m => ({ role: m.role, content: m.content }))

    const body: Record<string, unknown> = {
      provider,
      model: model || undefined,
      messages: apiMessages,
      migration_mode: true,
      version: sourceVersion || undefined,
      target_version: source.mode === 'version' ? (targetVersion || undefined) : undefined,
    }

    if (source.mode === 'environment' && source.profileId) {
      body.profile_id = source.profileId
      body.active_env_id = source.envId || undefined
    }
    if (target.mode === 'environment' && target.profileId && source.mode !== 'environment') {
      body.target_profile_id = target.profileId
      body.target_env_id = target.envId || undefined
    } else if (target.mode === 'version') {
      body.target_version = targetVersion || undefined
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl

    let assistantMsg: MsgEntry = { role: 'assistant', content: '', tool_calls: [] }
    const currentToolCall: ToolCall | null = null
    void currentToolCall

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      const reader = resp.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const evt = JSON.parse(line)
            if (evt.type === 'text') {
              assistantMsg = { ...assistantMsg, content: assistantMsg.content + evt.content }
              setMsgs([...newMsgs, assistantMsg])
            } else if (evt.type === 'tool_call') {
              assistantMsg = { ...assistantMsg, tool_calls: [...(assistantMsg.tool_calls ?? []), { name: evt.name, args: evt.args }] }
              setMsgs([...newMsgs, assistantMsg])
            } else if (evt.type === 'tool_result') {
              const tcs = [...(assistantMsg.tool_calls ?? [])]
              const last = tcs[tcs.length - 1]
              if (last) tcs[tcs.length - 1] = { ...last, result: evt }
              assistantMsg = { ...assistantMsg, tool_calls: tcs }
              setMsgs([...newMsgs, assistantMsg])
            } else if (evt.type === 'done') {
              assistantMsg = { ...assistantMsg, tokens: { input: evt.input_tokens ?? 0, output: evt.output_tokens ?? 0 } }
              setMsgs([...newMsgs, assistantMsg])
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setMsgs([...newMsgs, { role: 'assistant', content: `Erreur : ${e.message}` }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <PageHeader title="Migration" />

      {/* Context bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        paddingBottom: 14, borderBottom: `1px solid ${t.border}`, marginBottom: 14,
        fontSize: 12,
      }}>
        {/* Provider + model */}
        <select
          value={provider}
          onChange={e => { setSelectedProvider(e.target.value); setSelectedModel('') }}
          style={{ padding: '4px 8px', fontSize: 12, border: `1px solid ${t.border}`, borderRadius: t.radius, background: t.bgCard, color: t.text, outline: 'none' }}
        >
          {configuredProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {availableModels.length > 0 && (
          <select
            value={model}
            onChange={e => setSelectedModel(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: `1px solid ${t.border}`, borderRadius: t.radius, background: t.bgCard, color: t.text, outline: 'none' }}
          >
            {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        {/* Migration label */}
        {(sourceVersion || targetVersion) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: t.radiusFull,
            background: `var(--brand, ${t.brand})15`,
            border: `1px solid var(--brand, ${t.brand})40`,
            color: `var(--brand, ${t.brand})`, fontWeight: 600, fontSize: 12,
          }}>
            {sourceLabel} → {targetLabel}
          </div>
        )}
        {sourceRepo.profileId && (
          <div style={{
            padding: '3px 10px', borderRadius: t.radiusFull,
            background: `${t.success}15`, border: `1px solid ${t.success}40`,
            color: t.success, fontWeight: 600, fontSize: 12,
          }}>
            ✓ ⎇ repo
          </div>
        )}
      </div>

      {/* Selectors */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
        <SideSelector label="Source (version actuelle)" cfg={source} onChange={setSource} versions={versions} profiles={profiles} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 4px', color: t.muted, fontSize: 20, flexShrink: 0 }}>
          →
        </div>
        <SideSelector label="Cible (version de destination)" cfg={target} onChange={setTarget} versions={versions} profiles={profiles} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4, marginBottom: 12 }}>
        {msgs.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: t.muted, maxWidth: 480 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⇄</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 8 }}>Assistant Migration Odoo</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                Sélectionnez une version source et une version cible ci-dessus, puis posez votre question.
              </div>
              <div style={{ marginTop: 16, fontSize: 12, color: t.muted, lineHeight: 1.8, textAlign: 'left', background: t.bgMuted, padding: '12px 16px', borderRadius: t.radius }}>
                <strong style={{ color: t.text }}>Exemples :</strong><br />
                "Quels champs ont été supprimés sur sale.order entre 16.0 et 17.0 ?"<br />
                "Comment a changé action_confirm sur account.move ?"<br />
                "Est-ce que les modules custom sont compatibles avec la version cible ?"<br />
                "Quelles sont les nouvelles API disponibles en 17.0 ?"
              </div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => <MsgBubble key={i} msg={m} />)}
        {streaming && msgs[msgs.length - 1]?.role !== 'assistant' && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--brand, ${t.brand})`, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={
              configuredProviders.length === 0
                ? 'Configurez un fournisseur IA dans les Paramètres'
                : !sourceVersion && !targetVersion
                ? 'Sélectionnez une version source et une version cible ci-dessus'
                : 'Posez une question sur la migration… (Entrée pour envoyer)'
            }
            disabled={!ready || streaming}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '12px 56px 12px 16px', border: `1px solid ${t.border}`,
              borderRadius: t.radiusLg, fontSize: 14, resize: 'none',
              color: t.text, background: t.bgCard, outline: 'none',
              fontFamily: t.font, lineHeight: 1.6,
              transition: 'border-color .15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = `var(--brand, ${t.brand})`)}
            onBlur={e => (e.currentTarget.style.borderColor = t.border)}
          />
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={!streaming && (!input.trim() || !ready)}
            title={streaming ? 'Arrêter la génération' : 'Envoyer (Entrée)'}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              width: 36, height: 36,
              background: streaming ? t.danger : `var(--brand, ${t.brand})`,
              color: '#fff', border: 'none', borderRadius: '50%',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700,
              opacity: (!streaming && (!input.trim() || !ready)) ? .35 : 1,
              transition: 'background .15s, opacity .15s',
            }}
          >
            {streaming ? '⏹' : '↑'}
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  )
}
