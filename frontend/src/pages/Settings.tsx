import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Database, Eye, EyeOff, FileText, FolderOpen, KeyRound, LayoutPanelTop, Loader2, RefreshCw, Settings2, UserRound, X } from 'lucide-react'
import { getAiProviders, saveAiKey, deleteAiKey, testAiKey, copilotLogin, copilotPoll, listContextFiles, getContextFile, saveContextFile, deleteContextFile, getModelConfig, saveModelConfig, getUserProfile, saveUserProfile, getDataDir, openDataFolder } from '../api/client'
import { PROVIDERS as AI_PROVIDERS } from '../constants/providers'
import RobotThinking from '../components/RobotThinking'
import CatThinking from '../components/CatThinking'
import DogThinking from '../components/DogThinking'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import { applyBrandColor, applyThemeMode } from '../App'
import { WIDTH_OPTIONS, WIDTH_KEY, getStoredWidth, type ContentWidth } from '../components/Layout'
import { Tabs } from '../components/ui'
import { useUiLanguage, type UiLanguage } from '../i18n'

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
  const lang = useUiLanguage()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const c = {
    fr: {
      title: 'Paramètres',
      tabs: { profile: 'Profil', api: 'Clés API', context: 'Contexte IA', interface: 'Interface', storage: 'Stockage' },
      profileIntro: "Personnalisez votre identité et l'apparence de l'interface. Le nom et le poste sont injectés dans le contexte de l'assistant IA.",
      contextIntro: "Ces fichiers Markdown sont injectés dans le prompt système de l'assistant. Modifiez-les pour adapter le contexte métier.",
    },
    en: {
      title: 'Settings',
      tabs: { profile: 'Profile', api: 'API keys', context: 'AI context', interface: 'Interface', storage: 'Storage' },
      profileIntro: 'Customize your identity and interface appearance. Your name and role are injected into the AI assistant context.',
      contextIntro: 'These Markdown files are injected into the assistant system prompt. Edit them to adapt the business context.',
    },
  }[lang]

  const tabs = [
    { id: 'profile' as const,   label: c.tabs.profile, icon: <UserRound size={15} /> },
    { id: 'api' as const,       label: c.tabs.api, icon: <KeyRound size={15} /> },
    { id: 'context' as const,   label: c.tabs.context, icon: <FileText size={15} /> },
    { id: 'interface' as const, label: c.tabs.interface, icon: <LayoutPanelTop size={15} /> },
    { id: 'storage' as const,   label: c.tabs.storage, icon: <Database size={15} /> },
  ]

  return (
    <div className="page-stack">
      <PageHeader title={c.title} />

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <section className="settings-panel">
          <p className="settings-intro">
            {c.profileIntro}
          </p>
          <UserProfileEditor />
        </section>
      )}

      {tab === 'api' && <div className="settings-panel settings-panel-plain"><ApiSection /></div>}

      {tab === 'context' && (
        <section className="settings-panel settings-panel-plain">
          <p className="settings-intro">
            {c.contextIntro}
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
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intro: 'All local data is centralized in one folder. You can back it up, move it, or delete it without touching the application.',
      contents: 'Data folder contents',
      open: 'Open in file explorer',
      securityTitle: 'Security:',
      security: 'API keys (Odoo and AI) are stored in the system keyring (Keychain on macOS, Secret Service on Linux), never in this folder. The database only contains non-sensitive metadata.',
      rows: [
        ['Main folder', 'Database, configuration, encryption keys.'],
        ['Odoo sources', 'Local git clones of Community and Enterprise sources.'],
        ['Client custom repositories', 'GitHub repositories for custom modules, one folder per project and environment.'],
        ['AI context', 'Markdown files injected into the assistant system prompt.'],
        ['Model configuration', 'Enabled AI models and selection preferences.'],
      ],
    }
    : {
      intro: "Toutes les données locales sont centralisées dans un seul dossier. Vous pouvez le sauvegarder, le déplacer ou le supprimer sans toucher à l'application.",
      contents: 'Contenu du dossier de données',
      open: "Ouvrir dans l'explorateur",
      securityTitle: 'Sécurité :',
      security: 'Les clés API (Odoo et IA) sont stockées dans le keyring système (Keychain sur macOS, Secret Service sur Linux) — jamais dans ce dossier. La base de données ne contient que des métadonnées non sensibles.',
      rows: [
        ['Dossier principal', 'Base de données, configuration, clés de chiffrement.'],
        ['Sources Odoo', 'Dépôts git des sources Community et Enterprise clonés localement.'],
        ['Dépôts custom clients', 'Dépôts GitHub des modules custom, un dossier par projet et environnement.'],
        ['Contexte IA', "Fichiers Markdown injectés dans le prompt système de l'assistant."],
        ['Configuration modèles', 'Modèles IA activés et préférences de sélection.'],
      ],
    }
  const { data } = useQuery({ queryKey: ['data-dir'], queryFn: getDataDir })
  const dataDir: string = data?.data?.path ?? '~/.odoo-consultant'

  const rows: { label: string; path: string; description: string }[] = [
    {
      label: c.rows[0][0],
      path: dataDir,
      description: c.rows[0][1],
    },
    {
      label: c.rows[1][0],
      path: `${dataDir}/sources/`,
      description: c.rows[1][1],
    },
    {
      label: c.rows[2][0],
      path: `${dataDir}/repos/`,
      description: c.rows[2][1],
    },
    {
      label: c.rows[3][0],
      path: `${dataDir}/context/`,
      description: c.rows[3][1],
    },
    {
      label: c.rows[4][0],
      path: `${dataDir}/model-config.json`,
      description: c.rows[4][1],
    },
  ]

  return (
    <section className="settings-panel">
      <p style={{ fontSize: 13, color: t.muted, marginBottom: 24, lineHeight: 1.6 }}>
        {c.intro}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{c.contents}</div>
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
          <FolderOpen size={16} /> {c.open}
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
        <strong style={{ color: t.text }}>{c.securityTitle}</strong> {c.security}
      </div>
    </section>
  )
}

