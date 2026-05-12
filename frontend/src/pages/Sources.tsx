import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listSshKeys, testGithubSsh, generateSshKey, checkAllSources, checkSourceUpdates, checkSingleVersion } from '../api/client'
import { t, btn } from '../theme'

// ── Version definitions ─────────────────────────────────────────

const MAJOR_VERSIONS = [
  { version: '19.0', label: 'Odoo 19', badge: 'Nouveau',  badgeColor: t.action },
  { version: '18.0', label: 'Odoo 18', badge: 'Stable',   badgeColor: t.success },
  { version: '17.0', label: 'Odoo 17', badge: 'LTS',      badgeColor: t.brand },
  { version: '16.0', label: 'Odoo 16', badge: '',          badgeColor: t.muted },
  { version: '15.0', label: 'Odoo 15', badge: '',          badgeColor: t.muted },
]

type VersionDef = { version: string; label: string; badge: string; badgeColor: string; isMajor: boolean }

// ── Types ───────────────────────────────────────────────────────

type CardState = 'idle' | 'running' | 'done' | 'error'

interface ProgressEvt {
  type: 'start' | 'log' | 'progress' | 'done' | 'error' | 'separator' | 'end'
  msg?: string; label?: string; pct?: number
}

interface VersionState {
  status: CardState; pct: number; currentLabel: string; logs: string[]; showLogs: boolean
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

// ── Main component ──────────────────────────────────────────────

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
  const [extraStatus,    setExtraStatus]    = useState<Record<string, RepoInfo>>({})
  const abortRefs = useRef<Record<string, AbortController>>({})

  // SSH state
  const [sshStep,  setSshStep]  = useState<'idle' | 'generating' | 'done'>('idle')
  const [publicKey, setPublicKey] = useState('')
  const [copied,   setCopied]   = useState(false)

