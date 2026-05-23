import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  Wand2, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Loader2,
  FileText, Download, RotateCcw, Pencil, Play, Hammer, Database,
  ScanSearch, KeyRound, History, X, Paperclip, ArrowRight, Image as ImageIcon, Eye,
} from 'lucide-react'
import {
  getCreatorProjects, getAiProviders, getModelConfig, checkAllSources, getCreatorHistory,
  getCreatorHistoryEntry, dryRunCreatorChangeset, applyCreatorChangeset, rejectCreatorRequest, documentCreatorChange,
  previewCreatorOperation,
} from '../api/client'
import { useUiLanguage } from '../i18n'
import { PROVIDERS } from '../constants/providers'
import { makeChallenge } from '../constants/creatorWords'
import PageHeader from '../components/PageHeader'
import AiProviderRequiredModal, { useAiProvidersConfigured } from '../components/AiProviderRequiredModal'
import CreatorPreviewModal, { type PreviewResult } from '../components/CreatorPreviewModal'
import { Button, Card, Field, Badge, Modal, EmptyState } from '../components/ui'
import ToolCallGroup, { type ToolEvent } from '../components/ToolCallGroup'
import Markdown from '../components/Markdown'
import AiSelector from '../components/AiSelector'
import ConversationContextPanel from '../components/ConversationContextPanel'
import WorkspaceShell from '../components/WorkspaceShell'
import { useWorkspaceContext } from '../components/Layout'
import { routedContextFiles, routedContextFilesWithSource, type ComplexityMode } from '../utils/aiContext'
import { streamingSignals } from '../utils/streamingSignals'
import { useRefreshProjectContext } from '../utils/refreshProjectContext'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_MAX_FILES, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_MB,
  fileKind, fileToBase64, formatFileSize, attachmentPayload,
  attachmentNeedsBase64, defaultMimeType,
  type AttachmentDraft,
} from '../utils/attachments'

// ── Types ─────────────────────────────────────────────────────────

interface EnvEntry { id: string; name: string; odoo_version?: string; github_repo?: string }
interface CompanyEntry { id: number; name: string; country_code?: string; currency?: string }
interface CreatorProject {
  id: number
  name: string
  company_name?: string | null
  odoo_version?: string | null
  environments?: string | null
  active_env_id?: string | null
  company_ids?: string | null
  selected_company_id?: number | null
  studio_mode?: string | null
  technical_complexity?: string | null
  eligible: boolean
}
interface Operation { type: string; summary: string; params: Record<string, unknown> }

type StudioVerdict = 'feasible' | 'with_caveats' | 'not_feasible'
interface AnalysisFeasibility {
  verdict: StudioVerdict
  summary: string
  operations: Array<{ index: number; type: string; verdict: StudioVerdict; reasons: string[] }>
}
interface ValidationIssue { field: string | null; severity: 'error' | 'warning'; message: string }
interface AnalysisValidation {
  ok: boolean
  operations: Array<{ index: number; type: string; issues: ValidationIssue[] }>
}
interface OpResult {
  index: number; type: string; summary: string
  status: 'success' | 'failed' | 'skipped' | 'rolled_back' | 'ok'
  error?: string; plan?: string; detail?: Record<string, unknown>
}
interface ChangesetResult {
  ok: boolean
  dry_run: boolean
  operations: OpResult[]
  rolled_back: boolean
  rollback_errors: string[]
}
interface ContextInfo { odoo_version?: string; has_sources: boolean; has_repo: boolean }
interface CreatorHistoryEntry {
  id: number
  profile_id?: number | null
  profile_name?: string | null
  env_id?: string | null
  env_label?: string | null
  company_id?: number | null
  request_text: string
  status: 'analyzed' | 'applied' | 'failed' | 'rejected' | string
  provider?: string | null
  model?: string | null
  created_at?: string | null
  has_documentation?: boolean
}
interface CreatorHistoryDetail extends CreatorHistoryEntry {
  instructions?: string[]
  functional_analysis?: string
  technical_analysis?: string
  changeset?: Operation[]
  apply_result?: ChangesetResult | null
  documentation?: string
}

type Phase = 'gate' | 'setup' | 'analyzing' | 'review' | 'applying' | 'done'

const OP_META: Record<string, { fr: string; en: string }> = {
  create_field:         { fr: 'Nouveau champ',           en: 'New field' },
  modify_view:          { fr: 'Modification de vue',     en: 'View change' },
  create_server_action: { fr: 'Action serveur',          en: 'Server action' },
  create_automation:    { fr: 'Action automatisée',      en: 'Automated action' },
  create_cron:          { fr: 'Action planifiée',        en: 'Scheduled action' },
  modify_report:        { fr: 'Modification de rapport', en: 'Report change' },
  create_record:        { fr: 'Nouvel enregistrement',   en: 'New record' },
  update_record:        { fr: 'Mise à jour de fiches',   en: 'Record update' },
  delete_record:        { fr: 'Suppression de fiches',   en: 'Record deletion' },
}

interface FieldChange { field: string; before: unknown; after: unknown }
interface RecordChange { id: number; display_name: string; changes?: FieldChange[] }

