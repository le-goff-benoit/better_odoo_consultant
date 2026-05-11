import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { syncSource, testGithubSsh, listSshKeys, generateSshKey } from '../api/client'
import { t } from '../theme'

const VERSIONS = [
  { version: '19.0', label: 'Odoo 19', badge: 'Nouveau', badgeColor: t.action },
  { version: '18.0', label: 'Odoo 18', badge: 'Stable',  badgeColor: t.success },
  { version: '17.0', label: 'Odoo 17', badge: 'LTS',     badgeColor: t.brand },
  { version: '16.0', label: 'Odoo 16', badge: '',         badgeColor: '' },
  { version: '15.0', label: 'Odoo 15', badge: '',         badgeColor: '' },
]

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error'

const defaultPath = (version: string) => `~/odoo-sources/${version}`

export default function Sources() {
  const [statuses,    setStatuses]    = useState<Record<string, SyncStatus>>({})
  const [messages,    setMessages]    = useState<Record<string, string>>({})
  const [customPaths, setCustomPaths] = useState<Record<string, string>>({})
  const [expanded,    setExpanded]    = useState<string | null>(null)
  const [enterprise,  setEnterprise]  = useState<Record<string, boolean>>({})

  // SSH state
  const [sshStep,    setSshStep]    = useState<'idle' | 'generating' | 'done'>('idle')
  const [publicKey,  setPublicKey]  = useState('')
  const [copied,     setCopied]     = useState(false)

  const { data: sshData,  refetch: recheckSsh } = useQuery({
    queryKey: ['github-ssh'], queryFn: testGithubSsh, retry: false,
  })
  const { data: keysData } = useQuery({
    queryKey: ['ssh-keys'], queryFn: listSshKeys, retry: false,
  })

  const sshOk:   boolean  = sshData?.data?.accessible === true
  const hasKeys: boolean  = (keysData?.data?.keys?.length ?? 0) > 0

  const genKey = useMutation({
    mutationFn: generateSshKey,
    onMutate:  () => setSshStep('generating'),
    onSuccess: (res) => {
      setSshStep('done')
      setPublicKey(res.data.public_key)
    },
    onError: () => setSshStep('idle'),
  })

  const sync = useMutation({
    mutationFn: ({ version, path, ent }: { version: string; path: string; ent: boolean }) =>
      syncSource({ version, path, community: true, enterprise: ent }),
    onMutate:  ({ version }) => setStatuses(s => ({ ...s, [version]: 'syncing' })),
    onSuccess: (res, { version }) => {
      setStatuses(s => ({ ...s, [version]: 'done' }))
      const r = res.data.results[0]
      setMessages(m => ({ ...m, [version]: r.action === 'cloned' ? 'Téléchargé avec succès' : 'Mis à jour' }))
    },
    onError: (e: ApiError, { version }) => {
      setStatuses(s => ({ ...s, [version]: 'error' }))
      setMessages(m => ({ ...m, [version]: e.response?.data?.detail ?? e.message }))
    },
  })

  const copyKey = () => {
    navigator.clipboard.writeText(publicKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Sources Odoo</h1>
        <p style={{ fontSize: 14, color: t.muted }}>
          Téléchargez les sources Odoo sur votre ordinateur pour les consulter localement.
        </p>
      </div>

      {/* ── SSH section ─────────────────────────────────────── */}
      {sshOk ? (
        <div style={banner(t.success)}>
          <span style={{ fontSize: 18 }}>🔑</span>
          <div>
            <strong>Accès SSH GitHub disponible</strong>
            <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
              Vous pouvez télécharger Odoo Enterprise en plus de la version Community.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...banner(t.warning), flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <div style={{ flex: 1 }}>
              <strong>Pas d'accès SSH à GitHub détecté</strong>
              <div style={{ fontSize: 13, color: t.muted, marginTop: 2 }}>
                {hasKeys
                  ? 'Une clé SSH existe mais n'est pas encore autorisée sur GitHub. Suivez les étapes ci-dessous.'
                  : 'Aucune clé SSH trouvée. Créez-en une pour pouvoir télécharger Odoo Enterprise.'}
              </div>
            </div>
            {sshStep === 'idle' && (
              <button onClick={() => genKey.mutate()} style={btnTeal}>
                {hasKeys ? 'Voir ma clé SSH' : '+ Créer une clé SSH'}
              </button>
            )}
          </div>

          {/* Step-by-step SSH guide */}
          {sshStep === 'generating' && (
            <div style={{ marginTop: 16, fontSize: 13, color: t.muted }}>Génération en cours…</div>
          )}

          {sshStep === 'done' && (
            <div style={{ marginTop: 20 }}>
              <div style={sshCard}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: t.text }}>
                  Ajoutez votre clé SSH à GitHub — 3 étapes
                </div>

                <Step n={1} title="Copiez votre clé publique">
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <textarea
                      readOnly value={publicKey}
                      style={{
                        width: '100%', height: 72, resize: 'none', fontFamily: 'monospace',
                        fontSize: 11, padding: '8px 10px', background: '#f8f8f8',
                        border: `1px solid ${t.border}`, borderRadius: t.radius, color: t.text,
                      }}
                    />
                    <button onClick={copyKey} style={{
                      position: 'absolute', top: 8, right: 8,
                      padding: '4px 10px', fontSize: 11, background: copied ? t.success : t.brand,
                      color: '#fff', border: 'none', borderRadius: t.radiusSm, cursor: 'pointer',
                    }}>
                      {copied ? '✓ Copié !' : 'Copier'}
                    </button>
                  </div>
                </Step>

                <Step n={2} title="Ouvrez les paramètres SSH de GitHub">
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Cliquez sur ce lien pour ouvrir directement la bonne page :{' '}
                    <a
                      href="https://github.com/settings/ssh/new"
                      target="_blank" rel="noreferrer"
                      style={{ color: t.action, fontWeight: 600 }}
                    >
                      github.com/settings/ssh/new →
                    </a>
                  </div>
                </Step>

                <Step n={3} title='Collez la clé et cliquez "Add SSH key"'>
                  <div style={{ marginTop: 6, fontSize: 13, color: t.muted }}>
                    Dans le champ <strong>Title</strong>, mettez par exemple <em>"Odoo Portal"</em>,
                    puis collez la clé dans le champ <strong>Key</strong>.
                  </div>
                </Step>

                <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={() => recheckSsh()} style={btnTeal}>
                    J'ai ajouté la clé — vérifier l'accès
                  </button>
                  <span style={{ fontSize: 12, color: t.muted }}>
                    Le bouton vérifiera la connexion SSH automatiquement.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Version cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 16 }}>
        {VERSIONS.map(({ version, label, badge, badgeColor }) => {
          const status: SyncStatus = statuses[version] ?? 'idle'
          const msg  = messages[version] ?? ''
          const path = customPaths[version] || defaultPath(version)
          const ent  = enterprise[version] ?? false
          const open = expanded === version

          return (
            <div key={version} style={versionCard(status)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: t.text }}>{label}</div>
                  {badge && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#fff', background: badgeColor,
                      borderRadius: 3, padding: '1px 7px', marginTop: 4, display: 'inline-block',
                    }}>{badge}</span>
                  )}
                </div>
                <StatusDot status={status} />
              </div>

              {msg && (
                <div style={{
                  fontSize: 12, marginBottom: 10,
                  color: status === 'error' ? t.danger : t.success,
                  background: status === 'error' ? '#fff5f5' : '#f0fff4',
                  padding: '5px 10px', borderRadius: t.radiusSm,
                }}>
                  {status === 'error' ? '⚠ ' : '✓ '}{msg}
                </div>
              )}

              {sshOk && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={ent}
                    onChange={e => setEnterprise(p => ({ ...p, [version]: e.target.checked }))}
                    style={{ accentColor: t.brand, width: 14, height: 14 }}
                  />
                  <span style={{ color: t.muted }}>Inclure Enterprise</span>
                </label>
              )}

              <button
                onClick={() => setExpanded(open ? null : version)}
                style={{ background: 'none', border: 'none', color: t.action, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: open ? 8 : 10 }}
              >
                {open ? '▲ Masquer' : '▼ Options avancées'}
              </button>

              {open && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 12, color: t.muted, marginBottom: 4 }}>Dossier</label>
                  <input
                    value={customPaths[version] ?? ''}
                    placeholder={defaultPath(version)}
                    onChange={e => setCustomPaths(p => ({ ...p, [version]: e.target.value }))}
                    style={inputSt}
                  />
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 3 }}>Par défaut : {defaultPath(version)}</div>
                </div>
              )}

              <button
                disabled={status === 'syncing'}
                onClick={() => sync.mutate({ version, path, ent })}
                style={btnDownload(status === 'syncing')}
              >
                {status === 'syncing'
                  ? '⟳ Téléchargement…'
                  : status === 'done'
                  ? '↺ Mettre à jour'
                  : '⬇ Télécharger'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────

interface ApiError { response?: { data?: { detail?: string } }; message: string }

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: t.action, color: '#fff', fontSize: 12,
        fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: t.text }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { icon: string; color: string }> = {
    idle:    { icon: '○', color: t.border },
    syncing: { icon: '◌', color: t.warning },
    done:    { icon: '●', color: t.success },
    error:   { icon: '✗', color: t.danger },
  }
  const { icon, color } = map[status]
  return <span style={{ fontSize: 18, color, fontWeight: 700 }}>{icon}</span>
}