// ── Interface settings ────────────────────────────────────────────

function InterfaceSection() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { intro: 'Adjust content width to match your screen and reading preferences.', title: 'Content width', active: 'Active' }
    : { intro: 'Ajustez la largeur du contenu selon votre écran et vos préférences de lecture.', title: 'Largeur du contenu', active: 'Actif' }
  const [currentWidth, setCurrentWidth] = useState<ContentWidth>(() => getStoredWidth())

  const applyWidth = (id: ContentWidth) => {
    localStorage.setItem(WIDTH_KEY, id)
    setCurrentWidth(id)
    window.dispatchEvent(new Event('app-width-change'))
  }

  return (
    <section className="settings-panel">
      <p className="settings-intro">
        {c.intro}
      </p>

      <div style={{ fontWeight: 700, fontSize: 14, color: t.text, marginBottom: 14 }}>{c.title}</div>

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
                  {lang === 'en' ? opt.labelEn : opt.label}
                </div>
                {opt.px > 0 && (
                  <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{opt.px} px</div>
                )}
              </div>
              {isActive && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px',
                  background: `var(--brand, ${t.brand})`, color: '#fff', borderRadius: 9999,
                }}>{c.active}</span>
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
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intro: 'Keys are stored in the system keyring, never in clear text in the database.',
      configured: 'Configured',
      addProvider: 'Add a provider',
      modelsTitle: 'Available models',
      modelsIntro: 'Hide models that are not included in your subscription.',
      expired: 'Code expired. Start again.',
      denied: 'Access denied on GitHub.',
      testing: 'Testing…',
      test: 'Test connection',
      reconnect: 'Reconnect',
      replace: 'Replace',
      delete: 'Delete',
      init: 'Initializing…',
      connectGithub: 'Connect with GitHub',
      cancel: 'Cancel',
      enterCode: 'Enter this code on GitHub. The page opened in a new tab:',
      openDevice: 'Open github.com/login/device →',
      waiting: 'Waiting for your approval…',
      save: 'Save',
      getKey: 'Get your key from',
    }
    : {
      intro: 'Les clés sont stockées dans le trousseau système (keyring) — jamais en clair dans la base de données.',
      configured: 'Configurés',
      addProvider: 'Ajouter un fournisseur',
      modelsTitle: 'Modèles disponibles',
      modelsIntro: 'Masquez les modèles non inclus dans votre abonnement.',
      expired: 'Code expiré. Recommencez.',
      denied: 'Accès refusé sur GitHub.',
      testing: 'Test en cours…',
      test: 'Tester la connexion',
      reconnect: 'Reconnecter',
      replace: 'Remplacer',
      delete: 'Supprimer',
      init: 'Initialisation…',
      connectGithub: 'Se connecter avec GitHub',
      cancel: 'Annuler',
      enterCode: "Entrez ce code sur GitHub — la page s'est ouverte dans un nouvel onglet :",
      openDevice: 'Ouvrir github.com/login/device →',
      waiting: 'En attente de votre validation…',
      save: 'Sauvegarder',
      getKey: 'Obtenez votre clé sur',
    }
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
            setCopilotFlow(f => f ? { ...f, status: 'error', error: c.expired } : null)
          } else if (st === 'access_denied') {
            clearInterval(pollRef.current!)
            setCopilotFlow(f => f ? { ...f, status: 'error', error: c.denied } : null)
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
        {c.intro}
      </p>

      {configuredList.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.success, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
            {c.configured} ({configuredList.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {configuredList.map(p => renderProvider(p, true))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          {c.addProvider}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unconfiguredList.map(p => renderProvider(p, false))}
        </div>
      </div>

      {configuredList.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {c.modelsTitle}
          </div>
          <p style={{ fontSize: 13, color: t.muted, marginBottom: 16 }}>
            {c.modelsIntro}
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
                          {testing[p.id] ? c.testing : c.test}
                        </button>
                        {p.oauthFlow ? (
                          <button onClick={() => { startCopilotLogin(); setEditing(e => ({ ...e, [p.id]: true })) }}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> {c.reconnect}
                          </button>
                        ) : (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: true }))}
                            style={btnOutline(t.brand)}>
                            <RefreshCw size={13} /> {c.replace}
                          </button>
                        )}
                        <button onClick={() => { del.mutate(p.id); setTestResult(r => ({ ...r, [p.id]: null })) }}
                          style={btnOutline(t.danger)}>
                          {c.delete}
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
                          {copilotLoading ? c.init : c.connectGithub}
                        </button>
                      ) : copilotFlow.status === 'error' ? (
                        <div>
                          <div style={{ padding: '8px 12px', borderRadius: t.radius, fontSize: 12, background: `${t.danger}10`, border: `1px solid ${t.danger}30`, color: t.danger, marginBottom: 8 }}>
                            <X size={13} /> {copilotFlow.error}
                          </div>
                          <button onClick={() => { setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                            style={btnOutline(t.muted)}>
                            {c.cancel}
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 12, color: t.muted, marginBottom: 10 }}>
                            {c.enterCode}
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
                              {c.openDevice}
                            </a>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.muted }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: p.color, animation: 'pulse 1.5s infinite' }} />
                            {c.waiting}
                            <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setCopilotFlow(null); setEditing(e => ({ ...e, [p.id]: false })) }}
                              style={{ marginLeft: 'auto', ...btnOutline(t.muted), padding: '3px 10px' }}>
                              {c.cancel}
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
                          {save.isPending ? '…' : c.save}
                        </button>
                        {isEditing && (
                          <button onClick={() => setEditing(e => ({ ...e, [p.id]: false }))}
                            style={{ padding: '8px 12px', background: 'none', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, cursor: 'pointer', color: t.muted }}>
                            {c.cancel}
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: t.muted }}>
                        {c.getKey}{' '}
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