  // Custom (intermediate) versions — persisted in localStorage
  const [customVersions, setCustomVersions] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('odoo-custom-versions') ?? '[]') } catch { return [] }
  })
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [customInput,  setCustomInput]  = useState('')

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

  // Merged status for all versions (major + custom + overrides)
  const allVersionStatus: Record<string, RepoInfo> = useMemo(() => ({
    ...(allStatus?.data ?? {}),
    ...extraStatus,
    ...repoOverrides,
  }), [allStatus, extraStatus, repoOverrides])

  // Auto-check enterprise when status loads (if already installed)
  useEffect(() => {
    if (!allStatus?.data) return
    const data: Record<string, RepoInfo> = allStatus.data
    setEnterprise(prev => {
      const next = { ...prev }
      for (const [key, val] of Object.entries(data)) {
        if (key.endsWith('-enterprise') && val.installed) {
          const ver = key.replace('-enterprise', '')
          if (!(ver in next)) next[ver] = true
        }
      }
      return next
    })
  }, [allStatus])

  // Fetch status for custom versions
  const fetchCustomStatus = useCallback(async (v: string) => {
    try {
      const res = await checkSingleVersion(v)
      const data: Record<string, RepoInfo> = res.data ?? {}
      setExtraStatus(prev => ({ ...prev, ...data }))
      // Auto-check enterprise for custom versions too
      const entKey = `${v}-enterprise`
      if (data[entKey]?.installed) {
        setEnterprise(prev => (prev[v] !== undefined ? prev : { ...prev, [v]: true }))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    customVersions.forEach(v => {
      if (!extraStatus[v]) fetchCustomStatus(v)
    })
  }, [customVersions])

  // Unified sorted list of all versions
  const allVersionDefs: VersionDef[] = useMemo(() => {
    const major: VersionDef[] = MAJOR_VERSIONS.map(v => ({ ...v, isMajor: true }))
    const custom: VersionDef[] = customVersions.map(v => ({
      version: v,
      label: `Odoo ${v}`,
      badge: `saas-${v}`,
      badgeColor: '#8B5CF6',
      isMajor: false,
    }))
    return [...major, ...custom].sort((a, b) => {
      const [aMaj, aMin = 0] = a.version.split('.').map(Number)
      const [bMaj, bMin = 0] = b.version.split('.').map(Number)
      return bMaj !== aMaj ? bMaj - aMaj : bMin - aMin
    })
  }, [customVersions])

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
    if (!v || !/^\d+\.\d+$/.test(v)) return
    if (customVersions.includes(v) || MAJOR_VERSIONS.some(x => x.version === v)) return
    const updated = [...customVersions, v]
    setCustomVersions(updated)
    localStorage.setItem('odoo-custom-versions', JSON.stringify(updated))
    setCustomInput('')
    setShowAddForm(false)
    fetchCustomStatus(v)
  }

  const removeCustomVersion = (v: string) => {
    const updated = customVersions.filter(x => x !== v)
    setCustomVersions(updated)
    localStorage.setItem('odoo-custom-versions', JSON.stringify(updated))
    setExtraStatus(prev => {
      const next = { ...prev }
      delete next[v]; delete next[`${v}-enterprise`]
      return next
    })
  }

  const doCheckUpdates = async (version: string) => {
    const path = customPaths[version] || defaultPath(version)
    setUpdatesLoading(p => ({ ...p, [version]: true, [`${version}-enterprise`]: true }))
    try {
      const [commRes, entRes] = await Promise.allSettled([
        checkSourceUpdates(version, path),
        checkSourceUpdates(`${version}-enterprise`, path.replace(version, `${version}-enterprise`)),
      ])
      if (commRes.status === 'fulfilled') setRepoOverrides(p => ({ ...p, [version]: commRes.value.data }))
      if (entRes.status === 'fulfilled')  setRepoOverrides(p => ({ ...p, [`${version}-enterprise`]: entRes.value.data }))
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

    setCard(version, { status: 'running', pct: 0, currentLabel: 'Démarrage…', logs: [], showLogs: false })

    try {
      const res = await fetch('/api/sources/sync-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, path, community: true, enterprise: ent }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        setCard(version, { status: 'error', currentLabel: `Erreur HTTP ${res.status}` }); return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt: ProgressEvt
          try { evt = JSON.parse(line.slice(6)) } catch { continue }

          if (evt.type === 'progress') {
            setCard(version, { pct: evt.pct ?? 0, currentLabel: evt.label ?? '' })
            if (evt.label) setCards(p => ({ ...p, [version]: { ...p[version], logs: [...(p[version]?.logs ?? []), evt.label!] } }))
          } else if (evt.type === 'log' || evt.type === 'start') {
            const msg = evt.msg ?? ''
            setCard(version, { currentLabel: msg })
            if (msg) setCards(p => ({ ...p, [version]: { ...p[version], logs: [...(p[version]?.logs ?? []), msg] } }))
          } else if (evt.type === 'done') {
            setCard(version, { status: 'done', pct: 100, currentLabel: evt.msg ?? 'Terminé' })
            qc.invalidateQueries({ queryKey: ['sources-status'] })
            if (!MAJOR_VERSIONS.some(v => v.version === version)) fetchCustomStatus(version)
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
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Sources Odoo</h1>
          <p style={{ fontSize: 14, color: t.muted }}>
            Téléchargez et maintenez les sources Odoo localement pour consultation et analyse.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {showAddForm ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomVersion()}
                placeholder="ex: 19.1 ou 18.2"
                autoFocus
                style={{
                  padding: '7px 12px', border: `1px solid ${t.border}`, borderRadius: t.radius,
                  fontSize: 13, color: t.text, background: t.bgCard, width: 130, outline: 'none',
                }}
              />
              <button onClick={addCustomVersion} style={btnPrimary}>Ajouter</button>
              <button onClick={() => { setShowAddForm(false); setCustomInput('') }} style={btnSecondary}>✕</button>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)} style={btnSecondary}>
              + Version intermédiaire
            </button>
          )}
        </div>
      </div>

      {/* SSH banner */}
      {sshOk ? (
        <div style={bannerStyle(t.success)}>
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

      {/* Unified version cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {allVersionDefs.map(({ version, label, badge, badgeColor, isMajor }) => {
          const card     = cards[version]
          const status   = card?.status ?? 'idle'
          const pct      = card?.pct    ?? 0
          const isOpen   = advanced === version
          const repoInfo = allVersionStatus[version]
          const entInfo  = allVersionStatus[`${version}-enterprise`]
          const checking = updatesLoading[version] ?? false
          const isInstalled = repoInfo?.installed

          // Progress stripe color
          const stripeColor = status === 'running' ? t.action
            : status === 'error' ? t.danger
            : status === 'done' ? t.success
            : isInstalled ? t.success
            : 'transparent'

          const stripeWidth = status === 'idle'
            ? (isInstalled ? '100%' : '0%')
            : status === 'running'
              ? (pct === 0 ? '30%' : `${pct}%`)
              : '100%'

          return (
            <div key={version} style={{
              background: t.white,
              border: `1px solid ${
                status === 'error' ? t.danger
                : status === 'done' ? t.success
                : isInstalled ? `${t.success}40`
                : t.border
              }`,
              borderRadius: t.radiusLg,
              boxShadow: t.shadow,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: 'border-color .2s',
            }}>
              {/* Progress stripe — always visible at top */}
              <div style={{ height: 4, background: t.borderLight, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  background: stripeColor,
                  width: stripeWidth,
                  transition: status === 'running' && pct > 0 ? 'width .4s ease' : 'width .6s ease',
                  animation: status === 'running' && pct === 0 ? 'indeterminate 1.5s infinite' : 'none',
                }} />
              </div>

              <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: t.text }}>{label}</div>
                      {!isMajor && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: '#8B5CF6',
                          background: '#8B5CF615', border: '1px solid #8B5CF640',
                          borderRadius: 3, padding: '1px 6px', letterSpacing: '.02em',
                        }}>saas</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {badge && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: '#fff',
                          background: badgeColor, borderRadius: 3, padding: '2px 8px',
                        }}>{badge}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!isMajor && (
                      <button onClick={() => removeCustomVersion(version)} style={{
                        background: 'none', border: 'none', color: t.muted, fontSize: 16,
                        cursor: 'pointer', padding: '2px 4px', lineHeight: 1,
                      }} title="Retirer cette version">×</button>
                    )}
                    <StatusBadge status={status} isInstalled={isInstalled} loading={statusLoading} />
                  </div>
                </div>

                {/* Running status label */}
                {(status === 'running' || status === 'error' || status === 'done') && card?.currentLabel && (
                  <div style={{
                    fontSize: 11, marginBottom: 8,
                    color: status === 'error' ? t.danger : status === 'done' ? t.success : t.muted,
                    fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {status === 'running' ? `⟳ ${card.currentLabel}` : status === 'done' ? `✓ ${card.currentLabel}` : `✗ ${card.currentLabel}`}
                  </div>
                )}

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

                {/* Enterprise toggle */}
                {sshOk && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={enterprise[version] ?? false}
                      onChange={e => setEnterprise(p => ({ ...p, [version]: e.target.checked }))}
                      style={{ accentColor: 'var(--brand, #017e84)', width: 14, height: 14 }} />
                    <span style={{ color: t.muted }}>
                      Inclure Enterprise
                      {entInfo?.installed && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: t.success, fontWeight: 600 }}>✓ installé</span>
                      )}
                    </span>
                  </label>
                )}

                {/* Advanced toggle */}
                <button onClick={() => setAdvanced(isOpen ? null : version)}
                  style={{ background: 'none', border: 'none', color: t.action, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 6, textAlign: 'left' }}>
                  {isOpen ? '▲ Masquer options' : '▼ Options avancées'}
                </button>

                {isOpen && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, color: t.muted, marginBottom: 4 }}>Dossier cible</label>
                    <input value={customPaths[version] ?? ''} placeholder={defaultPath(version)}
                      onChange={e => setCustomPaths(p => ({ ...p, [version]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, boxSizing: 'border-box', background: t.bgCard, color: t.text }} />
                  </div>
                )}

                {/* Logs */}
                {(card?.logs?.length ?? 0) > 0 && (
                  <button onClick={() => setCards(p => ({ ...p, [version]: { ...p[version], showLogs: !p[version]?.showLogs } }))}
                    style={{ background: 'none', border: 'none', color: t.muted, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 6, textAlign: 'left' }}>
                    {card?.showLogs ? '▲ Masquer les logs' : `▼ Voir les logs (${card?.logs.length})`}
                  </button>
                )}
                {card?.showLogs && <LogBox logs={card.logs} />}

                {/* Action button */}
                <button
                  disabled={status === 'running'}
                  onClick={() => status === 'running' ? abortRefs.current[version]?.abort() : startSync(version)}
                  style={btnDownload(status, isInstalled)}
                >
                  {status === 'running' ? '⏹ Annuler'
                    : isInstalled ? '↺ Mettre à jour'
                    : '⬇ Télécharger'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes indeterminate {
          0%   { left: -40%; width: 40% }
          100% { left: 100%; width: 40% }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

// ── InstalledStrip ──────────────────────────────────────────────

function InstalledStrip({ info, entInfo, version: _version, label, showCommits, onToggleCommits, onCheckUpdates, checking, onAiSummary }: {
  info: RepoInfo; entInfo?: RepoInfo; version: string; label: string
  showCommits: boolean; onToggleCommits: () => void; onCheckUpdates: () => void
  checking: boolean; onAiSummary: (prefill: string) => void
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
      {info.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: entInfo?.installed ? 3 : 0 }}>
          <span style={{ fontSize: 11, color: t.success, fontWeight: 600 }}>✓ Community</span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{info.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(info.date)}</span>
          {(info.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>{info.behind} en retard</span>
          )}
        </div>
      )}
      {entInfo?.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--brand, #017e84)', fontWeight: 600 }}>✓ Enterprise</span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{entInfo.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(entInfo.date)}</span>
          {(entInfo.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>{entInfo.behind} en retard</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {(info.recent_commits?.length ?? 0) > 0 && (
          <button onClick={onToggleCommits} style={btnGhost}>
            {showCommits ? '▲ Masquer' : `▼ ${info.recent_commits!.length} commits`}
          </button>
        )}
        {hasAiData && (
          <button onClick={() => onAiSummary(buildPrefill())} style={{
            ...btnGhost, color: 'var(--brand, #017e84)', borderColor: 'var(--brand, #017e84)',
            background: 'transparent', fontWeight: 600,
          }}>
            ✦ IA — Résumé 30 j
          </button>
        )}
        <button onClick={onCheckUpdates} disabled={checking} style={{ ...btnGhost, marginLeft: 'auto' }}>
          {checking ? '⟳ Vérif…' : '↻ Vérifier'}
        </button>
      </div>
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
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  return (
    <div ref={ref} style={{
      background: '#1e1e2e', borderRadius: t.radius, padding: '10px 12px',
      maxHeight: 160, overflowY: 'auto', marginBottom: 10,
      fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
    }}>
      {logs.map((l, i) => {
        const isErr = l.startsWith('✗') || l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal')
        return (
          <div key={i} style={{ color: isErr ? '#f38ba8' : l.startsWith('✓') ? '#a6e3a1' : '#cdd6f4' }}>{l}</div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status, isInstalled, loading }: { status: CardState; isInstalled?: boolean; loading?: boolean }) {
  if (loading) return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: t.borderLight, color: t.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, animation: 'spin .9s linear infinite', flexShrink: 0 }}>⟳</div>
  )
  const cfg: Record<CardState, { icon: string; bg: string; color: string }> = {
    idle:    isInstalled ? { icon: '✓', bg: `${t.success}20`, color: t.success } : { icon: '○', bg: t.borderLight, color: t.muted },
    running: { icon: '⟳',  bg: t.brand20, color: t.action },
    done:    { icon: '✓',  bg: `${t.success}20`, color: t.success },
    error:   { icon: '✗',  bg: `${t.danger}20`,  color: t.danger },
  }
  const { icon, bg, color } = cfg[status]
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, animation: status === 'running' ? 'spin .9s linear infinite' : 'none' }}>
      {icon}
    </div>
  )
}

function SshSetup({ hasKeys, sshStep, publicKey, copied, onGenerate, onCopy, onRecheck }: {
  hasKeys: boolean; sshStep: string; publicKey: string; copied: boolean
  onGenerate: () => void; onCopy: () => void; onRecheck: () => void
}) {
  return (
    <div style={{ ...bannerStyle(t.warning), flexDirection: 'column', gap: 0, marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⚠</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: t.text }}>Pas d'accès SSH GitHub</strong>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>
            {hasKeys ? "Une clé SSH existe mais n'est pas encore autorisée sur GitHub." : "Aucune clé SSH. Créez-en une pour télécharger Odoo Enterprise."}
          </div>
        </div>
        {sshStep === 'idle' && (
          <button onClick={onGenerate} style={btnTeal}>{hasKeys ? 'Voir ma clé' : '+ Créer une clé SSH'}</button>
        )}
      </div>
      {sshStep === 'generating' && <div style={{ marginTop: 14, fontSize: 13, color: t.muted }}>⟳ Génération en cours…</div>}
      {sshStep === 'done' && (
        <div style={{ marginTop: 18, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, marginBottom: 16, color: t.text }}>Ajoutez la clé SSH à GitHub — 3 étapes</div>
          <SshStep n={1} title="Copiez votre clé publique">
            <div style={{ position: 'relative', marginTop: 8 }}>
              <textarea readOnly value={publicKey} style={{ width: '100%', height: 70, resize: 'none', fontFamily: 'monospace', fontSize: 11, padding: '8px 10px', background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radiusSm, color: t.text, boxSizing: 'border-box' }} />
              <button onClick={onCopy} style={{ position: 'absolute', top: 8, right: 8, padding: '3px 10px', fontSize: 11, background: copied ? t.success : t.brand, color: '#fff', border: 'none', borderRadius: t.radiusSm, cursor: 'pointer', fontWeight: 600 }}>
                {copied ? '✓ Copié !' : 'Copier'}
              </button>
            </div>
          </SshStep>
          <SshStep n={2} title="Ouvrez les paramètres SSH GitHub">
            <a href="https://github.com/settings/ssh/new" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: t.action, fontWeight: 600, display: 'block', marginTop: 5 }}>github.com/settings/ssh/new →</a>
          </SshStep>
          <SshStep n={3} title={`Collez la clé et cliquez "Add SSH key"`}>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 5 }}>Champ <strong>Title</strong> : <em>"Odoo Portal"</em> — champ <strong>Key</strong> : collez la clé copiée.</div>
          </SshStep>
          <button onClick={onRecheck} style={{ ...btnTeal, marginTop: 6 }}>{"J'ai ajouté la clé — vérifier l'accès →"}</button>
        </div>
      )}
    </div>
  )
}

function SshStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: t.action, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────

function bannerStyle(color: string): React.CSSProperties {
  return {
    background: t.white, border: `1px solid ${color}`, borderLeft: `4px solid ${color}`,
    borderRadius: t.radius, padding: '14px 18px', marginBottom: 24,
    display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 13,
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

const btnPrimary = btn.primary
const btnSecondary = btn.secondary
const btnTeal: React.CSSProperties = { ...btn.primary, whiteSpace: 'nowrap', flexShrink: 0 }
const btnGhost: React.CSSProperties = { ...btn.ghost, fontSize: 11, padding: '3px 8px' }
