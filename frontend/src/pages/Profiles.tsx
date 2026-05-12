import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProfiles, createProfile, updateProfile, deleteProfile, testProfile, diagnoseOdoo, getProfileApps } from '../api/client'
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

interface Env { name: string; db_url: string; branch: string }
interface Profile {
  id: number; name: string; db_url: string; db_name: string
  login: string; odoo_version?: string; odoo_sh_url?: string; github_repo?: string
  default_branch?: string; environments?: string
  company_name?: string; company_city?: string; company_logo?: string
  company_ids?: string; selected_company_id?: number; api_key_expires?: string
}
interface DiagStep { name: string; ok: boolean; detail: string }
interface DiagResult {
  steps: DiagStep[]; uid: number | null; odoo_version: string | null
  module_count: number; db_name_suggestion: string
  company_name?: string; company_city?: string; company_logo?: string
  company_ids?: string
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
  const [envs,       setEnvs]       = useState<Env[]>([])
  const [newEnv,     setNewEnv]     = useState<Env | null>(null)

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 5000)
  }

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const [companyInfo, setCompanyInfo] = useState<{ name?: string; city?: string; logo?: string } | null>(null)
  const [availableCompanies, setAvailableCompanies] = useState<CompanyOption[]>([])

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
      setShowWizard(false); setStep(1); setForm(EMPTY); setDiag(null); setEnvs([]); setCompanyInfo(null); setAvailableCompanies([])
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
      setEditingId(null); setShowWizard(false); setStep(1); setForm(EMPTY); setDiag(null); setEnvs([]); setCompanyInfo(null); setAvailableCompanies([])
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
    try { setEnvs(JSON.parse(p.environments ?? '[]')) } catch { setEnvs([]) }
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

                {/* Environments */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 8 }}>
                    Environnements de staging
                    <span style={{ color: t.muted, fontWeight: 400 }}> (optionnel)</span>
                  </div>
                  {envs.map((env, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 8, alignItems: 'center',
                      padding: '6px 10px', background: t.bg, borderRadius: t.radius, marginBottom: 6,
                      border: `1px solid ${t.border}`,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: t.brand, minWidth: 60 }}>{env.name}</span>
                      <span style={{ fontSize: 11, color: t.muted, flex: 1 }}>{env.db_url}</span>
                      {env.branch && <span style={{ fontSize: 11, color: t.muted, fontFamily: 'monospace' }}>{env.branch}</span>}
                      <button onClick={() => setEnvs(p => p.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.danger, fontSize: 14, padding: '0 4px' }}>×</button>
                    </div>
                  ))}
                  {newEnv ? (
                    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '12px 14px', marginBottom: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 8, marginBottom: 10 }}>
                        <input placeholder="Nom (ex: staging)" value={newEnv.name}
                          onChange={e => setNewEnv(p => p && ({ ...p, name: e.target.value }))}
                          style={{ ...styles.input, fontSize: 12, padding: '6px 8px' }} />
                        <input placeholder="URL" value={newEnv.db_url}
                          onChange={e => setNewEnv(p => p && ({ ...p, db_url: e.target.value }))}
                          style={{ ...styles.input, fontSize: 12, padding: '6px 8px' }} />
                        <input placeholder="Branche" value={newEnv.branch}
                          onChange={e => setNewEnv(p => p && ({ ...p, branch: e.target.value }))}
                          style={{ ...styles.input, fontSize: 12, padding: '6px 8px' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" disabled={!newEnv.name || !newEnv.db_url}
                          onClick={() => { if (newEnv.name && newEnv.db_url) { setEnvs(p => [...p, newEnv]); setNewEnv(null) } }}>
                          Ajouter
                        </button>
                        <button className="btn btn-secondary" onClick={() => setNewEnv(null)}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setNewEnv({ name: '', db_url: '', branch: '' })}
                      style={{ fontSize: 12, color: t.action, background: 'none', border: `1px dashed ${t.border}`, borderRadius: t.radius, padding: '6px 14px', cursor: 'pointer', width: '100%' }}>
                      + Ajouter un environnement
                    </button>
                  )}
                </div>

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
              onUpdateEnvs={(envs) => updateProfile(p.id, { environments: JSON.stringify(envs) })
                .then(() => qc.invalidateQueries({ queryKey: ['profiles'] }))}
              onSelectCompany={(companyId) => updateProfile(p.id, { selected_company_id: companyId })
                .then(() => qc.invalidateQueries({ queryKey: ['profiles'] }))} />
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