const ALL_MODELS = AI_PROVIDERS.map(p => ({
  provider: p.id,
  label: `${p.label} (${p.id === 'claude' ? 'Anthropic' : p.id === 'openai' ? 'OpenAI' : p.id === 'gemini' ? 'Google' : p.id === 'copilot' ? 'GitHub' : p.id === 'github' ? 'GitHub Models' : p.id})`,
  color: p.color,
  models: p.models.map((m: { id: string; label: string }) => ({ id: m.id, label: m.label })),
}))

function ModelConfigEditor({ configuredProviderIds }: { configuredProviderIds: string[] }) {
  const lang = useUiLanguage()
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
                <button key={m.id} onClick={() => toggle(prov.provider, m.id)} className={`ui-chip-button${on ? ' is-active' : ''}`} style={{
                  background: on ? `${prov.color}15` : undefined,
                  borderColor: on ? prov.color : undefined,
                  color: on ? prov.color : undefined,
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
        <button onClick={handleSave} className="btn btn-primary btn-sm">
          {saved ? <Check size={13} /> : null}
          {saved ? (lang === 'en' ? 'Saved' : 'Enregistré') : (lang === 'en' ? 'Save' : 'Enregistrer')}
        </button>
      </div>
    </div>
  )
}

// ── Context files editor ─────────────────────────────────────────

const KNOWN_FILES = [
  { name: 'skills.md',          label: 'Compétences consultant', labelEn: 'Consultant skills', icon: '🧠', desc: 'Connaissances métier, patterns courants, approche de diagnostic', descEn: 'Business knowledge, common patterns, diagnostic approach' },
  { name: 'meeting-minute.md',  label: 'Modèle compte-rendu', labelEn: 'Meeting minutes template', icon: '📝', desc: 'Template utilisé par le bouton "Meeting Minute" dans le chat', descEn: 'Template used by the "Meeting Minute" button in chat' },
  { name: 'migration.md',       label: 'Méthodologie migration', labelEn: 'Migration methodology', icon: '⇄',  desc: 'Checklist et breaking changes injectés dans l\'assistant Migration', descEn: 'Checklist and breaking changes injected into the Migration assistant' },
  { name: 'studio.md',          label: 'Inspection Studio', labelEn: 'Studio inspection', icon: '🎨', desc: 'Guide d\'interprétation des personnalisations Studio (modèles, champs, vues, automatisations)', descEn: 'Interpretation guide for Studio customizations (models, fields, views, automations)' },
  { name: 'creation.md',        label: 'Méthodologie création', labelEn: 'Creation methodology', icon: '🪄', desc: 'Conventions et méthodologie injectées dans l\'outil Création (changeset Studio, dry-run, versions)', descEn: 'Conventions and methodology injected into the Creator tool (Studio changeset, dry-run, versions)' },
  { name: 'profile-support.md', label: 'Profil Support', labelEn: 'Support profile', icon: '🛠️', desc: 'Guidelines de réponse orientées support incident et run.', descEn: 'Response guidelines focused on incident support and operations.' },
  { name: 'profile-business-analyst.md', label: 'Profil Business Analyst', labelEn: 'Business Analyst profile', icon: '💼', desc: 'Guidelines orientées processus, projet et conseil.', descEn: 'Guidelines focused on process, project and consulting.' },
  { name: 'profile-architect.md', label: 'Profil Architecte', labelEn: 'Architect profile', icon: '🏗️', desc: 'Guidelines architecture, sécurité, performance et migration.', descEn: 'Architecture, security, performance and migration guidance.' },
  { name: 'profile-developer.md', label: 'Profil Développeur', labelEn: 'Developer profile', icon: '💻', desc: 'Guidelines techniques code, modèles, vues et tests.', descEn: 'Technical guidance for code, models, views and tests.' },
  { name: 'l10n_ch.md',          label: 'Localisation CH', labelEn: 'CH localization', icon: '▣', desc: 'Mémo fiscal Suisse injecté quand le pays CH est sélectionné.', descEn: 'Swiss fiscal memo injected when country CH is selected.' },
  { name: 'l10n_fr.md',          label: 'Localisation FR', labelEn: 'FR localization', icon: '▣', desc: 'Mémo fiscal France injecté quand le pays FR est sélectionné.', descEn: 'French fiscal memo injected when country FR is selected.' },
  { name: 'l10n_be.md',          label: 'Localisation BE', labelEn: 'BE localization', icon: '▣', desc: 'Mémo fiscal Belgique injecté quand le pays BE est sélectionné.', descEn: 'Belgian fiscal memo injected when country BE is selected.' },
  { name: 'l10n_lu.md',          label: 'Localisation LU', labelEn: 'LU localization', icon: '▣', desc: 'Mémo fiscal Luxembourg injecté quand le pays LU est sélectionné.', descEn: 'Luxembourg fiscal memo injected when country LU is selected.' },
  { name: 'odoo-19.0.md',       label: 'Odoo 19.0', labelEn: 'Odoo 19.0', icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models' },
  { name: 'odoo-18.0.md',       label: 'Odoo 18.0', labelEn: 'Odoo 18.0', icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models' },
  { name: 'odoo-17.0.md',       label: 'Odoo 17.0', labelEn: 'Odoo 17.0', icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models' },
  { name: 'odoo-16.0.md',       label: 'Odoo 16.0', labelEn: 'Odoo 16.0', icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models' },
  { name: 'odoo-15.0.md',       label: 'Odoo 15.0', labelEn: 'Odoo 15.0', icon: '📋', desc: 'Notes de version, nouveautés, modèles renommés', descEn: 'Release notes, new features, renamed models' },
]

function ContextEditor() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      intermediateNotes: 'Intermediate release notes',
      unsavedContinue: 'Unsaved changes. Continue?',
      resetConfirm: (name: string) => `Reset "${name}" to default content? Your changes will be lost.`,
      customized: '✓ Customized',
      default: '○ Default',
      language: 'Language',
      unsaved: '● Unsaved',
      reset: '↺ Reset',
      saved: '✓ Saved',
      save: 'Save',
      markdown: 'Markdown file',
      lines: 'lines',
      chars: 'characters',
      path: 'Path',
      languageChange: 'Unsaved changes. Change language?',
    }
    : {
      intermediateNotes: 'Notes de version intermédiaire',
      unsavedContinue: 'Modifications non sauvegardées. Continuer ?',
      resetConfirm: (name: string) => `Réinitialiser "${name}" au contenu par défaut ? Vos modifications seront perdues.`,
      customized: '✓ Personnalisé',
      default: '○ Par défaut',
      language: 'Langue',
      unsaved: '● Non sauvegardé',
      reset: '↺ Réinitialiser',
      saved: '✓ Sauvegardé',
      save: 'Sauvegarder',
      markdown: 'Fichier Markdown',
      lines: 'lignes',
      chars: 'caractères',
      path: 'Chemin',
      languageChange: 'Modifications non sauvegardées. Changer de langue ?',
    }
  const qc = useQueryClient()
  const [selected, setSelected] = useState('skills.md')
  const [locale, setLocale] = useState<'fr' | 'en'>('fr')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { data: userData } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile })

  useEffect(() => {
    const preferred = userData?.data?.contextLanguage ?? userData?.data?.language
    if (preferred === 'fr' || preferred === 'en') setLocale(preferred)
  }, [userData])

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
      .map(v => ({ name: `odoo-${v}.md`, label: `Odoo ${v}`, labelEn: `Odoo ${v}`, icon: '📋', desc: c.intermediateNotes, descEn: c.intermediateNotes })),
  ]

  const { data: filesData } = useQuery({ queryKey: ['context-files', locale], queryFn: () => listContextFiles(locale) })
  const existingNames: string[] = (filesData?.data ?? []).map((f: { name: string }) => f.name)

  useEffect(() => {
    setDirty(false)
    setSaved(false)
    getContextFile(selected, locale)
      .then(res => setContent(res.data.content))
      .catch(() => setContent(''))
  }, [selected, locale])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContextFile(selected, content, locale)
      setDirty(false)
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['context-files', locale] })
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(c.resetConfirm(selected))) return
    await deleteContextFile(selected, locale)
    qc.invalidateQueries({ queryKey: ['context-files', locale] })
    const res = await getContextFile(selected, locale)
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
            <button key={f.name} onClick={() => { if (dirty && !confirm(c.unsavedContinue)) return; setSelected(f.name) }} style={{
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
                  {lang === 'en' ? f.labelEn : f.label}
                </div>
                <div style={{ fontSize: 10, color: t.muted }}>
                  {exists ? c.customized : c.default}
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
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{lang === 'en' ? currentFile?.labelEn : currentFile?.label ?? selected}</div>
            <div style={{ fontSize: 12, color: t.muted }}>{lang === 'en' ? currentFile?.descEn : currentFile?.desc}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.muted }}>
              {c.language}
              <select
                value={locale}
                onChange={e => {
                  if (dirty && !confirm(c.languageChange)) return
                  setLocale(e.target.value as 'fr' | 'en')
                }}
                style={{ ...selectStyle, width: 120, padding: '5px 8px', fontSize: 12 }}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            {dirty && <span style={{ fontSize: 11, color: t.warning }}>{c.unsaved}</span>}
            {isCustomized && !dirty && (
              <button onClick={handleReset} style={{
                padding: '5px 10px', background: 'transparent',
                border: `1px solid ${t.border}`, borderRadius: t.radius,
                fontSize: 11, color: t.muted, cursor: 'pointer',
              }} title="Revenir au contenu par défaut">
                {c.reset}
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
              {saving ? '…' : saved ? c.saved : c.save}
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
          {c.markdown} · {content.split('\n').length} {c.lines} · {content.length} {c.chars}
          · {c.path} : <code style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px' }}>~/.odoo-consultant/context/{locale === 'fr' ? selected : `${locale}/${selected}`}</code>
        </div>
      </div>
    </div>
  )
}

