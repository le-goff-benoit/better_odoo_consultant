import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Code2, Copy, Download, FolderOpen, GitBranch, KeyRound, Loader2, Plus, RefreshCw, Square, Trash2, TriangleAlert, Wrench, X } from 'lucide-react'
import { listSshKeys, testGithubSsh, generateSshKey, checkAllSources, checkSourceUpdates, checkSingleVersion, getCommitsSince, openSourceWorkspace, openSourceFolder, getContextFile, saveContextFile, getUserProfile } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { Badge, Card, StatusPill } from '../components/ui'
import { useUiLanguage, type UiLanguage } from '../i18n'
import { sourceSyncSignals } from '../utils/sourceSyncSignals'

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

interface VersionState {
  status: CardState; pct: number; currentLabel: string; logs: string[]; showLogs: boolean
}

interface RecentCommit { sha: string; message: string; author: string; date: string }
interface RepoInfo {
  installed: boolean; path: string; head?: string; message?: string
  date?: string; behind?: number; branch?: string
  recent_commits?: RecentCommit[]; error?: string
}
interface CommitSince {
  sha: string; author: string; date: string; subject: string
  files: string[]; file_count: number
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
    intermediateVersion: 'Ajouter une version',
    updateAllSources: 'Mettre à jour les sources',
    updatingSources: 'Mise à jour…',
    customPlaceholder: 'ex: 14.0, 13.0 ou 19.1',
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
    lastUpdated: 'Dernière mise à jour',
    hide: 'Masquer',
    aiSummary: 'Résumé 30 j',
    latestUpdates: 'Dernières mises à jour',
    latestUpdatesShort: 'Mises à jour',
    askAi: 'Résumé IA',
    closeModal: 'Fermer',
    searchCommits: 'Rechercher (message, SHA, auteur)…',
    daysLabel: 'Période (jours)',
    allTags: 'Tous',
    sourceCommunity: 'Community',
    sourceEnterprise: 'Enterprise',
    sourceBoth: 'Les deux',
    loadingCommits: 'Chargement…',
    noCommits: 'Aucun commit pour ces critères.',
    maintenance: 'Maintenance',
    maintenanceTitle: 'Actions de maintenance',
    openVscode: 'Ouvrir dans VS Code',
    openVscodeDesc: 'Génère un workspace avec les dossiers Community et Enterprise.',
    openFolder: 'Ouvrir le dossier',
    openFolderDesc: 'Affiche le dossier des sources dans l\'explorateur.',
    githubCommunity: 'odoo/odoo',
    githubEnterprise: 'odoo/enterprise',
    externalLinks: 'Liens externes',
    contextAction: 'Contexte version',
    contextActionDesc: 'Notes markdown utilisées par l\'IA pour cette version.',
    contextEditTitle: 'Contexte Odoo',
    contextPlaceholder: 'Notes spécifiques à cette version (changements API, gotchas, etc.)…',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Enregistré',
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
    pasteKeyHelp: 'Champ Title : "Better Odoo Assistant" — champ Key : collez la clé copiée.',
    recheck: "J'ai ajouté la clé - vérifier l'accès",
    prefillAsk: 'Fais-moi un résumé clair des changements importants et leur impact potentiel pour un consultant Odoo.',
  },
  en: {
    title: 'Odoo Sources',
    description: 'Download and maintain Odoo sources locally for consulting and analysis.',
    add: 'Add',
    cancel: 'Cancel',
    intermediateVersion: 'Add version',
    updateAllSources: 'Update sources',
    updatingSources: 'Updating…',
    customPlaceholder: 'e.g. 14.0, 13.0, or 19.1',
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
    lastUpdated: 'Last updated',
    hide: 'Hide',
    aiSummary: '30d summary',
    latestUpdates: 'Latest updates',
    latestUpdatesShort: 'Updates',
    askAi: 'AI summary',
    closeModal: 'Close',
    searchCommits: 'Search (message, SHA, author)…',
    daysLabel: 'Range (days)',
    allTags: 'All',
    sourceCommunity: 'Community',
    sourceEnterprise: 'Enterprise',
    sourceBoth: 'Both',
    loadingCommits: 'Loading…',
    noCommits: 'No commit for these filters.',
    maintenance: 'Maintenance',
    maintenanceTitle: 'Maintenance actions',
    openVscode: 'Open in VS Code',
    openVscodeDesc: 'Generate a workspace with Community and Enterprise folders.',
    openFolder: 'Open folder',
    openFolderDesc: 'Reveal the sources folder in the file explorer.',
    githubCommunity: 'odoo/odoo',
    githubEnterprise: 'odoo/enterprise',
    externalLinks: 'External links',
    contextAction: 'Version context',
    contextActionDesc: 'Markdown notes used by the AI for this version.',
    contextEditTitle: 'Odoo context',
    contextPlaceholder: 'Version-specific notes (API changes, gotchas, etc.)…',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
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
    pasteKeyHelp: 'Title field: "Better Odoo Assistant" — Key field: paste the copied key.',
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
  const [customPaths]                       = useState<Record<string, string>>({})
  const [enterprise,     setEnterprise]     = useState<Record<string, boolean>>({})
  const [showCommits,    setShowCommits]    = useState<Record<string, boolean>>({})
  const [maintenanceVersion, setMaintenanceVersion] = useState<string | null>(null)
  const [repoOverrides,  setRepoOverrides]  = useState<Record<string, RepoInfo>>({})
  const [updatesLoading, setUpdatesLoading] = useState<Record<string, boolean>>({})
  const [extraStatus,    setExtraStatus]    = useState<Record<string, RepoInfo>>({})
  const [updatingAll,    setUpdatingAll]    = useState(false)
  const [syncTick,       rerenderSync]      = useState(0)

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
  const syncByVersion = useMemo(() => Object.fromEntries(sourceSyncSignals.getAll()), [syncTick])
  const anySourceSyncRunning = sourceSyncSignals.hasRunning()

  useEffect(() => sourceSyncSignals.subscribe(() => rerenderSync(n => n + 1)), [])

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
      badge: '',
      badgeColor: '#8B5CF6',
      isMajor: false,
    }))
    return [...major, ...custom].sort((a, b) => {
      const [aMaj, aMin = 0] = a.version.split('.').map(Number)
      const [bMaj, bMin = 0] = b.version.split('.').map(Number)
      return bMaj !== aMaj ? bMaj - aMaj : bMin - aMin
    })
  }, [customVersions])

  useEffect(() => {
    if (!sshOk) return
    setEnterprise(prev => {
      const next = { ...prev }
      for (const { version } of allVersionDefs) {
        if (next[version] === undefined) next[version] = true
      }
      return next
    })
  }, [sshOk, allVersionDefs])
  const installedVersionsToUpdate = useMemo(() => (
    allVersionDefs
      .filter(({ version }) => allVersionStatus[version]?.installed || allVersionStatus[`${version}-enterprise`]?.installed)
      .map(({ version }) => version)
  ), [allVersionDefs, allVersionStatus])

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

  // Auto-check updates for installed versions, once per session — saves the
  // user from manually clicking "Check" on each card after landing on Sources.
  const autoCheckedRef = useRef(false)
  useEffect(() => {
    if (autoCheckedRef.current) return
    if (!allStatus?.data) return
    const data: Record<string, RepoInfo> = allStatus.data
    const installed = Object.entries(data)
      .filter(([k, v]) => v.installed && !k.endsWith('-enterprise'))
      .map(([k]) => k)
    if (installed.length === 0) return
    autoCheckedRef.current = true
    installed.forEach(v => { void doCheckUpdatesSilent(v, data) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStatus])

  const doCheckUpdatesSilent = async (version: string, _data: Record<string, RepoInfo>) => {
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

  const startSync = async (version: string, includeEnterprise = enterprise[version] ?? false) => {
    const path = customPaths[version] || defaultPath(version)
    const ent  = includeEnterprise

    await sourceSyncSignals.start({
      version,
      path,
      enterprise: ent,
      labels: { start: c.start, done: c.done, error: c.error },
    })
    qc.invalidateQueries({ queryKey: ['sources-status'] })
    if (!MAJOR_VERSIONS.some(v => v.version === version)) fetchCustomStatus(version)
  }

  const updateAllInstalledSources = async () => {
    if (updatingAll || installedVersionsToUpdate.length === 0) return
    setUpdatingAll(true)
    try {
      for (const version of installedVersionsToUpdate) {
        const entInstalled = allVersionStatus[`${version}-enterprise`]?.installed === true
        await startSync(version, entInstalled || enterprise[version] === true)
      }
      qc.invalidateQueries({ queryKey: ['sources-status'] })
    } finally {
      setUpdatingAll(false)
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={c.title}
        description={c.description}
        action={showAddForm ? (
          <div className="sources-header-actions">
            <input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomVersion()}
              placeholder={c.customPlaceholder}
              autoFocus
              className="ui-input"
              style={{ width: 140 }}
            />
            <button className="btn btn-primary" onClick={addCustomVersion}>{c.add}</button>
            <button className="btn btn-secondary" onClick={() => { setShowAddForm(false); setCustomInput('') }}>{c.cancel}</button>
          </div>
        ) : (
          <div className="sources-header-actions">
            <button
              className="btn btn-secondary"
              onClick={updateAllInstalledSources}
              disabled={updatingAll || anySourceSyncRunning || installedVersionsToUpdate.length === 0}
              title={c.updateAllSources}
            >
              {updatingAll
                ? <Loader2 size={15} style={{ animation: 'spin .9s linear infinite' }} />
                : <RefreshCw size={15} />}
              {updatingAll ? c.updatingSources : c.updateAllSources}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowAddForm(true)}>
              <Plus size={15} /> {c.intermediateVersion}
            </button>
          </div>
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
        {allVersionDefs.map(({ version, label, badge, badgeEn, isMajor }) => {
          const syncCard = syncByVersion[version]
          const card     = syncCard
            ? {
              status: syncCard.status as CardState,
              pct: syncCard.pct,
              currentLabel: syncCard.label,
              logs: syncCard.logs,
              showLogs: cards[version]?.showLogs ?? false,
            }
            : cards[version]
          const status   = card?.status ?? 'idle'
          const pct      = card?.pct    ?? 0
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
                          fontFamily: 'monospace',
                        }}>saas-{version}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {badge && (
                        <Badge tone={badge === 'Stable' || badge === 'LTS' ? 'success' : 'warning'}>
                          {lang === 'en' ? (badgeEn ?? badge) : badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    onAskAiCommit={(co) => {
                      const header = lang === 'en'
                        ? `Explain this commit of **${label}** for an Odoo consultant — what changed and why it matters:`
                        : `Explique ce commit de **${label}** pour un consultant Odoo — ce qui change et pourquoi c'est important :`
                      const body = `- \`${co.sha.slice(0, 12)}\` [${co.kind}]${co.tag ? ` [${co.tag}]` : ''} ${co.subject}\n  ${co.author} · ${co.date}`
                      navigate('/assistant', { state: { prefill: `${header}\n\n${body}`, version, autoSend: true } })
                    }}
                  />
                )}

                {/* Enterprise toggle */}
                {sshOk && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox"
                      checked={enterprise[version] ?? false}
                      onChange={e => setEnterprise(p => ({ ...p, [version]: e.target.checked }))}
                      style={{ accentColor: 'var(--brand, #33f06f)', width: 14, height: 14 }} />
                    <span style={{ color: t.muted }}>
                      {c.includeEnterprise}
                      {entInfo?.installed && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: t.success, fontWeight: 600 }}>✓ {c.installedSmall}</span>
                      )}
                    </span>
                  </label>
                )}

                {/* Logs */}
                {(card?.logs?.length ?? 0) > 0 && (
                  <button onClick={() => setCards(p => ({ ...p, [version]: { ...p[version], showLogs: !p[version]?.showLogs } }))}
                    className="btn btn-outline-muted btn-xs" style={{ marginBottom: 6 }}>
                    {card?.showLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {card?.showLogs ? c.hideLogs : `${c.showLogs} (${card?.logs.length})`}
                  </button>
                )}
                {card?.showLogs && <LogBox logs={card.logs} />}

                {/* Footer: primary action + Maintenance */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => status === 'running' ? sourceSyncSignals.abort(version) : startSync(version)}
                    style={{ ...btnDownload(status, isInstalled), flex: 1 }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 7, verticalAlign: '-2px' }}>
                      {status === 'running' ? <Square size={13} /> : isInstalled ? <RefreshCw size={14} /> : <Download size={14} />}
                    </span>
                    {status === 'running' ? c.stop
                      : isInstalled ? c.update
                      : c.download}
                  </button>
                  {isInstalled && (
                    <button
                      className="btn btn-outline"
                      onClick={() => setMaintenanceVersion(version)}
                      title={c.maintenanceTitle}
                      style={{ flexShrink: 0 }}
                    >
                      <Wrench size={14} /> {c.maintenance}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Maintenance modal (lifted from card so it can sit at the bottom footer) */}
      {maintenanceVersion && (() => {
        const def = allVersionDefs.find(d => d.version === maintenanceVersion)
        const info = allVersionStatus[maintenanceVersion]
        const ent = allVersionStatus[`${maintenanceVersion}-enterprise`]
        if (!def || !info) return null
        return createPortal(
          <SourceMaintenanceModal
            version={maintenanceVersion}
            label={def.label}
            isMajor={def.isMajor}
            hasCommunity={!!info.installed}
            hasEnterprise={!!ent?.installed}
            communityPath={info.installed ? info.path : undefined}
            enterprisePath={ent?.installed ? ent.path : undefined}
            onClose={() => setMaintenanceVersion(null)}
            onRemoveCustom={() => { const v = maintenanceVersion; setMaintenanceVersion(null); removeCustomVersion(v) }}
            lang={lang}
            labels={c}
          />,
          document.body,
        )
      })()}

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

function InstalledStrip({ info, entInfo, version, label, showCommits, onToggleCommits, onCheckUpdates, checking, onAiSummary, onAskAiCommit, lang, labels }: {
  info: RepoInfo; entInfo?: RepoInfo; version: string; label: string
  showCommits: boolean; onToggleCommits: () => void; onCheckUpdates: () => void
  checking: boolean; onAiSummary: (prefill: string) => void
  onAskAiCommit: (commit: TaggedCommit) => void
  lang: UiLanguage; labels: typeof sourcesCopy.fr
}) {
  const [summaryLoading, setSummaryLoading] = useState(false)
  if (!info.installed && (!entInfo || !entInfo.installed)) {
    return (
      <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
        {labels.notInstalled}
      </div>
    )
  }

  // Fetch 30 days of commits — with the files each one changed — for BOTH
  // Community and Enterprise, then hand the assembled brief to the assistant.
  const buildSummary = async () => {
    setSummaryLoading(true)
    try {
      const targets: { kind: string; path: string }[] = []
      if (info.installed && info.path) targets.push({ kind: 'Community', path: info.path })
      if (entInfo?.installed && entInfo.path) targets.push({ kind: 'Enterprise', path: entInfo.path })
      const sections: string[] = []
      for (const tgt of targets) {
        let commits: CommitSince[] = []
        try {
          const res = await getCommitsSince(tgt.path, 30)
          commits = res.data?.commits ?? []
        } catch { /* best-effort — leave empty */ }
        if (commits.length === 0) {
          sections.push(`### ${tgt.kind}\n${lang === 'en'
            ? '_No commit in the last 30 days (or history unavailable)._'
            : '_Aucun commit sur les 30 derniers jours (ou historique indisponible)._'}`)
          continue
        }
        const lines = commits.map(c => {
          const shown = (c.files ?? []).slice(0, 8)
          const more = c.file_count > shown.length ? ` (+${c.file_count - shown.length})` : ''
          const filesLbl = lang === 'en' ? 'Files' : 'Fichiers'
          return `- \`${c.sha}\` ${c.subject} — ${c.date}, ${c.author}\n  ${filesLbl} : ${shown.join(', ') || '—'}${more}`
        })
        sections.push(`### ${tgt.kind} — ${commits.length} commit${commits.length > 1 ? 's' : ''}\n${lines.join('\n')}`)
      }
      const header = lang === 'en'
        ? `Here are the commits of **${label}** over the last 30 days (Community + Enterprise), with the files each commit changed:`
        : `Voici les commits de **${label}** des 30 derniers jours (Community + Enterprise), avec les fichiers modifiés par chaque commit :`
      onAiSummary(`${header}\n\n${sections.join('\n\n')}\n\n${labels.prefillAsk}`)
    } finally {
      setSummaryLoading(false)
    }
  }

  return (
    <div className="source-installed-strip">
      {info.installed && (
        <div className="source-repo-row">
          <span className="source-repo-kind source-repo-kind-community">
            <CheckCircle2 size={12} /> Community
          </span>
          <span className="source-repo-date">{labels.lastUpdated} {relativeDate(info.date, lang)}</span>
          {(info.behind ?? 0) > 0 && (
            <span className="source-repo-warning">{info.behind} {labels.behind}</span>
          )}
        </div>
      )}
      {entInfo?.installed && (
        <div className="source-repo-row">
          <span className="source-repo-kind source-repo-kind-enterprise">
            <CheckCircle2 size={12} /> Enterprise
          </span>
          <span className="source-repo-date">{labels.lastUpdated} {relativeDate(entInfo.date, lang)}</span>
          {(entInfo.behind ?? 0) > 0 && (
            <span className="source-repo-warning">{entInfo.behind} {labels.behind}</span>
          )}
        </div>
      )}
      <div className="source-installed-actions">
        {(info.recent_commits?.length ?? 0) > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={onToggleCommits} title={labels.latestUpdates}>
            <RefreshCw size={13} /> {labels.latestUpdatesShort}
            <span style={{ marginLeft: 4, opacity: .65 }}>{info.recent_commits!.length}</span>
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={buildSummary} disabled={summaryLoading}>
          {summaryLoading
            ? <RefreshCw size={13} style={{ animation: 'spin .9s linear infinite' }} />
            : <Bot size={13} />} {labels.aiSummary}
        </button>
        <button className="btn btn-ghost btn-sm source-check-button" onClick={onCheckUpdates} disabled={checking}>
          <RefreshCw size={13} style={checking ? { animation: 'spin .9s linear infinite' } : undefined} />
          {checking ? labels.checking : labels.check}
        </button>
      </div>
      {showCommits && createPortal(
        <CommitsModal
          label={label}
          commPath={info.installed ? info.path : undefined}
          entPath={entInfo?.installed ? entInfo.path : undefined}
          onClose={onToggleCommits}
          onAskAi={(filtered, days) => {
            const header = lang === 'en'
              ? `Here are ${filtered.length} commits of **${label}** over the last ${days} days. Tell me what changed and the impact for an Odoo consultant.`
              : `Voici ${filtered.length} commits de **${label}** sur les ${days} derniers jours. Dis-moi ce qui a changé et l'impact pour un consultant Odoo.`
            const lines = filtered.map(co =>
              `- \`${co.sha.slice(0, 8)}\` [${co.kind}] ${co.subject} — ${co.author}, ${co.date}`,
            )
            onAiSummary(`${header}\n\n${lines.join('\n')}`)
            onToggleCommits()
          }}
          onAskAiCommit={(co) => { onAskAiCommit(co); onToggleCommits() }}
          lang={lang}
          labels={labels}
        />,
        document.body,
      )}
    </div>
  )
}

// ── Source maintenance modal ────────────────────────────────────

function branchForVersion(version: string): string {
  const parts = version.split('.')
  if (parts.length === 2 && parts[1] !== '0') return `saas-${version}`
  return version
}

function SourceMaintenanceModal({
  version, label, isMajor, hasCommunity, hasEnterprise, communityPath, enterprisePath,
  onClose, onRemoveCustom, lang, labels,
}: {
  version: string; label: string; isMajor: boolean
  hasCommunity: boolean; hasEnterprise: boolean
  communityPath?: string; enterprisePath?: string
  onClose: () => void; onRemoveCustom: () => void
  lang: UiLanguage; labels: typeof sourcesCopy.fr
}) {
  const [openingVscode, setOpeningVscode] = useState(false)
  const [openingFolder, setOpeningFolder] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [contextContent, setContextContent] = useState('')
  const [contextLoading, setContextLoading] = useState(false)
  const [contextSaving, setContextSaving] = useState(false)
  const [contextHasFile, setContextHasFile] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const branch = branchForVersion(version)
  const ghCommunity = `https://github.com/odoo/odoo/tree/${branch}`
  const ghEnterprise = `https://github.com/odoo/enterprise/tree/${branch}`

  const doOpenVscode = async () => {
    setOpeningVscode(true); setErrMsg(null)
    try { await openSourceWorkspace(version); onClose() }
    catch (e: any) { setErrMsg(e?.response?.data?.detail || String(e)) }
    finally { setOpeningVscode(false) }
  }
  const doOpenFolder = async () => {
    setOpeningFolder(true); setErrMsg(null)
    try { await openSourceFolder(version) }
    catch (e: any) { setErrMsg(e?.response?.data?.detail || String(e)) }
    finally { setOpeningFolder(false) }
  }
  const contextFilename = `odoo-${version}.md`
  const openContext = async () => {
    setContextOpen(true); setContextLoading(true); setErrMsg(null)
    try {
      // Resolve the user's preferred context language (falls back to UI lang).
      let locale: string = lang
      try {
        const up = await getUserProfile()
        locale = (up.data?.contextLanguage as string | undefined) || (up.data?.language as string | undefined) || lang
      } catch { /* fall back to UI lang */ }
      const res = await getContextFile(contextFilename, locale)
      const content = res.data?.content || ''
      setContextContent(content)
      setContextHasFile(content.length > 0)
    } catch (e: any) { setErrMsg(e?.response?.data?.detail || String(e)) }
    finally { setContextLoading(false) }
  }
  const saveContext = async () => {
    setContextSaving(true); setErrMsg(null)
    try {
      let locale: string = lang
      try {
        const up = await getUserProfile()
        locale = (up.data?.contextLanguage as string | undefined) || (up.data?.language as string | undefined) || lang
      } catch { /* fall back */ }
      await saveContextFile(contextFilename, contextContent, locale)
      setContextHasFile(true)
    } catch (e: any) { setErrMsg(e?.response?.data?.detail || String(e)) }
    finally { setContextSaving(false) }
  }

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%' }}>
        <div className="ui-modal-header">
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 700 }}>
            <Wrench size={16} /> {labels.maintenance} — {label}
          </h2>
          <button onClick={onClose} className="ui-icon-button" title={labels.closeModal} aria-label={labels.closeModal}>
            <X size={18} />
          </button>
        </div>
        <div className="ui-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errMsg && (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'color-mix(in srgb, var(--th-danger) 12%, transparent)', color: 'var(--th-danger)', fontSize: 12 }}>
              {errMsg}
            </div>
          )}

          {!contextOpen && (
            <>
              <SourceMaintenanceAction
                icon={<Code2 size={15} />}
                label={labels.openVscode}
                description={labels.openVscodeDesc}
                onClick={doOpenVscode}
                loading={openingVscode}
                disabled={!hasCommunity && !hasEnterprise}
              />
              <SourceMaintenanceAction
                icon={<FolderOpen size={15} />}
                label={labels.openFolder}
                description={communityPath || enterprisePath || ''}
                onClick={doOpenFolder}
                loading={openingFolder}
              />
              <SourceMaintenanceAction
                icon={<ClipboardList size={15} />}
                label={labels.contextAction}
                description={labels.contextActionDesc}
                onClick={openContext}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {labels.externalLinks}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={ghCommunity} target="_blank" rel="noreferrer"
                    className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>
                    <GitBranch size={13} /> {labels.githubCommunity}@{branch}
                  </a>
                  {hasEnterprise && (
                    <a href={ghEnterprise} target="_blank" rel="noreferrer"
                      className="btn btn-outline btn-sm" style={{ textDecoration: 'none' }}>
                      <GitBranch size={13} /> {labels.githubEnterprise}@{branch}
                    </a>
                  )}
                </div>
              </div>

              {!isMajor && (
                <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14, marginTop: 4 }}>
                  <button
                    onClick={onRemoveCustom}
                    className="btn btn-sm"
                    style={{
                      width: '100%', justifyContent: 'flex-start',
                      background: 'transparent', color: t.danger, border: `1px solid ${t.danger}`,
                    }}
                    title={labels.removeVersion}>
                    <Trash2 size={14} /> {labels.removeVersion}
                  </button>
                </div>
              )}
            </>
          )}

          {contextOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setContextOpen(false)} className="btn btn-ghost btn-sm">
                  <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} /> {lang === 'en' ? 'Back' : 'Retour'}
                </button>
                <strong style={{ fontSize: 13 }}>{labels.contextEditTitle} {label}</strong>
                {contextHasFile && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.success }} />}
              </div>
              {contextLoading ? (
                <div style={{ fontSize: 12, color: t.muted }}>{labels.loadingCommits}</div>
              ) : (
                <textarea
                  value={contextContent}
                  onChange={e => setContextContent(e.target.value)}
                  placeholder={labels.contextPlaceholder}
                  className="ui-input"
                  style={{ minHeight: 240, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={saveContext} disabled={contextSaving || contextLoading} className="btn btn-primary">
                  {contextSaving
                    ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} />
                    : <CheckCircle2 size={13} />}
                  {contextSaving ? labels.saving : labels.save}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceMaintenanceAction({ icon, label, description, onClick, loading, disabled }: {
  icon: React.ReactNode; label: string; description: string
  onClick: () => void; loading?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="project-maintenance-action-row"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px',
        width: '100%', textAlign: 'left',
        border: '1px solid var(--th-border)', borderRadius: 'var(--neo-radius, 8px)',
        background: 'transparent', color: 'var(--th-text)',
        cursor: loading ? 'wait' : disabled ? 'not-allowed' : 'pointer',
        opacity: (loading || disabled) ? 0.6 : 1, transition: 'background .15s, border-color .15s',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, flexShrink: 0,
        background: 'color-mix(in srgb, var(--brand) 12%, transparent)',
        borderRadius: 6, color: 'var(--brand-fg)' }}>
        {loading ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : icon}
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 11.5, color: 'var(--th-muted)', lineHeight: 1.4, wordBreak: 'break-all' }}>
          {description}
        </span>
      </span>
      <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5, marginTop: 7 }} />
    </button>
  )
}