function ProjectCard({ profile, onTest, onDelete, onEdit, onUpdateEnvs, onSelectCompany }: {
  profile: Profile; onTest: () => void; onDelete: () => void; onEdit: () => void
  onUpdateEnvs: (envs: Env[]) => void
  onSelectCompany: (companyId: number) => void
}) {
  const ghUrl = profile.github_repo ? `https://github.com/${profile.github_repo}` : null
  const [envs, setEnvs] = useState<Env[]>(() => { try { return JSON.parse(profile.environments ?? '[]') } catch { return [] } })
  const companies: CompanyOption[] = (() => { try { return JSON.parse(profile.company_ids ?? '[]') } catch { return [] } })()
  const [addingEnv, setAddingEnv] = useState(false)
  const [newEnv, setNewEnv] = useState<Env>({ name: '', db_url: '', branch: '' })

  const { data: appsData } = useQuery({
    queryKey: ['profile-apps', profile.id],
    queryFn: () => getProfileApps(profile.id),
    staleTime: 300_000,
    retry: false,
  })
  const apps: { name: string; shortdesc: string }[] = appsData?.data?.apps ?? []

  const saveEnv = () => {
    if (!newEnv.name || !newEnv.db_url) return
    const updated = [...envs, newEnv]
    setEnvs(updated)
    onUpdateEnvs(updated)
    setNewEnv({ name: '', db_url: '', branch: '' })
    setAddingEnv(false)
  }

  const removeEnv = (i: number) => {
    const updated = envs.filter((_, j) => j !== i)
    setEnvs(updated)
    onUpdateEnvs(updated)
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
      background: t.white, borderRadius: t.radiusLg,
      border: `1px solid ${t.border}`, boxShadow: t.shadow,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Coloured top bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${t.brand}, ${t.action})` }} />

      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Identity row ── */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Logo / icon */}
          <div style={{ flexShrink: 0 }}>
            {profile.company_logo
              ? <img src={profile.company_logo} alt="logo" style={{
                  width: 48, height: 48, objectFit: 'contain', borderRadius: 8,
                  background: t.bgMuted, border: `1px solid ${t.border}`, padding: 4,
                }} />
              : <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: t.brand20, border: `1px solid ${t.brand40}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>🏢</div>
            }
          </div>

          {/* Name + badges */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 3, lineHeight: 1.2 }}>{profile.name}</div>
            {profile.company_name && (
              <div style={{ fontSize: 12, color: t.textSub, marginBottom: 5 }}>
                {profile.company_name}{profile.company_city ? `, ${profile.company_city}` : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {profile.odoo_version && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: t.brand, borderRadius: 4, padding: '2px 8px' }}>
                  Odoo {profile.odoo_version}
                </span>
              )}
              {keyExpiry && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: keyExpiry.color, borderRadius: 4, padding: '2px 8px' }}
                  title={profile.api_key_expires}>{keyExpiry.label}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── App badges ── */}
        {apps.length > 0 && <AppBadges apps={apps} max={6} />}

        {/* ── Default company (multi-company) ── */}
        {companies.length > 1 && (
          <div style={{ background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '8px 10px' }}>
            <p className="label-section" style={{ marginBottom: 6 }}>
              Société par défaut dans l'Assistant IA
            </p>
            <div style={{ fontSize: 11, color: t.muted, marginBottom: 6 }}>
              Les requêtes seront filtrées sur cette société.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {companies.map(c => {
                const isActive = (profile.selected_company_id ?? companies[0]?.id) === c.id
                return (
                  <button key={c.id} onClick={() => onSelectCompany(c.id)} style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4,
                    border: `1px solid ${isActive ? t.brand : t.border}`,
                    background: isActive ? t.brand : t.bgCard,
                    color: isActive ? '#fff' : t.textSub,
                    cursor: 'pointer', transition: 'all .15s',
                  }}>
                    {isActive ? '✓ ' : ''}{c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Connection info ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <a href={profile.db_url} target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
            background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radius,
            fontSize: 11, color: t.action, textDecoration: 'none', fontWeight: 600,
            overflow: 'hidden',
          }}>
            <span>🌐</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.db_url.replace(/^https?:\/\//, '')}
            </span>
          </a>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
            background: t.bgMuted, border: `1px solid ${t.border}`, borderRadius: t.radius,
            fontSize: 11, color: t.textSub, overflow: 'hidden',
          }}>
            <span>👤</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.login}</span>
          </div>
        </div>

        {/* ── Environments ── */}
        {(envs.length > 0 || addingEnv) && (
          <div>
            {envs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: addingEnv ? 8 : 0 }}>
                {envs.map((env, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <a href={env.db_url} target="_blank" rel="noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: '4px 0 0 4px',
                      border: `1px solid ${t.border}`, background: t.bgMuted,
                      color: t.textSub, fontSize: 11, fontWeight: 600, textDecoration: 'none',
                    }}>
                      🌿 {env.name}
                      {env.branch && <span style={{ color: t.muted, fontFamily: 'monospace', fontSize: 10 }}>({env.branch})</span>}
                    </a>
                    <button onClick={() => removeEnv(i)} style={{
                      padding: '3px 6px', fontSize: 12, background: t.bgMuted,
                      border: `1px solid ${t.border}`, borderLeft: 'none',
                      borderRadius: '0 4px 4px 0', cursor: 'pointer', color: t.muted, lineHeight: 1,
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {addingEnv && (
              <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: t.radius, padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 6, marginBottom: 8 }}>
                  <input placeholder="Nom" value={newEnv.name}
                    onChange={e => setNewEnv(p => ({ ...p, name: e.target.value }))}
                    style={{ ...styles.input, fontSize: 12, padding: '5px 8px' }} />
                  <input placeholder="URL" value={newEnv.db_url}
                    onChange={e => setNewEnv(p => ({ ...p, db_url: e.target.value }))}
                    style={{ ...styles.input, fontSize: 12, padding: '5px 8px' }} />
                  <input placeholder="Branche" value={newEnv.branch}
                    onChange={e => setNewEnv(p => ({ ...p, branch: e.target.value }))}
                    style={{ ...styles.input, fontSize: 12, padding: '5px 8px' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" onClick={saveEnv} disabled={!newEnv.name || !newEnv.db_url}>Ajouter</button>
                  <button className="btn btn-secondary" onClick={() => setAddingEnv(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer actions ── */}
        <div style={{
          marginTop: 'auto', paddingTop: 10, borderTop: `1px solid ${t.borderLight}`,
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* Quick links */}
          {profile.odoo_sh_url && <QuickLink href={profile.odoo_sh_url} label="Odoo.sh" icon="☁" color={t.brand} />}
          {ghUrl && <QuickLink href={ghUrl} label="GitHub" icon="🐙" color="#24292f" />}
          <button onClick={() => setAddingEnv(a => !a)} style={{
            fontSize: 11, color: t.muted, background: 'none',
            border: `1px dashed ${t.border}`, borderRadius: t.radius,
            padding: '3px 9px', cursor: 'pointer',
          }}>+ env</button>

          <div style={{ flex: 1 }} />

          <button className="btn btn-outline" onClick={onEdit}>✏ Modifier</button>
          <button className="btn btn-outline" onClick={onTest}>Tester</button>
          <button className="btn btn-outline-danger" onClick={onDelete}>Supprimer</button>
        </div>

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
