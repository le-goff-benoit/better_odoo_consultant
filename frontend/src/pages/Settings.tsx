import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Database, Eye, EyeOff, FileText, FolderOpen, KeyRound, LayoutPanelTop, Loader2, RefreshCw, Settings2, UserRound, X } from 'lucide-react'
import { getAiProviders, saveAiKey, deleteAiKey, testAiKey, copilotLogin, copilotPoll, listContextFiles, getContextFile, saveContextFile, deleteContextFile, getModelConfig, saveModelConfig, getUserProfile, saveUserProfile, getDataDir, openDataFolder } from '../api/client'
import RobotThinking from '../components/RobotThinking'
import CatThinking from '../components/CatThinking'
import DogThinking from '../components/DogThinking'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { applyBrandColor, applyThemeMode } from '../App'
import { WIDTH_OPTIONS, WIDTH_KEY, getStoredWidth, type ContentWidth } from '../components/Layout'
import { Tabs } from '../components/ui'

interface ProviderDef {
  id: string
  label: string
  color: string
  logoUrl: string
  placeholder: string
  docsUrl: string
  docsLabel: string
  description: string
  note?: string
  oauthFlow?: boolean
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    color: '#D97706',
    logoUrl: 'https://www.anthropic.com/favicon.ico',
    placeholder: 'sk-ant-api03-…',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com',
    description: 'Le meilleur pour l\'analyse de données complexes et les synthèses. Modèles : Opus (puissant), Sonnet (quotidien), Haiku (rapide).',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT-4o)',
    color: '#16A34A',
    logoUrl: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64',
    placeholder: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com',
    description: 'Très polyvalent. Modèles : GPT-4o (puissant), GPT-4o mini (économique), o1 mini (raisonnement).',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    color: '#2563EB',
    logoUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
    placeholder: 'AIzaSy…',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'aistudio.google.com',
    description: 'Idéal pour les très longs contextes. Modèles : 2.0 Flash (rapide), 1.5 Pro (long contexte).',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    color: '#24292f',
    logoUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    placeholder: 'ghp_… ou github_pat_…',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    description: 'Accès à GPT-4o, Claude, Llama, Mistral via votre compte GitHub. Inclus dans GitHub Free/Pro.',
    note: 'Token GitHub personnel (classic ou fine-grained). Permission "models: read" si fine-grained.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot Business',
    color: '#6e40c9',
    logoUrl: 'https://github.githubassets.com/favicons/favicon.svg',
    placeholder: '',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    description: 'Accès via votre abonnement Copilot Business/Enterprise. Modèles GPT-4o, Claude, o1 selon votre plan.',
    note: 'Expérimental — API non officielle. Requiert un abonnement Copilot Business/Enterprise actif.',
    oauthFlow: true,
  },
]

interface CopilotFlowState {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  status: 'waiting' | 'error'
  error?: string
}

type SettingsTab = 'profile' | 'api' | 'context' | 'interface' | 'storage'

export default function Settings() {
  const [tab, setTab] = useState<SettingsTab>('profile')

  const tabs = [
    { id: 'profile' as const,   label: 'Profil',      icon: <UserRound size={15} /> },
    { id: 'api' as const,       label: 'Clés API',    icon: <KeyRound size={15} /> },
    { id: 'context' as const,   label: 'Contexte IA', icon: <FileText size={15} /> },
    { id: 'interface' as const, label: 'Interface',   icon: <LayoutPanelTop size={15} /> },
    { id: 'storage' as const,   label: 'Stockage',    icon: <Database size={15} /> },
  ]

  return (
    <div className="page-stack">
      <PageHeader title="Paramètres" />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <section className="settings-panel">
          <p className="settings-intro">
            Personnalisez votre identité et l'apparence de l'interface. Le nom et le poste sont injectés dans le contexte de l'assistant IA.
          </p>
          <UserProfileEditor />
        </section>
      )}

      {tab === 'api' && <div className="settings-panel settings-panel-plain"><ApiSection /></div>}

      {tab === 'context' && (
        <section className="settings-panel settings-panel-plain">
          <p className="settings-intro">
            Ces fichiers Markdown sont injectés dans le prompt système de l'assistant. Modifiez-les pour adapter le contexte métier.
          </p>
          <ContextEditor />
        </section>
      )}

      {tab === 'interface' && <InterfaceSection />}

      {tab === 'storage' && <StorageSection />}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  )
}

// ── Storage section ───────────────────────────────────────────────

