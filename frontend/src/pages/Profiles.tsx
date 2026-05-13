import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProfiles, createProfile, updateProfile, deleteProfile, testProfile, diagnoseOdoo, getProfileApps, checkAccessProfile, getProfileContext, saveProfileContext, autoFillContext, addProfileEnv, updateProfileEnv, deleteProfileEnv, activateProfileEnv, testProfileEnv } from '../api/client'
import { t, btn } from '../theme'
import PageHeader from '../components/PageHeader'
import { ODOO_APPS } from '../constants/odooApps'

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

export default function Profiles() {
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
      notify('Projet ajouté avec succès !')
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
      notify('Projet mis à jour !')
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); notify('Projet supprimé') },
  })

  const testConn = useMutation({
    mutationFn: (id: number) => testProfile(id),
    onSuccess: () => notify('Connexion réussie ✓'),
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
      notify('Contexte enregistré ✓')
      setContextProfileId(null)
    } catch {
      notify('Erreur lors de l\'enregistrement', false)
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
      notify('Contexte généré par l\'IA ✓')
    } catch {
      notify('Impossible de générer le contexte', false)
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
      notify('Impossible de vérifier les accès', false)
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
    <div style={{ maxWidth: 900 }}>
      <PageHeader
        title="Mes projets Odoo.sh"
        description="Gérez vos connexions aux instances Odoo de vos clients."
        action={
          <button className="btn btn-primary" onClick={() => { setEditingId(null); setForm(EMPTY); setShowWizard(true); setStep(1) }}>
            + Nouveau projet
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
          {toast.ok ? '✓' : '⚠'} {toast.msg}
        </div>
      )}

      {/* Wizard modal */}
      {showWizard && (
        <div style={styles.overlay}>
          <div style={styles.modal}>

            {/* Title */}
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: t.text, margin: 0 }}>
                {editingId !== null ? `Modifier — ${form.name || 'projet'}` : 'Nouveau projet'}
              </h2>
              <button onClick={() => { setShowWizard(false); setEditingId(null); setDiag(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>
                ×
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
                      {s.n < step ? '✓' : s.n}
                    </div>
                    <span style={{ fontSize: 11, color: s.n === step ? t.brand : t.muted, fontWeight: s.n === step ? 600 : 400 }}>
                      {s.label}
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
                <h2 style={styles.stepTitle}>Connexion à la base de données</h2>

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
                      {diagnose.isPending ? '⟳ Test en cours…' : '▶ Tester'}
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
                        {s.ok ? '✓' : '✗'}
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
                        ✓ Connexion réussie — Odoo {diag!.odoo_version} · {diag!.module_count} modules
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
                        <button onClick={() => setShowAccessWarning(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, padding: '0 0 0 8px', flexShrink: 0 }}>✕</button>
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
                <h2 style={styles.stepTitle}>Dépôt GitHub (optionnel)</h2>
                <p style={{ fontSize: 13, color: t.muted, marginBottom: 18 }}>
                  Ajoutez le dépôt GitHub de ce projet pour accéder directement au code depuis le portail.
                </p>
                <Field label="Dépôt GitHub" hint="Ex : mon-org/mon-projet-odoo" optional>
                  <input style={styles.input} value={form.github_repo} onChange={set('github_repo')}
                    placeholder="organisation/projet" />
                </Field>
                <Field label="Branche par défaut" hint="" optional>
                  <input style={styles.input} value={form.default_branch} onChange={set('default_branch')}
                    placeholder="main" />
                </Field>

                {/* Environments — info only in wizard, managed from card after creation */}
                {envs.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 8 }}>
                      Environnements configurés
                    </div>
                    {envs.map((env, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '6px 10px', background: t.bg, borderRadius: t.radius, marginBottom: 6,
                        border: `1px solid ${t.border}`,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: t.brand, minWidth: 60 }}>{env.name}</span>
                        <span style={{ fontSize: 11, color: t.muted, flex: 1 }}>{env.db_url}</span>
                        {env.odoo_version && <span style={{ fontSize: 11, color: t.muted }}>{env.odoo_version}</span>}
                        {env.branch && <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{env.branch}</span>}
                      </div>
                    ))}
                    <p style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>
                      Les environnements supplémentaires (staging, dev…) se gèrent depuis la fiche projet après enregistrement.
                    </p>
                  </div>
                )}

                {/* Summary */}
                <div style={{ background: t.bg, borderRadius: t.radiusLg, padding: '16px 18px', marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: t.text }}>Récapitulatif</div>
                  <SummaryRow label="Projet"  value={form.name} />
                  <SummaryRow label="URL"     value={form.db_url} />
                  <SummaryRow label="Base"    value={form.db_name} />
                  <SummaryRow label="Version" value={form.odoo_version} />
                  {form.github_repo && <SummaryRow label="GitHub" value={form.github_repo} />}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${t.border}` }}>
              <button className="btn btn-secondary"
                onClick={() => step === 1 ? (setShowWizard(false), setEditingId(null), setDiag(null)) : setStep(s => s - 1)}>
                {step === 1 ? 'Annuler' : '← Retour'}
              </button>
              {step < 3 ? (
                <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>
                  Suivant →
                </button>
              ) : (
                <button className="btn btn-primary" style={{ background: t.success }}
                  disabled={editingId !== null ? update.isPending : create.isPending}
                  onClick={() => editingId !== null ? update.mutate() : create.mutate()}>
                  {(editingId !== null ? update.isPending : create.isPending) ? '⟳ Enregistrement…' : '✓ Enregistrer'}
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
                📋 Contexte projet — {profiles.find(p => p.id === contextProfileId)?.name}
              </h2>
              <button onClick={() => setContextProfileId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>
                ×
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
                {contextAutoFilling ? '⟳ Génération en cours…' : '✨ Auto-compléter avec l\'IA'}
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
              <button className="btn btn-secondary" onClick={() => setContextProfileId(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveContext} disabled={contextSaving}>
                {contextSaving ? '⟳ Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      {profiles.length === 0 ? (
        <EmptyState onAdd={() => setShowWizard(true)} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
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
const EMPTY_ENV_FORM = { id: '', name: '', db_url: '', db_name: '', login: '', api_key: '', odoo_version: '', branch: '' }

function ProjectCard({ profile, onTest, onDelete, onEdit, onSelectCompany, onCheckAccess, checkingAccess, onContext, onRefresh }: {
  profile: Profile; onTest: () => void; onDelete: () => void; onEdit: () => void
  onSelectCompany: (companyId: number) => void
  onCheckAccess: () => void; checkingAccess: boolean
  onContext: () => void; onRefresh: () => void
}) {
  const ghUrl = profile.github_repo ? `https://github.com/${profile.github_repo}` : null
  const [envs, setEnvs] = useState<EnvEntry[]>(() => { try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] } })
  const companies: CompanyOption[] = (() => { try { return JSON.parse(profile.company_ids ?? '[]') } catch { return [] } })()
  const accessInfo: AccessInfo | null = (() => { try { return profile.user_access_info ? JSON.parse(profile.user_access_info) : null } catch { return null } })()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [envModal, setEnvModal] = useState<EnvModalState | null>(null)
  const [envForm, setEnvForm] = useState(EMPTY_ENV_FORM)
  const [envTesting, setEnvTesting] = useState(false)
  const [envTestResult, setEnvTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [envSaving, setEnvSaving] = useState(false)
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
    setEnvTestResult(null)
    setEnvModal({ mode: 'add' })
  }
  const openEditEnv = (env: EnvEntry) => {
    setEnvForm({ id: env.id, name: env.name, db_url: env.db_url, db_name: env.db_name, login: env.login, api_key: '', odoo_version: env.odoo_version ?? '', branch: env.branch ?? '' })
    setEnvTestResult(null)
    setEnvModal({ mode: 'edit', env })
  }

  const testEnvModal = async () => {
    if (envModal?.mode === 'edit') {
      setEnvTesting(true)
      try {
        await testProfileEnv(profile.id, envModal.env.id)
        setEnvTestResult({ ok: true, msg: 'Connexion réussie ✓' })
      } catch (e: any) {
        setEnvTestResult({ ok: false, msg: e.response?.data?.detail ?? e.message })
      } finally { setEnvTesting(false) }
    }
  }

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

  return (
    <div style={{
      background: t.white,
      borderRadius: t.radiusXl,
      border: `1px solid ${t.border}`,
      boxShadow: t.shadow,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'box-shadow .2s, border-color .2s',
    }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = t.shadowMd
        el.style.borderColor = t.brand40
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.boxShadow = t.shadow
        el.style.borderColor = t.border
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: '18px 20px 14px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          {profile.company_logo
            ? <img src={profile.company_logo} alt="logo" style={{
                width: 52, height: 52, objectFit: 'contain', borderRadius: 10,
                background: t.bgMuted, border: `1px solid ${t.border}`, padding: 5,
              }} />
            : <div style={{
                width: 52, height: 52, borderRadius: 10,
                background: t.brand20, border: `1px solid ${t.brand40}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>🏢</div>
          }
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: t.text, lineHeight: 1.2, marginBottom: 2 }}>
            {profile.name}
          </div>
          {profile.company_name && (
            <div style={{ fontSize: 12, color: t.muted, marginBottom: 7 }}>
              {profile.company_name}{profile.company_city ? ` · ${profile.company_city}` : ''}
            </div>
          )}
          {/* Badges row */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {profile.odoo_version && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#fff',
                background: t.brand, borderRadius: t.radiusFull, padding: '2px 9px',
              }}>
                Odoo {profile.odoo_version}
              </span>
            )}
            {keyExpiry && (
              <span title={profile.api_key_expires} style={{
                fontSize: 11, fontWeight: 600, color: '#fff', background: keyExpiry.color,
                borderRadius: t.radiusFull, padding: '2px 9px',
              }}>{keyExpiry.label}</span>
            )}
            {accessInfo?.is_system && (
              <span title="Utilisateur administrateur système" style={{
                fontSize: 11, fontWeight: 700, color: '#fff', background: '#dc2626',
                borderRadius: t.radiusFull, padding: '2px 9px', cursor: 'help',
              }}>⚠ Admin système</span>
            )}
            {!accessInfo?.is_system && accessInfo?.is_admin && (
              <span title="Utilisateur avec droits d'administration" style={{
                fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7',
                border: '1px solid #fcd34d', borderRadius: t.radiusFull, padding: '2px 9px', cursor: 'help',
              }}>⚠ Admin</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Connection info (slim) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '7px 20px', background: t.bgMuted,
        borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
        fontSize: 11, color: t.muted,
      }}>
        <a href={profile.db_url} target="_blank" rel="noreferrer" style={{
          display: 'flex', alignItems: 'center', gap: 5,
          color: t.action, textDecoration: 'none', fontWeight: 600,
          overflow: 'hidden', flex: 1,
        }}>
          <span>🌐</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.db_url.replace(/^https?:\/\//, '')}
          </span>
        </a>
        <span style={{ color: t.borderLight, margin: '0 8px' }}>│</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span>👤</span>
          <span style={{ color: t.textSub, fontWeight: 500 }}>{profile.login}</span>
        </span>
      </div>

      <div style={{ padding: '12px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── App badges ── */}
        {apps.length > 0 && (
          <div style={{ paddingTop: 12, borderTop: `1px solid ${t.borderLight}` }}>
            <AppBadges apps={apps} max={6} />
          </div>
        )}

        {/* ── Multi-company selector ── */}
        {companies.length > 1 && (
          <div style={{ paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.muted, marginBottom: 6 }}>
              Société active dans l'assistant
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {companies.map(c => {
                const isActive = (profile.selected_company_id ?? companies[0]?.id) === c.id
                const isAccessible = !accessInfo || accessInfo.accessible_company_ids.includes(c.id)
                return (
                  <button key={c.id} onClick={() => isAccessible && onSelectCompany(c.id)} disabled={!isAccessible}
                    title={!isAccessible ? `${accessInfo?.user_name} n'a pas accès à cette société` : undefined}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: t.radiusFull,
                      border: `1px solid ${!isAccessible ? t.border : isActive ? t.brand : t.border}`,
                      background: !isAccessible ? t.bgMuted : isActive ? t.brand : t.bgCard,
                      color: !isAccessible ? t.muted : isActive ? '#fff' : t.textSub,
                      cursor: !isAccessible ? 'not-allowed' : 'pointer', opacity: !isAccessible ? 0.5 : 1, transition: 'all .15s',
                    }}>
                    {!isAccessible ? '🔒 ' : isActive ? '✓ ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Environments ── */}
        <div style={{ paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.muted }}>
              Environnements
            </span>
            <button onClick={openAddEnv} title="Ajouter un environnement"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.action, fontSize: 13, padding: '0 2px', lineHeight: 1, fontWeight: 700 }}>
              +
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {envs.map(env => {
              const isActive = env.id === activeEnvId
              return (
                <div key={env.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                  <button
                    onClick={() => !isActive && activateEnv(env.id)}
                    title={isActive ? 'Environnement actif' : `Activer ${env.name}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px', borderRadius: '6px 0 0 6px',
                      border: `1px solid ${isActive ? t.brand : t.border}`,
                      background: isActive ? t.brand : t.bgMuted,
                      color: isActive ? '#fff' : t.textSub,
                      fontSize: 12, fontWeight: 600, cursor: isActive ? 'default' : 'pointer',
                      transition: 'all .15s',
                    }}>
                    {isActive && <span style={{ fontSize: 10 }}>✓</span>}
                    {env.name}
                    {env.odoo_version && (
                      <span style={{ fontSize: 10, opacity: 0.75 }}>v{env.odoo_version.split('.')[0]}</span>
                    )}
                  </button>
                  <button onClick={() => openEditEnv(env)} title={`Configurer ${env.name}`}
                    style={{
                      padding: '4px 6px', borderRadius: '0 6px 6px 0',
                      border: `1px solid ${isActive ? t.brand : t.border}`, borderLeft: 'none',
                      background: isActive ? t.brand : t.bgMuted,
                      color: isActive ? 'rgba(255,255,255,.7)' : t.muted,
                      fontSize: 11, cursor: 'pointer', lineHeight: 1, transition: 'all .15s',
                    }}>
                    ✎
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${t.borderLight}` }}>
          {/* External links */}
          {(profile.odoo_sh_url || ghUrl) && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
              {profile.odoo_sh_url && <QuickLink href={profile.odoo_sh_url} label="Odoo.sh" icon="☁" color={t.brand} />}
              {ghUrl && <QuickLink href={ghUrl} label="GitHub" icon="🐙" color="#24292f" />}
            </div>
          )}
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={onEdit} title="Modifier ce projet">✏ Modifier</button>
            <button className="btn btn-outline btn-sm" onClick={onTest} title="Tester la connexion">▶ Tester</button>
            <button className="btn btn-outline btn-sm" onClick={onCheckAccess} disabled={checkingAccess} title="Vérifier les droits d'accès">
              {checkingAccess ? '⟳' : '🔍'} Accès
            </button>
            <button className="btn btn-outline btn-sm" onClick={onContext} title="Fichier de contexte de ce projet"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              📋 Contexte
              {profile.project_context && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.success, display: 'inline-block', flexShrink: 0 }} />
              )}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setConfirmDelete(true)} title="Supprimer ce projet"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 15, padding: '2px 4px', lineHeight: 1, transition: 'color .15s' }}
              onMouseEnter={e => { e.currentTarget.style.color = t.danger }}
              onMouseLeave={e => { e.currentTarget.style.color = t.muted }}>🗑</button>
          </div>
        </div>

        {/* ── Env modal (add / edit) ── */}
        {envModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: t.white, borderRadius: t.radiusLg, padding: '28px 32px', maxWidth: 500, width: '100%', boxShadow: t.shadowLg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: t.text, margin: 0 }}>
                  {envModal.mode === 'add' ? '+ Nouvel environnement' : `Configurer — ${envModal.env.name}`}
                </h3>
                <button onClick={() => setEnvModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 20, padding: '0 4px' }}>×</button>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {envModal.mode === 'add' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                    <div>
                      <label style={styles.label}>Identifiant</label>
                      <input style={styles.input} value={envForm.id} onChange={setEnv('id')} placeholder="staging" />
                      <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>Lettres, chiffres, tirets</div>
                    </div>
                    <div>
                      <label style={styles.label}>Nom affiché</label>
                      <input style={styles.input} value={envForm.name} onChange={setEnv('name')} placeholder="Staging" autoFocus />
                    </div>
                  </div>
                )}

                <div>
                  <label style={styles.label}>URL de l'instance</label>
                  <input style={styles.input} value={envForm.db_url} onChange={setEnv('db_url')} placeholder="https://mon-projet-staging.odoo.com" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={styles.label}>Nom de la base</label>
                    <input style={styles.input} value={envForm.db_name} onChange={setEnv('db_name')} placeholder="mon-projet-staging" />
                  </div>
                  <div>
                    <label style={styles.label}>Login</label>
                    <input style={styles.input} value={envForm.login} onChange={setEnv('login')} placeholder="admin@client.com" />
                  </div>
                </div>
                <div>
                  <label style={styles.label}>{envModal.mode === 'edit' ? 'Clé API (laisser vide = inchangée)' : 'Clé API'}</label>
                  <input style={styles.input} type="password" value={envForm.api_key} onChange={setEnv('api_key')} placeholder={envModal.mode === 'edit' ? '(inchangée)' : '••••••••••••••••••'} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={styles.label}>Version Odoo</label>
                    <select style={styles.input} value={envForm.odoo_version} onChange={setEnv('odoo_version')}>
                      <option value="">— même que prod —</option>
                      {VERSIONS.map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={styles.label}>Branche GitHub</label>
                    <input style={styles.input} value={envForm.branch} onChange={setEnv('branch')} placeholder="staging" />
                  </div>
                </div>
              </div>

              {/* Test result */}
              {envTestResult && (
                <div style={{
                  marginTop: 12, padding: '8px 12px', borderRadius: t.radius, fontSize: 12, fontWeight: 600,
                  background: envTestResult.ok ? t.successBg : t.dangerBg,
                  border: `1px solid ${envTestResult.ok ? t.success : t.danger}40`,
                  color: envTestResult.ok ? t.success : t.danger,
                }}>
                  {envTestResult.msg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setEnvModal(null)}>Annuler</button>
                  {envModal.mode === 'edit' && (
                    <button className="btn btn-outline btn-sm" onClick={testEnvModal} disabled={envTesting}
                      style={{ color: t.action, borderColor: t.action }}>
                      {envTesting ? '⟳ Test…' : '▶ Tester'}
                    </button>
                  )}
                  {envModal.mode === 'edit' && (
                    <button onClick={() => { removeEnv(envModal.env.id); setEnvModal(null) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 13, padding: '4px 8px' }}
                      onMouseEnter={e => { e.currentTarget.style.color = t.danger }}
                      onMouseLeave={e => { e.currentTarget.style.color = t.muted }}>
                      Supprimer
                    </button>
                  )}
                </div>
                <button className="btn btn-primary" onClick={saveEnvModal} disabled={envSaving || !envForm.name || !envForm.db_url || !envForm.db_name || !envForm.login || (envModal.mode === 'add' && !envForm.api_key)}>
                  {envSaving ? '⟳ Enregistrement…' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm delete modal ── */}
        {confirmDelete && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: t.white, borderRadius: t.radiusLg, padding: '28px 32px',
              maxWidth: 400, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,.2)',
            }}>
              <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
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
        )}

      </div>
    </div>
  )
}

function QuickLink({ href, label, icon, color }: { href: string; label: string; icon: string; color: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 3,
      border: `1px solid ${t.brand40}`, background: t.brand10,
      color: t.action, fontSize: 11, fontWeight: 600, textDecoration: 'none',
    }}>
      {icon} {label}
    </a>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      background: t.white, border: `2px dashed ${t.border}`,
      borderRadius: t.radiusLg, padding: '60px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: t.text, marginBottom: 8 }}>Aucun projet configuré</div>
      <div style={{ fontSize: 14, color: t.muted, marginBottom: 24 }}>
        Ajoutez votre premier projet Odoo.sh pour commencer.
      </div>
      <button className="btn btn-primary" onClick={onAdd}>+ Nouveau projet</button>
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
