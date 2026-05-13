import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, KeyRound, Loader2, Plus, RefreshCw, Square, Trash2, TriangleAlert } from 'lucide-react'
import { listSshKeys, testGithubSsh, generateSshKey, checkAllSources, checkSourceUpdates, checkSingleVersion } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { Badge, Card, StatusPill } from '../components/ui'
import { useUiLanguage, type UiLanguage } from '../i18n'

// ── Version definitions ─────────────────────────────────────────

const MAJOR_VERSIONS = [
  { version: '19.0', label: 'Odoo 19', badge: 'Nouveau',  badgeEn: 'New', badgeColor: t.action },
  { version: '18.0', label: 'Odoo 18', badge: 'Stable',   badgeColor: t.success },
  { version: '17.0', label: 'Odoo 17', badge: 'LTS',      badgeColor: t.brand },
  { version: '16.0', label: 'Odoo 16', badge: '',          badgeColor: t.muted },
  { version: '15.0', label: 'Odoo 15', badge: '',          badgeColor: t.muted },
]

type VersionDef = { version: string; label: string; badge: string; badgeEn?: string; badgeColor: string; isMajor: boolean }

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

const defaultPath = (v: string) => `~/.odoo-consultant/sources/${v}`

function relativeDate(iso: string | undefined, lang: UiLanguage): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (lang === 'en') {
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days}d ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
  }
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} an(s)`
}

const sourcesCopy = {
  fr: {
    title: 'Sources Odoo',
    description: 'Téléchargez et maintenez les sources Odoo localement pour consultation et analyse.',
    add: 'Ajouter',
    cancel: 'Annuler',
    intermediateVersion: 'Version intermédiaire',
    customPlaceholder: 'ex: 19.1 ou 18.2',
    sshCheckingTitle: 'Vérification de la clé SSH…',
    sshCheckingDesc: 'Connexion à GitHub en cours',
    sshOkTitle: 'Accès SSH GitHub disponible',
    sshOkDesc: 'Vous pouvez télécharger Odoo Enterprise en plus de Community.',
    start: 'Démarrage…',
    done: 'Terminé',
    error: 'Erreur',
    removeVersion: 'Retirer cette version',
    installedSmall: 'installé',
    includeEnterprise: 'Inclure Enterprise',
    showOptions: 'Options avancées',
    hideOptions: 'Masquer options',
    targetFolder: 'Dossier cible',
    showLogs: 'Voir les logs',
    hideLogs: 'Masquer les logs',
    stop: 'Annuler',
    update: 'Mettre à jour',
    download: 'Télécharger',
    notInstalled: 'Non installé',
    behind: 'en retard',
    hide: 'Masquer',
    aiSummary: 'Résumé 30 j',
    checking: 'Vérif…',
    check: 'Vérifier',
    status: 'Statut',
    installed: 'Installé',
    missing: 'Absent',
    running: 'En cours',
    upToDate: 'À jour',
    noSshTitle: "Pas d'accès SSH GitHub",
    noSshWithKey: "Une clé SSH existe mais n'est pas encore autorisée sur GitHub.",
    noSshNoKey: 'Aucune clé SSH. Créez-en une pour télécharger Odoo Enterprise.',
    viewKey: 'Voir ma clé',
    createKey: 'Créer une clé SSH',
    generating: 'Génération en cours…',
    addKeyTitle: 'Ajoutez la clé SSH à GitHub — 3 étapes',
    copyPublicKey: 'Copiez votre clé publique',
    copied: 'Copié',
    copy: 'Copier',
    openGithubSsh: 'Ouvrez les paramètres SSH GitHub',
    pasteKey: 'Collez la clé et cliquez "Add SSH key"',
    pasteKeyHelp: 'Champ Title : "Odoo Portal" — champ Key : collez la clé copiée.',
    recheck: "J'ai ajouté la clé - vérifier l'accès",
    prefillAsk: 'Fais-moi un résumé clair des changements importants et leur impact potentiel pour un consultant Odoo.',
  },
  en: {
    title: 'Odoo Sources',
    description: 'Download and maintain Odoo sources locally for consulting and analysis.',
    add: 'Add',
    cancel: 'Cancel',
    intermediateVersion: 'Intermediate version',
    customPlaceholder: 'e.g. 19.1 or 18.2',
    sshCheckingTitle: 'Checking SSH key…',
    sshCheckingDesc: 'Connecting to GitHub',
    sshOkTitle: 'GitHub SSH access available',
    sshOkDesc: 'You can download Odoo Enterprise in addition to Community.',
    start: 'Starting…',
    done: 'Done',
    error: 'Error',
    removeVersion: 'Remove this version',
    installedSmall: 'installed',
    includeEnterprise: 'Include Enterprise',
    showOptions: 'Advanced options',
    hideOptions: 'Hide options',
    targetFolder: 'Target folder',
    showLogs: 'Show logs',
    hideLogs: 'Hide logs',
    stop: 'Stop',
    update: 'Update',
    download: 'Download',
    notInstalled: 'Not installed',
    behind: 'behind',
    hide: 'Hide',
    aiSummary: '30d summary',
    checking: 'Checking…',
    check: 'Check',
    status: 'Status',
    installed: 'Installed',
    missing: 'Missing',
    running: 'Running',
    upToDate: 'Up to date',
    noSshTitle: 'No GitHub SSH access',
    noSshWithKey: 'An SSH key exists but is not authorized on GitHub yet.',
    noSshNoKey: 'No SSH key. Create one to download Odoo Enterprise.',
    viewKey: 'Show my key',
    createKey: 'Create SSH key',
    generating: 'Generating…',
    addKeyTitle: 'Add the SSH key to GitHub — 3 steps',
    copyPublicKey: 'Copy your public key',
    copied: 'Copied',
    copy: 'Copy',
    openGithubSsh: 'Open GitHub SSH settings',
    pasteKey: 'Paste the key and click "Add SSH key"',
    pasteKeyHelp: 'Title field: "Odoo Portal" — Key field: paste the copied key.',
    recheck: 'I added the key - check access',
    prefillAsk: 'Give me a clear summary of the important changes and their potential impact for an Odoo consultant.',
  },
}

// ── Main component ──────────────────────────────────────────────

export default function Sources() {
  const lang = useUiLanguage()
  const c = sourcesCopy[lang]
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

  const { data: sshData,  refetch: recheckSsh, isLoading: sshLoading } = useQuery({ queryKey: ['github-ssh'], queryFn: testGithubSsh, retry: false })
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

    setCard(version, { status: 'running', pct: 0, currentLabel: c.start, logs: [], showLogs: false })

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
            setCard(version, { status: 'done', pct: 100, currentLabel: evt.msg ?? c.done })
            qc.invalidateQueries({ queryKey: ['sources-status'] })
            if (!MAJOR_VERSIONS.some(v => v.version === version)) fetchCustomStatus(version)
          } else if (evt.type === 'error') {
            setCard(version, { status: 'error', currentLabel: evt.msg ?? c.error })
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setCard(version, { status: 'error', currentLabel: String(err) })
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={c.title}
        description={c.description}
        action={showAddForm ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomVersion()}
              placeholder={c.customPlaceholder}
              autoFocus
              style={{
                padding: '7px 12px', border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 13, color: t.text, background: t.bgCard, width: 130, outline: 'none',
              }}
            />
            <button className="btn btn-primary" onClick={addCustomVersion}>{c.add}</button>
            <button className="btn btn-secondary" onClick={() => { setShowAddForm(false); setCustomInput('') }}>{c.cancel}</button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setShowAddForm(true)}>
            <Plus size={15} /> {c.intermediateVersion}
          </button>
        )}
      />

      {/* SSH banner */}
      {sshLoading ? (
        <div style={{ ...bannerStyle(t.border), color: t.muted }}>
          <Loader2 size={18} style={{ animation: 'spin .9s linear infinite', opacity: .7 }} />
          <div>
            <strong style={{ color: t.muted }}>{c.sshCheckingTitle}</strong>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
              {c.sshCheckingDesc}
            </div>
          </div>
        </div>
      ) : sshOk ? (
        <div style={bannerStyle(t.success)}>
          <KeyRound size={18} color={t.success} />
          <div>
            <strong style={{ color: t.text }}>{c.sshOkTitle}</strong>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
              {c.sshOkDesc}
            </div>
          </div>
        </div>
      ) : (
        <SshSetup
          hasKeys={hasKeys} sshStep={sshStep} publicKey={publicKey} copied={copied}
          labels={c}
          onGenerate={() => genKey.mutate()}
          onCopy={() => { navigator.clipboard.writeText(publicKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          onRecheck={() => recheckSsh()}
        />
      )}

      {/* Unified version cards grid */}
      <div className="page-grid page-grid-sources">
        {allVersionDefs.map(({ version, label, badge, badgeEn, badgeColor, isMajor }) => {
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
            <Card key={version} className="source-card" style={{
              border: `1px solid ${
                status === 'error' ? t.danger
                : status === 'done' ? t.success
                : isInstalled ? `${t.success}40`
                : t.border
              }`,
            }}>
              {/* Progress stripe — always visible at top */}
              <div className="source-card-progress">
                <div style={{
                  position: 'absolute', top: 0, left: 0, height: '100%',
                  background: stripeColor,
                  width: stripeWidth,
                  transition: status === 'running' && pct > 0 ? 'width .4s ease' : 'width .6s ease',
                  animation: status === 'running' && pct === 0 ? 'indeterminate 1.5s infinite' : 'none',
                }} />
              </div>

              <div className="source-card-body">
                {/* Header row */}
                <div className="source-card-header">
                  <div>
                    <div className="source-title">
                      <div className="source-title-text">{label}</div>
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
                        <Badge tone={badge === 'Stable' || badge === 'LTS' ? 'success' : 'brand'} style={{ color: badgeColor }}>
                          {lang === 'en' ? (badgeEn ?? badge) : badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {!isMajor && (
                      <button onClick={() => removeCustomVersion(version)} style={{
                        background: 'none', border: 'none', color: t.muted, fontSize: 16,
                        cursor: 'pointer', padding: '2px 4px', lineHeight: 1,
                      }} title={c.removeVersion}><Trash2 size={14} /></button>
                    )}
                    <StatusBadge status={status} isInstalled={isInstalled} loading={statusLoading} labels={c} />
                  </div>
                </div>

                {/* Running status label */}
                {(status === 'running' || status === 'error' || status === 'done') && card?.currentLabel && (
                  <div style={{
                    fontSize: 11, marginBottom: 8,
                    color: status === 'error' ? t.danger : status === 'done' ? t.success : t.muted,
                    fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {status === 'running' ? card.currentLabel : status === 'done' ? card.currentLabel : card.currentLabel}
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
                    lang={lang}
                    labels={c}
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
                      {c.includeEnterprise}
                      {entInfo?.installed && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: t.success, fontWeight: 600 }}>✓ {c.installedSmall}</span>
                      )}
                    </span>
                  </label>
                )}

                {/* Advanced toggle */}
                <button onClick={() => setAdvanced(isOpen ? null : version)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: t.action, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 6, textAlign: 'left' }}>
                  {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {isOpen ? c.hideOptions : c.showOptions}
                </button>

                {isOpen && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 11, color: t.muted, marginBottom: 4 }}>{c.targetFolder}</label>
                    <input value={customPaths[version] ?? ''} placeholder={defaultPath(version)}
                      onChange={e => setCustomPaths(p => ({ ...p, [version]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 12, boxSizing: 'border-box', background: t.bgCard, color: t.text }} />
                  </div>
                )}

                {/* Logs */}
                {(card?.logs?.length ?? 0) > 0 && (
                  <button onClick={() => setCards(p => ({ ...p, [version]: { ...p[version], showLogs: !p[version]?.showLogs } }))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: t.muted, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 6, textAlign: 'left' }}>
                    {card?.showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {card?.showLogs ? c.hideLogs : `${c.showLogs} (${card?.logs.length})`}
                  </button>
                )}
                {card?.showLogs && <LogBox logs={card.logs} />}

                {/* Action button */}
                <button
                  disabled={status === 'running'}
                  onClick={() => status === 'running' ? abortRefs.current[version]?.abort() : startSync(version)}
                  style={btnDownload(status, isInstalled)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 7, verticalAlign: '-2px' }}>
                    {status === 'running' ? <Square size={13} /> : isInstalled ? <RefreshCw size={14} /> : <Download size={14} />}
                  </span>
                  {status === 'running' ? c.stop
                    : isInstalled ? c.update
                    : c.download}
                </button>
              </div>
            </Card>
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

function InstalledStrip({ info, entInfo, version: _version, label, showCommits, onToggleCommits, onCheckUpdates, checking, onAiSummary, lang, labels }: {
  info: RepoInfo; entInfo?: RepoInfo; version: string; label: string
  showCommits: boolean; onToggleCommits: () => void; onCheckUpdates: () => void
  checking: boolean; onAiSummary: (prefill: string) => void; lang: UiLanguage; labels: typeof sourcesCopy.fr
}) {
  if (!info.installed && (!entInfo || !entInfo.installed)) {
    return (
      <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
        {labels.notInstalled}
      </div>
    )
  }

  const thirtyDaysAgo = Date.now() - 30 * 86400000
  const recentCommits = (info.recent_commits ?? []).filter(c => new Date(c.date).getTime() >= thirtyDaysAgo)
  const hasAiData = recentCommits.length > 0

  const buildPrefill = () => {
    const lines = recentCommits.map(c =>
      `- \`${c.sha}\` ${c.message} (${relativeDate(c.date, lang)}, ${c.author})`
    )
    return lang === 'en'
      ? `Here are the ${recentCommits.length} commits from **${label}** over the last 30 days:\n\n${lines.join('\n')}\n\n${labels.prefillAsk}`
      : `Voici les ${recentCommits.length} commits de **${label}** des 30 derniers jours :\n\n${lines.join('\n')}\n\n${labels.prefillAsk}`
  }

  return (
    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${t.border}` }}>
      {info.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: entInfo?.installed ? 3 : 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.success, fontWeight: 700 }}>
            <CheckCircle2 size={12} /> Community
          </span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{info.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(info.date, lang)}</span>
          {(info.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>{info.behind} {labels.behind}</span>
          )}
        </div>
      )}
      {entInfo?.installed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--brand, #017e84)', fontWeight: 700 }}>
            <CheckCircle2 size={12} /> Enterprise
          </span>
          <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{entInfo.head}</span>
          <span style={{ fontSize: 11, color: t.muted }}>· {relativeDate(entInfo.date, lang)}</span>
          {(entInfo.behind ?? 0) > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: t.warning, background: t.warningBg,
              border: `1px solid ${t.warning}30`, borderRadius: 3, padding: '1px 6px',
            }}>{entInfo.behind} {labels.behind}</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {(info.recent_commits?.length ?? 0) > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={onToggleCommits}>
            {showCommits ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showCommits ? labels.hide : `${info.recent_commits!.length} commits`}
          </button>
        )}
        {hasAiData && (
          <button className="btn btn-outline btn-sm" onClick={() => onAiSummary(buildPrefill())}>
            <Bot size={13} /> {labels.aiSummary}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onCheckUpdates} disabled={checking} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} style={checking ? { animation: 'spin .9s linear infinite' } : undefined} />
          {checking ? labels.checking : labels.check}
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
              <span style={{ fontSize: 10, color: '#585b70', flexShrink: 0 }}>{relativeDate(c.date, lang)}</span>
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

function StatusBadge({ status, isInstalled, loading, labels }: { status: CardState; isInstalled?: boolean; loading?: boolean; labels: typeof sourcesCopy.fr }) {
  if (loading) return <StatusPill tone="running">{labels.status}</StatusPill>
  const cfg: Record<CardState, { tone: 'ok' | 'warning' | 'error' | 'idle' | 'running'; label: string }> = {
    idle:    isInstalled ? { tone: 'ok', label: labels.installed } : { tone: 'idle', label: labels.missing },
    running: { tone: 'running', label: labels.running },
    done:    { tone: 'ok', label: labels.upToDate },
    error:   { tone: 'error', label: labels.error },
  }
  const item = cfg[status]
  return <StatusPill tone={item.tone}>{item.label}</StatusPill>
}

function SshSetup({ hasKeys, sshStep, publicKey, copied, onGenerate, onCopy, onRecheck, labels }: {
  hasKeys: boolean; sshStep: string; publicKey: string; copied: boolean
  onGenerate: () => void; onCopy: () => void; onRecheck: () => void; labels: typeof sourcesCopy.fr
}) {
  return (
    <div style={{ ...bannerStyle(t.warning), flexDirection: 'column', gap: 0, marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <TriangleAlert size={19} color={t.warning} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ color: t.text }}>{labels.noSshTitle}</strong>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 3 }}>
            {hasKeys ? labels.noSshWithKey : labels.noSshNoKey}
          </div>
        </div>
        {sshStep === 'idle' && (
          <button className="btn btn-primary" onClick={onGenerate}>
            <KeyRound size={15} /> {hasKeys ? labels.viewKey : labels.createKey}
          </button>
        )}
      </div>
      {sshStep === 'generating' && (
        <div style={{ marginTop: 14, fontSize: 13, color: t.muted, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={15} style={{ animation: 'spin .9s linear infinite' }} /> {labels.generating}
        </div>
      )}
      {sshStep === 'done' && (
        <div style={{ marginTop: 18, background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, marginBottom: 16, color: t.text }}>{labels.addKeyTitle}</div>
          <SshStep n={1} title={labels.copyPublicKey}>
            <div style={{ position: 'relative', marginTop: 8 }}>
              <textarea readOnly value={publicKey} style={{ width: '100%', height: 70, resize: 'none', fontFamily: 'monospace', fontSize: 11, padding: '8px 10px', background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radiusSm, color: t.text, boxSizing: 'border-box' }} />
              <button className="btn btn-primary btn-sm" onClick={onCopy}
                style={{ position: 'absolute', top: 8, right: 8, background: copied ? t.success : undefined }}>
                {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copied ? labels.copied : labels.copy}
              </button>
            </div>
          </SshStep>
          <SshStep n={2} title={labels.openGithubSsh}>
            <a href="https://github.com/settings/ssh/new" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: t.action, fontWeight: 600, display: 'block', marginTop: 5 }}>github.com/settings/ssh/new →</a>
          </SshStep>
          <SshStep n={3} title={labels.pasteKey}>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 5 }}>{labels.pasteKeyHelp}</div>
          </SshStep>
          <button className="btn btn-primary" onClick={onRecheck} style={{ marginTop: 6 }}>
            <RefreshCw size={15} /> {labels.recheck}
          </button>
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