function StorageSection() {
  const { data } = useQuery({ queryKey: ['data-dir'], queryFn: getDataDir })
  const dataDir: string = data?.data?.path ?? '~/.odoo-consultant'

  const rows: { label: string; path: string; description: string }[] = [
    {
      label: 'Dossier principal',
      path: dataDir,
      description: 'Base de données, configuration, clés de chiffrement.',
    },
    {
      label: 'Sources Odoo',
      path: `${dataDir}/sources/`,
      description: 'Dépôts git des sources Community et Enterprise clonés localement.',
    },
    {
      label: 'Dépôts custom clients',
      path: `${dataDir}/repos/`,
      description: 'Dépôts GitHub des modules custom, un dossier par projet et environnement.',
    },
    {
      label: 'Contexte IA',
      path: `${dataDir}/context/`,
      description: 'Fichiers Markdown injectés dans le prompt système de l\'assistant.',
    },
    {
      label: 'Configuration modèles',
      path: `${dataDir}/model-config.json`,
      description: 'Modèles IA activés et préférences de sélection.',
    },
  ]

  return (
    <section className="settings-panel">
      <p style={{ fontSize: 13, color: t.muted, marginBottom: 24, lineHeight: 1.6 }}>
        Toutes les données locales sont centralisées dans un seul dossier. Vous pouvez le sauvegarder, le déplacer ou le supprimer sans toucher à l'application.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Contenu du dossier de données</div>
        <button
          onClick={() => openDataFolder()}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px',
            background: `var(--brand-10, ${t.brand}15)`,
            color: `var(--brand, ${t.brand})`,
            border: `1px solid var(--brand-40, ${t.brand}40)`,
            borderRadius: t.radius, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'filter .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
          onMouseLeave={e => (e.currentTarget.style.filter = '')}
        >
          <FolderOpen size={16} /> Ouvrir dans l'explorateur
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(row => (
          <div key={row.label} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '12px 16px', background: t.bgCard,
            border: `1px solid ${t.border}`, borderRadius: t.radius,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: t.text, marginBottom: 2 }}>{row.label}</div>
              <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>{row.description}</div>
              <code style={{
                fontSize: 11, color: t.muted, background: t.bgMuted,
                padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{row.path}</code>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 20, padding: '12px 16px', background: t.bgMuted,
        borderRadius: t.radius, fontSize: 12, color: t.muted, lineHeight: 1.6,
      }}>
        <strong style={{ color: t.text }}>Sécurité :</strong> Les clés API (Odoo et IA) sont stockées dans le keyring système (Keychain sur macOS, Secret Service sur Linux) — jamais dans ce dossier. La base de données ne contient que des métadonnées non sensibles.
      </div>
    </section>
  )
}

// ── Interface settings ────────────────────────────────────────────

