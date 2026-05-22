import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Wand2, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Loader2,
  FileText, Download, RotateCcw, Pencil, Play, Hammer, Database, GitBranch,
  FileCode2, ScanSearch, KeyRound,
} from 'lucide-react'
import {
  getCreatorProjects, getAiProviders,
  dryRunCreatorChangeset, applyCreatorChangeset, rejectCreatorRequest, documentCreatorChange,
} from '../api/client'
import { useUiLanguage } from '../i18n'
import { PROVIDERS } from '../constants/providers'
import { makeChallenge } from '../constants/creatorWords'
import PageHeader from '../components/PageHeader'
import { Button, Card, Field, Badge, Modal, EmptyState } from '../components/ui'
import ToolCallGroup, { type ToolEvent } from '../components/ToolCallGroup'
import Markdown from '../components/Markdown'

// ── Types ─────────────────────────────────────────────────────────

interface EnvEntry { id: string; name: string; odoo_version?: string; github_repo?: string }
interface CompanyEntry { id: number; name: string }
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
  eligible: boolean
}
interface Operation { type: string; summary: string; params: Record<string, unknown> }
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

type Phase = 'gate' | 'setup' | 'analyzing' | 'review' | 'applying' | 'done'

const OP_META: Record<string, { fr: string; en: string }> = {
  create_field:         { fr: 'Nouveau champ',           en: 'New field' },
  modify_view:          { fr: 'Modification de vue',     en: 'View change' },
  create_server_action: { fr: 'Action serveur',          en: 'Server action' },
  create_automation:    { fr: 'Action automatisée',      en: 'Automated action' },
  create_cron:          { fr: 'Action planifiée',        en: 'Scheduled action' },
  modify_report:        { fr: 'Modification de rapport', en: 'Report change' },
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

// ── Page ──────────────────────────────────────────────────────────

export default function Creator() {
  const lang = useUiLanguage()
  const en = lang === 'en'
  const c = useMemo(() => ({
    title: en ? 'Creator' : 'Création',
    description: en
      ? 'Apply Studio-style modifications to a live Odoo instance — analysed, previewed and confirmed before any write.'
      : 'Appliquez des modifications de type Studio sur une instance Odoo en direct — analysées, prévisualisées et confirmées avant toute écriture.',
    steps: en ? ['Request', 'Analysis', 'Validation', 'Result'] : ['Demande', 'Analyse', 'Validation', 'Résultat'],
    gateTitle: en ? 'Sensitive tool' : 'Outil sensible',
    gateHint: en
      ? 'The Creator writes directly to production or test databases. Type the confirmation code below to enter.'
      : 'Le Creator écrit directement sur des bases de production ou de test. Tapez le code de confirmation ci-dessous pour entrer.',
    gateChallenge: en ? 'Type this code to continue:' : 'Tapez ce code pour continuer :',
    enter: en ? 'Enter the tool' : 'Accéder à l\'outil',
    challengePlaceholder: en ? 'Type the code…' : 'Tapez le code…',
    project: en ? 'Project' : 'Projet',
    selectProject: en ? 'Select a Studio project' : 'Sélectionner un projet Studio',
    environment: en ? 'Environment' : 'Environnement',
    company: en ? 'Company' : 'Société',
    allCompanies: en ? 'All companies' : 'Toutes les sociétés',
    aiModel: en ? 'AI provider' : 'Fournisseur IA',
    request: en ? 'Functional request' : 'Demande fonctionnelle',
    requestHint: en
      ? 'Describe the modification — e.g. "add an After-sales tab on the sale order form with a follow-up date field".'
      : 'Décrivez la modification — ex. « ajouter un onglet SAV sur le bon de commande avec un champ date de suivi ».',
    analyze: en ? 'Analyse the request' : 'Analyser la demande',
    analyzing: en ? 'Analysing the instance…' : 'Analyse de l\'instance…',
    noProjects: en ? 'No eligible project' : 'Aucun projet éligible',
    noProjectsHint: en
      ? 'The Creator is restricted to projects where Studio is in use (Studio or Studio + Dev). Run a technical-complexity analysis on a project first.'
      : 'Le Creator est réservé aux projets utilisant Studio (Studio ou Studio + Dev). Lancez d\'abord une analyse de complexité technique sur un projet.',
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
      ? 'Dry-run passed. Here is exactly what will be created:'
      : 'Le dry-run est passé. Voici exactement ce qui va être créé :',
    preflightFail: en
      ? 'The dry-run found problems — nothing will be written. Refine the request and try again.'
      : 'Le dry-run a détecté des problèmes — rien ne sera écrit. Modifiez la demande et réessayez.',
    onInstance: en ? 'Target instance' : 'Instance cible',
    confirmChallenge: en
      ? 'To write these changes to the instance, type the confirmation code:'
      : 'Pour écrire ces modifications sur l\'instance, tapez le code de confirmation :',
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
    instructionsApplied: en ? 'Instructions taken into account' : 'Instructions prises en compte',
    willCreate: en ? 'Will create' : 'Va créer',
  }), [en])

  const [phase, setPhase] = useState<Phase>('gate')
  const [gatePhrase] = useState(() => makeChallenge())
  const [gateTyped, setGateTyped] = useState('')

  const [provider, setProvider] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [envId, setEnvId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [request, setRequest] = useState('')

  const [instructions, setInstructions] = useState<string[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null)
  const [analysis, setAnalysis] = useState<Operation[] | null>(null)
  const [funcAnalysis, setFuncAnalysis] = useState('')
  const [techAnalysis, setTechAnalysis] = useState('')
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

  const abortRef = useRef<AbortController | null>(null)

  // ── data ────────────────────────────────────────────────────────

  const { data: providersData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const availableProviders = useMemo(() => {
    const map = (providersData?.data ?? {}) as Record<string, boolean>
    return Object.keys(map).filter(p => map[p])
  }, [providersData])

  useEffect(() => {
    if (!provider && availableProviders.length) {
      setProvider(availableProviders.includes('claude') ? 'claude' : availableProviders[0])
    }
  }, [availableProviders, provider])

  const { data: projectsData } = useQuery({
    queryKey: ['creator-projects'],
    queryFn: getCreatorProjects,
    enabled: phase !== 'gate',
  })
  const projects: CreatorProject[] = useMemo(
    () => ((projectsData?.data ?? []) as CreatorProject[]).filter(p => p.eligible),
    [projectsData],
  )

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

  useEffect(() => {
    if (!selectedProject) return
    setEnvId(selectedProject.active_env_id ?? envs[0]?.id ?? null)
    setCompanyId(selectedProject.selected_company_id ?? null)
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── analysis ────────────────────────────────────────────────────

  const runAnalysis = async (allInstructions: string[]) => {
    if (projectId === '' || !provider || !request.trim()) return
    setPhase('analyzing')
    setToolEvents([])
    setContextInfo(null)
    setAnalysis(null)
    setFuncAnalysis('')
    setTechAnalysis('')
    setStreamErr('')

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/creator/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          provider,
          profile_id: projectId,
          env_id: envId ?? undefined,
          company_id: companyId ?? undefined,
          request,
          instructions: allInstructions,
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
            setFuncAnalysis((evt.functional_analysis as string) ?? '')
            setTechAnalysis((evt.technical_analysis as string) ?? '')
            setAnalysis((evt.operations as Operation[]) ?? [])
          } else if (type === 'error') {
            setStreamErr((evt.msg as string) ?? 'Erreur inconnue')
          }
        }
      }
      if (!gotAnalysis && !streamErr) {
        setStreamErr(en ? 'No analysis returned.' : 'Aucune analyse retournée.')
      }
      setPhase('review')
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setStreamErr(e instanceof Error ? e.message : String(e))
      setPhase('review')
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
    try {
      const res = await applyCreatorChangeset({
        provider,
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
        setPreflight(res.data.preflight as ChangesetResult)
        setPhase('review')
        return
      }
      setApplyResult(res.data.result as ChangesetResult)
      setRequestId(res.data.request_id as number)
      setShowConfirm(false)
      setApplyTyped('')
      setPhase('done')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setApplyErr(detail ?? (e instanceof Error ? e.message : String(e)))
      setPhase('review')
    }
  }

  const doReject = async () => {
    if (projectId === '') return
    try {
      await rejectCreatorRequest({
        profile_id: projectId,
        env_id: envId ?? undefined,
        company_id: companyId ?? undefined,
        request,
        instructions,
        functional_analysis: funcAnalysis,
        technical_analysis: techAnalysis,
        operations: analysis ?? [],
      })
    } catch { /* logging only */ }
    resetRequest()
  }

  const resetRequest = () => {
    abortRef.current?.abort()
    setRequest('')
    setInstructions([])
    setToolEvents([])
    setContextInfo(null)
    setAnalysis(null)
    setFuncAnalysis('')
    setTechAnalysis('')
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
    setPhase('setup')
  }

  // ── documentation ───────────────────────────────────────────────

  const generateDoc = async () => {
    if (projectId === '' || !applyResult) return
    setDocLoading(true)
    try {
      const res = await documentCreatorChange({
        request_id: requestId ?? undefined,
        provider,
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
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--brand)' }}>
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

  return (
    <div className="page-stack">
      <PageHeader
        title={c.title}
        description={c.description}
        action={<Badge tone="brand" size="md"><Hammer size={13} /> Studio</Badge>}
      />

      <StepBar steps={c.steps} current={currentStep} />

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
            <Field label={c.aiModel}>
              <select
                className="ui-input"
                value={provider}
                disabled={busy}
                onChange={e => setProvider(e.target.value)}
              >
                {availableProviders.map(p => (
                  <option key={p} value={p}>{PROVIDERS.find(x => x.id === p)?.label ?? p}</option>
                ))}
              </select>
            </Field>
          </div>

          {selectedProject && (
            <ContextStrip
              version={activeVersion}
              hasRepo={contextInfo ? contextInfo.has_repo : Boolean(activeEnv?.github_repo)}
              hasSources={contextInfo?.has_sources ?? null}
              c={c}
            />
          )}

          {projects.length === 0 && projectsData && (
            <div style={{ marginTop: 8 }}>
              <EmptyState icon={<Database size={24} />} title={c.noProjects} description={c.noProjectsHint} />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Field label={c.request} hint={c.requestHint}>
              <textarea
                className="ui-input"
                rows={4}
                value={request}
                disabled={locked}
                placeholder={c.requestHint}
                onChange={e => setRequest(e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </Field>
          </div>

          {instructions.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="ui-section-title">{c.instructionsApplied}</div>
              {instructions.map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, marginTop: 4 }}>
                  <Pencil size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--brand)' }} />
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
                disabled={projectId === '' || !provider || !request.trim()}
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
      {(phase === 'review' || phase === 'applying') && analysis && (
        <>
          {funcAnalysis && (
            <Card className="page-card">
              <div className="page-card-body">
                <div className="ui-section-title"><FileText size={15} /> {c.functional}</div>
                <Markdown text={funcAnalysis} />
              </div>
            </Card>
          )}
          {techAnalysis && (
            <Card className="page-card">
              <div className="page-card-body">
                <div className="ui-section-title"><Hammer size={15} /> {c.technical}</div>
                <Markdown text={techAnalysis} />
              </div>
            </Card>
          )}

          <Card className="page-card">
            <div className="page-card-body">
              <div className="ui-section-title">
                {c.operations}
                {opCount > 0 && <Badge tone="brand">{opCount}</Badge>}
              </div>
              {opCount === 0 && <p className="ui-empty-description">{c.noOps}</p>}
              {analysis.map((op, i) => <OperationRow key={i} op={op} index={i} en={en} />)}

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
                    icon={<FileText size={15} />}
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
              <Loader2 size={18} className="creator-spin" style={{ color: 'var(--brand)' }} />
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
    </div>
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

// ── Context strip ─────────────────────────────────────────────────

function ContextStrip({ version, hasRepo, hasSources, c }: {
  version: string | null
  hasRepo: boolean
  hasSources: boolean | null
  c: { ctxVersion: string; ctxSources: string; ctxRepo: string; ctxOn: string; ctxOff: string }
}) {
  const pill = (icon: ReactNode, label: string, on: boolean | null) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
      padding: '3px 9px', borderRadius: 999,
      background: 'var(--th-bg-muted, #f4f4f4)',
      color: on === false ? 'var(--th-muted, #999)' : 'var(--th-text, #222)',
      border: '1px solid var(--th-border, #e3e3e3)',
    }}>
      {icon}{label}
      {on !== null && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: on ? 'var(--th-success, #1e7e34)' : 'var(--th-muted, #bbb)',
        }} />
      )}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {pill(<Database size={12} />, `${c.ctxVersion} ${version ?? '?'}`, null)}
      {pill(<FileCode2 size={12} />, `${c.ctxSources} ${hasSources === null ? '' : hasSources ? c.ctxOn : c.ctxOff}`.trim(), hasSources)}
      {pill(<GitBranch size={12} />, `${c.ctxRepo} ${hasRepo ? c.ctxOn : c.ctxOff}`, hasRepo)}
    </div>
  )
}

// ── Operation row (proposal) ──────────────────────────────────────

function OperationRow({ op, index, en }: { op: Operation; index: number; en: boolean }) {
  const meta = OP_META[op.type]
  const label = meta ? (en ? meta.en : meta.fr) : op.type
  const params = op.params ?? {}
  const arch = typeof params.arch === 'string' ? params.arch : null
  const code = typeof params.code === 'string' ? params.code : null
  const scalarParams = Object.entries(params)
    .filter(([k, v]) => k !== 'arch' && k !== 'code' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))

  return (
    <div style={{
      border: '1px solid var(--th-border, #e3e3e3)', borderRadius: 10,
      padding: '10px 14px', marginTop: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', minWidth: 22, textAlign: 'center' }}>
          #{index + 1}
        </span>
        <Badge tone="info">{label}</Badge>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{op.summary}</span>
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
      {(arch || code) && (
        <details style={{ marginTop: 8, marginLeft: 30 }}>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--th-muted)' }}>
            {arch ? 'XML' : 'Code'}
          </summary>
          <pre className="ui-code-block" style={{ marginTop: 6, fontSize: 11.5 }}>{arch ?? code}</pre>
        </details>
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
        {r.error && <div style={{ color: tone, marginTop: 2 }}>{r.error}</div>}
      </div>
    </div>
  )
}