function fmtCellValue(v: unknown): string {
  if (v === false || v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.length === 2 ? String(v[1]) : v.join(', ')
  return String(v)
}

function changesetCounts(ops: Operation[]) {
  let created = 0, updated = 0, deleted = 0, studio = 0
  for (const op of ops) {
    const targets = Array.isArray(op.params?.targets) ? (op.params.targets as unknown[]).length : 0
    if (op.type === 'create_record') created += 1
    else if (op.type === 'update_record') updated += targets || 1
    else if (op.type === 'delete_record') deleted += targets || 1
    else studio += 1
  }
  return { created, updated, deleted, studio }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

function companyLocalizationLabel(company?: CompanyEntry | null) {
  if (!company) return undefined
  const parts = [company.country_code, company.currency].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

function technicalComplexityLabel(raw?: string | null) {
  try {
    const value = JSON.parse(raw ?? '{}')
    return value.label || value.mode || undefined
  } catch {
    return undefined
  }
}

function fmtDate(raw?: string | null) {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Page ──────────────────────────────────────────────────────────

export default function Creator() {
  const lang = useUiLanguage()
  const { contextOpen } = useWorkspaceContext()
  const location = useLocation()
  const en = lang === 'en'
  const c = useMemo(() => ({
    title: en ? 'Creator' : 'Création',
    description: en
      ? 'Apply Studio-style changes and record updates to a live Odoo instance — analysed, previewed and confirmed before any write.'
      : 'Appliquez des modifications de type Studio et des mises à jour de records sur une instance Odoo en direct — analysées, prévisualisées et confirmées avant toute écriture.',
    steps: en ? ['Request', 'Analysis', 'Validation', 'Result'] : ['Demande', 'Analyse', 'Validation', 'Résultat'],
    gateTitle: en ? 'Sensitive tool' : 'Outil sensible',
    gateHint: en
      ? 'The Creator writes directly to production or test databases. Type the Odoo/mountain passphrase below to enter.'
      : 'Le Creator écrit directement sur des bases de production ou de test. Tapez le mot repère Odoo/montagne ci-dessous pour entrer.',
    gateChallenge: en ? 'Type this Odoo/mountain passphrase to continue:' : 'Tapez ce mot repère Odoo/montagne pour continuer :',
    enter: en ? 'Enter the tool' : 'Accéder à l\'outil',
    challengePlaceholder: en ? 'Type the passphrase…' : 'Tapez le mot repère…',
    project: en ? 'Project' : 'Projet',
    selectProject: en ? 'Select a project' : 'Sélectionner un projet',
    environment: en ? 'Environment' : 'Environnement',
    company: en ? 'Company' : 'Société',
    allCompanies: en ? 'All companies' : 'Toutes les sociétés',
    aiModel: en ? 'AI model' : 'Modèle IA',
    noProvider: en ? 'No configured AI provider.' : 'Aucun fournisseur IA configuré.',
    history: en ? 'History' : 'Historique',
    emptyHistory: en ? 'No Creator history yet.' : 'Aucun historique Creator pour le moment.',
    doneSignal: en ? 'Task complete' : 'Tâche terminée',
    runningSignal: en ? 'Task running…' : 'Tâche en cours…',
    request: en ? 'Functional request' : 'Demande fonctionnelle',
    requestHint: en
      ? 'Describe the change — e.g. "add an After-sales tab on the sale order form", or "update the prices of these products from the attached file".'
      : 'Décrivez la modification — ex. « ajouter un onglet SAV sur le bon de commande », ou « mettre à jour le prix de ces produits à partir du fichier joint ».',
    analyze: en ? 'Analyse the request' : 'Analyser la demande',
    analyzing: en ? 'Analysing the instance…' : 'Analyse de l\'instance…',
    noProjects: en ? 'No project available' : 'Aucun projet disponible',
    noProjectsHint: en
      ? 'No project is configured yet. Create a project first to use the Creator.'
      : 'Aucun projet n\'est encore configuré. Créez d\'abord un projet pour utiliser le Creator.',
    attach: en ? 'Attach a document' : 'Joindre un document',
    attachHint: en
      ? 'Optional — attach a PDF or text file (price list, product sheet…) the AI can use to prepare record updates.'
      : 'Optionnel — joignez un PDF ou un fichier texte (liste de prix, fiche produit…) que l\'IA pourra exploiter pour préparer des mises à jour de records.',
    removeAttachment: en ? 'Remove' : 'Retirer',
    dropFiles: en ? 'Drop files here' : 'Déposez les fichiers ici',
    ctxVersion: en ? 'Odoo' : 'Odoo',
    ctxSources: en ? 'Source code' : 'Code source',
    ctxRepo: en ? 'Client repo' : 'Dépôt client',
    ctxOn: en ? 'available' : 'disponible',
    ctxOff: en ? 'not installed' : 'non installé',
    aiWork: en ? 'AI investigation' : 'Investigation de l\'IA',
    functional: en ? 'Functional analysis' : 'Analyse fonctionnelle',
    technical: en ? 'Technical analysis' : 'Analyse technique',
    operations: en ? 'Proposed changes' : 'Modifications proposées',
    noOps: en
      ? 'The AI proposed no executable change. Read the analysis above and refine your request.'
      : 'L\'IA n\'a proposé aucune modification exécutable. Lisez l\'analyse ci-dessus et précisez votre demande.',
    validate: en ? 'Validate & preview' : 'Valider et prévisualiser',
    modify: en ? 'Refine' : 'Modifier',
    reject: en ? 'Reject' : 'Refuser',
    modifyTitle: en ? 'Additional instructions' : 'Instructions complémentaires',
    modifyHint: en
      ? 'Describe what to change in the proposal; the analysis will be regenerated.'
      : 'Décrivez ce qu\'il faut changer dans la proposition ; l\'analyse sera régénérée.',
    relaunch: en ? 'Relaunch analysis' : 'Relancer l\'analyse',
    cancel: en ? 'Cancel' : 'Annuler',
    close: en ? 'Close' : 'Fermer',
    preflightTitle: en ? 'Pre-flight check' : 'Contrôle préalable',
    preflightRunning: en ? 'Validating against the live instance…' : 'Validation sur l\'instance en direct…',
    preflightOk: en
      ? 'Dry-run passed. Here is exactly what will be applied:'
      : 'Le dry-run est passé. Voici exactement ce qui va être appliqué :',
    preflightFail: en
      ? 'The dry-run found problems — nothing will be written. Refine the request and try again.'
      : 'Le dry-run a détecté des problèmes — rien ne sera écrit. Modifiez la demande et réessayez.',
    onInstance: en ? 'Target instance' : 'Instance cible',
    confirmChallenge: en
      ? 'To write these changes to the instance, type the Odoo/mountain passphrase:'
      : 'Pour écrire ces modifications sur l\'instance, tapez le mot repère Odoo/montagne :',
    confirmApply: en ? 'Apply now' : 'Appliquer maintenant',
    applying: en ? 'Applying…' : 'Application en cours…',
    appliedOk: en ? 'Modification applied' : 'Modification appliquée',
    appliedFail: en ? 'Modification failed' : 'Échec de la modification',
    rolledBack: en
      ? 'A failure occurred — every change from this run was rolled back.'
      : 'Une erreur est survenue — toutes les modifications de cette exécution ont été annulées.',
    genDoc: en ? 'Generate documentation' : 'Générer la documentation',
    genDocLoading: en ? 'Writing documentation…' : 'Rédaction de la documentation…',
    downloadDoc: en ? 'Download (.md)' : 'Télécharger (.md)',
    newRequest: en ? 'New request' : 'Nouvelle demande',
    newCreation: en ? 'New creation' : 'Nouvelle création',
    instructionsApplied: en ? 'Instructions taken into account' : 'Instructions prises en compte',
    willCreate: en ? 'Preview' : 'Aperçu',
    statusApplied: en ? 'Applied' : 'Réalisé',
    statusFailed: en ? 'Failed' : 'Échec',
    statusRejected: en ? 'Rejected' : 'Rejeté',
    statusAnalyzed: en ? 'Analysed' : 'Analysé',
    resume: en ? 'Resume' : 'Reprendre',
    missingFunctional: en
      ? 'Functional analysis was not stored for this older history entry.'
      : "L'analyse fonctionnelle n'a pas été enregistrée pour cette ancienne entrée d'historique.",
    missingTechnical: en
      ? 'Technical analysis was not stored for this older history entry.'
      : "L'analyse technique n'a pas été enregistrée pour cette ancienne entrée d'historique.",
    executionErrors: en ? 'Execution errors' : "Erreurs d'exécution",
  }), [en])

  const [phase, setPhase] = useState<Phase>('gate')
  const [gatePhrase] = useState(() => makeChallenge())
  const [gateTyped, setGateTyped] = useState('')

  const [provider, setProvider] = useState('')
  const [modelId, setModelId] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [envId, setEnvId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [request, setRequest] = useState('')
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const { configured: aiConfigured, loading: aiProvLoading } = useAiProvidersConfigured()
  const [aiGuardDismissed, setAiGuardDismissed] = useState(false)
  const [preview, setPreview] = useState<{
    open: boolean; loading: boolean; result: PreviewResult | null; error: string | null; summary: string
  }>({ open: false, loading: false, result: null, error: null, summary: '' })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [instructions, setInstructions] = useState<string[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null)
  const [analysis, setAnalysis] = useState<Operation[] | null>(null)
  const [funcAnalysis, setFuncAnalysis] = useState('')
  const [techAnalysis, setTechAnalysis] = useState('')
  const [studioFeasibility, setStudioFeasibility] = useState<AnalysisFeasibility | null>(null)
  const [validation, setValidation] = useState<AnalysisValidation | null>(null)
  const [streamErr, setStreamErr] = useState('')

  const [showModify, setShowModify] = useState(false)
  const [modifyText, setModifyText] = useState('')

  const [showConfirm, setShowConfirm] = useState(false)
  const [preflight, setPreflight] = useState<ChangesetResult | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [applyPhrase, setApplyPhrase] = useState('')
  const [applyTyped, setApplyTyped] = useState('')
  const [applyErr, setApplyErr] = useState('')
  const [applyResult, setApplyResult] = useState<ChangesetResult | null>(null)
  const [requestId, setRequestId] = useState<number | null>(null)

  const [documentation, setDocumentation] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [, rerenderSignal] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const restoringHistoryRef = useRef(false)

  // ── data ────────────────────────────────────────────────────────

  const { data: providersData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const { data: modelCfg } = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })
  const { data: sourcesData } = useQuery({ queryKey: ['sources-all'], queryFn: checkAllSources, staleTime: 30_000 })
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['creator-history'],
    queryFn: () => getCreatorHistory(50),
    enabled: phase !== 'gate',
  })

  const configuredProviders = useMemo(() => {
    const map = (providersData?.data ?? {}) as Record<string, boolean>
    const config = (modelCfg?.data ?? {}) as Record<string, string[]>
    return PROVIDERS
      .filter(p => map[p.id])
      .map(p => {
        const enabled = config[p.id]
        if (!enabled || enabled.length === 0) return p
        return { ...p, models: p.models.filter(m => enabled.includes(m.id)) }
      })
      .filter(p => p.models.length > 0)
  }, [providersData, modelCfg])

  const activeProvider = provider || configuredProviders[0]?.id || ''
  const activeProvDef = configuredProviders.find(p => p.id === activeProvider)
  const activeModelId = modelId || activeProvDef?.models.find(m => m.recommended)?.id || activeProvDef?.models[0]?.id || ''
  const srcStatus: Record<string, { installed: boolean }> = sourcesData?.data ?? {}
  const historyRows: CreatorHistoryEntry[] = historyData?.data ?? []

  useEffect(() => {
    if (!provider && configuredProviders.length) {
      const preferred = configuredProviders.find(p => p.id === 'claude') ?? configuredProviders[0]
      setProvider(preferred.id)
      setModelId(preferred.models.find(m => m.recommended)?.id ?? preferred.models[0]?.id ?? '')
    }
  }, [configuredProviders, provider])

  const switchProvider = (id: string) => {
    const p = configuredProviders.find(pv => pv.id === id)
    if (!p) return
    setProvider(id)
    setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0]?.id ?? '')
  }

  useEffect(() => streamingSignals.subscribe(() => rerenderSignal(n => n + 1)), [])

  const { data: projectsData } = useQuery({
    queryKey: ['creator-projects'],
    queryFn: getCreatorProjects,
    enabled: phase !== 'gate',
  })
  const projects: CreatorProject[] = useMemo(
    () => (projectsData?.data ?? []) as CreatorProject[],
    [projectsData],
  )

  useEffect(() => {
    const state = location.state as { profileId?: number; envId?: string } | null
    if (!state?.profileId || projects.length === 0) return
    setProjectId(state.profileId)
    if (state.envId) setEnvId(state.envId)
    window.history.replaceState({}, '')
  }, [location.state, projects])

  const selectedProject = projects.find(p => p.id === projectId) ?? null
  const envs: EnvEntry[] = useMemo(
    () => parseJson<EnvEntry[]>(selectedProject?.environments, []),
    [selectedProject],
  )
  const companies: CompanyEntry[] = useMemo(
    () => parseJson<CompanyEntry[]>(selectedProject?.company_ids, []),
    [selectedProject],
  )
  const activeEnv = envs.find(e => e.id === envId) ?? null
  const activeVersion = activeEnv?.odoo_version ?? selectedProject?.odoo_version ?? null
  const activeCompany = companies.find(c => c.id === companyId) ?? companies[0] ?? null
  const activeEnvRepo = activeEnv?.github_repo ?? null
  const handleRefreshContext = useRefreshProjectContext(selectedProject?.id ?? null, activeEnv?.id ?? null)
  const activeComplexity = technicalComplexityLabel(selectedProject?.technical_complexity)
  const activeCompanyLocalization = companyLocalizationLabel(activeCompany)
  const complexityParsed = parseJson<Record<string, unknown>>(selectedProject?.technical_complexity, {})
  const complexityMode = (complexityParsed?.mode as ComplexityMode | undefined) ?? null
  const sourceRepoIsCloned = ((complexityParsed?.dev as { repositories?: Array<{ cloned: boolean }> } | undefined)?.repositories ?? []).some(r => r.cloned)
  const sourceCommunity = activeVersion ? srcStatus[activeVersion]?.installed === true : false
  const sourceEnterprise = activeVersion ? srcStatus[`${activeVersion}-enterprise`]?.installed === true : false
  const sourceEdition = sourceCommunity && sourceEnterprise ? 'C+E' : sourceCommunity ? 'C' : sourceEnterprise ? 'E' : ''
  const contextFilesWithSource = routedContextFilesWithSource({
    prompt: request,
    perspective: 'developer',
    version: activeVersion,
    migration: false,
    creation: true,
    complexityMode,
  })
  const contextFiles = contextFilesWithSource.map(f => f.name)
  const contextFileSources = new Map(contextFilesWithSource.map(f => [f.name, f.source]))
  const conversationSources = [
    activeVersion && (sourceCommunity || sourceEnterprise) ? `Sources Odoo ${activeVersion}${sourceEdition ? ` ${sourceEdition}` : ''}` : null,
    activeEnvRepo && sourceRepoIsCloned ? activeEnvRepo.split('/').slice(-2).join('/').replace(/\.git$/, '') : null,
  ].filter(Boolean) as string[]
  const creatorSignal = streamingSignals.getAll().find(([k]) => k === 'creator')?.[1]

  useEffect(() => {
    if (!selectedProject) return
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false
      return
    }
    setEnvId(selectedProject.active_env_id ?? envs[0]?.id ?? null)
    setCompanyId(selectedProject.selected_company_id ?? null)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── attachments ─────────────────────────────────────────────────

  const readyAttachments = attachments.filter(a => a.status === 'ready')

  const addAttachmentError = (file: File, error: string) => {
    setAttachments(prev => [
      ...prev,
      {
        id: `${Date.now()}-${file.name}-error`,
        name: file.name,
        mime_type: file.type,
        size: file.size,
        kind: fileKind(file) ?? 'text',
        status: 'error',
        error,
      },
    ])
  }

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length || phase !== 'setup') return
    const slots = ATTACHMENT_MAX_FILES - readyAttachments.length
    if (slots <= 0) {
      addAttachmentError(files[0], en ? `Maximum ${ATTACHMENT_MAX_FILES} files` : `Maximum ${ATTACHMENT_MAX_FILES} fichiers`)
      return
    }
    for (const file of files.slice(0, slots)) {
      const kind = fileKind(file)
      if (!kind) { addAttachmentError(file, en ? 'Unsupported format' : 'Format non supporté'); continue }
      if (file.size > ATTACHMENT_MAX_BYTES) { addAttachmentError(file, en ? `File over ${ATTACHMENT_MAX_MB} MB` : `Fichier supérieur à ${ATTACHMENT_MAX_MB} MB`); continue }
      try {
        const base = {
          id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          mime_type: defaultMimeType(file, kind),
          size: file.size,
          kind,
          status: 'ready' as const,
        }
        const draft: AttachmentDraft = attachmentNeedsBase64(kind)
          ? { ...base, content_base64: await fileToBase64(file) }
          : { ...base, text: await file.text() }
        setAttachments(prev => [...prev.filter(a => a.status === 'ready'), draft].slice(0, ATTACHMENT_MAX_FILES))
      } catch (err) {
        addAttachmentError(file, err instanceof Error ? err.message : (en ? 'Cannot read file' : 'Lecture impossible'))
      }
    }
  }

  // ── preview ─────────────────────────────────────────────────────

  const runPreview = async (index: number) => {
    if (projectId === '' || !analysis) return
    const op = analysis[index]
    if (!op) return
    setPreview({ open: true, loading: true, result: null, error: null, summary: op.summary || '' })
    try {
      const res = await previewCreatorOperation({
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        operations: analysis,
        index,
      })
      setPreview(p => ({ ...p, loading: false, result: res.data as PreviewResult }))
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPreview(p => ({
        ...p, loading: false,
        error: detail ?? (e instanceof Error ? e.message : 'Aperçu impossible'),
      }))
    }
  }

  const requestChangeFromPreview = (instruction: string) => {
    if (projectId === '') return
    const ctx = preview.summary ? `Concernant « ${preview.summary} » : ` : ''
    const next = [...instructions, ctx + instruction]
    setInstructions(next)
    setPreview(p => ({ ...p, open: false }))
    runAnalysis(next)
  }

  // ── analysis ────────────────────────────────────────────────────

  const runAnalysis = async (allInstructions: string[]) => {
    if (projectId === '' || !activeProvider) return
    if (!request.trim() && readyAttachments.length === 0) return
    setPhase('analyzing')
    setToolEvents([])
    setContextInfo(null)
    setAnalysis(null)
    setFuncAnalysis('')
    setTechAnalysis('')
    setStudioFeasibility(null)
    setValidation(null)
    setStreamErr('')

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    streamingSignals.set('creator', {
      status: 'streaming',
      label: selectedProject?.name ?? c.title,
      pageKey: 'creator',
    })

    try {
      const res = await fetch('/api/creator/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          provider: activeProvider,
          model: activeModelId || undefined,
          profile_id: projectId,
          env_id: envId ?? undefined,
          company_id: companyId ?? undefined,
          request,
          instructions: allInstructions,
          attachments: readyAttachments.map(attachmentPayload),
        }),
      })
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let gotAnalysis = false
      let gotError = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          let evt: Record<string, unknown>
          try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }
          const type = evt.type as string
          if (type === 'context') {
            setContextInfo({
              odoo_version: evt.odoo_version as string | undefined,
              has_sources: Boolean(evt.has_sources),
              has_repo: Boolean(evt.has_repo),
            })
          } else if (type === 'tool_call' || type === 'tool_result' || type === 'warning') {
            setToolEvents(prev => [...prev, evt as unknown as ToolEvent])
          } else if (type === 'analysis') {
            gotAnalysis = true
            setRequestId((evt.request_id as number | undefined) ?? null)
            setFuncAnalysis((evt.functional_analysis as string) ?? '')
            setTechAnalysis((evt.technical_analysis as string) ?? '')
            setAnalysis((evt.operations as Operation[]) ?? [])
            setStudioFeasibility((evt.studio_feasibility as AnalysisFeasibility | undefined) ?? null)
            setValidation((evt.validation as AnalysisValidation | undefined) ?? null)
          } else if (type === 'error') {
            gotError = true
            setStreamErr((evt.msg as string) ?? 'Erreur inconnue')
          }
        }
      }
      if (!gotAnalysis && !streamErr) {
        setStreamErr(en ? 'No analysis returned.' : 'Aucune analyse retournée.')
      }
      setPhase('review')
      if (gotAnalysis && !gotError) {
        streamingSignals.done('creator')
        refetchHistory()
      } else {
        streamingSignals.clear('creator')
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setStreamErr(e instanceof Error ? e.message : String(e))
      setPhase('review')
      streamingSignals.clear('creator')
    }
  }

  const startAnalysis = () => { setInstructions([]); runAnalysis([]) }

  const relaunchWithInstruction = () => {
    if (!modifyText.trim()) return
    const next = [...instructions, modifyText.trim()]
    setInstructions(next)
    setShowModify(false)
    setModifyText('')
    runAnalysis(next)
  }

  // ── dry-run + apply ─────────────────────────────────────────────

  const startValidation = async () => {
    if (projectId === '' || !analysis?.length) return
    setShowConfirm(true)
    setPreflight(null)
    setApplyErr('')
    setApplyTyped('')
    setApplyPhrase(makeChallenge())
    setPreflightLoading(true)
    try {
      const res = await dryRunCreatorChangeset({
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        operations: analysis,
      })
      setPreflight(res.data as ChangesetResult)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApplyErr(detail ?? (e instanceof Error ? e.message : String(e)))
    } finally {
      setPreflightLoading(false)
    }
  }

  const applyMatches = applyTyped.trim() === applyPhrase

  const doApply = async () => {
    if (projectId === '' || !analysis || !applyMatches) return
    setApplyErr('')
    setPhase('applying')
    streamingSignals.set('creator', {
      status: 'streaming',
      label: selectedProject?.name ?? c.title,
      pageKey: 'creator',
    })
    try {
      const res = await applyCreatorChangeset({
        request_id: requestId ?? undefined,
        provider: activeProvider,
        model: activeModelId || undefined,
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        request,
        instructions,
        functional_analysis: funcAnalysis,
        technical_analysis: techAnalysis,
        operations: analysis,
      })
      if (res.data.stage === 'preflight') {
        const failedPreflight = res.data.preflight as ChangesetResult
        setRequestId((res.data.request_id as number | undefined) ?? requestId)
        setPreflight(failedPreflight)
        setApplyResult(failedPreflight)
        setApplyErr(
          failedPreflight.operations
            ?.filter(op => op.status === 'failed')
            .map(op => op.error)
            .filter(Boolean)
            .join('\n') || c.preflightFail,
        )
        setPhase('review')
        streamingSignals.clear('creator')
        refetchHistory()
        return
      }
      setApplyResult(res.data.result as ChangesetResult)
      setRequestId(res.data.request_id as number)
      setShowConfirm(false)
      setApplyTyped('')
      setPhase('done')
      streamingSignals.done('creator')
      refetchHistory()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApplyErr(detail ?? (e instanceof Error ? e.message : String(e)))
      setPhase('review')
      streamingSignals.clear('creator')
    }
  }

  const doReject = async () => {
    if (projectId === '') return
    try {
      await rejectCreatorRequest({
        request_id: requestId ?? undefined,
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        request,
        instructions,
        functional_analysis: funcAnalysis,
        technical_analysis: techAnalysis,
        operations: analysis ?? [],
      })
      refetchHistory()
    } catch { /* logging only */ }
    resetRequest()
  }

  const resetRequest = () => {
    abortRef.current?.abort()
    setRequest('')
    setAttachments([])
    setInstructions([])
    setToolEvents([])
    setContextInfo(null)
    setAnalysis(null)
    setFuncAnalysis('')
    setTechAnalysis('')
    setStudioFeasibility(null)
    setValidation(null)
    setStreamErr('')
    setPreflight(null)
    setApplyResult(null)
    setApplyErr('')
    setApplyTyped('')
    setRequestId(null)
    setDocumentation('')
    setShowModify(false)
    setShowConfirm(false)
    setModifyText('')
    streamingSignals.clear('creator')
    setPhase('setup')
  }

  const resumeHistoryEntry = async (id: number) => {
    try {
      const res = await getCreatorHistoryEntry(id)
      const row = res.data as CreatorHistoryDetail
      abortRef.current?.abort()
      restoringHistoryRef.current = true
      setRequestId(row.id)
      setProjectId(row.profile_id ?? '')
      setEnvId(row.env_id ?? null)
      setCompanyId(row.company_id ?? null)
      setRequest(row.request_text ?? '')
      setAttachments([])
      setInstructions(row.instructions ?? [])
      setFuncAnalysis((row.functional_analysis ?? '').trim())
      setTechAnalysis((row.technical_analysis ?? '').trim())
      setAnalysis(row.changeset ?? [])
      setProvider(row.provider ?? activeProvider)
      setModelId(row.model ?? activeModelId)
      setToolEvents([])
      setStreamErr('')
      setPreflight(null)
      setApplyErr('')
      setApplyTyped('')
      setShowModify(false)
      setShowConfirm(false)
      setShowHistory(false)
      setDocumentation(row.documentation ?? '')
      if (row.status === 'applied' && row.apply_result) {
        setApplyResult(row.apply_result)
        setPhase('done')
      } else {
        setApplyResult(row.apply_result ?? null)
        if (row.status === 'failed') {
          const failed = row.apply_result?.operations?.filter(op => op.status === 'failed') ?? []
          setApplyErr(failed.map(op => op.error).filter(Boolean).join('\n') || c.appliedFail)
        }
        setPhase('review')
      }
      streamingSignals.clear('creator')
    } catch (e: unknown) {
      setStreamErr(e instanceof Error ? e.message : String(e))
      setShowHistory(false)
      setPhase('review')
    }
  }

  // ── documentation ───────────────────────────────────────────────

  const generateDoc = async () => {
    if (projectId === '' || !applyResult) return
    setDocLoading(true)
    try {
      const res = await documentCreatorChange({
        request_id: requestId ?? undefined,
        provider: activeProvider,
        model: activeModelId || undefined,
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        request,
        functional_analysis: funcAnalysis,
        technical_analysis: techAnalysis,
        apply_result: applyResult,
      })
      setDocumentation((res.data.documentation as string) ?? '')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setDocumentation(`> ${detail ?? (e instanceof Error ? e.message : String(e))}`)
    } finally {
      setDocLoading(false)
    }
  }

  const downloadDoc = () => {
    const blob = new Blob([documentation], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `creation-odoo-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── render: gate ────────────────────────────────────────────────

  if (phase === 'gate') {
    const gateMatches = gateTyped.trim() === gatePhrase
    return (
      <div className="page-stack">
        <PageHeader title={c.title} description={c.description} />
        <Card className="page-card">
          <div className="page-card-body">
            <div style={{ maxWidth: 400, margin: '20px auto' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--brand-fg)' }}>
                <ShieldCheck size={34} />
              </div>
              <div className="ui-section-title" style={{ justifyContent: 'center' }}>{c.gateTitle}</div>
              <p style={{ fontSize: 13, color: 'var(--th-muted)', margin: '6px 0 16px', textAlign: 'center' }}>
                {c.gateHint}
              </p>
              <ChallengeBox
                label={c.gateChallenge}
                phrase={gatePhrase}
                typed={gateTyped}
                onTyped={setGateTyped}
                placeholder={c.challengePlaceholder}
                onEnter={() => { if (gateMatches) setPhase('setup') }}
              />
              <Button
                variant="primary"
                icon={<KeyRound size={15} />}
                onClick={() => setPhase('setup')}
                disabled={!gateMatches}
                style={{ marginTop: 4, width: '100%' }}
              >
                {c.enter}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // ── render: main ────────────────────────────────────────────────

  const busy = phase === 'analyzing' || phase === 'applying'
  const locked = busy || phase === 'review' || phase === 'done'
  const opCount = analysis?.length ?? 0
  const currentStep: 1 | 2 | 3 | 4 =
    phase === 'setup' ? 1 : phase === 'analyzing' ? 2 : phase === 'done' ? 4 : 3

  const creatorHeader = (<>
    <AiProviderRequiredModal
      open={!aiProvLoading && !aiConfigured && !aiGuardDismissed}
      onClose={() => setAiGuardDismissed(true)}
    />
    <CreatorPreviewModal
      open={preview.open}
      loading={preview.loading}
      result={preview.result}
      error={preview.error}
      opSummary={preview.summary}
      onRequestChange={requestChangeFromPreview}
      onClose={() => setPreview(p => ({ ...p, open: false }))}
    />
    <PageHeader title={c.title} description={c.description} />
  </>)

  const creatorContextPanel = contextOpen ? (
    <ConversationContextPanel
      title={en ? 'Creator context' : 'Contexte Creator'}
      mode="developer"
      effectivePerspective="developer"
      lockedProfileLabel={en ? 'Creator' : 'Créateur'}
      lockedProfileHint={en
        ? 'Locked — Studio production conventions enforced'
        : 'Verrouillé — conventions Studio appliquées'}
      provider={activeProvDef?.label}
      model={activeProvDef?.models.find(m => m.id === activeModelId)?.label}
      project={selectedProject?.name}
      environment={activeEnv?.name}
      company={activeCompany?.name}
      countryCode={activeCompany?.country_code}
      localization={activeCompanyLocalization}
      complexity={activeComplexity}
      version={activeVersion}
      repo={activeEnvRepo}
      contextFiles={contextFiles}
      contextFileSources={contextFileSources}
      sources={conversationSources}
      attachments={[]}
      onRefresh={handleRefreshContext}
    />
  ) : null

  const creatorHistoryPanel = showHistory ? (
    <CreatorHistoryPanel
      rows={historyRows}
      empty={c.emptyHistory}
      title={c.history}
      close={c.close}
      labels={{
        applied: c.statusApplied,
        failed: c.statusFailed,
        rejected: c.statusRejected,
        analyzed: c.statusAnalyzed,
      }}
      resume={c.resume}
      onResume={resumeHistoryEntry}
      onClose={() => setShowHistory(false)}
    />
  ) : null

  return (
    <WorkspaceShell
      className="creator-shell"
      mainClassName="creator-content-row"
      chatClassName="creator-main-column"
      header={creatorHeader}
      contextPanel={creatorContextPanel}
      historyPanel={creatorHistoryPanel}
    >
      <StepBar steps={c.steps} current={currentStep} />

      <div className="assistant-context">
        <div className="assistant-control-row">
          {configuredProviders.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--th-muted)' }}>{c.noProvider}</span>
          ) : (
            <AiSelector
              providers={configuredProviders}
              provider={activeProvider}
              modelId={activeModelId}
              switchProvider={switchProvider}
              setModelId={setModelId}
            />
          )}
          {creatorSignal && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: creatorSignal.status === 'streaming' ? 'var(--th-streaming-fg)' : 'var(--th-success-fg, #1e7e34)',
              fontWeight: 650,
            }}>
              <span className={`stream-dot stream-dot--${creatorSignal.status}`} />
              {creatorSignal.status === 'streaming' ? c.runningSignal : c.doneSignal}
            </span>
          )}
          <div className="assistant-control-spacer" />
          {(request.trim() || analysis || phase === 'review' || phase === 'done') && (
            <button
              type="button"
              onClick={resetRequest}
              className="assistant-soft-action"
              disabled={busy}
              title={c.newCreation}
            >
              <RotateCcw size={13} />
              <span>{c.newCreation}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory(h => !h)}
            className={`assistant-soft-action${showHistory ? ' is-active' : ''}`}
            title={`${c.history} (${historyRows.length})`}
          >
            <History size={13} />
            <span>{c.history} ({historyRows.length})</span>
          </button>
        </div>
      </div>

      {/* Setup */}
      <Card className="page-card">
        <div className="page-card-body">
          <div className="ui-form-grid">
            <Field label={c.project}>
              <select
                className="ui-input"
                value={projectId}
                disabled={locked}
                onChange={e => setProjectId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">{c.selectProject}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.company_name ? ` · ${p.company_name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={c.environment}>
              <select
                className="ui-input"
                value={envId ?? ''}
                disabled={locked || envs.length === 0}
                onChange={e => setEnvId(e.target.value || null)}
              >
                {envs.length === 0 && <option value="">{selectedProject?.odoo_version ?? '—'}</option>}
                {envs.map(env => (
                  <option key={env.id} value={env.id}>
                    {env.name}{env.odoo_version ? ` (Odoo ${env.odoo_version})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={c.company}>
              <select
                className="ui-input"
                value={companyId ?? ''}
                disabled={locked || companies.length === 0}
                onChange={e => setCompanyId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{c.allCompanies}</option>
                {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
              </select>
            </Field>
          </div>

          {projects.length === 0 && projectsData && (
            <div style={{ marginTop: 8 }}>
              <EmptyState icon={<Database size={24} />} title={c.noProjects} description={c.noProjectsHint} />
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              borderRadius: 10,
              outline: draggingFiles ? '2px dashed var(--brand)' : '2px dashed transparent',
              outlineOffset: 6,
              transition: 'outline-color .12s',
            }}
            onDragEnter={e => { if (phase === 'setup') { e.preventDefault(); setDraggingFiles(true) } }}
            onDragOver={e => { if (phase === 'setup') { e.preventDefault(); setDraggingFiles(true) } }}
            onDragLeave={e => { if (e.currentTarget === e.target) setDraggingFiles(false) }}
            onDrop={e => {
              setDraggingFiles(false)
              if (phase !== 'setup') return
              e.preventDefault()
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
            }}
          >
            <Field label={c.request} hint={c.requestHint}>
              <textarea
                className="ui-input"
                rows={4}
                value={request}
                disabled={busy}
                readOnly={locked}
                placeholder={c.requestHint}
                onChange={e => { if (!locked) setRequest(e.target.value) }}
                style={{ resize: 'vertical', fontFamily: 'inherit', opacity: locked && !busy ? 0.85 : undefined }}
              />
            </Field>
            {phase === 'setup' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.currentTarget.value = '' }}
                />
                <button
                  type="button"
                  className="assistant-soft-action"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={readyAttachments.length >= ATTACHMENT_MAX_FILES}
                  title={c.attach}
                >
                  <Paperclip size={13} />
                  <span>{c.attach}</span>
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--th-muted)' }}>{c.attachHint}</span>
              </div>
            )}
            {attachments.length > 0 && (
              <div className="assistant-attachments" style={{ marginTop: 8 }}>
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className={`assistant-attachment-chip${att.status === 'error' ? ' is-error' : ''}`}
                    title={att.error ?? att.name}
                  >
                    {att.kind === 'pdf' || att.kind === 'office' ? <FileText size={13} /> : att.kind === 'image' ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                    <span className="assistant-attachment-name">{att.name}</span>
                    <span className="assistant-attachment-size">{formatFileSize(att.size)}</span>
                    {att.status === 'error' && <span className="assistant-attachment-error">{att.error}</span>}
                    {phase === 'setup' && (
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                        aria-label={`${c.removeAttachment} ${att.name}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {instructions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="ui-section-title">{c.instructionsApplied}</div>
              {instructions.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 4 }}>
                  <Pencil size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--brand-fg)' }} />
                  <span>{ins}</span>
                </div>
              ))}
            </div>
          )}

          {phase === 'setup' && (
            <div className="ui-actions-row" style={{ marginTop: 16 }}>
              <Button
                variant="primary"
                icon={<Wand2 size={15} />}
                onClick={startAnalysis}
                disabled={projectId === '' || !activeProvider || (!request.trim() && readyAttachments.length === 0)}
              >
                {c.analyze}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* AI investigation timeline */}
      {(phase === 'analyzing' || toolEvents.length > 0) && phase !== 'done' && (
        <Card className="page-card">
          <div className="page-card-body-compact">
            <div className="ui-section-title">
              {phase === 'analyzing'
                ? <><Loader2 size={15} className="creator-spin" /> {c.analyzing}</>
                : <><ScanSearch size={15} /> {c.aiWork}</>}
            </div>
            {toolEvents.length > 0 && (
              <ToolCallGroup events={toolEvents} projectName={selectedProject?.name} />
            )}
          </div>
        </Card>
      )}

      {streamErr && phase === 'review' && (
        <Card className="page-card">
          <div className="page-card-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} style={{ color: 'var(--th-danger, #c0392b)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13 }}>{streamErr}</span>
          </div>
        </Card>
      )}

      {/* Review */}
      {(phase === 'review' || phase === 'applying' || phase === 'done') && (analysis || funcAnalysis || techAnalysis) && (
        <>
          {(funcAnalysis || requestId) && (
            <Card className="page-card">
              <div className="page-card-body">
                <div className="ui-section-title"><FileText size={15} /> {c.functional}</div>
                {funcAnalysis ? <Markdown text={funcAnalysis} /> : <p className="ui-empty-description">{c.missingFunctional}</p>}
              </div>
            </Card>
          )}
          {(techAnalysis || requestId) && (
            <Card className="page-card">
              <div className="page-card-body">
                <div className="ui-section-title"><Hammer size={15} /> {c.technical}</div>
                {techAnalysis ? <Markdown text={techAnalysis} /> : <p className="ui-empty-description">{c.missingTechnical}</p>}
              </div>
            </Card>
          )}

          {phase !== 'done' && (applyErr || applyResult?.operations?.some(op => op.status === 'failed' || op.status === 'rolled_back')) && (
            <Card className="page-card">
              <div className="page-card-body">
                <div className="ui-section-title"><AlertTriangle size={15} /> {c.executionErrors}</div>
                {applyErr && (
                  <pre className="ui-code-block" style={{ whiteSpace: 'pre-wrap', marginTop: 0, color: 'var(--th-danger, #c0392b)' }}>
                    {applyErr}
                  </pre>
                )}
                {applyResult?.operations
                  ?.filter(op => op.status === 'failed' || op.status === 'rolled_back')
                  .map(op => <ResultRow key={op.index} r={op} en={en} />)}
              </div>
            </Card>
          )}

          {phase !== 'done' && (
          <Card className="page-card">
            <div className="page-card-body">
              <div className="ui-section-title">
                {c.operations}
              </div>
              {opCount === 0 && <p className="ui-empty-description">{c.noOps}</p>}
              {analysis && analysis.length > 0 && <ChangesetSummary ops={analysis} en={en} />}
              {analysis && analysis.length > 0 && (
                <PreflightBanner feasibility={studioFeasibility} validation={validation} en={en} />
              )}
              {analysis?.map((op, i) => (
                <OperationRow key={i} op={op} index={i} en={en} onPreview={runPreview}
                  feasibility={studioFeasibility?.operations.find(o => o.index === i)}
                  issues={validation?.operations.find(o => o.index === i)?.issues}
                />
              ))}

              {applyErr && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, color: 'var(--th-danger, #c0392b)', fontSize: 13 }}>
                  <XCircle size={16} style={{ flexShrink: 0 }} /> {applyErr}
                </div>
              )}

              <div className="ui-actions-row" style={{ marginTop: 18 }}>
                <Button
                  variant="primary"
                  icon={<Play size={15} />}
                  disabled={opCount === 0 || phase === 'applying'}
                  onClick={startValidation}
                >
                  {c.validate}
                </Button>
                <Button
                  variant="secondary"
                  icon={<Pencil size={15} />}
                  disabled={phase === 'applying'}
                  onClick={() => setShowModify(true)}
                >
                  {c.modify}
                </Button>
                <Button
                  variant="danger"
                  icon={<XCircle size={15} />}
                  disabled={phase === 'applying'}
                  onClick={doReject}
                >
                  {c.reject}
                </Button>
              </div>
            </div>
          </Card>
          )}
        </>
      )}

      {/* Done */}
      {phase === 'done' && applyResult && (
        <Card className="page-card">
          <div className="page-card-body">
            <div className="ui-section-title">
              {applyResult.ok
                ? <><CheckCircle2 size={16} style={{ color: 'var(--th-success, #1e7e34)' }} /> {c.appliedOk}</>
                : <><XCircle size={16} style={{ color: 'var(--th-danger, #c0392b)' }} /> {c.appliedFail}</>}
            </div>

            {applyResult.rolled_back && (
              <div style={{ display: 'flex', gap: 8, margin: '8px 0', fontSize: 13, color: 'var(--th-danger, #c0392b)' }}>
                <RotateCcw size={15} style={{ flexShrink: 0 }} /> {c.rolledBack}
              </div>
            )}

            {applyResult.operations.map(r => <ResultRow key={r.index} r={r} en={en} />)}

            <div style={{ marginTop: 18, borderTop: '1px solid var(--th-border, #e3e3e3)', paddingTop: 16 }}>
              {documentation
                ? (
                  <>
                    <div className="ui-section-title"><FileText size={15} /> Documentation</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6 }}><Markdown text={documentation} /></div>
                  </>
                )
                : (
                  <Button
                    variant="secondary"
                    icon={docLoading ? <Loader2 size={15} className="creator-spin" /> : <FileText size={15} />}
                    onClick={generateDoc}
                    disabled={docLoading}
                  >
                    {docLoading ? c.genDocLoading : c.genDoc}
                  </Button>
                )}
            </div>

            <div className="ui-actions-row" style={{ marginTop: 18 }}>
              {documentation && (
                <Button variant="secondary" icon={<Download size={15} />} onClick={downloadDoc}>
                  {c.downloadDoc}
                </Button>
              )}
              <Button variant="primary" icon={<RotateCcw size={15} />} onClick={resetRequest}>
                {c.newRequest}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Refine modal */}
      {showModify && (
        <Modal
          title={c.modifyTitle}
          onClose={() => setShowModify(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowModify(false)}>{c.cancel}</Button>
              <Button variant="primary" onClick={relaunchWithInstruction} disabled={!modifyText.trim()}>
                {c.relaunch}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--th-muted)', margin: '0 0 10px' }}>{c.modifyHint}</p>
          <textarea
            className="ui-input"
            rows={4}
            autoFocus
            value={modifyText}
            onChange={e => setModifyText(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Modal>
      )}

      {/* Pre-flight / apply modal */}
      {showConfirm && (
        <Modal
          title={<><ScanSearch size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />{c.preflightTitle}</>}
          width={620}
          onClose={() => { if (phase !== 'applying') setShowConfirm(false) }}
          footer={
            preflightLoading ? (
              <Button variant="ghost" disabled>{c.preflightRunning}</Button>
            ) : preflight?.ok ? (
              <>
                <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={phase === 'applying'}>
                  {c.cancel}
                </Button>
                <Button
                  variant="danger"
                  icon={phase === 'applying' ? <Loader2 size={15} className="creator-spin" /> : <Play size={15} />}
                  onClick={doApply}
                  disabled={!applyMatches || phase === 'applying'}
                >
                  {phase === 'applying' ? c.applying : c.confirmApply}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setShowConfirm(false)}>{c.close}</Button>
            )
          }
        >
          {preflightLoading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 0', fontSize: 13 }}>
              <Loader2 size={18} className="creator-spin" style={{ color: 'var(--brand-fg)' }} />
              {c.preflightRunning}
            </div>
          )}

          {applyErr && !preflightLoading && (
            <div style={{ display: 'flex', gap: 8, color: 'var(--th-danger, #c0392b)', fontSize: 13, marginBottom: 10 }}>
              <XCircle size={16} style={{ flexShrink: 0 }} /> {applyErr}
            </div>
          )}

          {preflight && !preflightLoading && (
            <>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13,
                color: preflight.ok ? 'var(--th-success, #1e7e34)' : 'var(--th-danger, #c0392b)',
                marginBottom: 12,
              }}>
                {preflight.ok
                  ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  : <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
                <span>{preflight.ok ? c.preflightOk : c.preflightFail}</span>
              </div>

              {analysis && <ChangesetSummary ops={analysis} en={en} />}
              {preflight.operations.map(op => <PreflightRow key={op.index} op={op} en={en} willCreate={c.willCreate} />)}

              {preflight.ok && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--th-border, #e3e3e3)', paddingTop: 14 }}>
                  <div style={{
                    fontSize: 12.5, background: 'var(--th-bg-muted, #f5f5f5)', borderRadius: 8,
                    padding: '8px 12px', marginBottom: 14,
                  }}>
                    <span style={{ color: 'var(--th-muted)' }}>{c.onInstance} : </span>
                    <strong>{selectedProject?.name}</strong>
                    {activeEnv && <> · {activeEnv.name}</>}
                    {activeVersion && <> · Odoo {activeVersion}</>}
                  </div>
                  <ChallengeBox
                    label={c.confirmChallenge}
                    phrase={applyPhrase}
                    typed={applyTyped}
                    onTyped={setApplyTyped}
                    placeholder={c.challengePlaceholder}
                    disabled={phase === 'applying'}
                    onEnter={doApply}
                  />
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </WorkspaceShell>
  )
}

// ── Challenge box (type-to-confirm) ───────────────────────────────

function ChallengeBox({ label, phrase, typed, onTyped, placeholder, disabled, onEnter }: {
  label: string
  phrase: string
  typed: string
  onTyped: (v: string) => void
  placeholder: string
  disabled?: boolean
  onEnter?: () => void
}) {
  return (
    <div>
      <p style={{ fontSize: 13, margin: '0 0 6px' }}>{label}</p>
      <code className="creator-challenge-code">{phrase}</code>
      <input
        type="text"
        className="ui-input"
        value={typed}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => onTyped(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
      />
    </div>
  )
}

// ── Step bar ──────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 2px' }}>
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        const fg = done || active ? 'var(--brand)' : 'var(--th-muted, #999)'
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: done || active ? 'var(--brand)' : 'transparent',
                color: done || active ? 'var(--brand-contrast, #fff)' : fg,
                border: `1.5px solid ${done || active ? 'var(--brand)' : 'var(--th-border, #ddd)'}`,
              }}>
                {done ? <CheckCircle2 size={14} /> : n}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: fg, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span style={{
                flex: 1, height: 2, margin: '0 12px',
                background: done ? 'var(--brand)' : 'var(--th-border, #e3e3e3)',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── History panel ────────────────────────────────────────────────

function CreatorHistoryPanel({ rows, empty, title, close, labels, resume, onResume, onClose }: {
  rows: CreatorHistoryEntry[]
  empty: string
  title: string
  close: string
  labels: Record<'applied' | 'failed' | 'rejected' | 'analyzed', string>
  resume: string
  onResume: (id: number) => void
  onClose: () => void
}) {
  const statusLabel = (status: string) => {
    if (status === 'applied') return labels.applied
    if (status === 'failed') return labels.failed
    if (status === 'rejected') return labels.rejected
    return labels.analyzed
  }
  const statusTone = (status: string) => {
    if (status === 'applied') return 'success'
    if (status === 'failed') return 'danger'
    if (status === 'rejected') return 'neutral'
    return 'info'
  }
  return (
    <div className="assistant-history-panel">
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: 'var(--neo-border-w) solid var(--th-border, #e3e3e3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
          color: 'var(--th-text)', textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          <History size={14} /> {title}
        </span>
        <button onClick={onClose} className="ui-icon-button" aria-label={close} title={close}>
          <X size={15} />
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '20px 14px', fontSize: 12, color: 'var(--th-muted)', textAlign: 'center' }}>
          {empty}
        </div>
      ) : rows.map(row => (
        <div key={row.id} style={{
          padding: '11px 14px',
          borderBottom: '1px solid var(--th-border-light, #ededed)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--th-text)', lineHeight: 1.4, flex: 1 }}
              title={row.request_text}>
              {row.request_text.length > 95 ? `${row.request_text.slice(0, 95)}…` : row.request_text}
            </span>
            <Badge tone={statusTone(row.status) as 'success' | 'danger' | 'neutral' | 'info'}>
              {statusLabel(row.status)}
            </Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--th-muted)' }}>
            <span>{fmtDate(row.created_at)}</span>
            {row.profile_name && <span>{row.profile_name}</span>}
            {row.env_label && <span>{row.env_label}</span>}
            {row.has_documentation && <span>Documentation</span>}
          </div>
          {row.status !== 'rejected' && (
            <Button
              variant="secondary"
              icon={<RotateCcw size={12} />}
              onClick={() => onResume(row.id)}
              style={{ marginTop: 2, fontSize: 11, padding: '5px 10px', width: 'fit-content' }}
            >
              {resume}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Operation row (proposal) ──────────────────────────────────────

function OperationRow({ op, index, en, onPreview, feasibility, issues }: {
  op: Operation; index: number; en: boolean; onPreview: (index: number) => void
  feasibility?: { verdict: StudioVerdict; reasons: string[] }
  issues?: ValidationIssue[]
}) {
  const meta = OP_META[op.type]
  const previewable = op.type === 'modify_view' || op.type === 'modify_report'
  const label = meta ? (en ? meta.en : meta.fr) : op.type
  const params = op.params ?? {}
  const arch = typeof params.arch === 'string' ? params.arch : null
  const codeBlocks = [
    ['Python', typeof params.code === 'string' ? params.code : null],
    [en ? 'Compute' : 'Calcul', typeof params.compute === 'string' ? params.compute : null],
  ].filter(([, value]) => value) as Array<[string, string]>
  const scalarParams = Object.entries(params)
    .filter(([k, v]) => !['arch', 'code', 'compute'].includes(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
  const recordValues = params.values && typeof params.values === 'object' && !Array.isArray(params.values)
    ? (params.values as Record<string, unknown>) : null
  const recordTargets = Array.isArray(params.targets)
    ? (params.targets as Array<{ id?: number; display_name?: string }>) : []

  return (
    <div style={{
      border: '1px solid var(--th-border, #e3e3e3)', borderRadius: 10,
      padding: '10px 14px', marginTop: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-fg)', minWidth: 22, textAlign: 'center' }}>
          #{index + 1}
        </span>
        <Badge tone="info">{label}</Badge>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{op.summary}</span>
        {previewable && (
          <button
            type="button"
            className="ui-button ui-button-primary ui-button-xs"
            style={{ marginLeft: 'auto' }}
            onClick={() => onPreview(index)}
            title={en ? 'Preview this change' : 'Aperçu de cette modification'}
          >
            <Eye size={13} />
            <span>{en ? 'Preview' : 'Aperçu'}</span>
          </button>
        )}
      </div>
      {scalarParams.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginLeft: 30 }}>
          {scalarParams.map(([k, v]) => (
            <span key={k} className="ui-badge ui-badge-neutral" style={{ fontSize: 11 }}>
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
      {recordTargets.length > 0 && (
        <div style={{ marginTop: 6, marginLeft: 30, fontSize: 12 }}>
          <span style={{ color: 'var(--th-muted)', fontWeight: 600 }}>{en ? 'Records' : 'Fiches'} : </span>
          {recordTargets.map((t, i) => (
            <span key={i}>{i > 0 ? ', ' : ''}{t.display_name ?? `#${t.id}`}</span>
          ))}
        </div>
      )}
      {recordValues && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, marginLeft: 30 }}>
          {Object.entries(recordValues).map(([k, v]) => (
            <span key={k} className="ui-badge ui-badge-neutral" style={{ fontSize: 11 }}>
              {k}: {fmtCellValue(v)}
            </span>
          ))}
        </div>
      )}
      {arch && (
        <details style={{ marginTop: 8, marginLeft: 30 }}>
          <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', cursor: 'pointer' }}>XML</summary>
          <pre className="ui-code-block" style={{ marginTop: 0, fontSize: 11.5 }}>{arch}</pre>
        </details>
      )}
      {codeBlocks.map(([codeLabel, value]) => (
        <details key={codeLabel} style={{ marginTop: 8, marginLeft: 30 }}>
          <summary style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)', cursor: 'pointer' }}>{codeLabel}</summary>
          <pre className="ui-code-block" style={{ marginTop: 0, fontSize: 11.5 }}>{value}</pre>
        </details>
      ))}
      <OperationFlags feasibility={feasibility} issues={issues} en={en} />
    </div>
  )
}

const STUDIO_OP_TONE: Record<StudioVerdict, { bg: string; fg: string; border: string; label: string; labelEn: string; icon: string }> = {
  feasible:     { bg: 'rgba(26,122,60,.10)', fg: '#1a7a3c', border: '#1a7a3c', label: 'Studio',          labelEn: 'Studio',        icon: '✓' },
  with_caveats: { bg: 'rgba(202,138,4,.12)', fg: '#8a5b00', border: '#caa804', label: 'Studio + manuel', labelEn: 'Studio + manual', icon: '◐' },
  not_feasible: { bg: 'rgba(176,38,38,.10)', fg: '#a51717', border: '#b02626', label: 'Hors Studio',     labelEn: 'Outside Studio', icon: '✕' },
}

function OperationFlags({ feasibility, issues, en }: {
  feasibility?: { verdict: StudioVerdict; reasons: string[] }
  issues?: ValidationIssue[]
  en: boolean
}) {
  const errors = (issues ?? []).filter(i => i.severity === 'error')
  const warnings = (issues ?? []).filter(i => i.severity === 'warning')
  const showStudio = feasibility && feasibility.verdict !== 'feasible'
  if (!showStudio && errors.length === 0 && warnings.length === 0) return null
  return (
    <div style={{ marginTop: 10, marginLeft: 30, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {showStudio && (() => {
        const tone = STUDIO_OP_TONE[feasibility!.verdict]
        return (
          <div style={{
            display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 6,
            border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg,
            fontSize: 11.5, lineHeight: 1.45,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, borderRadius: 8, background: tone.fg, color: 'white',
              fontSize: 10, fontWeight: 800, flexShrink: 0, marginTop: 1,
            }}>{tone.icon}</span>
            <div>
              <strong>{en ? tone.labelEn : tone.label}</strong> — {feasibility!.reasons.join(' ')}
            </div>
          </div>
        )
      })()}
      {errors.map((iss, i) => (
        <div key={`e${i}`} style={{
          display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 6,
          border: '1px solid #b02626', background: 'rgba(176,38,38,.10)', color: '#a51717',
          fontSize: 11.5, lineHeight: 1.45,
        }}>
          <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {iss.field && <span style={{ fontFamily: 'monospace', opacity: 0.9 }}>{iss.field}</span>}
            {iss.field && ' — '}
            {iss.message}
          </div>
        </div>
      ))}
      {warnings.map((iss, i) => (
        <div key={`w${i}`} style={{
          display: 'flex', gap: 8, padding: '7px 10px', borderRadius: 6,
          border: '1px solid #caa804', background: 'rgba(202,138,4,.12)', color: '#8a5b00',
          fontSize: 11.5, lineHeight: 1.45,
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            {iss.field && <span style={{ fontFamily: 'monospace', opacity: 0.9 }}>{iss.field}</span>}
            {iss.field && ' — '}
            {iss.message}
          </div>
        </div>
      ))}
    </div>
  )
}

function PreflightBanner({ feasibility, validation, en }: {
  feasibility: AnalysisFeasibility | null
  validation: AnalysisValidation | null
  en: boolean
}) {
  const errorCount = (validation?.operations ?? [])
    .reduce((n, op) => n + op.issues.filter(i => i.severity === 'error').length, 0)
  const warningCount = (validation?.operations ?? [])
    .reduce((n, op) => n + op.issues.filter(i => i.severity === 'warning').length, 0)
  if (!feasibility && errorCount === 0 && warningCount === 0) return null
  const studioBadge = feasibility ? STUDIO_OP_TONE[feasibility.verdict] : null
  // Pick the banner colour by the worst signal — error > warning > Studio caveat > ok.
  // `color-mix` keeps the tone subtle (10-14% of the strong colour) so the
  // banner is unmistakable at a glance without screaming.
  const bannerTone: 'error' | 'warning' | 'ok' =
    errorCount > 0 || feasibility?.verdict === 'not_feasible'
      ? 'error'
      : warningCount > 0 || feasibility?.verdict === 'with_caveats'
        ? 'warning'
        : 'ok'
  const bannerStyle = {
    error: {
      background: 'color-mix(in srgb, #b02626 14%, var(--th-bg-card, transparent))',
      border: '1px solid color-mix(in srgb, #b02626 55%, transparent)',
    },
    warning: {
      background: 'color-mix(in srgb, #caa804 18%, var(--th-bg-card, transparent))',
      border: '1px solid color-mix(in srgb, #caa804 55%, transparent)',
    },
    ok: {
      background: 'color-mix(in srgb, #1a7a3c 14%, var(--th-bg-card, transparent))',
      border: '1px solid color-mix(in srgb, #1a7a3c 55%, transparent)',
    },
  }[bannerTone]
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      padding: '9px 12px', borderRadius: 8, marginTop: 8,
      ...bannerStyle,
      fontSize: 11.5,
    }}>
      <strong>{en ? 'Pre-flight' : 'Pré-vol'} :</strong>
      {studioBadge && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 999,
          border: `1px solid ${studioBadge.border}`,
          background: studioBadge.bg, color: studioBadge.fg, fontWeight: 700,
        }}>
          <span aria-hidden="true">{studioBadge.icon}</span>
          {en ? studioBadge.labelEn : studioBadge.label}
        </span>
      )}
      {errorCount > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 999,
          border: '1px solid #b02626', background: 'rgba(176,38,38,.10)', color: '#a51717', fontWeight: 700,
        }}>
          <XCircle size={11} />
          {errorCount} {en ? 'error(s)' : 'erreur(s)'}
        </span>
      )}
      {warningCount > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 999,
          border: '1px solid #caa804', background: 'rgba(202,138,4,.12)', color: '#8a5b00', fontWeight: 700,
        }}>
          <AlertTriangle size={11} />
          {warningCount} {en ? 'warning(s)' : 'avertissement(s)'}
        </span>
      )}
      {feasibility && (
        <span style={{ color: 'var(--th-muted)' }}>{feasibility.summary}</span>
      )}
    </div>
  )
}