function banner(color: string): React.CSSProperties {
  return {
    background: t.white, border: `1px solid ${color}`,
    borderLeft: `4px solid ${color}`, borderRadius: t.radius,
    padding: '14px 18px', marginBottom: 24, fontSize: 13,
    display: 'flex', alignItems: 'flex-start', gap: 12,
  }
}

function versionCard(status: SyncStatus): React.CSSProperties {
  return {
    background: t.white,
    border: `1px solid ${status === 'done' ? t.success : t.border}`,
    borderRadius: t.radiusLg, padding: 20,
    boxShadow: t.shadow, display: 'flex', flexDirection: 'column',
  }
}

const sshCard: React.CSSProperties = {
  background: '#fafafa', border: `1px solid ${t.border}`,
  borderRadius: t.radius, padding: '18px 20px', marginTop: 4,
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  border: `1px solid ${t.border}`, borderRadius: t.radius,
  fontSize: 13, color: t.text,
}

const btnTeal: React.CSSProperties = {
  padding: '7px 14px', background: t.action, color: '#fff',
  border: 'none', borderRadius: t.radius, fontSize: 12,
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
}

function btnDownload(disabled: boolean): React.CSSProperties {
  return {
    marginTop: 'auto', padding: '8px 0', width: '100%',
    background: disabled ? t.muted : t.action, color: '#fff',
    border: 'none', borderRadius: t.radius,
    fontWeight: 600, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