type CommitKind = 'community' | 'enterprise' | 'both'
interface TaggedCommit {
  sha: string; subject: string; author: string; date: string
  tag: string  // FIX, IMP, ADD, etc. ('' if untagged)
  kind: CommitKind
}

// Odoo subject convention: "[TAG] module: short message". Colors follow the
// rough semantic weight of each tag (fix=red, feature=green, perf=purple…).
const TAG_COLORS: Record<string, string> = {
  FIX: '#dc2626', IMP: '#2563eb', ADD: '#16a34a', REM: '#6b7280',
  REF: '#ea580c', PERF: '#9333ea', MOV: '#6b7280', REV: '#b45309',
  MERGE: '#6b7280', TYP: '#6b7280', CLA: '#6b7280', DOC: '#0d9488',
  I18N: '#0891b2', FW: '#6b7280',
}
const tagColor = (tag: string) => TAG_COLORS[tag] || '#6b7280'

function parseTag(subject: string): string {
  const m = subject.match(/^\[([A-Z][A-Z0-9]{0,9})\]/)
  return m ? m[1] : ''
}

function kindLabel(kind: CommitKind, labels: typeof sourcesCopy.fr): string {
  if (kind === 'community') return labels.sourceCommunity
  if (kind === 'enterprise') return labels.sourceEnterprise
  return labels.sourceBoth
}
function kindColor(kind: CommitKind): string {
  if (kind === 'community') return '#0ea5e9'
  if (kind === 'enterprise') return '#7c3aed'
  return '#0d9488'
}

