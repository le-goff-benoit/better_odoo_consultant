import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, ArrowUp, ChevronDown, Check, Square, TriangleAlert } from 'lucide-react'
import { listProfiles, checkAllSources, getAiProviders, getModelConfig } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import PerspectiveToggle, { Perspective, loadPerspective, savePerspective } from '../components/PerspectiveToggle'
import { ODOO_APPS } from '../constants/odooApps'
import { PROVIDERS } from '../constants/providers'

// ── Types ─────────────────────────────────────────────────────────

interface Profile {
  id: number
  name: string
  odoo_version: string | null
  environments: string | null
  active_env_id: string | null
}

interface EnvEntry {
  id: string
  name: string
  odoo_version?: string | null
  github_repo?: string | null
}

type SelectorMode = 'version' | 'environment'

interface SideConfig {
  mode: SelectorMode
  version: string
  profileId: number | null
  envId: string | null
}

interface AiEvent {
  type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'done' | 'end'
  name?: string
  args?: Record<string, unknown>
  count?: number
  records?: Record<string, unknown>[]
  content?: string
  msg?: string
  ok?: boolean
  input_tokens?: number
  output_tokens?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text?: string
  events?: AiEvent[]
  loading?: boolean
  timestamp?: number
  inputTokens?: number
  outputTokens?: number
}


const SUGGESTIONS_MIGRATION_TECHNICAL = [
  'Quels champs ont changé sur sale.order entre les deux versions ?',
  'Comment migrer les vues XML avec attrs= ?',
  'Quels modules custom risquent d\'être incompatibles ?',
  'Quelles API Python ont été supprimées ou renommées ?',
  'Analyse les différences de stock.move entre les deux versions',
]

const SUGGESTIONS_MIGRATION_FUNCTIONAL = [
  'Quelles nouvelles fonctionnalités standard sont disponibles dans la version cible ?',
  'Quels modules nouveaux pourraient remplacer nos modules custom ?',
  'Quels changements UX/menus impactent les key users ?',
  'Quel est l\'impact formation pour les commerciaux ?',
  'Y a-t-il des modules dépréciés ou remplacés entre ces deux versions ?',
]

// ── Helpers ───────────────────────────────────────────────────────

function installedVersions(sourcesData: Record<string, { installed: boolean }> | undefined): string[] {
  if (!sourcesData) return []
  return Object.keys(sourcesData)
    .filter(k => !k.endsWith('-enterprise') && sourcesData[k]?.installed)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
}

function sourcesInstalled(version: string | null, sourcesData: Record<string, { installed: boolean }> | undefined): boolean {
  if (!version || !sourcesData) return false
  return !!(sourcesData[version]?.installed || sourcesData[`${version}-enterprise`]?.installed)
}

function profileEnvs(profile: Profile | null): EnvEntry[] {
  if (!profile) return []
  try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] }
}

function resolveVersion(cfg: SideConfig, profiles: Profile[]): string | null {
  if (cfg.mode === 'version') return cfg.version || null
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return null
  if (cfg.envId) {
    const env = profileEnvs(p).find(e => e.id === cfg.envId)
    return env?.odoo_version ?? p.odoo_version
  }
  return p.odoo_version
}

function resolveLabel(cfg: SideConfig, profiles: Profile[]): string {
  if (cfg.mode === 'version') return cfg.version ? `Odoo ${cfg.version}` : '—'
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return '—'
  const envs = profileEnvs(p)
  const env = envs.find(e => e.id === cfg.envId)
  const ver = env?.odoo_version ?? p.odoo_version ?? '?'
  return `${p.name}${env ? ` · ${env.name}` : ''} (${ver})`
}

function resolveRepoPath(cfg: SideConfig, profiles: Profile[]): { profileId: number | null; envId: string | null } {
  if (cfg.mode !== 'environment') return { profileId: null, envId: null }
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return { profileId: null, envId: null }
  const envs = profileEnvs(p)
  const envId = cfg.envId ?? (envs[0]?.id ?? null)
  const env = envs.find(e => e.id === envId)
  if (!env?.github_repo) return { profileId: null, envId: null }
  return { profileId: p.id, envId }
}

