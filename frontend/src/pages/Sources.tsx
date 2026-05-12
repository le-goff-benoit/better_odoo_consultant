import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listSshKeys, testGithubSsh, generateSshKey, checkAllSources, checkSourceUpdates, checkSingleVersion } from '../api/client'
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
  pct: number
  currentLabel: string
  logs: string[]
  showLogs: boolean
}

interface RecentCommit { sha: string; message: string; author: string; date: string }
interface RepoInfo {
  installed: boolean; path: string; head?: string; message?: string
  date?: string; behind?: number; branch?: string
  recent_commits?: RecentCommit[]; error?: string
}

const defaultPath = (v: string) => `~/odoo-sources/${v}`

function relativeDate(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an(s)`
}

export default function Sources() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const [cards,          setCards]          = useState<Record<string, VersionState>>({})
  const [customPaths,    setCustomPaths]    = useState<Record<string, string>>({})
  const [enterprise,     setEnterprise]     = useState<Record<string, boolean>>({})
  const [advanced,       setAdvanced]       = useState<string | null>(null)
  const [showCommits,    setShowCommits]    = useState<Record<string, boolean>>({})
  const [repoOverrides,  setRepoOverrides]  = useState<Record<string, RepoInfo>>({})
  const [updatesLoading, setUpdatesLoading] = useState<Record<string, boolean>>({})
  const abortRefs = useRef<Record<string, AbortController>>({})

  // SSH state
  const [sshStep,        setSshStep]       = useState<'idle' | 'generating' | 'done'>('idle')
  const [publicKey,      setPublicKey]     = useState('')
  const [copied,         setCopied]        = useState(false)
  const [customVersions, setCustomVersions] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('odoo-custom-versions') ?? '[]') } catch { return [] }
  })
  const [customInput,    setCustomInput]   = useState('')
  const [customStatus,   setCustomStatus]  = useState<Record<string, Record<string, { installed: boolean }>>>({})
  const [showCustomForm, setShowCustomForm] = useState(false)

  const { data: sshData,  refetch: recheckSsh } = useQuery({ queryKey: ['github-ssh'], queryFn: testGithubSsh, retry: false })
  const { data: keysData }                       = useQuery({ queryKey: ['ssh-keys'],   queryFn: listSshKeys,   retry: false })
  const { data: allStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['sources-status'],
    queryFn: checkAllSources,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  })

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
      [version]: { ...{ status: 'idle' as CardState, pct: 0, currentLabel: '', logs: [], showLogs: false }, ...prev[version], ...patch },
    }))

  const addCustomVersion = () => {
    const v = customInput.trim()
    if (!v || !/^\d+\.\d+$/.test(v) || customVersions.includes(v) || VERSIONS.some(x => x.version === v)) return
    const updated = [...customVersions, v]
    setCustomVersions(updated)
    localStorage.setItem('odoo-custom-versions', JSON.stringify(updated))
    setCustomInput('')
    checkSingleVersion(v).then(res => setCustomStatus(prev => ({ ...prev, [v]: res.data ?? {} })))
  }

  const removeCustomVersion = (v: string) => {
    const updated = customVersions.filter(x => x !== v)
    setCustomVersions(updated)
    localStorage.setItem('odoo-custom-versions', JSON.stringify(updated))
  }

  const refreshCustomStatus = (v: string) =>
    checkSingleVersion(v).then(res => setCustomStatus(prev => ({ ...prev, [v]: res.data ?? {} })))

  const toggleLogs = (version: string) =>
    setCards(prev => ({
      ...prev,
      [version]: { ...prev[version], showLogs: !prev[version]?.showLogs },
    }))

  const doCheckUpdates = async (version: string) => {
    const path = customPaths[version] || defaultPath(version)
    setUpdatesLoading(p => ({ ...p, [version]: true, [`${version}-enterprise`]: true }))
    try {
      const [commRes, entRes] = await Promise.allSettled([
        checkSourceUpdates(version, path),
        checkSourceUpdates(`${version}-enterprise`, path.replace(version, `${version}-enterprise`)),
      ])
      if (commRes.status === 'fulfilled')
        setRepoOverrides(p => ({ ...p, [version]: commRes.value.data }))
      if (entRes.status === 'fulfilled')
        setRepoOverrides(p => ({ ...p, [`${version}-enterprise`]: entRes.value.data }))
    } finally {
      setUpdatesLoading(p => ({ ...p, [version]: false, [`${version}-enterprise`]: false }))
    }
  }

  const startSync = async (version: string) => {
    const path = customPaths[version] || defaultPath(version)
    const ent  = enterprise[version] ?? false

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
            qc.invalidateQueries({ queryKey: ['sources-status'] })
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

  const statusData: Record<string, RepoInfo> = allStatus?.data ?? {}

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {VERSIONS.map(({ version, label, badge, color }) => {
          const card      = cards[version]
          const status    = card?.status ?? 'idle'
          const pct       = card?.pct    ?? 0
          const isOpen    = advanced === version
          const repoInfo  = repoOverrides[version] ?? statusData[version]
          const entInfo   = repoOverrides[`${version}-enterprise`] ?? statusData[`${version}-enterprise`]
          const checking  = updatesLoading[version] ?? false

          return (
            <div key={version} style={versionCard(status, repoInfo?.installed)}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: t.text }}>{label}</div>
                  {badge && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#fff', background: color,
                      borderRadius: 3, padding: '2px 8px', marginTop: 5, display: 'inline-block',
                    }}>{badge}</span>
                  )}
                </div>
                <StatusBadge status={status} isInstalled={repoInfo?.installed} loading={statusLoading} />
              </div>

              {/* Installed info strip */}
              {!statusLoading && repoInfo && (
                <InstalledStrip
                  info={repoInfo}
                  entInfo={entInfo}
                  version={version}
                  label={label}
                  showCommits={showCommits[version] ?? false}
                  onToggleCommits={() => setShowCommits(p => ({ ...p, [version]: !p[version] }))}
                  onCheckUpdates={() => doCheckUpdates(version)}
                  checking={checking}
                  onAiSummary={(prefill) => navigate('/assistant', { state: { prefill, version, autoSend: true } })}
                />
              )}

              {/* Progress bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  height: 5, background: t.borderLight, borderRadius: 3, overflow: 'hidden',
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
                    style={{ width: '100%', padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, boxSizing: 'border-box' }} />
                </div>
              )}

              {/* Logs toggle */}
              {(card?.logs?.length ?? 0) > 0 && (
                <button onClick={() => toggleLogs(version)}
                  style={{ background: 'none', border: 'none', color: t.muted, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                  {card?.showLogs ? '▲ Masquer les logs' : `▼ Voir les logs (${card?.logs.length})`}
                </button>
              )}

              {card?.showLogs && <LogBox logs={card.logs} />}

              {/* Action button */}
              <button
                disabled={status === 'running'}
                onClick={() => status === 'running' ? abortRefs.current[version]?.abort() : startSync(version)}
                style={btnDownload(status, repoInfo?.installed)}
              >
                {status === 'running' ? '⏹ Annuler'
                  : repoInfo?.installed ? '↺ Mettre à jour'
                  : '⬇ Télécharger'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Custom / intermediate versions */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Versions intermédiaires
          </h2>
          <button onClick={() => setShowCustomForm(f => !f)} style={{
            padding: '3px 10px', background: 'none', border: `1px solid ${t.border}`,
            borderRadius: t.radiusFull, fontSize: 11, cursor: 'pointer', color: t.muted,
          }}>
            {showCustomForm ? '✕ Fermer' : '+ Ajouter'}
          </button>
        </div>

        {showCustomForm && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomVersion()}
              placeholder="ex: 19.1 ou 18.2"
              style={{
                padding: '7px 12px', border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 13, color: t.text, background: t.bgCard, width: 140, outline: 'none',
              }}
            />
            <button onClick={addCustomVersion} style={{
              padding: '7px 16px', background: t.brand, color: '#fff', border: 'none',
              borderRadius: t.radius, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Ajouter</button>
            <span style={{ fontSize: 11, color: t.muted, alignSelf: 'center' }}>
              Format : majeur.mineur (ex: 19.1)
            </span>
          </div>
        )}

        {customVersions.length === 0 ? (
          <p style={{ fontSize: 13, color: t.muted }}>
            Aucune version intermédiaire ajoutée. Cliquez sur "+ Ajouter" pour suivre une version comme 19.1 ou 18.2.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {customVersions.map(v => {
              const st = customStatus[v]
              const comm = st?.[v]
              const ent  = st?.[`${v}-enterprise`]
              return (
                <div key={v} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', background: t.bgCard,
                  border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
                }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Odoo {v}</span>
                    <span style={{ fontSize: 11, color: t.muted, marginLeft: 10 }}>version intermédiaire</span>
                    {comm !== undefined && (
                      <div style={{ fontSize: 12, color: comm.installed ? t.success : t.muted, marginTop: 4 }}>
                        Community : {comm.installed ? '✓ Installé' : '✗ Non installé'}
                        {ent && <span style={{ marginLeft: 14, color: ent.installed ? t.success : t.muted }}>
                          Enterprise : {ent.installed ? '✓' : '✗'}
                        </span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => refreshCustomStatus(v)} style={{
                    padding: '5px 10px', background: 'none', border: `1px solid ${t.border}`,
                    borderRadius: t.radius, fontSize: 11, cursor: 'pointer', color: t.muted,
                  }}>Vérifier</button>
                  <button
                    onClick={() => startSync(v)}
                    style={{
                      padding: '5px 12px', background: t.brand, color: '#fff', border: 'none',
                      borderRadius: t.radius, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {cards[v]?.status === 'running' ? '...' : comm?.installed ? '↺ Mettre à jour' : '⬇ Télécharger'}
                  </button>
                  <button onClick={() => removeCustomVersion(v)} style={{
                    padding: '5px 8px', background: 'none', border: `1px solid ${t.border}`,
                    borderRadius: t.radius, fontSize: 11, cursor: 'pointer', color: t.muted,
                  }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); width: 40% }
          100% { transform: translateX(280%);  width: 40% }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

// ── InstalledStrip ──────────────────────────────────────────────

function InstalledStrip({ info, entInfo, version: _version, label, showCommits, onToggleCommits, onCheckUpdates, checking, onAiSummary }: {
  info: RepoInfo; entInfo?: RepoInfo
  version: string; label: string; showCommits: boolean
  onToggleCommits: () => void; onCheckUpdates: () => void; checking: boolean
  onAiSummary: (prefill: string) => void
}) {
  if (!info.installed && (!entInfo || !entInfo.installed)) {
    return (
      <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
        Non installé
      </div>
    )
  }

  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const recentCommits = (info.recent_commits ?? []).filter(c => new Date(c.date).getTime() >= thirtyDaysAgo)
  const hasAiData = recentCommits.length > 0

  const buildPrefill = () => {
    const lines = recentCommits.map(c =>
      `- \`${c.sha}\` ${c.message} (${relativeDate(c.date)}, ${c.author})`
    )
    return `Voici les ${recentCommits.length} commits de **${label}** des 30 derniers jours :\n\n${lines.join('\n')}\n\nFais-moi un résumé clair des changements importants et leur impact potentiel pour un consultant Odoo.`
  }

  return (
    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${t.border}` }}>
      {/* Community row */}
      {info.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: entInfo?.installed ? 4 : 0 }}>
          <span style={{ fontSize: 11, color: t.success, fontWeight: 600 }}>✓ Community</span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{info.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(info.date)}</span>
          {(info.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>
              {info.behind} en retard
            </span>
          )}
        </div>
      )}

      {/* Enterprise row */}
      {entInfo?.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: t.brand, fontWeight: 600 }}>✓ Enterprise</span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{entInfo.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(entInfo.date)}</span>
          {(entInfo.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>
              {entInfo.behind} en retard
            </span>
          )}
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {(info.recent_commits?.length ?? 0) > 0 && (
          <button onClick={onToggleCommits} style={btnGhost}>
            {showCommits ? '▲ Masquer' : `▼ ${info.recent_commits!.length} commits`}
          </button>
        )}
        {hasAiData && (
          <button
            onClick={() => onAiSummary(buildPrefill())}
            style={{
              ...btnGhost,
              color: t.brand, borderColor: `${t.brand}50`,
              background: `${t.brand}08`, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            ✦ IA — Résumé 30 j
          </button>
        )}
        <button onClick={onCheckUpdates} disabled={checking} style={{ ...btnGhost, marginLeft: 'auto' }}>
          {checking ? '⟳ Vérification…' : '↻ Vérifier les mises à jour'}
        </button>
      </div>

      {/* Recent commits panel */}
      {showCommits && info.recent_commits && (
        <div style={{
          marginTop: 8, background: '#1e1e2e', borderRadius: t.radiusSm,
          padding: '8px 10px', maxHeight: 180, overflowY: 'auto',
        }}>
          {info.recent_commits.map(c => (
            <div key={c.sha} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#89b4fa', flexShrink: 0, marginTop: 1 }}>{c.sha}</span>
              <span style={{ fontSize: 11, color: '#cdd6f4', flex: 1, lineHeight: 1.4 }}>{c.message}</span>
              <span style={{ fontSize: 10, color: '#585b70', flexShrink: 0 }}>{relativeDate(c.date)}</span>
            </div>
          ))}
        </div>
      )}
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

function StatusBadge({ status, isInstalled, loading }: { status: CardState; isInstalled?: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: t.borderLight, color: t.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        animation: 'spin .9s linear infinite',
      }}>⟳</div>
    )
  }
  const cfg: Record<CardState, { icon: string; bg: string; color: string }> = {
    idle:    isInstalled
      ? { icon: '✓', bg: `${t.success}20`, color: t.success }
      : { icon: '○', bg: t.borderLight, color: t.muted },
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
                boxSizing: 'border-box',
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
            {"J'ai ajouté la clé — vérifier l'accès →"}
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

function versionCard(status: CardState, installed?: boolean): React.CSSProperties {
  const borderColor = status === 'done' ? t.success
    : status === 'error' ? t.danger
    : installed ? `${t.success}40`
    : t.border
  return {
    background: t.white, border: `1px solid ${borderColor}`,
    borderRadius: t.radiusLg, padding: 20, boxShadow: t.shadow,
    display: 'flex', flexDirection: 'column', transition: 'border-color .2s',
  }
}

function btnDownload(status: CardState, installed?: boolean): React.CSSProperties {
  const bg = status === 'running' ? t.danger : installed ? t.brand : t.action
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

const btnGhost: React.CSSProperties = {
  background: 'none', border: `1px solid ${t.border}`, color: t.muted,
  borderRadius: t.radiusSm, fontSize: 11, cursor: 'pointer', padding: '3px 8px',
}