function CommitsModal({ label, commPath, entPath, onClose, onAskAi, onAskAiCommit, lang, labels }: {
  label: string
  commPath?: string
  entPath?: string
  onClose: () => void
  onAskAi: (filtered: TaggedCommit[], days: number) => void
  onAskAiCommit: (commit: TaggedCommit) => void
  lang: UiLanguage
  labels: typeof sourcesCopy.fr
}) {
  const [days, setDays] = useState(30)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [commits, setCommits] = useState<TaggedCommit[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const targets: { kind: 'community' | 'enterprise'; path: string }[] = []
    if (commPath) targets.push({ kind: 'community', path: commPath })
    if (entPath) targets.push({ kind: 'enterprise', path: entPath })

    Promise.all(targets.map(async tgt => {
      try {
        const res = await getCommitsSince(tgt.path, days)
        const arr: CommitSince[] = res.data?.commits ?? []
        return arr.map(c => ({ ...c, _kind: tgt.kind }))
      } catch { return [] as (CommitSince & { _kind: 'community' | 'enterprise' })[] }
    })).then(results => {
      if (cancelled) return
      const bySha = new Map<string, TaggedCommit>()
      for (const list of results) {
        for (const c of list) {
          const existing = bySha.get(c.sha)
          if (existing) {
            existing.kind = 'both'
          } else {
            bySha.set(c.sha, {
              sha: c.sha, subject: c.subject, author: c.author, date: c.date,
              tag: parseTag(c.subject),
              kind: c._kind,
            })
          }
        }
      }
      const merged = Array.from(bySha.values()).sort((a, b) => b.date.localeCompare(a.date))
      setCommits(merged)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [days, commPath, entPath])

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of commits) {
      if (!c.tag) continue
      counts.set(c.tag, (counts.get(c.tag) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [commits])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return commits.filter(c => {
      if (activeTags.size > 0 && !activeTags.has(c.tag)) return false
      if (!q) return true
      return c.subject.toLowerCase().includes(q)
        || c.sha.toLowerCase().includes(q)
        || c.author.toLowerCase().includes(q)
    })
  }, [commits, query, activeTags])

  const toggleTag = (tag: string) => setActiveTags(prev => {
    const next = new Set(prev)
    next.has(tag) ? next.delete(tag) : next.add(tag)
    return next
  })

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 860, width: '100%' }}>
        <div className="ui-modal-header">
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 700 }}>
            <RefreshCw size={16} /> {labels.latestUpdates} — {label}
          </h2>
          <button onClick={onClose} className="ui-icon-button" aria-label={labels.closeModal} title={labels.closeModal}>
            <X size={18} />
          </button>
        </div>
        <div className="ui-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={labels.searchCommits}
              className="ui-input"
              style={{ flex: '1 1 240px', minWidth: 200 }}
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.muted }}>
              {labels.daysLabel}
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={e => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 30)))}
                className="ui-input"
                style={{ width: 80 }}
              />
            </label>
          </div>
          {availableTags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveTags(new Set())}
                className="btn btn-sm"
                style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  background: activeTags.size === 0 ? t.text : 'transparent',
                  color: activeTags.size === 0 ? t.bg : t.text,
                  border: `1px solid ${t.border}`,
                }}
              >{labels.allTags}</button>
              {availableTags.map(([tag, n]) => {
                const active = activeTags.has(tag)
                const color = tagColor(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="btn btn-sm"
                    style={{
                      padding: '3px 10px', fontSize: 11, fontWeight: 700,
                      background: active ? color : 'transparent',
                      color: active ? '#fff' : color,
                      border: `1px solid ${color}`,
                    }}
                    title={`${tag} (${n})`}
                  >{tag} <span style={{ opacity: .75, fontWeight: 500 }}>{n}</span></button>
                )
              })}
            </div>
          )}
          <div style={{
            background: 'var(--code-bg)', borderRadius: t.radius,
            padding: '10px 12px', maxHeight: '52vh', overflowY: 'auto',
            border: `1px solid ${t.border}`,
          }}>
            {loading ? (
              <div style={{ fontSize: 12, color: t.muted, padding: '14px 4px' }}>{labels.loadingCommits}</div>
            ) : filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: t.muted, padding: '14px 4px' }}>{labels.noCommits}</div>
            ) : filtered.map(co => (
              <div key={co.sha} className="commit-row" style={{
                display: 'flex', gap: 10, marginBottom: 4, alignItems: 'flex-start',
                padding: '6px 8px', borderRadius: 4, position: 'relative',
                transition: 'background .12s',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--code-accent)', flexShrink: 0, marginTop: 2 }}>
                  {co.sha.slice(0, 8)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--code-fg)', lineHeight: 1.45, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
                    {co.tag && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                        background: tagColor(co.tag), color: '#fff', letterSpacing: .3,
                      }}>{co.tag}</span>
                    )}
                    <span style={{
                      fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                      background: 'transparent', color: kindColor(co.kind),
                      border: `1px solid ${kindColor(co.kind)}`,
                    }}>{kindLabel(co.kind, labels)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{co.subject}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: t.muted, marginTop: 2 }}>{co.author} · {relativeDate(co.date, lang)}</div>
                </div>
                <button
                  type="button"
                  className="commit-row-ai"
                  onClick={() => onAskAiCommit(co)}
                  title={lang === 'en' ? 'Explain in AI assistant' : "Détailler dans l'assistant IA"}
                  style={{
                    flexShrink: 0, alignSelf: 'center',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', fontSize: 11, fontWeight: 600,
                    border: `1px solid ${t.brand40}`, background: t.brand10,
                    color: t.brandFg, borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  <Bot size={12} /> {lang === 'en' ? 'AI' : 'IA'}
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-primary"
              onClick={() => onAskAi(filtered, days)}
              disabled={loading || filtered.length === 0}
            >
              <Bot size={14} /> {labels.askAi}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function LogBox({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  return (
    <div ref={ref} style={{
      background: 'var(--code-bg)', borderRadius: t.radius, padding: '10px 12px',
      maxHeight: 160, overflowY: 'auto', marginBottom: 10,
      fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
    }}>
      {logs.map((l, i) => {
        const isErr = l.startsWith('✗') || l.toLowerCase().includes('error') || l.toLowerCase().includes('fatal')
        return (
          <div key={i} style={{ color: isErr ? 'var(--code-err)' : l.startsWith('✓') ? 'var(--code-ok)' : 'var(--code-fg)' }}>{l}</div>
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
      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: t.action, color: t.brandContrast, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
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
  const bg = status === 'running' ? t.dangerSolid : installed ? t.brand : t.action
  return {
    marginTop: 'auto', padding: '8px 0', width: '100%',
    background: bg, color: status === 'running' ? '#fff' : t.brandContrast, border: 'none',
    borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  }
}
