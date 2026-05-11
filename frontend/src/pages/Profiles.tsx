import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProfiles, createProfile, deleteProfile, testProfile, detectOdooInfo } from '../api/client'
import { t } from '../theme'

interface Profile {
  id: number; name: string; db_url: string; db_name: string
  login: string; odoo_version?: string; odoo_sh_url?: string; github_repo?: string
}
interface DetectResult { odoo_version?: string; module_count?: number; uid?: number }

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
  { n: 1, label: 'Nommez le projet' },
  { n: 2, label: 'Connexion Odoo' },
  { n: 3, label: 'Options GitHub' },
]

export default function Profiles() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const profiles: Profile[] = data?.data ?? []

  const [showWizard, setShowWizard] = useState(false)
  const [step,       setStep]       = useState(1)
  const [form,       setForm]       = useState<FormState>(EMPTY)
  const [detected,   setDetected]   = useState<DetectResult | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const detect = useMutation({
    mutationFn: () => detectOdooInfo({
      db_url: form.db_url, db_name: form.db_name,
      login: form.login, api_key: form.api_key,
    }),
    onSuccess: (res) => {
      const d: DetectResult = res.data
      setDetected(d)
      if (d.odoo_version) setForm(p => ({ ...p, odoo_version: d.odoo_version! }))
      notify(`Odoo ${d.odoo_version ?? '?'} détecté — ${d.module_count} modules installés`)
    },
    onError: (e: ApiError) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const create = useMutation({
    mutationFn: () => createProfile(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setShowWizard(false); setStep(1); setForm(EMPTY); setDetected(null)
      notify('Projet ajouté avec succès !')
    },
    onError: (e: ApiError) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); notify('Projet supprimé') },
  })

  const test = useMutation({
    mutationFn: (id: number) => testProfile(id),
    onSuccess: (res) => notify(`Connexion réussie (uid=${res.data.uid}) ✓`),
    onError: (e: ApiError) => notify(e.response?.data?.detail ?? e.message, false),
  })

  const canNext = step === 1
    ? form.name.trim() !== '' && form.db_url.trim() !== ''
    : step === 2
    ? form.db_name.trim() !== '' && form.login.trim() !== '' && form.api_key.trim() !== ''
    : true

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Mes projets Odoo.sh</h1>
          <p style={{ fontSize: 14, color: t.muted }}>Gérez vos connexions aux instances Odoo de vos clients.</p>
        </div>
        <button onClick={() => { setShowWizard(true); setStep(1) }} style={btnAction}>
          + Nouveau projet
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 1000,
          background: toast.ok ? t.success : t.danger,
          color: '#fff', padding: '10px 18px', borderRadius: t.radius,
          boxShadow: t.shadowMd, fontSize: 13, fontWeight: 600,
        }}>
          {toast.ok ? '✓ ' : '⚠ '}{toast.msg}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <div style={modalOverlay}>
          <div style={modalBox}>
            {/* Step pills */}
            <div style={{ display: 'flex', marginBottom: 28, borderBottom: `1px solid ${t.border}`, paddingBottom: 20 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 5 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: s.n < step ? t.success : s.n === step ? t.brand : t.borderLight,
                      color: s.n <= step ? '#fff' : t.muted,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, transition: 'background .2s',
                    }}>
                      {s.n < step ? '✓' : s.n}
                    </div>
                    <div style={{ fontSize: 11, color: s.n === step ? t.brand : t.muted, fontWeight: s.n === step ? 600 : 400, textAlign: 'center' }}>
                      {s.label}
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ height: 1, flex: 0.4, background: step > s.n ? t.success : t.border, alignSelf: 'flex-start', marginTop: 14 }} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1 */}
            {step === 1 && (
              <div>
                <h2 style={stepTitle}>Identifiez le projet</h2>
                <Field label="Nom du projet" hint="Ex : Client ABC — Production">
                  <input style={inputSt} value={form.name} onChange={set('name')} placeholder="Mon client Odoo" autoFocus />
                </Field>
                <Field label="URL de l'instance Odoo" hint="L'adresse complète, ex : https://monprojet.odoo.com">
                  <input style={inputSt} value={form.db_url} onChange={set('db_url')} placeholder="https://monprojet.odoo.com" />
                </Field>
                <Field label="URL du tableau de bord Odoo.sh" hint="Optionnel — lien vers votre espace Odoo.sh" optional>
                  <input style={inputSt} value={form.odoo_sh_url} onChange={set('odoo_sh_url')} placeholder="https://www.odoo.sh/project/…" />
                </Field>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div>
                <h2 style={stepTitle}>Connexion à la base de données</h2>
                <Field label="Nom de la base de données" hint="Paramètres Odoo → Technique → Base de données">
                  <input style={inputSt} value={form.db_name} onChange={set('db_name')} placeholder="ma-base" autoFocus />
                </Field>
                <Field label="Identifiant de connexion" hint="Votre email ou login administrateur">
                  <input style={inputSt} value={form.login} onChange={set('login')} placeholder="admin@monentreprise.com" />
                </Field>
                <Field label="Clé API" hint="">
                  <input style={inputSt} type="password" value={form.api_key} onChange={set('api_key')} placeholder="••••••••••••••••" />
                  <a href="https://www.odoo.com/documentation/17.0/developer/reference/external_api.html#api-keys"
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: t.action, display: 'block', marginTop: 5 }}>
                    Comment créer une clé API ? →
                  </a>
                </Field>

                {/* Auto-detect */}
                <div style={{ background: t.bg, borderRadius: t.radius, padding: '12px 14px', marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: t.text }}>Détection automatique</div>
                  <div style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>
                    Cliquez pour que le portail se connecte et détecte la version Odoo et les modules installés.
                  </div>
                  <button
                    onClick={() => detect.mutate()}
                    disabled={!form.db_name || !form.login || !form.api_key || detect.isPending}
                    style={btnDetect(!form.db_name || !form.login || !form.api_key || detect.isPending)}
                  >
                    {detect.isPending ? '⟳ Détection…' : '🔍 Détecter la version et les modules'}
                  </button>
                  {detected && (
                    <div style={{ marginTop: 10, fontSize: 12, color: t.success }}>
                      ✓ Odoo <strong>{detected.odoo_version}</strong> — <strong>{detected.module_count}</strong> modules installés
                    </div>
                  )}
                </div>

                <Field label="Version Odoo" hint="Modifiez si la détection n'a pas fonctionné">
                  <select style={inputSt} value={form.odoo_version} onChange={set('odoo_version')}>
                    {VERSIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div>
                <h2 style={stepTitle}>Dépôt GitHub (optionnel)</h2>
                <p style={{ fontSize: 13, color: t.muted, marginBottom: 16 }}>
                  Si ce projet a un dépôt de modules personnalisés sur GitHub, renseignez-le pour accéder directement au code depuis le portail.
                </p>
                <Field label="Dépôt GitHub" hint="Ex : mon-org/mon-projet-odoo" optional>
                  <input style={inputSt} value={form.github_repo} onChange={set('github_repo')} placeholder="organisation/projet" />
                </Field>
                <Field label="Branche par défaut" hint="" optional>
                  <input style={inputSt} value={form.default_branch} onChange={set('default_branch')} placeholder="main" />
                </Field>

                {/* Summary card */}
                <div style={{ background: t.bg, borderRadius: t.radius, padding: '14px 16px', marginTop: 20, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 10, color: t.text }}>Récapitulatif</div>
                  <SummaryRow label="Projet"   value={form.name} />
                  <SummaryRow label="URL"      value={form.db_url} />
                  <SummaryRow label="Base"     value={form.db_name} />
                  <SummaryRow label="Version"  value={form.odoo_version} />
                  {form.github_repo && <SummaryRow label="GitHub" value={form.github_repo} />}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: `1px solid ${t.border}` }}>
              <button onClick={() => step === 1 ? setShowWizard(false) : setStep(s => s - 1)} style={btnSecondary}>
                {step === 1 ? 'Annuler' : '← Précédent'}
              </button>
              {step < 3 ? (
                <button disabled={!canNext} onClick={() => setStep(s => s + 1)} style={btnPrimary(!canNext)}>
                  Suivant →
                </button>
              ) : (
                <button disabled={create.isPending} onClick={() => create.mutate()} style={btnPrimary(create.isPending)}>
                  {create.isPending ? '⟳ Enregistrement…' : '✓ Enregistrer le projet'}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {profiles.map(p => (
            <ProjectCard key={p.id} profile={p} onTest={() => test.mutate(p.id)} onDelete={() => del.mutate(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function Field({ label, hint, children, optional }: { label: string; hint: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 4 }}>
        {label}{optional && <span style={{ color: t.muted, fontWeight: 400 }}> (optionnel)</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
      <span style={{ color: t.muted, minWidth: 60, fontSize: 12 }}>{label}</span>
      <span style={{ color: t.text, fontWeight: 500, fontSize: 12 }}>{value}</span>
    </div>
  )
}

function ProjectCard({ profile, onTest, onDelete }: { profile: Profile; onTest: () => void; onDelete: () => void }) {
  const ghUrl = profile.github_repo ? `https://github.com/${profile.github_repo}` : null

  return (
    <div style={{
      background: t.white, border: `1px solid ${t.border}`,
      borderRadius: t.radiusLg, padding: 20, boxShadow: t.shadow,
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{profile.name}</div>
          {profile.odoo_version && (
            <span style={{
              fontSize: 11, background: t.brand, color: '#fff',
              borderRadius: 3, padding: '1px 7px', display: 'inline-block', marginTop: 4,
            }}>Odoo {profile.odoo_version}</span>
          )}
        </div>
        <div style={{ width: 36, height: 36, background: t.bg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          🏢
        </div>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 12, color: t.muted, marginBottom: 3 }}>
        🔗 {profile.db_url}
      </div>
      <div style={{ fontSize: 12, color: t.muted, marginBottom: 14 }}>
        👤 {profile.login}
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <a href={profile.db_url} target="_blank" rel="noreferrer" style={chipLink(t.action)}>
          🌐 Ouvrir Odoo
        </a>
        {profile.odoo_sh_url && (
          <a href={profile.odoo_sh_url} target="_blank" rel="noreferrer" style={chipLink(t.brand)}>
            ☁ Odoo.sh
          </a>
        )}
        {ghUrl && (
          <a href={ghUrl} target="_blank" rel="noreferrer" style={chipLink('#24292f')}>
            🐙 GitHub
          </a>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button onClick={onTest}   style={btnSmall(t.action)}>Tester</button>
        <button onClick={onDelete} style={btnSmall(t.danger)}>Supprimer</button>
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      background: t.white, border: `2px dashed ${t.border}`,
      borderRadius: t.radiusLg, padding: '48px 24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
      <div style={{ fontWeight: 600, fontSize: 15, color: t.text, marginBottom: 6 }}>Aucun projet pour l'instant</div>
      <div style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>Ajoutez votre premier projet Odoo.sh pour commencer.</div>
      <button onClick={onAdd} style={btnAction}>+ Nouveau projet</button>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────

interface ApiError { response?: { data?: { detail?: string } }; message: string }

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 500, padding: 16,
}
const modalBox: React.CSSProperties = {
  background: t.white, borderRadius: t.radiusLg, padding: 32,
  width: '100%', maxWidth: 520, boxShadow: '0 8px 32px rgba(0,0,0,.2)',
  maxHeight: '92vh', overflowY: 'auto',
}
const stepTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 20 }
const inputSt: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  border: `1px solid ${t.border}`, borderRadius: t.radius,
  fontSize: 13, color: t.text, background: t.white, outline: 'none',
}
const btnAction: React.CSSProperties = {
  padding: '9px 18px', background: t.action, color: '#fff',
  border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', background: 'transparent', color: t.muted,
  border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, cursor: 'pointer',
}
function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 20px', background: disabled ? t.muted : t.brand, color: '#fff',
    border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
function btnDetect(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', background: disabled ? t.borderLight : t.action, color: disabled ? t.muted : '#fff',
    border: `1px solid ${disabled ? t.border : t.action}`, borderRadius: t.radius,
    fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
function btnSmall(color: string): React.CSSProperties {
  return {
    padding: '5px 12px', background: 'transparent',
    border: `1px solid ${color}`, color, borderRadius: t.radius,
    fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }
}
function chipLink(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', border: `1px solid ${color}20`,
    background: `${color}10`, color, borderRadius: 3,
    fontSize: 12, fontWeight: 600, textDecoration: 'none',
  }
}
