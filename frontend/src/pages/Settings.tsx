import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAiProviders, saveAiKey, deleteAiKey, testAiKey } from '../api/client'
import { t } from '../theme'

interface ProviderDef {
  id: string
  label: string
  color: string
  placeholder: string
  docsUrl: string
  docsLabel: string
  description: string
  note?: string
  available: boolean  // is the package installed?
}

const PROVIDERS: Omit<ProviderDef, 'available'>[] = [
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    color: '#D97706',
    placeholder: 'sk-ant-api03-…',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com',
    description: 'Le meilleur pour l\'analyse de données complexes et les synthèses. Modèles : Opus (puissant), Sonnet (quotidien), Haiku (rapide).',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT-4o)',
    color: '#16A34A',
    placeholder: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com',
    description: 'Très polyvalent. Modèles : GPT-4o (puissant), GPT-4o mini (économique), o1 mini (raisonnement).',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    color: '#2563EB',
    placeholder: 'AIzaSy…',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'aistudio.google.com',
    description: 'Idéal pour les très longs contextes. Modèles : 2.0 Flash (rapide), 1.5 Pro (long contexte).',
  },
  {
    id: 'github',
    label: 'GitHub Models',
    color: '#24292f',
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
    placeholder: 'ghp_… ou github_pat_…',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    description: 'Accès via votre abonnement Copilot Business/Enterprise. Modèles GPT-4o, Claude, o1 selon votre plan.',
    note: 'Expérimental — API non officielle. Utilisez votre token GitHub avec accès Copilot. Peut ne pas fonctionner sans compte Business actif.',
  },
]

export default function Settings() {
  const qc = useQueryClient()
  const { data: provData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const configured: Record<string, boolean> = provData?.data ?? {}

  const [keys,        setKeys]        = useState<Record<string, string>>({})
  const [editing,     setEditing]     = useState<Record<string, boolean>>({})
  const [showKey,     setShowKey]     = useState<Record<string, boolean>>({})
  const [testResult,  setTestResult]  = useState<Record<string, { ok: boolean; msg: string } | null>>({})
  const [testing,     setTesting]     = useState<Record<string, boolean>>({})

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

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, marginBottom: 4 }}>Paramètres</h1>
        <p style={{ fontSize: 14, color: t.muted }}>Gérez vos clés API et préférences.</p>
      </div>

      {/* AI Keys section */}
      <section>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
          Clés API — Assistants IA
        </h2>
        <p style={{ fontSize: 13, color: t.muted, marginBottom: 20 }}>
          Les clés sont stockées dans le trousseau système de votre machine (keyring) — jamais en clair dans la base de données.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {PROVIDERS.map(p => {
            const isConfigured = configured[p.id] ?? false
            const isEditing    = editing[p.id] ?? false
            const keyVal       = keys[p.id] ?? ''

            return (
              <div key={p.id} style={{
                background: t.bgCard, border: `1px solid ${isConfigured ? `${t.success}50` : t.border}`,
                borderRadius: t.radiusLg, overflow: 'hidden',
              }}>
                {/* Color bar */}
                <div style={{ height: 3, background: p.color }} />

                <div style={{ padding: '16px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>{p.label}</div>
                      <div style={{ fontSize: 12, color: t.muted, marginTop: 3, lineHeight: 1.5 }}>{p.description}</div>
                      {p.note && (
                        <div style={{
                          marginTop: 6, fontSize: 11, color: t.warning,
                          background: t.warningBg, border: `1px solid ${t.warning}30`,
                          borderRadius: t.radiusSm, padding: '3px 8px', display: 'inline-block',
                        }}>
                          ℹ {p.note}
                        </div>
                      )}
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
                          style={{
                            ...btnOutline(p.color),
                            background: testing[p.id] ? `${p.color}10` : 'transparent',
                          }}>
                          {testing[p.id] ? '⟳ Test en cours…' : '▶ Tester la connexion'}
                        </button>
                        <button onClick={() => setEditing(e => ({ ...e, [p.id]: true }))}
                          style={btnOutline(t.brand)}>
                          ↺ Remplacer
                        </button>
                        <button onClick={() => { del.mutate(p.id); setTestResult(r => ({ ...r, [p.id]: null })) }}
                          style={btnOutline(t.danger)}>
                          Supprimer
                        </button>
                      </div>
                      {/* Test result */}
                      {testResult[p.id] && (
                        <div style={{
                          marginTop: 8, padding: '7px 12px', borderRadius: t.radius, fontSize: 12,
                          background: testResult[p.id]!.ok ? `${t.success}12` : `${t.danger}10`,
                          border: `1px solid ${testResult[p.id]!.ok ? `${t.success}40` : `${t.danger}30`}`,
                          color: testResult[p.id]!.ok ? t.success : t.danger,
                          fontWeight: 500,
                        }}>
                          {testResult[p.id]!.ok ? '✓' : '✗'} {testResult[p.id]!.msg}
                        </div>
                      )}
                    </div>
                  ) : (
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
                            {showKey[p.id] ? '🙈' : '👁'}
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
                        <a href={p.docsUrl} target="_blank" rel="noreferrer"
                          style={{ color: t.brand, fontWeight: 500 }}>
                          {p.docsLabel} →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
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
      <span>{configured ? '✓' : '○'}</span>
      {configured ? 'Configurée' : 'Non configurée'}
    </div>
  )
}

function btnOutline(color: string): React.CSSProperties {
  return {
    padding: '5px 12px', background: 'transparent',
    border: `1px solid ${color}`, color,
    borderRadius: t.radius, fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }
}