// ── Pre-flight row ────────────────────────────────────────────────

function PreflightRow({ op, en, willCreate }: { op: OpResult; en: boolean; willCreate: string }) {
  const meta = OP_META[op.type]
  const label = meta ? (en ? meta.en : meta.fr) : op.type
  const failed = op.status === 'failed'
  const tone = failed ? 'var(--th-danger, #c0392b)' : 'var(--th-success, #1e7e34)'
  const Icon = failed ? XCircle : CheckCircle2
  return (
    <div style={{
      display: 'flex', gap: 9, alignItems: 'flex-start', padding: '8px 0',
      borderBottom: '1px solid var(--th-border, #ededed)',
    }}>
      <Icon size={16} style={{ color: tone, flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone="neutral">{label}</Badge>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{op.summary}</span>
        </div>
        {op.plan && !failed && (
          <div style={{ fontSize: 12.5, color: 'var(--th-muted)', marginTop: 2 }}>
            <span style={{ color: tone, fontWeight: 600 }}>{willCreate} : </span>{op.plan}
          </div>
        )}
        {!failed && <RecordChangeView detail={op.detail} />}
        {op.error && (
          <div style={{ fontSize: 12.5, color: tone, marginTop: 2 }}>{op.error}</div>
        )}
      </div>
    </div>
  )
}

// ── Apply result row ──────────────────────────────────────────────

function ResultRow({ r, en }: { r: OpResult; en: boolean }) {
  const meta = OP_META[r.type]
  const label = meta ? (en ? meta.en : meta.fr) : r.type
  const tone = r.status === 'success' ? 'var(--th-success, #1e7e34)'
    : r.status === 'failed' ? 'var(--th-danger, #c0392b)'
    : 'var(--th-muted, #888)'
  const Icon = r.status === 'success' ? CheckCircle2
    : r.status === 'failed' ? XCircle
    : RotateCcw
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8, fontSize: 13 }}>
      <Icon size={16} style={{ color: tone, flexShrink: 0, marginTop: 1 }} />
      <div>
        <div><Badge tone="neutral">{label}</Badge> <span style={{ fontWeight: 600 }}>{r.summary}</span></div>
        {r.plan && r.status === 'success' && (
          <div style={{ color: 'var(--th-muted)', marginTop: 2 }}>{r.plan}</div>
        )}
        {r.status === 'success' && <RecordChangeView detail={r.detail} />}
        {r.error && <div style={{ color: tone, marginTop: 2 }}>{r.error}</div>}
      </div>
    </div>
  )
}

