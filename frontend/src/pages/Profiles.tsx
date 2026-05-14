import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Building2, Check, ClipboardList, Cloud, ExternalLink, GitBranch, Globe2, Loader2, Pencil, Play, Plus, Search, Trash2, TriangleAlert, UserRound, X } from 'lucide-react'
import { listProfiles, createProfile, updateProfile, deleteProfile, testProfile, diagnoseOdoo, getProfileApps, checkAccessProfile, getProfileContext, saveProfileContext, autoFillContext, addProfileEnv, updateProfileEnv, deleteProfileEnv, activateProfileEnv, testProfileEnv, getEnvRepoStatus, syncEnvRepoUrl } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { ODOO_APPS } from '../constants/odooApps'
import { useUiLanguage } from '../i18n'

function AppBadges({ apps, max = 5 }: { apps: { name: string; shortdesc: string }[]; max?: number }) {
  const known = apps.filter(a => ODOO_APPS[a.name])
  const shown = known.slice(0, max)
  const rest  = known.length - max
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, marginBottom: 4 }}>
      {shown.map(a => {
        const def = ODOO_APPS[a.name]
        return (
          <span key={a.name} title={a.shortdesc} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 4,
            background: `${def.color}15`, border: `1px solid ${def.color}40`,
            fontSize: 11, fontWeight: 600, color: def.color,
          }}>
            <img src={def.iconUrl} alt={def.label} width={14} height={14} style={{ objectFit: 'contain' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            {def.label}
          </span>
        )
      })}
      {rest > 0 && (
        <span style={{
          padding: '3px 8px', borderRadius: 4,
          background: '#F3F4F6', border: '1px solid #E5E7EB',
          fontSize: 11, color: '#6B7280',
        }}>+{rest}</span>
      )}
    </div>
  )
}

interface EnvEntry {
  id: string
  name: string
  db_url: string
  db_name: string
  login: string
  odoo_version?: string
  branch?: string
  github_repo?: string
  repo_branch?: string
}
interface AccessInfo {
  is_system: boolean; is_admin: boolean
  user_name: string; accessible_company_ids: number[]
  checked_at: string
}
interface Profile {
  id: number; name: string; db_url: string; db_name: string
  login: string; odoo_version?: string; odoo_sh_url?: string; github_repo?: string
  default_branch?: string; environments?: string; active_env_id?: string
  company_name?: string; company_city?: string; company_logo?: string
  company_ids?: string; selected_company_id?: number; api_key_expires?: string
  user_access_info?: string; project_context?: string
}
interface DiagStep { name: string; ok: boolean; detail: string }
interface DiagResult {
  steps: DiagStep[]; uid: number | null; odoo_version: string | null
  module_count: number; db_name_suggestion: string
  company_name?: string; company_city?: string; company_logo?: string
  company_ids?: string; access_info?: AccessInfo
}
interface CompanyOption { id: number; name: string }

const VERSIONS = ['15.0', '16.0', '17.0', '18.0', '19.0']

type FormState = {
  name: string; odoo_sh_url: string; db_url: string; db_name: string
  login: string; api_key: string; odoo_version: string
  github_repo: string; default_branch: string
}
const EMPTY: FormState = {
  name: '', odoo_sh_url: '', db_url: '', db_name: '',
  login: '', api_key: '', odoo_version: '17.0',
  github_repo: '', default_branch: 'main',
}
const STEPS = [
  { n: 1, label: 'Projet' },
  { n: 2, label: 'Connexion' },
  { n: 3, label: 'GitHub' },
]

const profilesCopy = {
  fr: {
    steps: ['Projet', 'Connexion', 'GitHub'],
    title: 'Mes projets Odoo.sh',
    description: 'Gérez vos connexions aux instances Odoo de vos clients.',
    newProject: 'Nouveau projet',
    editProject: (name: string) => `Modifier — ${name || 'projet'}`,
    added: 'Projet ajouté avec succès !',
    updated: 'Projet mis à jour !',
    deleted: 'Projet supprimé',
    connectionOk: 'Connexion réussie ✓',
    contextSaved: 'Contexte enregistré ✓',
    contextGenerated: "Contexte généré par l'IA ✓",
    contextError: "Erreur lors de l'enregistrement",
    contextGenerateError: 'Impossible de générer le contexte',
    accessCheckError: 'Impossible de vérifier les accès',
    dbConnection: 'Connexion à la base de données',
    project: 'Projet',
    cancel: 'Annuler',
    back: '← Retour',
    saving: 'Enregistrement…',
    save: 'Enregistrer',
    contextProject: 'Contexte projet',
    autoFill: "Auto-compléter avec l'IA",
    generating: 'Génération en cours…',
    activeCompany: 'Société active',
    environments: 'Environnements',
    applications: 'Applications',
    linksActions: 'Liens & actions',
    actions: 'Actions',
    edit: 'Modifier',
    test: 'Tester',
    access: 'Accès',
    context: 'Contexte',
    deleteTitle: 'Supprimer ce projet',
    noProject: 'Aucun projet configuré',
    noProjectDesc: 'Ajoutez votre premier projet Odoo.sh pour commencer.',
  },
  en: {
    steps: ['Project', 'Connection', 'GitHub'],
    title: 'My Odoo.sh projects',
    description: 'Manage connections to your clients’ Odoo instances.',
    newProject: 'New project',
    editProject: (name: string) => `Edit — ${name || 'project'}`,
    added: 'Project added successfully!',
    updated: 'Project updated!',
    deleted: 'Project deleted',
    connectionOk: 'Connection successful ✓',
    contextSaved: 'Context saved ✓',
    contextGenerated: 'Context generated by AI ✓',
    contextError: 'Error while saving',
    contextGenerateError: 'Unable to generate context',
    accessCheckError: 'Unable to check access rights',
    dbConnection: 'Database connection',
    project: 'Project',
    cancel: 'Cancel',
    back: '← Back',
    saving: 'Saving…',
    save: 'Save',
    contextProject: 'Project context',
    autoFill: 'Auto-fill with AI',
    generating: 'Generating…',
    activeCompany: 'Active company',
    environments: 'Environments',
    applications: 'Applications',
    linksActions: 'Links & actions',
    actions: 'Actions',
    edit: 'Edit',
    test: 'Test',
    access: 'Access',
    context: 'Context',
    deleteTitle: 'Delete this project',
    noProject: 'No project configured',
    noProjectDesc: 'Add your first Odoo.sh project to get started.',
  },
}