// ── User profile editor ──────────────────────────────────────────

const ACCENT_PRESETS = [
  { id: 'boa-green', color: '#33f06f', labelFr: 'BOA vert', labelEn: 'BOA green' },
  { id: 'boa-cyan', color: '#48e7ff', labelFr: 'BOA cyan', labelEn: 'BOA cyan' },
  { id: 'boa-yellow', color: '#ffd735', labelFr: 'BOA jaune', labelEn: 'BOA yellow' },
  { id: 'boa-red', color: '#ff3341', labelFr: 'BOA rouge', labelEn: 'BOA red' },
  { id: 'boa-blue', color: '#114ee8', labelFr: 'BOA bleu', labelEn: 'BOA blue' },
]
const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: `1px solid ${t.border}`,
  borderRadius: t.radius,
  fontSize: 13,
  color: t.text,
  background: t.bgCard,
  boxSizing: 'border-box',
}

interface UserProfile {
  name?: string
  title?: string
  team?: string
  language?: 'fr' | 'en'
  assistantLanguage?: 'auto' | 'fr' | 'en'
  contextLanguage?: 'fr' | 'en'
  avatar?: string   // emoji or data-URI
  primaryColor?: string
  themeMode?: 'light' | 'dark' | 'sepia'
  mascotType?: 'robot' | 'cat' | 'dog'
  mascotColor?: string
}