function InterfaceSection() {
  const [currentWidth, setCurrentWidth] = useState<ContentWidth>(() => getStoredWidth())

  const applyWidth = (id: ContentWidth) => {
    localStorage.setItem(WIDTH_KEY, id)
    setCurrentWidth(id)
    window.dispatchEvent(new Event('app-width-change'))
  }

  return (
    <section className="settings-panel">
      <p className="settings-intro">
        Ajustez la largeur du contenu selon votre écran et vos préférences de lecture.
      </p>

      <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 14 }}>Largeur du contenu</div>

      <div className="settings-width-grid">
        {WIDTH_OPTIONS.map(opt => {
          const isActive = currentWidth === opt.id
          return (
            <button
              key={opt.id}
              onClick={() => applyWidth(opt.id)}
              className={`settings-width-option${isActive ? ' is-active' : ''}`}
            >
              {/* Width visualisation */}
              <div className="settings-width-preview">
                <div className="settings-width-preview-inner" style={{
                  width: opt.id === 'narrow' ? '55%' : opt.id === 'medium' ? '70%' : opt.id === 'wide' ? '85%' : '100%',
                }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? `var(--brand, ${t.brand})` : t.text }}>
                  {opt.label}
                </div>
                {opt.px > 0 && (
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{opt.px} px</div>
                )}
              </div>
              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px',
                  background: `var(--brand, ${t.brand})`, color: '#fff', borderRadius: 9999,
                }}>Actif</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── API keys + model config tab ───────────────────────────────────

function ApiSection() {
  const qc = useQueryClient()
  const { data: provData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const configured: Record<string, boolean> = provData?.data ?? {}

  const [keys,       setKeys]       = useState<Record<string, string>>({})
  const [editing,    setEditing]    = useState<Record<string, boolean>>({})
  const [showKey,    setShowKey]    = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({})
  const [testing,    setTesting]    = useState<Record<string, boolean>>({})
  const [copilotFlow, setCopilotFlow] = useState<CopilotFlowState | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const startCopilotLogin = async () => {
    setCopilotLoading(true)
    if (pollRef.current) clearInterval(pollRef.current)
    try {
      const res = await copilotLogin()
      const flow = res.data as { device_code: string; user_code: string; verification_uri: string; interval: number }
      setCopilotFlow({ ...flow, status: 'waiting' })
      window.open(flow.verification_uri, '_blank', 'noopener')
      pollRef.current = setInterval(async () => {
        try {
          const poll = await copilotPoll(flow.device_code)
          const st = poll.data.status as string
          if (st === 'ok') {
            clearInterval(pollRef.current!)
            setCopilotFlow(null)
            qc.invalidateQueries({ queryKey: ['ai-providers'] })
          } else if (st === 'expired_token') {
            clearInterval(pollRef.current!)
            setCopilotFlow(f => f ? { ...f, status: 'error', error: 'Code expiré. Recommencez.' } : null)
          } else if (st === 'access_denied') {
            clearInterval(pollRef.current!)
            setCopilotFlow(f => f ? { ...f, status: 'error', error: 'Accès refusé sur GitHub.' } : null)
          }
        } catch { /* keep polling */ }
      }, (flow.interval + 1) * 1000)
    } catch (e: any) {
      setCopilotFlow({ device_code: '', user_code: '', verification_uri: '', interval: 5, status: 'error', error: e.response?.data?.detail ?? e.message })
    } finally {
      setCopilotLoading(false)
    }
  }

  const runTest = async (provider: string) => {
    setTesting(p => ({ ...p, [provider]: true }))
    setTestResult(p => ({ ...p, [provider]: null }))
    try {
      const res = await testAiKey(provider)
      setTestResult(p => ({ ...p, [provider]: res.data }))
    } catch (e: any) {
      setTestResult(p => ({ ...p, [provider]: { ok: false, msg: e.response?.data?.detail ?? e.message } }))
    } finally {
      setTesting(p => ({ ...p, [provider]: false }))
    }
  }

  const save = useMutation({
    mutationFn: ({ provider, key }: { provider: string; key: string }) => saveAiKey(provider, key),
    onSuccess: (_, { provider }) => {
      qc.invalidateQueries({ queryKey: ['ai-providers'] })
      setEditing(p => ({ ...p, [provider]: false }))
      setKeys(p => ({ ...p, [provider]: '' }))
    },
  })

  const del = useMutation({
    mutationFn: (provider: string) => deleteAiKey(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  })

  const configuredList = PROVIDERS.filter(p => configured[p.id])
  const unconfiguredList = PROVIDERS.filter(p => !configured[p.id])

  return (
    <div>
      <p style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>
        Les clés sont stockées dans le trousseau système (keyring) — jamais en clair dans la base de données.
      </p>

      {configuredList.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.success, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            Configurés ({configuredList.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {configuredList.map(p => renderProvider(p, true))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Ajouter un fournisseur
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unconfiguredList.map(p => renderProvider(p, false))}
        </div>
      </div>

      {configuredList.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Modèles disponibles
          </div>
          <p style={{ fontSize: 13, color: t.muted, marginBottom: 16 }}>
            Masquez les modèles non inclus dans votre abonnement.
          </p>
          <ModelConfigEditor configuredProviderIds={configuredList.map(p => p.id)} />
        </div>
      )}
    </div>
  )

  function renderProvider(p: ProviderDef, isConfigured: boolean) {
    const isEditing = editing[p.id] ?? false
    const keyVal    = keys[p.id] ?? ''



            return (
              <div key={p.id} style={{
                background: t.bgCard, border: `1px solid ${isConfigured ? `${t.success}50` : t.border}`,
                borderRadius: t.radiusLg, overflow: 'hidden',
              }}>
                <div style={{ height: 3, background: p.color }} />

                <div style={{ padding: '16px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                      <ProviderLogo logoUrl={p.logoUrl} label={p.label} color={p.color} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{p.label}</div>
                        <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.5 }}>{p.description}</div>
                        {p.note && (
                          <div style={{
                            marginTop: 6, fontSize: 11, color: t.warning,
                            background: t.warningBg, border: `1px solid ${t.warning}30`,
                            borderRadius: t.radiusSm, padding: '3px 8px', display: 'inline-block',
                          }}>
                            {p.note}
                          </div>
                        )}
                      </div>
                    </div>
                    <StatusBadge configured={isConfigured} />
                  </div>

                  {/* Actions */}
                  {isConfigured && !isEditing ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          onClick={() => runTest(p.id)}
                          disabled={testing[p.id]}
                          style={{ ...btnOutline(p.color), background: testing[p.id] ? `${p.color}10` : 'transparent' }}>
                          {testing[p.id] ? <Loader2 size={13} style={{ animation: 'spin .9s linear infinite' }} /> : <Settings2 size={13} />}
                          {testing[p.id] ? 'Test en cours…' : 'Tester la connexion'}
                        </button>
                        {p.oauthFlow ? (
                          <button onClick={() => { startCopilotLogin(); setEditing(e => ({ ...e, [p.id]: true })) }}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> Reconnecter
                          </button>
                        ) : (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: true }))}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> Remplacer
                          </button>
                        )}
                        <button onClick={() => { del.mutate(p.id); setTestResult(r => ({ ...r, [p.id]: null })) }}
                          style={btnOutline(t.danger)}>
                          Supprimer
                        </button>
                      </div>
                      {testResult[p.id] && (
                        <div style={{
                          marginTop: 8, padding: '7px 12px', borderRadius: t.radius, fontSize: 12,
                          background: testResult[p.id]!.ok ? `${t.success}12` : `${t.danger}10`,
                          border: `1px solid ${testResult[p.id]!.ok ? `${t.success}40` : `${t.danger}30`}`,
                          color: testResult[p.id]!.ok ? t.success : t.danger,
                          fontWeight: 500,
                        }}>
                          {testResult[p.id]!.ok ? <Check size={13} /> : <X size={13} />} {testResult[p.id]!.msg}
                        </div>
                      )}
                    </div>

                  ) : p.oauthFlow ? (
                    /* ── Copilot OAuth flow ── */
                    <div style={{ marginTop: 12 }}>
                      {!copilotFlow ? (
                        <button
                          onClick={startCopilotLogin}
                          disabled={copilotLoading}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '9px 18px', background: p.color, color: '#fff',
                            border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13,
                            cursor: copilotLoading ? 'default' : 'pointer', opacity: copilotLoading ? 0.7 : 1,
                          }}>
                          <GitHubIcon />
                          {copilotLoading ? 'Initialisation…' : 'Se connecter avec GitHub'}
                        </button>
                      ) : copilotFlow.status === 'error' ? (
                        <div>
                          <div style={{ padding: '8px 12px', borderRadius: t.radius, fontSize: 12, background: `${t.danger}10`, border: `1px solid ${t.danger}30`, color: t.danger, marginBottom: 8 }}>
                            <X size={13} /> {copilotFlow.error}
                          </div>
                          <button onClick={() => { setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                            style={btnOutline(t.muted)}>
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>
                            Entrez ce code sur GitHub — la page s'est ouverte dans un nouvel onglet :
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <div style={{
                              fontFamily: 'monospace', fontSize: 22, fontWeight: 700,
                              letterSpacing: '0.15em', color: p.color,
                              background: `${p.color}12`, border: `2px solid ${p.color}40`,
                              borderRadius: t.radius, padding: '8px 18px',
                            }}>
                              {copilotFlow.user_code}
                            </div>
                            <a href={copilotFlow.verification_uri} target="_blank" rel="noreferrer"
                              style={{ fontSize: 12, color: t.brand, fontWeight: 500 }}>
                              Ouvrir github.com/login/device →
                            </a>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.muted }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s infinite' }} />
                            En attente de votre validation…
                            <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                              style={{ marginLeft: 'auto', ...btnOutline(t.muted), padding: '3px 10px' }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  ) : (
                    /* ── Standard API key input ── */
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type={showKey[p.id] ? 'text' : 'password'}
                            placeholder={p.placeholder}
                            value={keyVal}
                            onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && keyVal.trim()) save.mutate({ provider: p.id, key: keyVal }) }}
                            autoFocus={isEditing}
                            style={{
                              width: '100%', padding: '8px 36px 8px 12px',
                              border: `1px solid ${t.border}`, borderRadius: t.radius,
                              fontSize: 13, color: t.text, boxSizing: 'border-box',
                            }}
                          />
                          <button onClick={() => setShowKey(s => ({ ...s, [p.id]: !s[p.id] }))}
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: t.muted, fontSize: 12 }}>
                            {showKey[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button
                          disabled={!keyVal.trim() || save.isPending}
                          onClick={() => save.mutate({ provider: p.id, key: keyVal })}
                          style={{
                            padding: '8px 16px', background: keyVal.trim() ? p.color : t.borderLight,
                            color: keyVal.trim() ? '#fff' : t.muted,
                            border: 'none', borderRadius: t.radius, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                          {save.isPending ? '…' : 'Sauvegarder'}
                        </button>
                        {isEditing && (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: false }))}
                            style={{ padding: '8px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, cursor: 'pointer', color: t.muted }}>
                            Annuler
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: t.muted }}>
                        Obtenez votre clé sur{' '}
                        <a href={p.docsUrl} target="_blank" rel="noreferrer" style={{ color: t.brand, fontWeight: 500 }}>
                          {p.docsLabel} →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
  } // end renderProvider
} // end ApiSection

// ── Model config editor ──────────────────────────────────────────

const ALL_MODELS: { provider: string; label: string; color: string; models: { id: string; label: string }[] }[] = [
  { provider: 'claude', label: 'Claude (Anthropic)', color: '#D97706', models: [
    { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
    { id: 'claude-opus-4-7',           label: 'Opus 4.7' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ]},
  { provider: 'openai', label: 'GPT-4o (OpenAI)', color: '#16A34A', models: [
    { id: 'gpt-4o',      label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'o1-mini',     label: 'o1 mini' },
  ]},
  { provider: 'gemini', label: 'Gemini (Google)', color: '#2563EB', models: [
    { id: 'gemini-2.0-flash', label: '2.0 Flash' },
    { id: 'gemini-1.5-pro',   label: '1.5 Pro' },
    { id: 'gemini-1.5-flash', label: '1.5 Flash' },
  ]},
  { provider: 'copilot', label: 'Copilot (GitHub)', color: '#6e40c9', models: [
    { id: 'gpt-4o',                     label: 'GPT-4o' },
    { id: 'gpt-4o-mini',                label: 'GPT-4o mini' },
    { id: 'gpt-5-mini',                 label: 'GPT-5 mini' },
    { id: 'gpt-5.2',                    label: 'GPT-5.2' },
    { id: 'gpt-5.4',                    label: 'GPT-5.4' },
    { id: 'gpt-5.2-codex',              label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.3-codex',              label: 'GPT-5.3 Codex' },
    { id: 'o1-mini',                    label: 'o1 mini' },
    { id: 'o3-mini',                    label: 'o3 mini' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5' },
    { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-5',            label: 'Claude Opus 4.5' },
    { id: 'claude-opus-4-6',            label: 'Claude Opus 4.6' },
    { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7' },
    { id: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5' },
    { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro' },
    { id: 'gemini-3.1-pro',             label: 'Gemini 3.1 Pro' },
    { id: 'gemini-3-flash',             label: 'Gemini 3 Flash' },
    { id: 'grok-code-fast-1',           label: 'Grok Code Fast' },
  ]},
  { provider: 'github', label: 'GitHub Models', color: '#24292f', models: [
    { id: 'gpt-4o',                        label: 'GPT-4o' },
    { id: 'gpt-4o-mini',                   label: 'GPT-4o mini' },
    { id: 'claude-3-5-sonnet-20241022',    label: 'Claude 3.5' },
    { id: 'claude-3-7-sonnet-20250219',    label: 'Claude 3.7' },
    { id: 'Llama-3.2-90B-Vision-Instruct', label: 'Llama 3.2 90B' },
    { id: 'Llama-3.1-405B-Instruct',       label: 'Llama 3.1 405B' },
    { id: 'mistral-large-2407',            label: 'Mistral Large' },
    { id: 'Phi-3.5-mini-instruct',         label: 'Phi-3.5 mini' },
  ]},
]

function ModelConfigEditor({ configuredProviderIds }: { configuredProviderIds: string[] }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })
  const [local, setLocal] = useState<Record<string, string[]>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLocal(data?.data ?? {}) }, [data])

  const visibleModels = ALL_MODELS.filter(p => configuredProviderIds.includes(p.provider))

  const toggle = (provider: string, modelId: string) => {
    setLocal(prev => {
      const providerModels = ALL_MODELS.find(p => p.provider === provider)!.models.map(m => m.id)
      const current: string[] = prev[provider] ?? providerModels
      const next = current.includes(modelId) ? current.filter(id => id !== modelId) : [...current, modelId]
      return { ...prev, [provider]: next }
    })
    setSaved(false)
  }

  const isEnabled = (provider: string, modelId: string) => {
    const providerModels = ALL_MODELS.find(p => p.provider === provider)!.models.map(m => m.id)
    return (local[provider] ?? providerModels).includes(modelId)
  }

  const handleSave = async () => {
    await saveModelConfig(local)
    qc.invalidateQueries({ queryKey: ['model-config'] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (visibleModels.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {visibleModels.map(prov => (
        <div key={prov.provider} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: prov.color, marginBottom: 8 }}>{prov.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {prov.models.map(m => {
              const on = isEnabled(prov.provider, m.id)
              return (
                <button key={m.id} onClick={() => toggle(prov.provider, m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px',
                  background: on ? `${prov.color}15` : t.bgMuted,
                  border: `1px solid ${on ? prov.color : t.border}`,
                  borderRadius: t.radiusFull,
                  fontSize: 11, fontWeight: on ? 600 : 400,
                  color: on ? prov.color : t.muted,
                  cursor: 'pointer', transition: 'all .15s',
                }}>
                  <span style={{ fontSize: 10 }}>{on ? <Check size={11} /> : null}</span>
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div>
        <button onClick={handleSave} style={{
          padding: '7px 18px', background: `var(--brand, ${t.brand})`, color: '#fff', border: 'none',
          borderRadius: t.radius, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {saved ? <Check size={13} /> : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

// ── Context files editor ─────────────────────────────────────────

const KNOWN_FILES = [
  { name: 'skills.md',          label: 'Compétences consultant', icon: '🧠', desc: 'Connaissances métier, patterns courants, approche de diagnostic' },
  { name: 'meeting-minute.md',  label: 'Modèle compte-rendu',   icon: '📝', desc: 'Template utilisé par le bouton "Meeting Minute" dans le chat' },
  { name: 'migration.md',       label: 'Méthodologie migration', icon: '⇄',  desc: 'Checklist et breaking changes injectés dans l\'assistant Migration' },
  { name: 'studio.md',          label: 'Inspection Studio',      icon: '🎨', desc: 'Guide d\'interprétation des personnalisations Studio (modèles, champs, vues, automatisations)' },
  { name: 'odoo-19.0.md',       label: 'Odoo 19.0',  icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés' },
  { name: 'odoo-18.0.md',       label: 'Odoo 18.0',  icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés' },
  { name: 'odoo-17.0.md',       label: 'Odoo 17.0',  icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés' },
  { name: 'odoo-16.0.md',       label: 'Odoo 16.0',  icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés' },
  { name: 'odoo-15.0.md',       label: 'Odoo 15.0',  icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés' },
]

function ContextEditor() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState('skills.md')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Include intermediate/custom versions from Sources page
  const customVersions: string[] = (() => { try { return JSON.parse(localStorage.getItem('odoo-custom-versions') ?? '[]') } catch { return [] } })()
  const allFiles = [
    ...KNOWN_FILES,
    ...customVersions
      .filter(v => !KNOWN_FILES.some(f => f.name === `odoo-${v}.md`))
      .sort((a, b) => {
        const [aMaj, aMin = 0] = a.split('.').map(Number)
        const [bMaj, bMin = 0] = b.split('.').map(Number)
        return bMaj !== aMaj ? bMaj - aMaj : bMin - aMin
      })
      .map(v => ({ name: `odoo-${v}.md`, label: `Odoo ${v}`, icon: '📋', desc: 'Notes de version intermédiaire' })),
  ]

  const { data: filesData } = useQuery({ queryKey: ['context-files'], queryFn: listContextFiles })
  const existingNames: string[] = (filesData?.data ?? []).map((f: { name: string }) => f.name)

  useEffect(() => {
    setDirty(false)
    setSaved(false)
    getContextFile(selected)
      .then(res => setContent(res.data.content))
      .catch(() => setContent(''))
  }, [selected])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContextFile(selected, content)
      setDirty(false)
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['context-files'] })
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(`Réinitialiser "${selected}" au contenu par défaut ? Vos modifications seront perdues.`)) return
    await deleteContextFile(selected)
    qc.invalidateQueries({ queryKey: ['context-files'] })
    const res = await getContextFile(selected)
    setContent(res.data.content)
    setDirty(false)
  }

  const isCustomized = existingNames.includes(selected)
  const currentFile = allFiles.find(f => f.name === selected)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* File list */}
      <div style={{ width: 200, flexShrink: 0 }}>
        {allFiles.map(f => {
          const exists = existingNames.includes(f.name)
          const isActive = f.name === selected
          return (
            <button key={f.name} onClick={() => { if (dirty && !confirm('Modifications non sauvegardées. Continuer ?')) return; setSelected(f.name) }} style={{
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 4,
              background: isActive ? t.brand10 : 'transparent',
              border: `1px solid ${isActive ? t.brand40 : t.border}`,
              borderRadius: t.radius, cursor: 'pointer',
              transition: 'all .15s',
            }}>
              <span style={{ fontSize: 14 }}>{f.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? t.brand : t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 10, color: t.muted }}>
                  {exists ? '✓ Personnalisé' : '○ Par défaut'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{currentFile?.label ?? selected}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{currentFile?.desc}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: 11, color: t.warning }}>● Non sauvegardé</span>}
            {isCustomized && !dirty && (
              <button onClick={handleReset} style={{
                padding: '5px 10px', background: 'transparent',
                border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 11, color: t.muted, cursor: 'pointer',
              }} title="Revenir au contenu par défaut">
                ↺ Réinitialiser
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                padding: '6px 16px', background: dirty ? t.brand : t.borderLight,
                color: dirty ? '#fff' : t.muted,
                border: 'none', borderRadius: t.radius, fontSize: 12, fontWeight: 600,
                cursor: dirty ? 'pointer' : 'default',
              }}>
              {saving ? '…' : saved ? '✓ Sauvegardé' : 'Sauvegarder'}
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={e => { setContent(e.target.value); setDirty(true) }}
          spellCheck={false}
          style={{
            width: '100%', height: 480, padding: '12px 14px',
            border: `1px solid ${dirty ? t.brand + '60' : t.border}`,
            borderRadius: t.radiusLg, fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            lineHeight: 1.6, resize: 'vertical', color: t.text,
            background: t.bgCard, boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 11, color: t.muted }}>
          Fichier Markdown · {content.split('\n').length} lignes · {content.length} caractères
          · Chemin : <code style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px' }}>~/.odoo-consultant/context/{selected}</code>
        </div>
      </div>
    </div>
  )
}

// ── User profile editor ──────────────────────────────────────────

const PRESET_COLORS = ['#017e84', '#2563EB', '#7C3AED', '#DC2626', '#D97706', '#16A34A', '#0891B2', '#EC4899', '#374151']

interface UserProfile {
  name?: string
  title?: string
  team?: string
  avatar?: string   // emoji or data-URI
  primaryColor?: string
  themeMode?: 'light' | 'dark' | 'sepia'
  mascotType?: 'robot' | 'cat' | 'dog'
  mascotColor?: string
}

function UserProfileEditor() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile })
  const [form, setForm] = useState<UserProfile>({})
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const p: UserProfile = data?.data ?? {}
    setForm(p)
    if (p.primaryColor) applyBrandColor(p.primaryColor)
    applyThemeMode(p.themeMode)
  }, [data])

  const set = (key: keyof UserProfile, val: string) => {
    setForm(f => ({ ...f, [key]: val }))
    if (key === 'primaryColor') applyBrandColor(val)
    if (key === 'themeMode') applyThemeMode(val)
  }

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('avatar', ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    await saveUserProfile(form)
    qc.invalidateQueries({ queryKey: ['user-profile'] })
    if (form.primaryColor) applyBrandColor(form.primaryColor)
    applyThemeMode(form.themeMode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const avatarIsImage = form.avatar?.startsWith('data:')

  return (
    <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: t.radiusLg, padding: '20px 24px' }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div
            onClick={() => fileRef.current?.click()}
            title="Cliquer pour changer l'avatar"
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: form.primaryColor ? `${form.primaryColor}20` : t.brand20,
              border: `2px solid ${form.primaryColor ? `${form.primaryColor}40` : t.brand40}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: avatarIsImage ? 0 : 32, cursor: 'pointer',
              overflow: 'hidden', flexShrink: 0,
            }}
          >
            {avatarIsImage
              ? <img src={form.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (form.avatar || '👤')
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['👤', '🧑‍💻', '👨‍💼', '👩‍💼', '🦊'].map(em => (
              <button key={em} onClick={() => set('avatar', em)} style={{
                fontSize: 16, background: form.avatar === em ? t.brand15 : 'transparent',
                border: `1px solid ${form.avatar === em ? t.brand : t.border}`,
                borderRadius: 6, padding: '2px 4px', cursor: 'pointer',
              }}>{em}</button>
            ))}
          </div>
          <span style={{ fontSize: 10, color: t.muted }}>ou cliquer sur l'avatar</span>
        </div>

        {/* Form fields */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>Nom complet</div>
              <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Benoît Le Goff"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>Poste</div>
              <input value={form.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Consultant Odoo Senior"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
          </div>
          <label>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>Équipe / Cabinet</div>
            <input value={form.team ?? ''} onChange={e => set('team', e.target.value)} placeholder="Le Projet · Pôle ERP"
              style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
          </label>

          {/* Color picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>Couleur principale des menus</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => set('primaryColor', c)} style={{
                  width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                  cursor: 'pointer', outline: form.primaryColor === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2, transition: 'outline .1s',
                }} />
              ))}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.muted, cursor: 'pointer' }}>
                <input type="color" value={form.primaryColor ?? '#017e84'}
                  onChange={e => set('primaryColor', e.target.value)}
                  style={{ width: 26, height: 26, border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer' }} />
                Autre
              </label>
            </div>
          </div>

          {/* Theme mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>Thème d'affichage</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'light', label: 'Clair',  icon: '☀️' },
                { id: 'dark',  label: 'Sombre', icon: '🌙' },
                { id: 'sepia', label: 'Sépia',  icon: '📜' },
              ] as const).map(m => {
                const active = (form.themeMode ?? 'light') === m.id
                return (
                  <button key={m.id} onClick={() => set('themeMode', m.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: t.radius, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--brand, #017e84)' : t.border}`,
                    background: active ? 'var(--brand, #017e84)' : t.bgMuted,
                    color: active ? '#fff' : t.muted,
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    transition: 'all .15s',
                  }}>
                    <span>{m.icon}</span> {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mascot picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>Mascotte de réflexion</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {([
                { id: 'robot', label: 'Robot',  preview: <RobotThinking size={40} color={form.mascotColor ?? '#22D3EE'} /> },
                { id: 'cat',   label: 'Chat',   preview: <CatThinking   size={40} color={form.mascotColor ?? '#22D3EE'} /> },
                { id: 'dog',   label: 'Chien',  preview: <DogThinking   size={40} color={form.mascotColor ?? '#22D3EE'} /> },
              ] as const).map(({ id, label, preview }) => {
                const active = (form.mascotType ?? 'robot') === id
                return (
                  <button key={id} onClick={() => set('mascotType', id)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 12px', borderRadius: t.radius, cursor: 'pointer',
                    border: `2px solid ${active ? (form.mascotColor ?? 'var(--brand, #017e84)') : t.border}`,
                    background: active ? `${form.mascotColor ?? 'var(--brand, #017e84)'}15` : t.bgMuted,
                    transition: 'all .15s',
                  }}>
                    <div style={{ height: 44, display: 'flex', alignItems: 'flex-end' }}>{preview}</div>
                    <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? (form.mascotColor ?? t.brand) : t.muted }}>{label}</span>
                  </button>
                )
              })}

              {/* Mascot color picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'center', marginLeft: 4 }}>
                <div style={{ fontSize: 10, color: t.muted, fontWeight: 600 }}>Couleur</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['#22D3EE', '#818CF8', '#F472B6', '#34D399', '#F59E0B', '#EF4444', '#A855F7', '#F97316'].map(c => (
                    <button key={c} onClick={() => set('mascotColor', c)} style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, border: 'none',
                      cursor: 'pointer', outline: (form.mascotColor ?? '#22D3EE') === c ? `3px solid ${c}` : 'none',
                      outlineOffset: 2, transition: 'outline .1s',
                    }} />
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="Couleur personnalisée">
                    <input type="color" value={form.mascotColor ?? '#22D3EE'}
                      onChange={e => set('mascotColor', e.target.value)}
                      style={{ width: 22, height: 22, border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer' }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} style={{
          padding: '8px 20px', background: form.primaryColor ?? t.brand, color: '#fff',
          border: 'none', borderRadius: t.radius, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          {saved ? '✓ Enregistré' : 'Sauvegarder le profil'}
        </button>
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  )
}

function ProviderLogo({ logoUrl, label, color }: { logoUrl: string; label: string; color: string }) {
  const initial = label.charAt(0).toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}20`, border: `1px solid ${color}30` }}>
      <img
        src={logoUrl}
        alt={label}
        width={20}
        height={20}
        style={{ objectFit: 'contain' }}
        onError={e => {
          const img = e.currentTarget
          img.style.display = 'none'
          const fallback = img.nextElementSibling as HTMLElement | null
          if (fallback) fallback.style.display = 'flex'
        }}
      />
      <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, fontWeight: 700, fontSize: 13, color }}>
        {initial}
      </span>
    </div>
  )
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: t.radiusFull, fontSize: 11, fontWeight: 600,
      background: configured ? `${t.success}15` : t.bgMuted,
      color: configured ? t.success : t.muted,
      border: `1px solid ${configured ? `${t.success}40` : t.border}`,
      flexShrink: 0,
    }}>
      <span>{configured ? <Check size={12} /> : null}</span>
      {configured ? 'Configurée' : 'Non configurée'}
    </div>
  )
}

function btnOutline(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 12px', background: 'transparent',
    border: `1px solid ${color}`, color,
    borderRadius: t.radius, fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }
}