export default function Profiles() {
  const lang = useUiLanguage()
  const c = profilesCopy[lang]
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const profiles: Profile[] = data?.data ?? []

  const [showWizard, setShowWizard] = useState(false)
  const [editingId,  setEditingId]  = useState<number | null>(null)
  const [step,       setStep]       = useState(1)
  const [form,       setForm]       = useState<FormState>(EMPTY)
  const [diag,       setDiag]       = useState<DiagResult | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [envs,       setEnvs]       = useState<EnvEntry[]>([])
  const [_newEnv,    _setNewEnv]    = useState<EnvEntry | null>(null)  // unused after migration to card flow

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 5000)
  }

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const [companyInfo, setCompanyInfo] = useState<{ name?: string; city?: string; logo?: string } | null>(null)
  const [availableCompanies, setAvailableCompanies] = useState<CompanyOption[]>([])
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null)
  const [showAccessWarning, setShowAccessWarning] = useState(false)

  const diagnose = useMutation({
    mutationFn: () => diagnoseOdoo({
      db_url: form.db_url, db_name: form.db_name,
      login: form.login, api_key: form.api_key,
    }),
    onSuccess: (res) => {
      const d: DiagResult = res.data
      setDiag(d)
      if (d.odoo_version) setForm(p => ({ ...p, odoo_version: d.odoo_version! }))
      if (d.db_name_suggestion && !form.db_name)
        setForm(p => ({ ...p, db_name: d.db_name_suggestion }))
      if (d.company_name || d.company_logo)
        setCompanyInfo({ name: d.company_name ?? undefined, city: d.company_city ?? undefined, logo: d.company_logo ?? undefined })
      if (d.company_ids) {
        try { setAvailableCompanies(JSON.parse(d.company_ids)) } catch { /* ignore */ }
      }
      if (d.access_info) {
        setAccessInfo(d.access_info)
        if (d.access_info.is_admin) setShowAccessWarning(true)
      }
    },
  })

  const create = useMutation({
    mutationFn: () => createProfile({
      ...form,
      environments: JSON.stringify(envs),
      company_name: companyInfo?.name,
      company_city: companyInfo?.city,
      company_logo: companyInfo?.logo,
      company_ids: availableCompanies.length > 0 ? JSON.stringify(availableCompanies) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setShowWizard(false); setStep(1); setForm(EMPTY); setDiag(null); setEnvs([]); setCompanyInfo(null); setAvailableCompanies([]); setAccessInfo(null); setShowAccessWarning(false)
      notify(c.added)
    },
    onError: (e: ApiErr) =>
      notify(e.response?.data?.detail ?? e.message, false),
  })

  const update = useMutation({
    mutationFn: () => updateProfile(editingId!, {
      ...form,
      environments: JSON.stringify(envs),
      company_name: companyInfo?.name,
      company_city: companyInfo?.city,
      company_logo: companyInfo?.logo,
      company_ids: availableCompanies.length > 0 ? JSON.stringify(availableCompanies) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setEditingId(null); setShowWizard(false); setStep(1); setForm(EMPTY); setDiag(null); setEnvs([]); setCompanyInfo(null); setAvailableCompanies([]); setAccessInfo(null); setShowAccessWarning(false)
      notify(c.updated)
    },
    onError: (e: ApiErr) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const openEdit = (p: Profile) => {
    setEditingId(p.id)
    setForm({
      name: p.name,
      odoo_sh_url: p.odoo_sh_url ?? '',
      db_url: p.db_url,
      db_name: p.db_name,
      login: p.login,
      api_key: '',          // never pre-filled for security
      odoo_version: p.odoo_version ?? '17.0',
      github_repo: p.github_repo ?? '',
      default_branch: p.default_branch ?? 'main',
    })
    try { setEnvs(JSON.parse(p.environments ?? '[]') as EnvEntry[]) } catch { setEnvs([]) }
    setCompanyInfo(p.company_name ? { name: p.company_name, city: p.company_city ?? undefined, logo: p.company_logo ?? undefined } : null)
    setDiag(null)
    setStep(1)
    setShowWizard(true)
  }

  const del = useMutation({
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); notify(c.deleted) },
  })

  const testConn = useMutation({
    mutationFn: (id: number) => testProfile(id),
    onSuccess: () => notify(c.connectionOk),
    onError:   (e: ApiErr) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const [checkingAccessId, setCheckingAccessId] = useState<number | null>(null)

  // ── Context modal ──────────────────────────────────────────────
  const [contextProfileId, setContextProfileId] = useState<number | null>(null)
  const [contextText, setContextText] = useState('')
  const [contextSaving, setContextSaving] = useState(false)
  const [contextAutoFilling, setContextAutoFilling] = useState(false)

  const openContext = async (profileId: number) => {
    setContextProfileId(profileId)
    try {
      const res = await getProfileContext(profileId)
      setContextText(res.data.content ?? '')
    } catch {
      setContextText('')
    }
  }

  const saveContext = async () => {
    if (contextProfileId === null) return
    setContextSaving(true)
    try {
      await saveProfileContext(contextProfileId, contextText)
      qc.invalidateQueries({ queryKey: ['profiles'] })
      notify(c.contextSaved)
      setContextProfileId(null)
    } catch {
      notify(c.contextError, false)
    } finally {
      setContextSaving(false)
    }
  }

  const doAutoFill = async () => {
    if (contextProfileId === null) return
    setContextAutoFilling(true)
    try {
      const res = await autoFillContext(contextProfileId)
      setContextText(res.data.content ?? '')
      notify(c.contextGenerated)
    } catch {
      notify(c.contextGenerateError, false)
    } finally {
      setContextAutoFilling(false)
    }
  }

  const checkAccess = async (profileId: number) => {
    setCheckingAccessId(profileId)
    try {
      const res = await checkAccessProfile(profileId)
      const info: AccessInfo = res.data
      qc.invalidateQueries({ queryKey: ['profiles'] })
      if (info.is_system) {
        notify(`⚠ Utilisateur administrateur système détecté (${info.user_name}). Préférez un utilisateur dédié.`, false)
      } else if (info.is_admin) {
        notify(`⚠ Utilisateur avec droits d'administration (${info.user_name}). Pensez à limiter les droits.`, false)
      } else {
        notify(`Accès vérifié pour ${info.user_name} — ${info.accessible_company_ids.length} société(s) accessible(s) ✓`)
      }
    } catch {
      notify(c.accessCheckError, false)
    } finally {
      setCheckingAccessId(null)
    }
  }

  // In edit mode, api_key is optional (user may not want to change it)
  const canNext = step === 1
    ? form.name.trim() !== '' && form.db_url.trim() !== ''
    : step === 2
    ? form.db_name.trim() !== '' && form.login.trim() !== '' && (editingId !== null || form.api_key.trim() !== '')
    : true

  const diagOk = diag !== null && diag.uid !== null

  return (
    <div className="page-stack">
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(EMPTY); setShowWizard(true); setStep(1) }}>
            <Plus size={15} /> {c.newProject}
          </button>
        }
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000,
          background: toast.ok ? t.success : t.danger,
          color: '#fff', padding: '12px 20px', borderRadius: t.radius,
          boxShadow: '0 4px 16px rgba(0,0,0,.2)', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.ok ? <Check size={15} /> : <TriangleAlert size={15} />} {toast.msg}
        </div>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <div style={styles.overlay}>
          <div style={styles.modal}>

            {/* Title */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0 }}>
                {editingId !== null ? c.editProject(form.name) : c.newProject}
              </h2>
              <button onClick={() => { setShowWizard(false); setEditingId(null); setDiag(null) }}
                className="ui-icon-button" aria-label={c.cancel} title={c.cancel}>
                <X size={18} />
              </button>
            </div>

            {/* Step bar */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'unset' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 60 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: s.n < step ? t.success : s.n === step ? t.brand : t.borderLight,
                      color: s.n <= step ? '#fff' : t.muted,
                      transition: 'all .25s',
                    }}>
                      {s.n < step ? <Check size={15} /> : s.n}
                    </div>
                    <span style={{ fontSize: 11, color: s.n === step ? t.brand : t.muted, fontWeight: s.n === step ? 600 : 400 }}>
                      {c.steps[i] ?? s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: step > s.n ? t.success : t.borderLight, margin: '0 4px', marginBottom: 20 }} />
                  )}
                </div>
              ))}
            </div>

            {/* ── Step 1 ── */}
            {step === 1 && (
              <div>
                <h2 style={styles.stepTitle}>Identifiez le projet</h2>
                <Field label="Nom du projet" hint="Ex : Client ABC — Production">
                  <input style={styles.input} value={form.name} onChange={set('name')}
                    placeholder="Mon client Odoo" autoFocus />
                </Field>
                <Field label="URL de l'instance Odoo" hint="Ex : https://monprojet.odoo.com">
                  <input style={styles.input} value={form.db_url} onChange={set('db_url')}
                    placeholder="https://monprojet.odoo.com"
                    onBlur={() => {
                      if (form.db_url && !form.db_name) {
                        const m = form.db_url.match(/https?:\/\/([^./]+)/)
                        if (m) setForm(p => ({ ...p, db_name: m[1] }))
                      }
                    }}
                  />
                </Field>
                <Field label="URL Odoo.sh (optionnel)" hint="Lien vers votre tableau de bord Odoo.sh" optional>
                  <input style={styles.input} value={form.odoo_sh_url} onChange={set('odoo_sh_url')}
                    placeholder="https://www.odoo.sh/project/…" />
                </Field>
              </div>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <div>
                <h2 style={styles.stepTitle}>{c.dbConnection}</h2>

                <Field label="Nom de la base de données"
                  hint="Souvent le sous-domaine de l'URL (ex : monprojet pour https://monprojet.odoo.com)">
                  <input style={styles.input} value={form.db_name} onChange={set('db_name')}
                    placeholder="monprojet" autoFocus />
                </Field>
                <Field label="Login" hint="Votre email ou identifiant administrateur Odoo">
                  <input style={styles.input} value={form.login} onChange={set('login')}
                    placeholder="admin@monentreprise.com" />
                </Field>
                <Field label="Clé API" hint={editingId !== null ? 'Laissez vide pour conserver la clé existante' : ''}>
                  <input style={styles.input} type="password" value={form.api_key}
                    onChange={set('api_key')} placeholder={editingId !== null ? '(inchangée)' : '••••••••••••••••••••'} />
                  <a href="https://www.odoo.com/documentation/17.0/developer/reference/external_api.html#api-keys"
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: t.action, marginTop: 5, display: 'inline-block' }}>
                    Comment créer une clé API ? →
                  </a>
                </Field>

                {/* Diagnose box */}
                <div style={{
                  background: t.bg, borderRadius: t.radiusLg,
                  padding: '16px 18px', marginTop: 4,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: diag ? 14 : 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>Test de connexion</span>
                    <button
                      onClick={() => diagnose.mutate()}
                      disabled={!form.db_name || !form.login || !form.api_key || diagnose.isPending}
                      style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: 600,
                        background: (!form.db_name || !form.login || !form.api_key) ? t.borderLight : t.action,
                        color: (!form.db_name || !form.login || !form.api_key) ? t.muted : '#fff',
                        border: 'none', borderRadius: t.radius, cursor: 'pointer',
                      }}
                    >
                    {diagnose.isPending ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : <Play size={14} />}
                    {diagnose.isPending ? c.saving : c.test}
                    </button>
                  </div>

                  {/* Step results */}
                  {diag && diag.steps.map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: '8px 0', borderTop: i > 0 ? `1px solid ${t.border}` : 'none',
                    }}>
                      <span style={{
                        fontSize: 15, flexShrink: 0, marginTop: 1,
                        color: s.ok ? t.success : t.danger,
                      }}>
                        {s.ok ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: s.ok ? t.muted : t.danger, marginTop: 2, whiteSpace: 'pre-line' }}>
                          {s.detail}
                        </div>
                      </div>
                    </div>
                  ))}

                  {diagOk && (
                    <div style={{
                      marginTop: 12, padding: '10px 14px',
                      background: `${t.success}18`, border: `1px solid ${t.success}40`,
                      borderRadius: t.radius,
                    }}>
                      <div style={{ fontSize: 13, color: t.success, fontWeight: 600, marginBottom: companyInfo ? 10 : 0 }}>
                        <Check size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} /> {c.connectionOk.replace(' ✓', '')} — Odoo {diag!.odoo_version} · {diag!.module_count} modules
                      </div>
                      {companyInfo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {companyInfo.logo && (
                            <img src={companyInfo.logo} alt="logo"
                              style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, background: '#fff', border: `1px solid ${t.border}`, padding: 2 }} />
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{companyInfo.name}</div>
                            {companyInfo.city && <div style={{ fontSize: 12, color: t.muted }}>{companyInfo.city}</div>}
                          </div>
                        </div>
                      )}
                      {availableCompanies.length > 1 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: t.muted, marginBottom: 5, fontWeight: 600 }}>
                            {availableCompanies.length} sociétés détectées
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {availableCompanies.map(c => (
                              <span key={c.id} style={{
                                padding: '2px 8px', borderRadius: 3, fontSize: 11,
                                background: t.bgMuted, border: `1px solid ${t.border}`, color: t.textSub,
                              }}>
                                {c.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin warning — shown after diagnose if user has admin rights */}
                  {showAccessWarning && accessInfo && (
                    <div style={{
                      marginTop: 10, padding: '12px 14px',
                      background: accessInfo.is_system ? '#fef2f2' : '#fffbeb',
                      border: `1px solid ${accessInfo.is_system ? '#fca5a5' : '#fcd34d'}`,
                      borderRadius: t.radius,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 20, flexShrink: 0 }}>{accessInfo.is_system ? '🔴' : '🟡'}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: accessInfo.is_system ? '#b91c1c' : '#92400e', marginBottom: 4 }}>
                              {accessInfo.is_system ? 'Administrateur système détecté' : 'Utilisateur avec droits d\'administration'}
                            </div>
                            <div style={{ fontSize: 12, color: accessInfo.is_system ? '#991b1b' : '#78350f', lineHeight: 1.5 }}>
                              {accessInfo.is_system
                                ? <>L'utilisateur <strong>{accessInfo.user_name}</strong> a les droits d'administration technique (Paramètres complets). Pour une utilisation en production, préférez un utilisateur dédié avec des droits limités aux modèles nécessaires.</>
                                : <>L'utilisateur <strong>{accessInfo.user_name}</strong> a des droits d'administration. Il est recommandé d'utiliser un compte avec des droits limités pour l'accès API.</>
                              }
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setShowAccessWarning(false)} className="ui-icon-button" aria-label={c.cancel} title={c.cancel}><X size={14} /></button>
                      </div>
                    </div>
                  )}
                </div>

                <Field label="Version Odoo" hint="Mise à jour automatiquement si le test réussit">
                  <select style={styles.input} value={form.odoo_version} onChange={set('odoo_version')}>
                    {VERSIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* ── Step 3 ── */}
            {step === 3 && (
              <div>
                <h2 style={styles.stepTitle}>Récapitulatif</h2>
                <p style={{ fontSize: 13, color: t.muted, marginBottom: 18 }}>
                  Vérifiez les informations avant d'enregistrer. Les environnements supplémentaires (staging, dev…) et les dépôts GitHub se configurent depuis la fiche projet après enregistrement.
                </p>

                {/* Summary */}
                <div style={{ background: t.bg, borderRadius: t.radiusLg, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: t.text }}>Récapitulatif</div>
                  <SummaryRow label="Projet"  value={form.name} />
                  <SummaryRow label="URL"     value={form.db_url} />
                  <SummaryRow label="Base"    value={form.db_name} />
                  <SummaryRow label="Version" value={form.odoo_version} />
                </div>

                <div style={{ background: `${t.brand}08`, border: `1px solid ${t.brand20}`, borderRadius: t.radius, padding: '12px 16px', fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
                  💡 Après enregistrement, cliquez sur les pilules d'environnement pour configurer les dépôts GitHub et les sources complémentaires pour l'IA.
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${t.border}` }}>
              <button className="btn btn-secondary"
                onClick={() => step === 1 ? (setShowWizard(false), setEditingId(null), setDiag(null)) : setStep(s => s - 1)}>
                {step === 1 ? c.cancel : c.back}
              </button>
              {step < 3 ? (
                <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>
                  Suivant →
                </button>
              ) : (
                <button className="btn btn-primary" style={{ background: t.success }}
                  disabled={editingId !== null ? update.isPending : create.isPending}
                  onClick={() => editingId !== null ? update.mutate() : create.mutate()}>
                  {(editingId !== null ? update.isPending : create.isPending) ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : <Check size={14} />}
                  {(editingId !== null ? update.isPending : create.isPending) ? c.saving : c.save}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context modal */}
      {contextProfileId !== null && (
        <div style={styles.overlay}>
          <div style={{ ...styles.modal, maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0 }}>
                <ClipboardList size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} /> {c.contextProject} — {profiles.find(p => p.id === contextProfileId)?.name}
              </h2>
              <button onClick={() => setContextProfileId(null)}
                className="ui-icon-button" aria-label={c.cancel} title={c.cancel}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 12, color: t.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Notez ici tout ce qui est utile pour ce client : activité, particularités, modules clés, contacts importants…
              Ce contexte sera automatiquement injecté dans les prompts IA de ce projet.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                onClick={doAutoFill}
                disabled={contextAutoFilling}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  background: contextAutoFilling ? t.bgMuted : `${t.action}15`,
                  color: contextAutoFilling ? t.muted : t.action,
                  border: `1px solid ${t.action}40`, borderRadius: t.radius, cursor: 'pointer',
                }}>
                {contextAutoFilling ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : <Bot size={14} />}
                {contextAutoFilling ? c.generating : c.autoFill}
              </button>
            </div>

            <textarea
              value={contextText}
              onChange={e => setContextText(e.target.value)}
              placeholder="Ex: Client dans la distribution industrielle, utilise principalement ventes + stock + facturation. Multi-sociétés avec 3 entités. Point d'attention : dépôt douanier non standard..."
              style={{
                width: '100%', minHeight: 220, padding: '10px 12px',
                border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 13, color: t.text, background: t.white,
                fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
              <button className="btn btn-secondary" onClick={() => setContextProfileId(null)}>{c.cancel}</button>
              <button className="btn btn-primary" onClick={saveContext} disabled={contextSaving}>
                  {contextSaving ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : <Check size={14} />}
                  {contextSaving ? c.saving : c.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {profiles.length === 0 ? (
        <EmptyState onAdd={() => setShowWizard(true)} />
      ) : (
        <div className="page-grid page-grid-profiles">
          {profiles.map(p => (
            <ProjectCard key={p.id} profile={p}
              onTest={() => testConn.mutate(p.id)}
              onDelete={() => del.mutate(p.id)}
              onEdit={() => openEdit(p)}
              onSelectCompany={(companyId) => updateProfile(p.id, { selected_company_id: companyId })
                .then(() => qc.invalidateQueries({ queryKey: ['profiles'] }))}
              onCheckAccess={() => checkAccess(p.id)}
              checkingAccess={checkingAccessId === p.id}
              onContext={() => openContext(p.id)}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['profiles'] })} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function Field({ label, hint, children, optional }: {
  label: string; hint: string; children: React.ReactNode; optional?: boolean
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 5 }}>
        {label}{optional && <span style={{ color: t.muted, fontWeight: 400 }}> (optionnel)</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
      <span style={{ color: t.muted, fontSize: 12, minWidth: 56 }}>{label}</span>
      <span style={{ color: t.text, fontWeight: 500, fontSize: 12 }}>{value}</span>
    </div>
  )
}

type EnvModalState = { mode: 'add' } | { mode: 'edit'; env: EnvEntry }
const EMPTY_ENV_FORM = { id: '', name: '', db_url: '', db_name: '', login: '', api_key: '', odoo_version: '', branch: '', github_repo: '', repo_branch: '' }

function ProjectCard({ profile, onTest, onDelete, onEdit, onSelectCompany, onCheckAccess, checkingAccess, onContext, onRefresh }: {
  profile: Profile; onTest: () => void; onDelete: () => void; onEdit: () => void
  onSelectCompany: (companyId: number) => void
  onCheckAccess: () => void; checkingAccess: boolean
  onContext: () => void; onRefresh: () => void
}) {
  const lang = useUiLanguage()
  const c = profilesCopy[lang]
  const [envs, setEnvs] = useState<EnvEntry[]>(() => { try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] } })
  // Use first env with a github_repo for the GitHub quick link
  const ghUrl = (() => {
    const envWithRepo = envs.find(e => e.github_repo)
    return envWithRepo?.github_repo ? `https://github.com/${envWithRepo.github_repo}` : null
  })()
  const companies: CompanyOption[] = (() => { try { return JSON.parse(profile.company_ids ?? '[]') } catch { return [] } })()
  const accessInfo: AccessInfo | null = (() => { try { return profile.user_access_info ? JSON.parse(profile.user_access_info) : null } catch { return null } })()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [envModal, setEnvModal] = useState<EnvModalState | null>(null)
  const [envForm, setEnvForm] = useState(EMPTY_ENV_FORM)
  const [envDiag, setEnvDiag] = useState<DiagResult | null>(null)
  const [envDiagPending, setEnvDiagPending] = useState(false)
  const [envSaving, setEnvSaving] = useState(false)
  const [repoStatus, setRepoStatus] = useState<{ cloned: boolean; github_repo?: string | null; head?: string; message?: string; date?: string; error?: string } | null>(null)
  const [repoSyncing, setRepoSyncing] = useState(false)
  const [repoLogs, setRepoLogs] = useState<string[]>([])
  const repoAbortRef = useRef<AbortController | null>(null)
  const activeEnvId = profile.active_env_id || envs[0]?.id

  const { data: appsData } = useQuery({
    queryKey: ['profile-apps', profile.id],
    queryFn: () => getProfileApps(profile.id),
    staleTime: 300_000,
    retry: false,
  })
  const apps: { name: string; shortdesc: string }[] = appsData?.data?.apps ?? []

  const setEnv = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEnvForm(p => ({ ...p, [k]: e.target.value }))

  const openAddEnv = () => {
    setEnvForm(EMPTY_ENV_FORM)
    setEnvDiag(null)
    setEnvModal({ mode: 'add' })
  }
  const openEditEnv = (env: EnvEntry) => {
    setEnvForm({ id: env.id, name: env.name, db_url: env.db_url, db_name: env.db_name, login: env.login, api_key: '', odoo_version: env.odoo_version ?? '', branch: env.branch ?? '', github_repo: env.github_repo ?? '', repo_branch: env.repo_branch ?? '' })
    setEnvDiag(null)
    setEnvModal({ mode: 'edit', env })
  }

  const runEnvDiagnose = async () => {
    const canUseSavedKey = envModal?.mode === 'edit' && !envForm.api_key
      && envForm.db_url === envModal.env.db_url
      && envForm.db_name === envModal.env.db_name
      && envForm.login === envModal.env.login
    if (!envForm.db_url || !envForm.db_name || !envForm.login || (!envForm.api_key && !canUseSavedKey)) return
    setEnvDiagPending(true)
    setEnvDiag(null)
    try {
      if (canUseSavedKey && envModal?.mode === 'edit') {
        const res = await testProfileEnv(profile.id, envModal.env.id)
        setEnvDiag({
          steps: [{
            name: 'Connexion Odoo',
            ok: true,
            detail: `Authentification réussie avec la clé enregistrée${res.data.uid ? ` (uid ${res.data.uid})` : ''}.`,
          }],
          uid: res.data.uid ?? null,
          odoo_version: envForm.odoo_version || null,
          module_count: 0,
          db_name_suggestion: '',
        })
        return
      }
      const res = await diagnoseOdoo({ db_url: envForm.db_url, db_name: envForm.db_name, login: envForm.login, api_key: envForm.api_key })
      const d: DiagResult = res.data
      setEnvDiag(d)
      if (d.odoo_version) setEnvForm(p => ({ ...p, odoo_version: d.odoo_version! }))
      if (d.db_name_suggestion && !envForm.db_name) setEnvForm(p => ({ ...p, db_name: d.db_name_suggestion }))
    } catch (err) {
      const apiErr = err as { response?: { data?: { detail?: string } }; message?: string }
      setEnvDiag({
        steps: [{
          name: 'Connexion Odoo',
          ok: false,
          detail: apiErr.response?.data?.detail ?? apiErr.message ?? 'Erreur de connexion',
        }],
        uid: null,
        odoo_version: null,
        module_count: 0,
        db_name_suggestion: '',
      })
    } finally { setEnvDiagPending(false) }
  }

  const fetchRepoStatus = async (envId: string) => {
    try {
      const res = await getEnvRepoStatus(profile.id, envId)
      setRepoStatus(res.data)
    } catch { setRepoStatus(null) }
  }

  const syncRepo = async (envId: string) => {
    repoAbortRef.current?.abort()
    const ctrl = new AbortController()
    repoAbortRef.current = ctrl
    setRepoSyncing(true)
    setRepoLogs([])
    try {
      const res = await fetch(syncEnvRepoUrl(profile.id, envId), {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        // Pass current form values so it works before the env is saved
        body: JSON.stringify({ github_repo: envForm.github_repo || undefined, repo_branch: envForm.repo_branch || undefined }),
      })
      if (!res.ok || !res.body) { setRepoSyncing(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.msg) setRepoLogs(p => [...p.slice(-20), evt.msg])
            if (evt.type === 'done' || evt.type === 'end') { fetchRepoStatus(envId) }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError')
        setRepoLogs(p => [...p, String(err)])
    } finally { setRepoSyncing(false) }
  }

  // Fetch repo status when env modal opens on an env with a github_repo
  useEffect(() => {
    if (envModal?.mode === 'edit' && envModal.env.github_repo) {
      fetchRepoStatus(envModal.env.id)
    } else {
      setRepoStatus(null)
      setRepoLogs([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envModal])

  const saveEnvModal = async () => {
    setEnvSaving(true)
    try {
      if (envModal?.mode === 'add') {
        const res = await addProfileEnv(profile.id, { ...envForm, id: envForm.id || envForm.name.toLowerCase().replace(/\s+/g, '-') })
        setEnvs((res.data as Profile).environments ? JSON.parse((res.data as Profile).environments!) : envs)
      } else if (envModal?.mode === 'edit') {
        const res = await updateProfileEnv(profile.id, envModal.env.id, envForm)
        setEnvs((res.data as Profile).environments ? JSON.parse((res.data as Profile).environments!) : envs)
      }
      onRefresh()
      setEnvModal(null)
      setEnvDiag(null)
    } catch { /* ignore */ } finally { setEnvSaving(false) }
  }

  const removeEnv = async (envId: string) => {
    try {
      await deleteProfileEnv(profile.id, envId)
      setEnvs(p => p.filter(e => e.id !== envId))
      onRefresh()
    } catch { /* ignore */ }
  }

  const activateEnv = async (envId: string) => {
    try {
      const res = await activateProfileEnv(profile.id, envId)
      onRefresh()
      // update local active env display immediately
      const updated = (res.data as Profile).environments ? JSON.parse((res.data as Profile).environments!) : envs
      setEnvs(updated)
    } catch { /* ignore */ }
  }

  const keyExpiry = (() => {
    if (!profile.api_key_expires) return null
    const expDate = new Date(profile.api_key_expires)
    const now = new Date()
    const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return { label: '⚠ Clé expirée', color: t.danger }
    if (diffDays <= 30) return { label: `⚠ Expire dans ${diffDays}j`, color: '#F59E0B' }
    return null
  })()
  const canRunEnvDiagnose = Boolean(
    envForm.db_url && envForm.db_name && envForm.login && (envForm.api_key || (
      envModal?.mode === 'edit'
      && envForm.db_url === envModal.env.db_url
      && envForm.db_name === envModal.env.db_name
      && envForm.login === envModal.env.login
    ))
  )
  const modalRoot = typeof document !== 'undefined' ? document.body : null

  return (
    <div className="project-card">
      {/* ── Header ── */}
      <div className="project-card-header">
        {/* Logo */}
        <div className="project-logo">
          {profile.company_logo
            ? <img src={profile.company_logo} alt="logo" />
            : <Building2 size={24} />
          }
        </div>

        {/* Name + meta */}
        <div className="project-title-block">
          <div className="project-title-row">
            <div className="project-title-block">
              <div className="project-title">{profile.name}</div>
              {profile.company_name && (
                <div className="project-subtitle">
                  {profile.company_name}{profile.company_city ? ` · ${profile.company_city}` : ''}
                </div>
              )}
            </div>
          </div>
          {/* Badges row */}
          <div className="project-badges">
            {profile.odoo_version && (
              <span className="project-pill project-pill-brand">
                Odoo {profile.odoo_version}
              </span>
            )}
            {keyExpiry && (
              <span title={profile.api_key_expires} className={`project-pill ${keyExpiry.color === t.danger ? 'project-pill-danger' : 'project-pill-warning'}`}>
                {keyExpiry.label}
              </span>
            )}
            {accessInfo?.is_system && (
              <span title="Utilisateur administrateur système" className="project-pill project-pill-danger"><TriangleAlert size={11} /> Admin système</span>
            )}
            {!accessInfo?.is_system && accessInfo?.is_admin && (
              <span title="Utilisateur avec droits d'administration" className="project-pill project-pill-warning"><TriangleAlert size={11} /> Admin</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Connection info (slim) ── */}
      <div className="project-connection">
        <a href={profile.db_url} target="_blank" rel="noreferrer" className="project-connection-item" style={{ color: t.action, textDecoration: 'none' }}>
          <Globe2 size={13} />
          <span>{profile.db_url.replace(/^https?:\/\//, '')}</span>
        </a>
        <span className="project-connection-item">
          <UserRound size={13} />
          <span>{profile.login}</span>
        </span>
      </div>

      <div className="project-card-body">

        {/* ── App badges ── */}
        {apps.length > 0 && (
          <div className="project-section">
            <div className="project-section-title">{c.applications}</div>
            <AppBadges apps={apps} max={6} />
          </div>
        )}

        {/* ── Multi-company selector ── */}
        {companies.length > 1 && (
          <div className="project-section">
            <div className="project-section-title">{c.activeCompany}</div>
            <div className="project-company-list">
              {companies.map(c => {
                const isActive = (profile.selected_company_id ?? companies[0]?.id) === c.id
                const isAccessible = !accessInfo || accessInfo.accessible_company_ids.includes(c.id)
                return (
                  <button key={c.id} onClick={() => isAccessible && onSelectCompany(c.id)} disabled={!isAccessible}
                    title={!isAccessible ? `${accessInfo?.user_name} n'a pas accès à cette société` : undefined}
                    className={`project-company-pill${isActive ? ' is-active' : ''}`}>
                    {!isAccessible ? 'Verrouillé - ' : isActive ? 'Actif - ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Environments ── */}
        <div className="project-section">
          <div className="project-section-header">
            <span className="project-section-title">{c.environments}</span>
            <button onClick={openAddEnv} title="Ajouter un environnement"
              className="project-add-env">
              <Plus size={14} />
            </button>
          </div>
          <div className="project-env-list">
            {envs.map(env => {
              const isActive = env.id === activeEnvId
              return (
                <button key={env.id} onClick={() => openEditEnv(env)} title={`Configurer ${env.name}${!isActive ? ' · Cliquer pour activer' : ''}`}
                  className={`project-env-pill${isActive ? ' is-active' : ''}`}>
                  {isActive && <Check size={11} style={{ opacity: 0.85 }} />}
                  {env.name}
                  {env.odoo_version && (
                    <span className="project-env-version">
                      v{env.odoo_version.split('.')[0]}
                    </span>
                  )}
                  {env.github_repo && (
                    <span title={`Dépôt : ${env.github_repo}`} style={{ display: 'inline-flex', opacity: isActive ? 0.8 : 0.6 }}>
                      <GitBranch size={11} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="project-card-footer">
          <div className="project-section-title" style={{ marginBottom: 8 }}>
            {(profile.odoo_sh_url || ghUrl) ? c.linksActions : c.actions}
          </div>
          {/* External links */}
          {(profile.odoo_sh_url || ghUrl) && (
            <div className="project-link-list" style={{ marginBottom: 8 }}>
              {profile.odoo_sh_url && <QuickLink href={profile.odoo_sh_url} label="Odoo.sh" icon={<Cloud size={12} />} color={t.brand} />}
              {ghUrl && <QuickLink href={ghUrl} label="GitHub" icon={<GitBranch size={12} />} color="#24292f" />}
            </div>
          )}
          {/* Action buttons */}
          <div className="project-action-list">
            <button className="btn btn-outline btn-sm" onClick={onEdit} title={c.edit}><Pencil size={13} /> {c.edit}</button>
            <button className="btn btn-outline btn-sm" onClick={onTest} title={c.test}><Play size={13} /> {c.test}</button>
            <button className="btn btn-outline btn-sm" onClick={onCheckAccess} disabled={checkingAccess} title="Vérifier les droits d'accès">
              {checkingAccess ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} /> : <Search size={13} />} {c.access}
            </button>
            <button className="btn btn-outline btn-sm" onClick={onContext} title="Fichier de contexte de ce projet"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ClipboardList size={13} /> {c.context}
              {profile.project_context && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.success, display: 'inline-block', flexShrink: 0 }} />
              )}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setConfirmDelete(true)} title={c.deleteTitle}
              className="project-delete-action"><Trash2 size={15} /></button>
          </div>
        </div>

        {/* ── Env modal (add / edit) ── */}
        {envModal && modalRoot && createPortal((
          <div className="ui-modal-overlay project-env-modal-overlay">
            <div className="ui-modal project-env-modal" role="dialog" aria-modal="true" aria-labelledby="env-modal-title">

              {/* Header */}
              <div className="ui-modal-header">
                <h2 id="env-modal-title">
                  {envModal.mode === 'add' ? 'Nouvel environnement' : `Environnement - ${envModal.env.name}`}
                </h2>
                <button onClick={() => setEnvModal(null)} className="ui-icon-button" title="Fermer" aria-label="Fermer">
                  <X size={18} />
                </button>
              </div>

              <div className="ui-modal-body project-env-modal-body">
                {/* Nom + identifiant (add only) */}
                {envModal.mode === 'add' && (
                  <div className="project-env-grid project-env-grid-asymmetric">
                    <div className="ui-field">
                      <label style={styles.label}>Identifiant</label>
                      <input style={styles.input} value={envForm.id} onChange={setEnv('id')} placeholder="staging" autoFocus />
                      <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>ex : staging, dev-v18</div>
                    </div>
                    <div className="ui-field">
                      <label style={styles.label}>Nom affiché</label>
                      <input style={styles.input} value={envForm.name} onChange={setEnv('name')} placeholder="Staging" />
                    </div>
                  </div>
                )}

                {/* URL */}
                <div className="project-env-field">
                  <label style={styles.label}>URL de l'instance</label>
                  <input style={styles.input} value={envForm.db_url} onChange={e => {
                    setEnv('db_url')(e)
                    if (!envForm.db_name) {
                      const m = e.target.value.match(/https?:\/\/([^./]+)/)
                      if (m) setEnvForm(p => ({ ...p, db_name: m[1] }))
                    }
                  }} placeholder="https://mon-projet-staging.odoo.com" />
                </div>

                {/* DB + Login */}
                <div className="project-env-grid">
                  <div className="ui-field">
                    <label style={styles.label}>Nom de la base</label>
                    <input style={styles.input} value={envForm.db_name} onChange={setEnv('db_name')} placeholder="mon-projet-staging" />
                  </div>
                  <div className="ui-field">
                    <label style={styles.label}>Login</label>
                    <input style={styles.input} value={envForm.login} onChange={setEnv('login')} placeholder="admin@client.com" />
                  </div>
                </div>

                {/* API key */}
                <div className="project-env-field">
                  <label style={styles.label}>{envModal.mode === 'edit' ? 'Clé API (laisser vide = inchangée)' : 'Clé API'}</label>
                  <input style={styles.input} type="password" value={envForm.api_key} onChange={setEnv('api_key')} placeholder={envModal.mode === 'edit' ? '(inchangée)' : '••••••••••••••••••'} />
                </div>

                {/* Diagnose box */}
                <div className="project-env-test-box">
                  <div className="project-env-test-header" style={{ marginBottom: envDiag ? 12 : 0 }}>
                    <span className="project-env-test-title"><Play size={14} /> Test de connexion</span>
                    <button onClick={runEnvDiagnose}
                      disabled={envDiagPending || !canRunEnvDiagnose}
                      className="btn btn-primary btn-sm"
                      title={envModal.mode === 'edit' && !envForm.api_key ? 'Tester avec la clé API déjà enregistrée, si la connexion n’a pas changé' : 'Tester la connexion'}>
                      {envDiagPending ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} /> : <Play size={13} />}
                      {envDiagPending ? 'Test en cours…' : 'Tester'}
                    </button>
                  </div>
                  {envDiag && (
                    <>
                      {envDiag.steps.map((s, i) => (
                        <div key={i} className="project-env-test-result">
                          <span style={{ fontSize: 14, flexShrink: 0, color: s.ok ? t.success : t.danger }}>{s.ok ? <Check size={14} /> : <X size={14} />}</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: s.ok ? t.muted : t.danger, marginTop: 1, whiteSpace: 'pre-line' }}>{s.detail}</div>
                          </div>
                        </div>
                      ))}
                      {envDiag.uid !== null && (
                        <div className="project-env-success">
                          <Check size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                          Connexion réussie{envDiag.odoo_version ? ` - Odoo ${envDiag.odoo_version}` : ''}{envDiag.module_count ? ` - ${envDiag.module_count} modules` : ''}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Version + Branch */}
                <div className="project-env-grid">
                  <div className="ui-field">
                    <label style={styles.label}>Version Odoo <span style={{ color: t.muted, fontWeight: 400 }}>(auto-détectée)</span></label>
                    <select style={styles.input} value={envForm.odoo_version} onChange={setEnv('odoo_version')}>
                      <option value="">— idem projet —</option>
                      {VERSIONS.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="ui-field">
                    <label style={styles.label}>Branche Odoo.sh <span style={{ color: t.muted, fontWeight: 400 }}>(optionnel)</span></label>
                    <input style={styles.input} value={envForm.branch} onChange={setEnv('branch')} placeholder="staging" />
                  </div>
                </div>

                {/* ── Repo section ── */}
                <div className="project-env-repo">
                  <div className="project-env-repo-title">
                    Source complémentaire (dépôt GitHub)
                  </div>
                  <div className="project-env-grid project-env-grid-asymmetric">
                    <div className="ui-field">
                      <label style={styles.label}>Dépôt <span style={{ color: t.muted, fontWeight: 400 }}>(optionnel)</span></label>
                      <input style={styles.input} value={envForm.github_repo} onChange={setEnv('github_repo')} placeholder="org/mon-projet-odoo" />
                    </div>
                    <div className="ui-field">
                      <label style={styles.label}>Branche</label>
                      <input style={styles.input} value={envForm.repo_branch} onChange={setEnv('repo_branch')} placeholder="main" />
                    </div>
                  </div>

                  {/* Repo status + sync button */}
                  {envModal?.mode === 'add' && envForm.github_repo && (
                    <div style={{ fontSize: 11, color: t.muted, fontStyle: 'italic' }}>
                      Enregistrez l'environnement pour pouvoir cloner le dépôt.
                    </div>
                  )}
                  {envModal?.mode === 'edit' && (envForm.github_repo || repoStatus) && (
                    <div className="project-env-repo-status">
                      <div className="project-env-repo-row">
                        <div className="project-env-repo-meta">
                          {repoStatus?.cloned ? (
                            <>
                              <span style={{ color: t.success, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Cloné</span>
                              {repoStatus.head && <span style={{ color: t.muted, fontFamily: 'monospace', fontSize: 11 }}>{repoStatus.head}</span>}
                              {repoStatus.message && <span style={{ color: t.textSub }} title={repoStatus.date ?? ''}>{repoStatus.message.slice(0, 40)}</span>}
                            </>
                          ) : repoStatus?.github_repo ? (
                            <span style={{ color: '#b45309', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><TriangleAlert size={13} /> Non cloné</span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => syncRepo(envModal.env.id)}
                          disabled={repoSyncing || !envForm.github_repo}
                          className="btn btn-primary btn-sm">
                          {repoSyncing ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} /> : <GitBranch size={13} />}
                          {repoSyncing ? 'En cours…' : repoStatus?.cloned ? 'Mettre à jour' : 'Cloner'}
                        </button>
                      </div>
                      {repoLogs.length > 0 && (
                        <div className="project-env-repo-log">
                          {repoLogs.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="ui-modal-footer project-env-modal-footer">
                <div className="project-env-modal-actions">
                  <button className="btn btn-secondary" onClick={() => setEnvModal(null)}>Annuler</button>
                  {envModal.mode === 'edit' && envModal.env.id !== activeEnvId && (
                    <button className="btn btn-outline btn-sm" onClick={() => { activateEnv(envModal.env.id); setEnvModal(null) }}
                      style={{ color: t.action, borderColor: t.action }}>
                      <Check size={13} /> Activer
                    </button>
                  )}
                  {envModal.mode === 'edit' && (
                    <button onClick={() => { removeEnv(envModal.env.id); setEnvModal(null) }}
                      className="btn btn-outline-danger btn-sm">
                      <Trash2 size={13} /> Supprimer
                    </button>
                  )}
                </div>
                <button className="btn btn-primary" onClick={saveEnvModal}
                  disabled={envSaving || !envForm.name || !envForm.db_url || !envForm.db_name || !envForm.login || (envModal.mode === 'add' && !envForm.api_key)}>
                  {envSaving ? <Loader2 size={14} style={{ animation: 'spin .9s linear infinite' }} /> : <Check size={14} />}
                  {envSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        ), modalRoot)}

        {/* ── Confirm delete modal ── */}
        {confirmDelete && modalRoot && createPortal((
          <div style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: t.white, borderRadius: t.radiusLg, padding: '28px 32px',
              maxWidth: 400, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,.2)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 12, color: t.danger }}><TriangleAlert size={34} /></div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: t.text, textAlign: 'center', margin: '0 0 8px' }}>
                Supprimer ce projet ?
              </h3>
              <p style={{ fontSize: 13, color: t.muted, textAlign: 'center', margin: '0 0 6px', lineHeight: 1.5 }}>
                Vous êtes sur le point de supprimer le projet
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: t.text, textAlign: 'center', margin: '0 0 20px' }}>
                « {profile.name} »
              </p>
              <p style={{ fontSize: 12, color: t.danger, textAlign: 'center', margin: '0 0 24px', lineHeight: 1.5 }}>
                Cette action est irréversible. La clé API et toutes les données de connexion seront supprimées.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmDelete(false)}
                >
                  Annuler
                </button>
                <button
                  className="btn btn-outline-danger"
                  style={{ flex: 1, fontWeight: 700 }}
                  onClick={() => { setConfirmDelete(false); onDelete() }}
                >
                  Oui, supprimer
                </button>
              </div>
            </div>
          </div>
        ), modalRoot)}

      </div>
    </div>
  )
}

function QuickLink({ href, label, icon, color }: { href: string; label: string; icon: React.ReactNode; color: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 3,
      border: `1px solid ${t.brand40}`, background: t.brand10,
      color: t.action, fontSize: 11, fontWeight: 600, textDecoration: 'none',
    }}>
      {icon} {label} <ExternalLink size={10} style={{ opacity: .65 }} />
    </a>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const lang = useUiLanguage()
  const c = profilesCopy[lang]
  return (
    <div className="ui-empty">
      <div className="ui-empty-icon"><Building2 size={26} /></div>
      <div style={{ fontWeight: 700, fontSize: 16, color: t.text, marginBottom: 8 }}>{c.noProject}</div>
      <div style={{ fontSize: 14, color: t.muted, marginBottom: 24 }}>
        {c.noProjectDesc}
      </div>
      <button className="btn btn-primary" onClick={onAdd}><Plus size={15} /> {c.newProject}</button>
    </div>
  )
}

// ── Types & styles ──────────────────────────────────────────────

interface ApiErr { response?: { data?: { detail?: string } }; message: string }

const styles = {
  h1: { fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 } as React.CSSProperties,
  sub: { fontSize: 14, color: t.muted } as React.CSSProperties,
  stepTitle: { fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 20 } as React.CSSProperties,
  label: { display: 'block', fontWeight: 600, fontSize: 12, color: t.textSub, marginBottom: 4 } as React.CSSProperties,
  input: {
    width: '100%', padding: '9px 12px',
    border: `1px solid ${t.border}`, borderRadius: t.radius,
    fontSize: 13, color: t.text, background: t.white, outline: 'none',
    transition: 'border-color .15s',
  } as React.CSSProperties,
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: 16, backdropFilter: 'blur(2px)',
  } as React.CSSProperties,
  modal: {
    background: t.white, borderRadius: t.radiusLg, padding: '32px 36px',
    width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,.25)',
  } as React.CSSProperties,
}