function fmtTime(ts?: number) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function fmtTokens(input?: number, output?: number) {
  if (!input && !output) return null
  const total = (input ?? 0) + (output ?? 0)
  const parts = []
  if (input)  parts.push(`↑${input.toLocaleString()}`)
  if (output) parts.push(`↓${output.toLocaleString()}`)
  return `${total.toLocaleString()} tokens (${parts.join(' · ')})`
}

// ── OdooAppIcon ───────────────────────────────────────────────────

function OdooAppIcon({ name, size = 16 }: { name: string; size?: number }) {
  const def = ODOO_APPS[name]
  if (!def) return null
  return (
    <img src={def.iconUrl} alt={def.label} width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// ── AiSelector ────────────────────────────────────────────────────

function AiSelector({ providers, provider, modelId, switchProvider, setModelId }: {
  providers: typeof PROVIDERS
  provider: string
  modelId: string
  switchProvider: (id: string) => void
  setModelId: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const currentProv = providers.find(p => p.id === provider)
  const currentModel = currentProv?.models.find(m => m.id === modelId) ?? currentProv?.models[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!currentProv) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 12px', borderRadius: t.radius, cursor: 'pointer',
        background: t.bgCard, border: `1px solid ${t.border}`,
        transition: 'border-color .15s',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: currentProv.color }}>{currentProv.label}</span>
        <span style={{ color: t.border, fontSize: 13 }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{currentModel?.label}</span>
        {currentModel?.recommended && (
          <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>★</span>
        )}
        <ChevronDown size={12} color={t.muted} style={{ marginLeft: 1 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 300,
          background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: t.radiusLg, boxShadow: t.shadowMd,
          minWidth: 300, maxHeight: 420, overflowY: 'auto',
        }}>
          {providers.map((prov, pi) => (
            <div key={prov.id}>
              {pi > 0 && <div style={{ height: 1, background: t.border }} />}
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: prov.color, background: `${prov.color}08`,
              }}>
                {prov.label}
              </div>
              {prov.models.map(m => {
                const isSelected = provider === prov.id && modelId === m.id
                return (
                  <button key={m.id}
                    onClick={() => { if (provider !== prov.id) switchProvider(prov.id); setModelId(m.id); setOpen(false) }}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                      padding: '9px 14px', border: 'none', cursor: 'pointer',
                      background: isSelected ? `${prov.color}10` : 'transparent',
                      borderLeft: isSelected ? `3px solid ${prov.color}` : '3px solid transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.bgMuted }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 12, color: isSelected ? prov.color : t.text }}>{m.label}</span>
                      {m.recommended && (
                        <span style={{ fontSize: 9, background: t.success, color: '#fff', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>Recommandé</span>
                      )}
                    </div>
                    {m.desc && <div style={{ fontSize: 11, color: t.muted }}>{m.desc}</div>}
                    {m.tags && m.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {m.tags.map(tag => (
                          <span key={tag} style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 10,
                            background: `${prov.color}18`, color: prov.color,
                            border: `1px solid ${prov.color}30`, fontWeight: 600,
                          }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SideSelector ──────────────────────────────────────────────────

function SideSelector({
  label, cfg, onChange, versions, profiles, sourcesData,
}: {
  label: string
  cfg: SideConfig
  onChange: (c: SideConfig) => void
  versions: string[]
  profiles: Profile[]
  sourcesData: Record<string, { installed: boolean }> | undefined
}) {
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: `1px solid ${t.border}`, borderRadius: t.radius,
    background: t.bgCard, color: t.text, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
  }

  const selectedProfile = profiles.find(p => p.id === cfg.profileId) ?? null
  const envs = profileEnvs(selectedProfile)
  const version = resolveVersion(cfg, profiles)
  const installed = sourcesInstalled(version, sourcesData)

  return (
    <div style={{
      flex: 1, padding: '16px 18px', background: t.bgCard,
      border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: t.text, marginBottom: 14 }}>{label}</div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['version', 'environment'] as SelectorMode[]).map(m => (
          <button key={m} onClick={() => onChange({ ...cfg, mode: m })} style={{
            flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600,
            background: cfg.mode === m ? `var(--brand, ${t.brand})` : t.bgMuted,
            color: cfg.mode === m ? '#fff' : t.muted,
            border: `1px solid ${cfg.mode === m ? `var(--brand, ${t.brand})` : t.border}`,
            borderRadius: t.radius, cursor: 'pointer', transition: 'all .15s',
          }}>
            {m === 'version' ? 'Version Odoo' : 'Environnement'}
          </button>
        ))}
      </div>

      {cfg.mode === 'version' ? (
        <div>
          <div style={labelStyle}>Version</div>
          <select value={cfg.version} onChange={e => onChange({ ...cfg, version: e.target.value })} style={selectStyle}>
            <option value="">— Choisir —</option>
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {versions.length === 0 && (
            <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>
              Aucune source téléchargée. Allez dans Sources pour télécharger une version.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={labelStyle}>Projet</div>
            <select
              value={cfg.profileId ?? ''}
              onChange={e => onChange({ ...cfg, profileId: e.target.value ? Number(e.target.value) : null, envId: null })}
              style={selectStyle}
            >
              <option value="">— Choisir —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {envs.length > 0 && (
            <div>
              <div style={labelStyle}>Environnement</div>
              <select value={cfg.envId ?? ''} onChange={e => onChange({ ...cfg, envId: e.target.value || null })} style={selectStyle}>
                <option value="">— Défaut —</option>
                {envs.map(e => <option key={e.id} value={e.id}>{e.name} {e.odoo_version ? `(${e.odoo_version})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Version + sources badge */}
      {version && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: `var(--brand, ${t.brand})`, fontWeight: 600 }}>
            Odoo {version}
          </span>
          <span title={installed ? `Sources v${version} installées` : `Sources v${version} non installées`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: t.radiusFull,
              background: installed ? `${t.success}15` : '#fef3c7',
              color: installed ? t.success : '#b45309',
              border: `1px solid ${installed ? `${t.success}40` : '#f59e0b'}`,
            }}>
            {installed ? <Check size={10} /> : <TriangleAlert size={10} />}
            {installed ? 'Sources ✓' : 'Sources ⚠'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Message rendering ─────────────────────────────────────────────

function UserBubble({ text, timestamp }: { text: string; timestamp?: number }) {
  const time = fmtTime(timestamp)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '10px 14px',
          background: t.brand, color: '#fff',
          borderRadius: `${t.radiusLg} ${t.radiusLg} 4px ${t.radiusLg}`,
          fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {text}
        </div>
        {time && (
          <div style={{ textAlign: 'right', fontSize: 10, color: t.muted, marginTop: 3, paddingRight: 2 }}>
            {time}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantBubble({ events, loading, provider, timestamp, inputTokens, outputTokens }: {
  events: AiEvent[]; loading?: boolean; provider: string
  timestamp?: number; inputTokens?: number; outputTokens?: number
}) {
  const prov = PROVIDERS.find(p => p.id === provider)
  const textEvt    = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt   = events.find(e => e.type === 'error')
  const time   = fmtTime(timestamp)
  const tokens = fmtTokens(inputTokens, outputTokens)

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: prov ? `${prov.color}20` : t.bgMuted,
        color: prov?.color ?? t.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
        marginTop: 4,
      }}>
        {prov?.label[0] ?? 'AI'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} />}

        {textEvt?.content && (
          <div style={{
            background: t.bgCard, border: `1px solid ${t.border}`,
            borderRadius: `4px ${t.radiusLg} ${t.radiusLg} ${t.radiusLg}`,
            padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: t.text,
          }}>
            <Markdown text={textEvt.content} />
          </div>
        )}

        {errorEvt && (
          <div style={{
            background: t.dangerBg, border: `1px solid ${t.danger}40`,
            borderRadius: t.radius, padding: '10px 14px', fontSize: 13, color: t.danger,
          }}>
            ⚠ {errorEvt.msg}
          </div>
        )}

        {loading && !textEvt && !errorEvt && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginTop: toolEvents.length > 0 ? 10 : 0,
            padding: '10px 16px', background: t.bgMuted,
            border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
            fontSize: 13, color: t.textSub,
          }}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: t.brand,
                  display: 'inline-block',
                  animation: `migPulse 1.2s ease-in-out ${i * 0.2}s infinite`, opacity: 0.7,
                }} />
              ))}
            </span>
            <span style={{ fontWeight: 500 }}>
              {toolEvents.length > 0 ? 'Analyse des résultats et rédaction de la réponse…' : 'Analyse en cours…'}
            </span>
          </div>
        )}

        {(time || tokens) && !loading && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: t.muted, paddingLeft: 2 }}>
            {time && <span>{time}</span>}
            {tokens && <span title="Tokens utilisés (entrée ↑ + sortie ↓)">{tokens}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tool rendering ────────────────────────────────────────────────

const ODOO_MODEL_LABELS: Record<string, string> = {
  'account.move': 'Factures', 'account.payment': 'Paiements',
  'sale.order': 'Commandes clients', 'crm.lead': 'Opportunités CRM',
  'purchase.order': 'Commandes fournisseurs', 'stock.picking': 'Transferts de stock',
  'stock.move': 'Mouvements de stock', 'stock.quant': 'Niveaux de stock',
  'product.template': 'Produits', 'product.product': 'Variantes de produit',
  'res.partner': 'Contacts', 'hr.employee': 'Employés',
  'project.project': 'Projets', 'project.task': 'Tâches',
  'mrp.production': 'Ordres de fabrication', 'mrp.bom': 'Nomenclatures',
  'ir.model': 'Modèles techniques', 'ir.model.fields': 'Champs techniques',
}

function humanModel(model: string): string {
  return ODOO_MODEL_LABELS[model] ?? model
}

function getToolMeta(name: string, args?: Record<string, unknown>) {
  if (name === 'query_odoo') {
    const model = (args?.model as string) ?? ''
    const prefix = model.split('.')[0]
    const app = ODOO_APPS[prefix]
    const label = humanModel(model)
    return {
      icon: app ? app.icon : '🗄️', appName: app ? prefix : null,
      color: app ? app.color : '#64748b',
      loadingLabel: model ? `Requête base client — ${label}…` : 'Requête base client…',
      doneLabel: label || 'Odoo', liveDb: true,
    }
  }
  if (name === 'count_odoo') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔢', appName: null, color: '#0891b2',
      loadingLabel: model ? `Comptage — ${label}…` : 'Comptage…',
      doneLabel: model ? `Comptage · ${label}` : 'Comptage', liveDb: true,
    }
  }
  if (name === 'get_odoo_fields') {
    const model = (args?.model as string) ?? ''
    const label = humanModel(model)
    return {
      icon: '🔬', appName: null, color: '#059669',
      loadingLabel: model ? `Champs — ${label}…` : 'Découverte des champs…',
      doneLabel: model ? `Champs · ${label}` : 'Champs',
    }
  }
  if (name === 'search_odoo_source') {
    const ver = args?.version as string
    return {
      icon: '🔎', appName: null, color: '#2563EB',
      loadingLabel: `Recherche sources${ver ? ` v${ver}` : ''}…`,
      doneLabel: ver ? `Sources v${ver}` : 'Sources Odoo',
    }
  }
  if (name === 'read_odoo_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📄', appName: null, color: '#7C3AED',
      loadingLabel: `Lecture de ${file}…`, doneLabel: file,
    }
  }
  if (name === 'search_target_source') {
    const ver = args?.version as string
    return {
      icon: '🎯', appName: null, color: '#9333ea',
      loadingLabel: `Recherche sources cibles${ver ? ` v${ver}` : ''}…`,
      doneLabel: ver ? `Sources cibles v${ver}` : 'Sources cibles',
    }
  }
  if (name === 'read_target_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📋', appName: null, color: '#9333ea',
      loadingLabel: `Lecture cible : ${file}…`, doneLabel: file,
    }
  }
  if (name === 'search_project_source') {
    return {
      icon: '⎇', appName: null, color: '#0891b2',
      loadingLabel: 'Recherche dans le repo projet…',
      doneLabel: 'Repo projet',
    }
  }
  if (name === 'read_project_file') {
    const path = (args?.path as string) ?? ''
    const file = path.split('/').pop() ?? 'fichier'
    return {
      icon: '📁', appName: null, color: '#0891b2',
      loadingLabel: `Lecture repo : ${file}…`, doneLabel: file,
    }
  }
  if (name === 'count_source_lines') {
    const scope = (args?.scope as string) ?? ''
    const path  = (args?.path as string) ?? ''
    const groupBy = (args?.group_by as string) ?? 'extension'
    const scopeLabels: Record<string, string> = { odoo: 'sources Odoo', target: 'sources cible', project: 'repo projet' }
    const scopeLbl = scopeLabels[scope] ?? scope
    return {
      icon: '📊', appName: null, color: '#0EA5E9',
      loadingLabel: `Comptage lignes — ${scopeLbl}${path ? ` / ${path}` : ''}…`,
      doneLabel: `LOC · ${scopeLbl}${path ? ` / ${path}` : ''} (par ${groupBy})`,
    }
  }
  return {
    icon: '🔧', appName: null, color: '#64748b',
    loadingLabel: `${name}…`, doneLabel: name,
  }
}

function ToolCallGroup({ events }: { events: AiEvent[] }) {
  const [open, setOpen] = useState(false)
  const calls   = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')

  const dedupedCalls = calls.reduce<{ call: AiEvent; count: number; key: string }[]>((acc, c) => {
    const key = (c.name === 'search_odoo_source' || c.name === 'search_target_source')
      ? `${c.name}:${c.args?.version ?? ''}`
      : c.name === 'query_odoo'
      ? `query_odoo:${c.args?.model ?? ''}`
      : `${c.name}`
    const existing = acc.find(a => a.key === key)
    if (existing) { existing.count++; return acc }
    return [...acc, { call: c, count: 1, key }]
  }, [])

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: open ? 8 : 0 }}>
        {dedupedCalls.map(({ call: c, count }, idx) => {
          const meta = getToolMeta(c.name!, c.args)
          const res  = results.find(r => r.name === c.name)
          const done = !!res
          const hasRecords = done && res!.records && res!.records.length > 0

          return (
            <button
              key={`${c.name}-${idx}`}
              onClick={() => hasRecords && setOpen(p => !p)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: done ? `${meta.color}12` : `${meta.color}06`,
                border: `1px solid ${done ? `${meta.color}45` : `${meta.color}30`}`,
                borderRadius: t.radiusFull, padding: '5px 12px 5px 8px',
                cursor: hasRecords ? 'pointer' : 'default',
                fontSize: 12, color: done ? meta.color : t.textSub, fontWeight: done ? 600 : 500,
                transition: 'all .2s', maxWidth: 340,
              }}
            >
              {done ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: '50%',
                  background: meta.color, color: '#fff', fontSize: 9, fontWeight: 800, flexShrink: 0,
                }}>
                  {c.name === 'query_odoo' || c.name === 'count_odoo' ? 'O'
                    : c.name === 'search_odoo_source' || c.name === 'search_target_source' ? '⌕'
                    : c.name === 'read_odoo_file' || c.name === 'read_target_file' ? '§'
                    : c.name === 'search_project_source' || c.name === 'read_project_file' ? '⎇'
                    : '◈'}
                </span>
              ) : (
                <span style={{
                  display: 'inline-block', flexShrink: 0,
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${meta.color}`, borderTopColor: 'transparent',
                  animation: 'migSpin .6s linear infinite',
                }} />
              )}

              {'appName' in meta && meta.appName && done && <OdooAppIcon name={meta.appName as string} size={13} />}
              {!(('appName' in meta) && meta.appName) && done && <span style={{ fontSize: 12, flexShrink: 0 }}>{meta.icon}</span>}

              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {done ? meta.doneLabel : meta.loadingLabel}
              </span>

              {done && res!.count !== undefined && (
                <span style={{
                  background: `${meta.color}28`, borderRadius: 9999,
                  padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0,
                }}>
                  {res!.count}
                </span>
              )}

              {count > 1 && (
                <span title={`${count} appels`} style={{
                  background: `${meta.color}22`, borderRadius: 9999,
                  padding: '1px 5px', fontSize: 10, flexShrink: 0,
                }}>×{count}</span>
              )}

              {done && (
                <span style={{ fontSize: 10, color: t.muted, flexShrink: 0 }}>
                  {hasRecords ? (open ? '▲' : '▼') : '✓'}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {open && results.map((r, i) => r.records && r.records.length > 0 && (
        <div key={i} style={{
          background: '#1e1e2e', borderRadius: t.radius,
          padding: '10px 12px', overflowX: 'auto', maxHeight: 220, overflowY: 'auto', marginTop: 4,
        }}>
          <RecordsTable records={r.records} />
        </div>
      ))}

      <style>{`
        @keyframes migPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes migSpin  { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}

function RecordsTable({ records }: { records: Record<string, unknown>[] }) {
  if (!records.length) return null
  const cols = Object.keys(records[0]).slice(0, 8)
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 11, color: '#cdd6f4', minWidth: '100%' }}>
      <thead>
        <tr>{cols.map(c => <th key={c} style={{ padding: '3px 10px', textAlign: 'left', borderBottom: '1px solid #45475a', color: '#89b4fa', fontWeight: 600 }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#1a1a2e' }}>
            {cols.map(c => (
              <td key={c} style={{ padding: '3px 10px', borderBottom: '1px solid #313244', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(r[c] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Markdown ──────────────────────────────────────────────────────

function MarkdownTable({ headers, dataRows }: { headers: string[]; dataRows: string[][] }) {
  const [hovered, setHovered] = useState(false)

  const downloadCsv = () => {
    const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [headers.map(escape).join(','), ...dataRows.map(row => row.map(escape).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'export.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ overflowX: 'auto', margin: '8px 0', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button onClick={downloadCsv} title="Exporter en CSV" style={{
          position: 'absolute', top: 4, right: 4, zIndex: 10,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', fontSize: 11, fontWeight: 600,
          background: t.bgCard, color: t.action,
          border: `1px solid ${t.brand40}`, borderRadius: t.radius,
          cursor: 'pointer', boxShadow: t.shadow, transition: 'opacity .15s',
        }}>
          ↓ CSV
        </button>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, j) => (
              <th key={j} style={{ padding: '6px 12px', textAlign: 'left', background: t.bgMuted, borderBottom: `2px solid ${t.border}`, fontWeight: 600, color: t.textSub }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? t.bgCard : t.bgMuted }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '5px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function inlineMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      result.push(
        <pre key={i} style={{ background: '#1e1e2e', borderRadius: t.radiusSm, padding: '10px 14px', overflowX: 'auto', margin: '8px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: '#cdd6f4' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const rows = tableLines.filter(l => !l.match(/^\|[-| :]+\|$/))
      if (rows.length) {
        const headers = rows[0].split('|').filter(Boolean).map(s => s.trim())
        const dataRows = rows.slice(1).map(row => row.split('|').filter(Boolean).map(c => c.trim()))
        result.push(<MarkdownTable key={i} headers={headers} dataRows={dataRows} />)
      }
      continue
    }

    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      const sizes = [18, 16, 14]
      result.push(<div key={i} style={{ fontSize: sizes[hMatch[1].length - 1], fontWeight: 700, color: t.text, margin: '12px 0 4px' }}>{hMatch[2]}</div>)
      i++; continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brand, flexShrink: 0 }}>•</span>
          <span>{inlineMarkdown(listMatch[1])}</span>
        </div>
      )
      i++; continue
    }

    if (!line.trim()) { result.push(<div key={i} style={{ height: 8 }} />); i++; continue }

    result.push(<p key={i} style={{ margin: '0 0 4px' }}>{inlineMarkdown(line)}</p>)
    i++
  }

  return <>{result}</>
}

// ── Main page ─────────────────────────────────────────────────────

export default function Migration() {
  const { data: profilesData } = useQuery({ queryKey: ['profiles'],     queryFn: listProfiles })
  const { data: sourcesData }  = useQuery({ queryKey: ['sources-all'],  queryFn: checkAllSources, staleTime: 30_000 })
  const { data: provData }     = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const { data: modelCfg }     = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })

  const profiles: Profile[] = profilesData?.data ?? []
  const allProviders: Record<string, boolean> = provData?.data ?? {}
  const modelConfig: Record<string, string[]> = modelCfg?.data ?? {}
  const srcStatus: Record<string, { installed: boolean }> = sourcesData?.data ?? {}

  const configuredProviders = PROVIDERS
    .filter(p => allProviders[p.id])
    .map(p => {
      const enabled = modelConfig[p.id]
      if (!enabled || enabled.length === 0) return p
      return { ...p, models: p.models.filter(m => enabled.includes(m.id)) }
    })
    .filter(p => p.models.length > 0)

  const versions = installedVersions(sourcesData?.data)

  const [provider,  setProvider]  = useState('')
  const [modelId,   setModelId]   = useState('')

  const activeProvider  = provider  || configuredProviders[0]?.id  || ''
  const activeProvDef   = configuredProviders.find(p => p.id === activeProvider)
  const activeModelId   = modelId   || activeProvDef?.models[0]?.id || ''

  const switchProvider = (id: string) => {
    const p = configuredProviders.find(pv => pv.id === id)!
    setProvider(id)
    setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0].id)
  }

  const [source, setSource] = useState<SideConfig>({ mode: 'version', version: '', profileId: null, envId: null })
  const [target, setTarget] = useState<SideConfig>({ mode: 'version', version: '', profileId: null, envId: null })

  const [perspective, setPerspectiveState] = useState<Perspective>(() => loadPerspective('migration', 'technical'))
  const setPerspective = (p: Perspective) => { setPerspectiveState(p); savePerspective('migration', p) }

  const [messages, setMessages] = useState<Message[]>([])
  const [input,     setInput]   = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef  = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const assistantRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id ?? null

  // When a brand-new assistant response appears, anchor the viewport at its TOP
  // so the user sees the start of the response (not the bottom).
  useEffect(() => {
    if (!lastAssistantId) return
    const el = assistantRefs.current.get(lastAssistantId)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [lastAssistantId])

  const sourceVersion = resolveVersion(source, profiles)
  const targetVersion = resolveVersion(target, profiles)
  const sourceLabel   = resolveLabel(source, profiles)
  const targetLabel   = resolveLabel(target, profiles)
  const sourceRepo    = resolveRepoPath(source, profiles)

  const ready = configuredProviders.length > 0 && !!(sourceVersion || targetVersion)

  const resetConversation = () => {
    abortRef.current?.abort()
    setMessages([])
    setStreaming(false)
  }

  const appendEvent = (msgId: string, evt: AiEvent) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, events: [...(m.events ?? []), evt] } : m
    ))
  }

  const sendWithText = async (text: string) => {
    if (!text.trim() || streaming || !ready) return

    const now = Date.now()
    const userMsg: Message      = { id: String(now),     role: 'user',      text, timestamp: now }
    const assistantMsg: Message = { id: String(now + 1), role: 'assistant', events: [], loading: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    const history = messages
      .filter(m => !m.loading)
      .map(m => ({
        role: m.role,
        content: m.role === 'user'
          ? (m.text ?? '')
          : (m.events?.find(e => e.type === 'text')?.content ?? ''),
      }))
      .filter(m => m.content)
    history.push({ role: 'user', content: text })

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const body: Record<string, unknown> = {
      provider: activeProvider,
      model: activeModelId || undefined,
      messages: history,
      migration_mode: true,
      version: sourceVersion || undefined,
      perspective,
    }

    if (source.mode === 'environment' && source.profileId) {
      body.profile_id = source.profileId
      body.active_env_id = source.envId || undefined
    }
    if (target.mode === 'environment' && target.profileId) {
      body.target_profile_id = target.profileId
      body.target_env_id = target.envId || undefined
    } else if (targetVersion) {
      body.target_version = targetVersion
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        appendEvent(assistantMsg.id, { type: 'error', msg: err.detail ?? `HTTP ${res.status}` })
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt: AiEvent
          try { evt = JSON.parse(line.slice(6)) } catch { continue }
          if (evt.type === 'done') {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id
              ? { ...m, timestamp: Date.now(), inputTokens: evt.input_tokens, outputTokens: evt.output_tokens }
              : m
            ))
          }
          if (evt.type !== 'end') appendEvent(assistantMsg.id, evt)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      appendEvent(assistantMsg.id, { type: 'error', msg: String(err) })
    } finally {
      setStreaming(false)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, loading: false } : m
      ))
    }
  }

  const send = () => { if (input.trim()) sendWithText(input.trim()) }

  const showSuggestions = messages.length === 0 && ready && !input.trim()
  const suggestionList = perspective === 'functional' ? SUGGESTIONS_MIGRATION_FUNCTIONAL : SUGGESTIONS_MIGRATION_TECHNICAL

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <PageHeader
        title="Migration"
        description="Analysez et planifiez vos migrations Odoo en comparant deux versions ou environnements."
        action={
          <button
            onClick={resetConversation}
            title="Effacer la conversation"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: t.radius, cursor: 'pointer',
              background: t.bgMuted, border: `1px solid ${t.border}`,
              fontSize: 12, color: t.muted, fontWeight: 600,
              opacity: messages.length === 0 ? 0.4 : 1,
              transition: 'opacity .15s',
            }}
            disabled={messages.length === 0}
          >
            <ArrowRightLeft size={13} />
            Nouvelle analyse
          </button>
        }
      />

      {/* Context bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        paddingBottom: 14, borderBottom: `1px solid ${t.border}`, marginBottom: 14,
      }}>
        {configuredProviders.length === 0 ? (
          <span style={{ fontSize: 13, color: t.muted }}>
            Aucun fournisseur IA configuré — configurez une clé API dans les Paramètres
          </span>
        ) : (
          <>
            <AiSelector
              providers={configuredProviders}
              provider={activeProvider}
              modelId={activeModelId}
              switchProvider={switchProvider}
              setModelId={setModelId}
            />

            <div style={{ flex: 1 }} />

            {/* Migration path badge */}
            {(sourceVersion || targetVersion) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: t.radiusFull,
                background: `var(--brand, ${t.brand})15`,
                border: `1px solid var(--brand, ${t.brand})40`,
                color: `var(--brand, ${t.brand})`, fontWeight: 600, fontSize: 12,
              }}>
                {sourceLabel} → {targetLabel}
              </div>
            )}

            {/* Repo badge */}
            {sourceRepo.profileId && (
              <span title="Dépôt projet source actif"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: t.radiusFull,
                  background: `${t.success}15`, border: `1px solid ${t.success}40`,
                  color: t.success, fontWeight: 600, fontSize: 12,
                }}>
                <Check size={11} /> ⎇ repo
              </span>
            )}
          </>
        )}
      </div>

      {/* Side selectors */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
        <SideSelector
          label="Source (version actuelle)"
          cfg={source} onChange={setSource}
          versions={versions} profiles={profiles} sourcesData={srcStatus}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '18px 4px', color: t.muted, fontSize: 20, flexShrink: 0,
        }}>
          →
        </div>
        <SideSelector
          label="Cible (version de destination)"
          cfg={target} onChange={setTarget}
          versions={versions} profiles={profiles} sourcesData={srcStatus}
        />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4, marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center', color: t.muted, maxWidth: 520 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⇄</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: t.text, marginBottom: 8 }}>
                Assistant Migration Odoo
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                Sélectionnez une version source et une version cible ci-dessus,
                puis posez votre question sur la migration.
              </div>
            </div>
          </div>
        )}

        {messages.map(m =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text ?? ''} timestamp={m.timestamp} />
          ) : (
            <div
              key={m.id}
              ref={el => { assistantRefs.current.set(m.id, el) }}
              style={{ scrollMarginTop: 8 }}
            >
              <AssistantBubble
                events={m.events ?? []}
                loading={m.loading}
                provider={activeProvider}
                timestamp={m.timestamp}
                inputTokens={m.inputTokens}
                outputTokens={m.outputTokens}
              />
            </div>
          )
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="assistant-composer">
        <div className="assistant-composer-inner">
          {showSuggestions && (
            <div className="assistant-composer-suggestions">
              {suggestionList.map(s => (
                <button key={s} type="button" onClick={() => setInput(s)} className="assistant-composer-suggestion">
                  {s}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={
              configuredProviders.length === 0
                ? 'Configurez un fournisseur IA dans les Paramètres'
                : !sourceVersion && !targetVersion
                ? 'Sélectionnez une version source et une version cible ci-dessus'
                : `Posez une question sur la migration ${sourceVersion ?? '?'} → ${targetVersion ?? '?'}… (Entrée pour envoyer)`
            }
            disabled={!ready || streaming}
            rows={3}
            className="assistant-textarea"
            style={{ paddingLeft: 16 }}
          />
          <div className="assistant-perspective-slot">
            <PerspectiveToggle
              value={perspective}
              onChange={setPerspective}
              size="sm"
              disabled={streaming}
            />
          </div>
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={!streaming && (!input.trim() || !ready)}
            title={streaming ? 'Arrêter la génération' : 'Envoyer (Entrée)'}
            className={`assistant-send-button${streaming ? ' is-streaming' : ''}`}
          >
            {streaming ? <Square size={15} /> : <ArrowUp size={18} />}
          </button>
        </div>
        <div className="assistant-composer-meta">
          <span>Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</span>
          {(sourceVersion || targetVersion) && (
            <span>{sourceLabel} → {targetLabel}</span>
          )}
        </div>
      </div>
    </div>
  )
}
