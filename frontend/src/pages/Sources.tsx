import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listSshKeys, testGithubSsh, generateSshKey } from '../api/client'
import { t } from '../theme'

const VERSIONS = [
  { version: '19.0', label: 'Odoo 19', badge: 'Nouveau',  color: t.action },
  { version: '18.0', label: 'Odoo 18', badge: 'Stable',   color: t.success },
  { version: '17.0', label: 'Odoo 17', badge: 'LTS',      color: t.brand },
  { version: '16.0', label: 'Odoo 16', badge: '',          color: t.muted },
  { version: '15.0', label: 'Odoo 15', badge: '',          color: t.muted },
]

type CardState = 'idle' | 'running' | 'done' | 'error'

interface ProgressEvt {
  type: 'start' | 'log' | 'progress' | 'done' | 'error' | 'separator' | 'end'
  msg?: string; label?: string; pct?: number
}

interface VersionState {
  status: CardState
  pct: number           // 0-100
  currentLabel: string  // e.g. "Receiving objects : 67%  (12345/18432) — 3.45 MiB/s"
  logs: string[]
  showLogs: boolean
}

const defaultPath = (v: string) => `~/odoo-sources/${v}`

export default function Sources() {
  const qc = useQueryClient()
  const [cards,       setCards]       = useState<Record<string, VersionState>>({})
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({})
  const [enterprise,  setEnterprise]  = useState<Record<string, boolean>>({})
  const [advanced,    setAdvanced]    = useState<string | null>(null)
  const abortRefs                     = useRef<Record<string, AbortController>>({})

  // SSH state
  const [sshStep,   setSshStep]   = useState<'idle' | 'generating' | 'done'>('idle')
  const [publicKey, setPublicKey] = useState('')
  const [copied,    setCopied]    = useState(false)

  const { data: sshData,  refetch: recheckSsh } = useQuery({ queryKey: ['github-ssh'], queryFn: testGithubSsh, retry: false })
  const { data: keysData }                       = useQuery({ queryKey: ['ssh-keys'],   queryFn: listSshKeys,   retry: false })
  const sshOk   = sshData?.data?.accessible === true
  const hasKeys = (keysData?.data?.keys?.length ?? 0) > 0

  const genKey = useMutation({
    mutationFn: generateSshKey,
    onMutate:  () => setSshStep('generating'),
    onSuccess: (res) => { setSshStep('done'); setPublicKey(res.data.public_key) },
    onError:   () => setSshStep('idle'),
  })

  const setCard = (version: string, patch: Partial<VersionState>) =>
    setCards(prev => ({
      ...prev,
      [version]: { ...{ status: 'idle', pct: 0, currentLabel: '', logs: [], showLogs: false }, ...prev[version], ...patch },
    }))

  const toggleLogs = (version: string) =>
    setCards(prev => ({
      ...prev,
      [version]: { ...prev[version], showLogs: !prev[version]?.showLogs },
    }))

  const startSync = async (version: string) => {
    const path = customPaths[version] || defaultPath(version)
    const ent  = enterprise[version] ?? false

    // Cancel previous run for this version
    abortRefs.current[version]?.abort()
    const ctrl = new AbortController()
    abortRefs.current[version] = ctrl

    setCard(version, { status: 'running', pct: 0, currentLabel: 'Démarrage…', logs: [], showLogs: true })

    try {
      const res = await fetch('/api/sources/sync-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, path, community: true, enterprise: ent }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        setCard(version, { status: 'error', currentLabel: `Erreur HTTP ${res.status}` })
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
          let evt: ProgressEvt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }

          if (evt.type === 'progress') {
            setCard(version, { status: 'running', pct: evt.pct ?? 0, currentLabel: evt.label ?? '' })
            if (evt.label) setCards(prev => ({
              ...prev,
              [version]: { ...prev[version], logs: [...(prev[version]?.logs ?? []), evt.label!] },
            }))
          } else if (evt.type === 'log' || evt.type === 'start') {
            const msg = evt.msg ?? ''
            setCard(version, { currentLabel: msg })
            if (msg) setCards(prev => ({
              ...prev,
              [version]: { ...prev[version], logs: [...(prev[version]?.logs ?? []), msg] },
            }))
          } else if (evt.type === 'done') {
            setCard(version, { status: 'done', pct: 100, currentLabel: evt.msg ?? 'Terminé' })
            qc.invalidateQueries({ queryKey: ['github-ssh'] })
          } else if (evt.type === 'error') {
            setCard(version, { status: 'error', currentLabel: evt.msg ?? 'Erreur' })
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setCard(version, { status: 'error', currentLabel: String(err) })
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Sources Odoo</h1>
        <p style={{ fontSize: 14, color: t.muted }}>
          Téléchargez les sources Odoo sur votre ordinateur pour les consulter localement.
        </p>
      </div>

      {/* SSH banner */}
      {sshOk ? (
        <div style={banner(t.success)}>
          <span style={{ fontSize: 18 }}>🔑</span>
          <div>
            <strong style={{ color: t.text }}>Accès SSH GitHub disponible</strong>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
              Vous pouvez télécharger Odoo Enterprise en plus de Community.
            </div>
          </div>
        </div>
      ) : (
        <SshSetup
          hasKeys={hasKeys} sshStep={sshStep} publicKey={publicKey} copied={copied}
          onGenerate={() => genKey.mutate()}
          onCopy={() => { navigator.clipboard.writeText(publicKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          onRecheck={() => recheckSsh()}
        />
      )}

      {/* Version cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {VERSIONS.map(({ version, label, badge, color }) => {
          const card   = cards[version]
          const status = card?.status ?? 'idle'
          const pct    = card?.pct    ?? 0
          const isOpen = advanced === version

          return (
            <div key={version} style={versionCard(status)}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: t.text }}>{label}</div>
                  {badge && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#fff', background: color,
                      borderRadius: 3, padding: '2px 8px', marginTop: 5, display: 'inline-block',
                    }}>{badge}</span>
                  )}
                </div>
                <StatusBadge status={status} />
              </div>

              {/* Progress bar — always reserve space */}
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  height: 6, background: t.borderLight, borderRadius: 3, overflow: 'hidden',
                  opacity: status === 'idle' ? 0 : 1, transition: 'opacity .3s',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: status === 'error' ? t.danger : status === 'done' ? t.success : t.action,
                    width: status === 'running' && pct === 0 ? '100%' : `${pct}%`,
                    transition: 'width .4s ease',
                    animation: status === 'running' && pct === 0 ? 'indeterminate 1.5s infinite' : 'none',
                  }} />
                </div>
                {(status === 'running' || status === 'error') && card?.currentLabel && (
                  <div style={{
                    fontSize: 11, color: status === 'error' ? t.danger : t.muted,
                    marginTop: 4, fontFamily: 'monospace', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {card.currentLabel}
                  </div>
                )}
                {status === 'done' && (
                  <div style={{ fontSize: 11, color: t.success, marginTop: 4 }}>✓ {card?.currentLabel}</div>
                )}
              </div>

              {/* Enterprise toggle */}
              {sshOk && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enterprise[version] ?? false}
                    onChange={e => setEnterprise(p => ({ ...p, [version]: e.target.checked }))}
                    style={{ accentColor: t.brand, width: 14, height: 14 }} />
                  <span style={{ color: t.muted }}>Inclure Enterprise</span>
                </label>
              )}

              {/* Advanced */}
              <button onClick={() => setAdvanced(isOpen ? null : version)}
                style={{ background: 'none', border: 'none', color: t.action, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                {isOpen ? '▲ Masquer' : '▼ Options avancées'}
              </button>

              {isOpen && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, color: t.muted, marginBottom: 4 }}>Dossier</label>
                  <input value={customPaths[version] ?? ''} placeholder={defaultPath(version)}
                    onChange={e => setCustomPaths(p => ({ ...p, [version]: e.target.value }))}
                    style={{ width: '100%', padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12 }} />
                </div>
              )}

              {/* Logs toggle */}
              {(card?.logs?.length ?? 0) > 0 && (
                <button onClick={() => toggleLogs(version)}
                  style={{ background: 'none', border: 'none', color: t.muted, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                  {card?.showLogs ? '▲ Masquer les logs' : `▼ Voir les logs (${card?.logs.length})`}
                </button>
              )}

              {card?.showLogs && (
                <LogBox logs={card.logs} />
              )}

              {/* Action button */}
              <button
                disabled={status === 'running'}
                onClick={() => status === 'running' ? abortRefs.current[version]?.abort() : startSync(version)}
                style={btnDownload(status)}
              >
                {status === 'running' ? '⏹ Annuler' : status === 'done' ? '↺ Mettre à jour' : '⬇ Télécharger'}
              </button>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); width: 40% }
          100% { transform: translateX(280%);  width: 40% }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function LogBox({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{
      background: '#1e1e2e', borderRadius: t.radius, padding: '10px 12px',
      maxHeight: 160, overflowY: 'auto', marginBottom: 10,
      fontFamily: 'monospace', fontSize: 11, color: '#a6e3a1',
      lineHeight: 1.6,
    }}>
      {logs.map((l, i) => {
        const isErr = l.startsWith('✗') || l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal')
        return (
          <div key={i} style={{ color: isErr ? '#f38ba8' : l.startsWith('✓') ? '#a6e3a1' : '#cdd6f4' }}>
            {l}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: CardState }) {
  const cfg: Record<CardState, { icon: string; bg: string; color: string }> = {
    idle:    { icon: '○',  bg: t.borderLight, color: t.muted },
    running: { icon: '⟳',  bg: `${t.action}20`, color: t.action },
    done:    { icon: '✓',  bg: `${t.success}20`, color: t.success },
    error:   { icon: '✗',  bg: `${t.danger}20`,  color: t.danger },
  }
  const { icon, bg, color } = cfg[status]
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, flexShrink: 0,
      animation: status === 'running' ? 'spin .9s linear infinite' : 'none',
    }}>
      {icon}
    </div>
  )
}

function SshSetup({ hasKeys, sshStep, publicKey, copied, onGenerate, onCopy, onRecheck }: {
  hasKeys: boolean; sshStep: string; publicKey: string; copied: boolean
  onGenerate: () => void; onCopy: () => void; onRecheck: () => void
}) {
  return (
    <div style={{ ...banner(t.warning), flexDirection: 'column', gap: 0, marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: t.text }}>Pas d'accès SSH GitHub</strong>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>
            {hasKeys
              ? "Une clé SSH existe mais n'est pas encore autorisée sur GitHub."
              : "Aucune clé SSH. Créez-en une pour télécharger Odoo Enterprise."}
          </div>
        </div>
        {sshStep === 'idle' && (
          <button onClick={onGenerate} style={btnTeal}>
            {hasKeys ? 'Voir ma clé' : '+ Créer une clé SSH'}
          </button>
        )}
      </div>

      {sshStep === 'generating' && (
        <div style={{ marginTop: 14, fontSize: 13, color: t.muted }}>⟳ Génération en cours…</div>
      )}

      {sshStep === 'done' && (
        <div style={{ marginTop: 18, background: '#fafafa', border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, marginBottom: 16, color: t.text }}>
            Ajoutez la clé SSH à GitHub — 3 étapes
          </div>

          <SshStep n={1} title="Copiez votre clé publique">
            <div style={{ position: 'relative', marginTop: 8 }}>
              <textarea readOnly value={publicKey} style={{
                width: '100%', height: 70, resize: 'none',
                fontFamily: 'monospace', fontSize: 11,
                padding: '8px 10px', background: '#f0f0f0',
                border: `1px solid ${t.border}`, borderRadius: t.radiusSm, color: t.text,
              }} />
              <button onClick={onCopy} style={{
                position: 'absolute', top: 8, right: 8, padding: '3px 10px',
                fontSize: 11, background: copied ? t.success : t.brand,
                color: '#fff', border: 'none', borderRadius: t.radiusSm, cursor: 'pointer', fontWeight: 600,
              }}>
                {copied ? '✓ Copié !' : 'Copier'}
              </button>
            </div>
          </SshStep>

          <SshStep n={2} title="Ouvrez les paramètres SSH GitHub">
            <a href="https://github.com/settings/ssh/new" target="_blank" rel="noreferrer"
              style={{ fontSize: 13, color: t.action, fontWeight: 600, display: 'block', marginTop: 5 }}>
              github.com/settings/ssh/new →
            </a>
          </SshStep>

          <SshStep n={3} title={`Collez la clé et cliquez "Add SSH key"`}>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 5 }}>
              Champ <strong>Title</strong> : <em>"Odoo Portal"</em> — champ <strong>Key</strong> : collez la clé copiée.
            </div>
          </SshStep>

          <button onClick={onRecheck} style={{ ...btnTeal, marginTop: 6 }}>
            J'ai ajouté la clé — vérifier l'accès →
          </button>
        </div>
      )}
    </div>
  )
}

function SshStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: t.action, color: '#fff', fontSize: 12,
        fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────

function banner(color: string): React.CSSProperties {
  return {
    background: t.white, border: `1px solid ${color}`,
    borderLeft: `4px solid ${color}`, borderRadius: t.radius,
    padding: '14px 18px', marginBottom: 24,
    display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 13,
  }
}

function versionCard(status: CardState): React.CSSProperties {
  const borderColor = status === 'done' ? t.success : status === 'error' ? t.danger : t.border
  return {
    background: t.white, border: `1px solid ${borderColor}`,
    borderRadius: t.radiusLg, padding: 20, boxShadow: t.shadow,
    display: 'flex', flexDirection: 'column', transition: 'border-color .2s',
  }
}

function btnDownload(status: CardState): React.CSSProperties {
  const bg = status === 'running' ? t.danger : t.action
  return {
    marginTop: 'auto', padding: '8px 0', width: '100%',
    background: bg, color: '#fff', border: 'none',
    borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  }
}

const btnTeal: React.CSSProperties = {
  padding: '7px 14px', background: t.action, color: '#fff',
  border: 'none', borderRadius: t.radius, fontSize: 12,
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
}