function UserProfileEditor() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      avatarTitle: 'Click to change avatar',
      avatarHint: 'or click the avatar',
      fullName: 'Full name',
      role: 'Role',
      team: 'Team / Firm',
      appLanguage: 'Application language',
      aiLanguage: 'AI response language',
      contextLanguage: 'AI context language',
      automatic: 'Automatic',
      primaryColor: 'Accent color',
      accentHint: 'Used for primary actions, active states and focus rings. Structural areas stay neutral.',
      other: 'Other',
      theme: 'Display theme',
      light: 'Light',
      dark: 'Dark',
      sepia: 'Sepia',
      mascot: 'Thinking mascot',
      robot: 'Robot',
      cat: 'Cat',
      dog: 'Dog',
      color: 'Color',
      customColor: 'Custom color',
      saved: '✓ Saved',
      save: 'Save profile',
    }
    : {
      avatarTitle: "Cliquer pour changer l'avatar",
      avatarHint: "ou cliquer sur l'avatar",
      fullName: 'Nom complet',
      role: 'Poste',
      team: 'Équipe / Cabinet',
      appLanguage: "Langue de l'application",
      aiLanguage: 'Langue des réponses IA',
      contextLanguage: 'Langue du contexte IA',
      automatic: 'Automatique',
      primaryColor: "Couleur d'accent",
      accentHint: "Utilisée pour les actions principales, les états actifs et le focus. Les zones de structure restent neutres.",
      other: 'Autre',
      theme: "Thème d'affichage",
      light: 'Clair',
      dark: 'Sombre',
      sepia: 'Sépia',
      mascot: 'Mascotte de réflexion',
      robot: 'Robot',
      cat: 'Chat',
      dog: 'Chien',
      color: 'Couleur',
      customColor: 'Couleur personnalisée',
      saved: '✓ Enregistré',
      save: 'Sauvegarder le profil',
    }
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
    document.documentElement.lang = form.language === 'en' ? 'en' : 'fr'
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
            title={c.avatarTitle}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: t.bgMuted,
              border: `1px solid ${t.border}`,
              boxShadow: `inset 0 -3px 0 ${form.primaryColor ?? t.brand}`,
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
                fontSize: 16, background: form.avatar === em ? t.bgMuted : 'transparent',
                border: `1px solid ${form.avatar === em ? t.textSub : t.border}`,
                borderRadius: 6, padding: '2px 4px', cursor: 'pointer',
              }}>{em}</button>
            ))}
          </div>
          <span style={{ fontSize: 10, color: t.muted }}>{c.avatarHint}</span>
        </div>

        {/* Form fields */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.fullName}</div>
              <input value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Benoît Le Goff"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.role}</div>
              <input value={form.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Consultant Odoo Senior"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
            </label>
          </div>
          <label>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.team}</div>
            <input value={form.team ?? ''} onChange={e => set('team', e.target.value)} placeholder="Le Projet · Pôle ERP"
              style={{ width: '100%', padding: '7px 10px', border: `1px solid ${t.border}`, borderRadius: t.radius, fontSize: 13, color: t.text, boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.appLanguage}</div>
              <select value={form.language ?? 'fr'} onChange={e => set('language', e.target.value)} style={selectStyle}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.aiLanguage}</div>
              <select value={form.assistantLanguage ?? 'auto'} onChange={e => set('assistantLanguage', e.target.value)} style={selectStyle}>
                <option value="auto">{c.automatic}</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 4 }}>{c.contextLanguage}</div>
              <select value={form.contextLanguage ?? form.language ?? 'fr'} onChange={e => set('contextLanguage', e.target.value)} style={selectStyle}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>

          {/* Color picker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>{c.primaryColor}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 8 }}>
              {ACCENT_PRESETS.map(accent => {
                const active = (form.primaryColor ?? '#33f06f').toLowerCase() === accent.color.toLowerCase()
                return (
                <button key={accent.id} onClick={() => set('primaryColor', accent.color)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  minHeight: 34, padding: '6px 9px',
                  borderRadius: t.radius, background: active ? t.bgMuted : t.bgCard,
                  border: `1px solid ${active ? accent.color : t.border}`,
                  color: active ? t.text : t.textSub,
                  cursor: 'pointer', fontSize: 12, fontWeight: active ? 650 : 500,
                  transition: 'background .15s, border-color .15s, color .15s',
                }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: accent.color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.45)' }} />
                  {lang === 'en' ? accent.labelEn : accent.labelFr}
                </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: t.muted, lineHeight: 1.45 }}>{c.accentHint}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: t.muted, cursor: 'pointer' }}>
                <input type="color" value={form.primaryColor ?? '#33f06f'}
                  onChange={e => set('primaryColor', e.target.value)}
                  style={{ width: 28, height: 28, border: `1px solid ${t.border}`, borderRadius: 6, padding: 2, cursor: 'pointer', background: t.bgCard }} />
                {c.customColor}
              </label>
            </div>
          </div>

          {/* Theme mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>{c.theme}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'light', label: c.light,  icon: '☀️' },
                { id: 'dark',  label: c.dark, icon: '🌙' },
                { id: 'sepia', label: c.sepia,  icon: '📜' },
              ] as const).map(m => {
                const active = (form.themeMode ?? 'light') === m.id
                return (
                  <button key={m.id} onClick={() => set('themeMode', m.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: t.radius, cursor: 'pointer',
                    border: `1px solid ${active ? t.brand40 : t.border}`,
                    background: active ? t.brand10 : t.bgMuted,
                    color: active ? t.text : t.muted,
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
            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSub, marginBottom: 6 }}>{c.mascot}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {([
                { id: 'robot', label: c.robot,  preview: <RobotThinking size={40} color={form.mascotColor ?? '#22D3EE'} /> },
                { id: 'cat',   label: c.cat,   preview: <CatThinking   size={40} color={form.mascotColor ?? '#22D3EE'} /> },
                { id: 'dog',   label: c.dog,  preview: <DogThinking   size={40} color={form.mascotColor ?? '#22D3EE'} /> },
              ] as const).map(({ id, label, preview }) => {
                const active = (form.mascotType ?? 'robot') === id
                return (
                  <button key={id} onClick={() => set('mascotType', id)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 12px', borderRadius: t.radius, cursor: 'pointer',
                    border: `2px solid ${active ? (form.mascotColor ?? 'var(--brand, #33f06f)') : t.border}`,
                    background: active ? `${form.mascotColor ?? 'var(--brand, #33f06f)'}15` : t.bgMuted,
                    transition: 'all .15s',
                  }}>
                    <div style={{ height: 44, display: 'flex', alignItems: 'flex-end' }}>{preview}</div>
                    <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? (form.mascotColor ?? t.brand) : t.muted }}>{label}</span>
                  </button>
                )
              })}

              {/* Mascot color picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'center', marginLeft: 4 }}>
                <div style={{ fontSize: 10, color: t.muted, fontWeight: 600 }}>{c.color}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['#22D3EE', '#818CF8', '#F472B6', '#34D399', '#F59E0B', '#EF4444', '#A855F7', '#F97316'].map(c => (
                    <button key={c} onClick={() => set('mascotColor', c)} style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                      cursor: 'pointer', outline: (form.mascotColor ?? '#22D3EE') === c ? `3px solid ${c}` : 'none',
                      outlineOffset: 2, transition: 'outline .1s',
                    }} />
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title={c.customColor}>
                    <input type="color" value={form.mascotColor ?? '#22D3EE'}
                      onChange={e => set('mascotColor', e.target.value)}
                      style={{ width: 26, height: 26, border: 'none', borderRadius: '50%', padding: 0, cursor: 'pointer' }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleSave} className="btn btn-primary">
          {saved ? c.saved : c.save}
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
  const lang = useUiLanguage()
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
      {configured ? (lang === 'en' ? 'Configured' : 'Configurée') : (lang === 'en' ? 'Not configured' : 'Non configurée')}
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
