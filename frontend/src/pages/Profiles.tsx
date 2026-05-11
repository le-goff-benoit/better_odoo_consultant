import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProfiles, createProfile, deleteProfile, testProfile, diagnoseOdoo } from '../api/client'
import { t } from '../theme'

interface Profile {
  id: number; name: string; db_url: string; db_name: string
  login: string; odoo_version?: string; odoo_sh_url?: string; github_repo?: string
}
interface DiagStep { name: string; ok: boolean; detail: string }
interface DiagResult {
  steps: DiagStep[]; uid: number | null; odoo_version: string | null
  module_count: number; db_name_suggestion: string
}

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
  const [step,       setStep]       = useState(1)
  const [form,       setForm]       = useState<FormState>(EMPTY)
  const [diag,       setDiag]       = useState<DiagResult | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 5000)
  }

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

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
    },
  })

  const create = useMutation({
    mutationFn: () => createProfile(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setShowWizard(false); setStep(1); setForm(EMPTY); setDiag(null)
      notify('Projet ajouté avec succès !')
    },
    onError: (e: ApiErr) =>
      notify(e.response?.data?.detail ?? e.message, false),
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); notify('Projet supprimé') },
  })

  const testConn = useMutation({
    mutationFn: (id: number) => testProfile(id),
    onSuccess: () => notify('Connexion réussie ✓'),
    onError:   (e: ApiErr) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const canNext = step === 1
    ? form.name.trim() !== '' && form.db_url.trim() !== ''
    : step === 2
    ? form.db_name.trim() !== '' && form.login.trim() !== '' && form.api_key.trim() !== ''
    : true

  const diagOk = diag !== null && diag.uid !== null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={styles.h1}>Mes projets Odoo.sh</h1>
          <p style={styles.sub}>Gérez vos connexions aux instances Odoo de vos clients.</p>
        </div>
        <button onClick={() => { setShowWizard(true); setStep(1) }} style={styles.btnPrimary}>
          + Nouveau projet
        </button>
      </div>

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
                <Field label="Clé API" hint="">
                  <input style={styles.input} type="password" value={form.api_key}
                    onChange={set('api_key')} placeholder="••••••••••••••••••••" />
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
                      marginTop: 12, padding: '8px 12px',
                      background: `${t.success}18`, border: `1px solid ${t.success}40`,
                      borderRadius: t.radius, fontSize: 13, color: t.success, fontWeight: 600,
                    }}>
                      ✓ Connexion réussie — Odoo {diag!.odoo_version} · {diag!.module_count} modules
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
              <button
                onClick={() => step === 1 ? (setShowWizard(false), setDiag(null)) : setStep(s => s - 1)}
                style={styles.btnSecondary}
              >
                {step === 1 ? 'Annuler' : '← Retour'}
              </button>
              {step < 3 ? (
                <button disabled={!canNext} onClick={() => setStep(s => s + 1)}
                  style={{ ...styles.btnPrimary, opacity: canNext ? 1 : .5, cursor: canNext ? 'pointer' : 'not-allowed' }}>
                  Suivant →
                </button>
              ) : (
                <button disabled={create.isPending} onClick={() => create.mutate()}
                  style={{ ...styles.btnPrimary, background: t.success }}>
                  {create.isPending ? '⟳ Enregistrement…' : '✓ Enregistrer'}
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
              onDelete={() => del.mutate(p.id)} />
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

function ProjectCard({ profile, onTest, onDelete }: {
  profile: Profile; onTest: () => void; onDelete: () => void
}) {
  const ghUrl = profile.github_repo ? `https://github.com/${profile.github_repo}` : null

  return (
    <div style={{
      background: t.white, borderRadius: t.radiusLg,
      border: `1px solid ${t.border}`, boxShadow: t.shadow,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Coloured top bar */}
      <div style={{ height: 4, background: `linear-gradient(90deg, ${t.brand}, ${t.action})` }} />

      <div style={{ padding: '18px 20px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: t.text, marginBottom: 4 }}>{profile.name}</div>
            {profile.odoo_version && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#fff',
                background: t.brand, borderRadius: 3, padding: '2px 8px',
              }}>Odoo {profile.odoo_version}</span>
            )}
          </div>
          <div style={{ fontSize: 24 }}>🏢</div>
        </div>

        <div style={{ fontSize: 12, color: t.muted, marginBottom: 3 }}>🔗 {profile.db_url}</div>
        <div style={{ fontSize: 12, color: t.muted, marginBottom: 14 }}>👤 {profile.login}</div>

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <QuickLink href={profile.db_url} label="Ouvrir Odoo" icon="🌐" color={t.action} />
          {profile.odoo_sh_url && <QuickLink href={profile.odoo_sh_url} label="Odoo.sh" icon="☁" color={t.brand} />}
          {ghUrl && <QuickLink href={ghUrl} label="GitHub" icon="🐙" color="#24292f" />}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onTest}   style={styles.btnOutline(t.action)}>Tester</button>
          <button onClick={onDelete} style={styles.btnOutline(t.danger)}>Supprimer</button>
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
      border: `1px solid ${color}30`, background: `${color}0d`,
      color, fontSize: 11, fontWeight: 600, textDecoration: 'none',
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
      <button onClick={onAdd} style={styles.btnPrimary}>+ Nouveau projet</button>
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
  btnPrimary: {
    padding: '9px 20px', background: t.action, color: '#fff',
    border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '8px 16px', background: 'transparent', color: t.muted,
    border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, cursor: 'pointer',
  } as React.CSSProperties,
  btnOutline: (color: string): React.CSSProperties => ({
    padding: '5px 12px', background: 'transparent',
    border: `1px solid ${color}`, color,
    borderRadius: t.radius, fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }),
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