// ── Changeset summary (record counts) ─────────────────────────────

function ChangesetSummary({ ops, en }: { ops: Operation[]; en: boolean }) {
  if (!ops.length) return null
  const { created, updated, deleted, studio } = changesetCounts(ops)
  const chips: Array<{ label: string; tone: string }> = []
  if (created) chips.push({ label: en ? `${created} record(s) created` : `${created} fiche(s) créée(s)`, tone: 'var(--th-success, #1e7e34)' })
  if (updated) chips.push({ label: en ? `${updated} record(s) updated` : `${updated} fiche(s) mise(s) à jour`, tone: 'var(--brand)' })
  if (deleted) chips.push({ label: en ? `${deleted} record(s) deleted` : `${deleted} fiche(s) supprimée(s)`, tone: 'var(--th-danger, #c0392b)' })
  if (studio) chips.push({ label: en ? `${studio} Studio change(s)` : `${studio} modification(s) Studio`, tone: 'var(--th-muted)' })
  if (!chips.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
      {chips.map(ch => (
        <span key={ch.label} style={{
          fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
          border: `1px solid ${ch.tone}`, color: ch.tone,
        }}>
          {ch.label}
        </span>
      ))}
    </div>
  )
}

// ── Record change view (create_record / update_record diff) ───────

function RecordChangeView({ detail }: { detail?: Record<string, unknown> }) {
  const records = detail?.records as RecordChange[] | undefined
  if (!records || records.length === 0) return null
  return (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {records.map(rec => (
        <div key={rec.id} style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 650 }}>
            {rec.display_name}{' '}
            <span style={{ color: 'var(--th-muted)', fontWeight: 400 }}>#{rec.id}</span>
          </div>
          {(rec.changes ?? []).map(ch => (
            <div key={ch.field} style={{
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
              marginLeft: 8, marginTop: 2,
            }}>
              <span className="ui-badge ui-badge-neutral" style={{ fontSize: 10.5 }}>{ch.field}</span>
              <span style={{ color: 'var(--th-muted)', textDecoration: 'line-through' }}>
                {fmtCellValue(ch.before)}
              </span>
              <ArrowRight size={11} style={{ color: 'var(--th-muted)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{fmtCellValue(ch.after)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
