import type React from 'react'
import { useState } from 'react'
import { Bot, Database, FileText, FolderCode, GitBranch, Globe2, Layers3, Lock, PanelRight, RefreshCw, Sparkles, Workflow } from 'lucide-react'
import { countryFlag } from '../utils/countryFlag'
import { useQuery } from '@tanstack/react-query'
import { useUiLanguage } from '../i18n'
import type { Perspective, PerspectiveMode } from './PerspectiveToggle'
import { PERSPECTIVE_COLORS } from './PerspectiveToggle'
import PerspectiveSelect from './PerspectiveSelect'
import { perspectiveLabel } from '../utils/aiContext'
import type { ContextFileSource } from '../utils/aiContext'
import { listContextFiles } from '../api/client'

interface ContextFileMeta { name: string; size: number; modified: number }

/** Days since the file was last edited on disk. Used to flag stale context
 * documents so the user knows to refresh outdated guides. */
function daysSince(modifiedEpochSeconds: number): number {
  return Math.floor((Date.now() / 1000 - modifiedEpochSeconds) / 86400)
}

const STALE_DAYS = 180   // editable files unchanged for 6 months → "vieux"
const AGING_DAYS = 90    // unchanged for 3 months → "à revoir"

function freshnessTone(days: number): 'fresh' | 'aging' | 'stale' {
  if (days >= STALE_DAYS) return 'stale'
  if (days >= AGING_DAYS) return 'aging'
  return 'fresh'
}

interface ConversationContextPanelProps {
  title?: string
  mode: PerspectiveMode
  effectivePerspective: Perspective
  onModeChange?: (mode: PerspectiveMode) => void
  disabled?: boolean
  provider?: string
  model?: string
  project?: string
  environment?: string
  company?: string
  /** ISO 3166-1 alpha-2 country code of the active company (e.g. "FR", "CH"). Used to display a flag emoji. */
  countryCode?: string | null
  localization?: string
  complexity?: string
  version?: string | null
  targetVersion?: string | null
  repo?: string | null
  contextFiles: string[]
  /** Optional per-file source — when supplied, pills show a small origin tag
   * ("from project" vs "from keyword"). Files not in the map render plainly. */
  contextFileSources?: Map<string, ContextFileSource>
  sources: string[]
  attachments: string[]
  /** When set, the profile section displays this label with a lock icon and
   * hides the perspective toggle — used by the Creator where the profile is
   * fixed. Backend perspective is still computed normally. */
  lockedProfileLabel?: string
  /** Helper text under the lock chip (e.g. why it's locked). */
  lockedProfileHint?: string
  /** When provided, displays a refresh button in the panel header that runs
   * a unified refresh of the project context (custom repo pull + fiscal
   * localization + technical complexity). The promise should resolve with a
   * short human-readable summary that the caller surfaces as a toast. */
  onRefresh?: () => Promise<string | void>
}

export default function ConversationContextPanel({
  title,
  mode,
  effectivePerspective,
  onModeChange,
  disabled,
  provider,
  model,
  project,
  environment,
  company,
  countryCode,
  localization,
  complexity,
  version,
  targetVersion,
  repo,
  contextFiles,
  contextFileSources,
  sources,
  attachments,
  lockedProfileLabel,
  lockedProfileHint,
  onRefresh,
}: ConversationContextPanelProps) {
  const lang = useUiLanguage()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshFlash, setRefreshFlash] = useState<string | null>(null)
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    setRefreshFlash(null)
    try {
      const summary = await onRefresh()
      setRefreshFlash(typeof summary === 'string' && summary
        ? summary
        : (lang === 'en' ? 'Context refreshed' : 'Contexte rafraîchi'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRefreshFlash((lang === 'en' ? 'Refresh failed: ' : 'Échec : ') + msg)
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshFlash(null), 6000)
    }
  }
  // Fetch context-file freshness once per UI language; React Query dedupes
  // across the multiple pages that mount this panel.
  const { data: contextMeta } = useQuery<ContextFileMeta[]>({
    queryKey: ['context-files-meta', lang],
    queryFn: async () => {
      const res = await listContextFiles(lang)
      return res.data ?? []
    },
    staleTime: 60_000,
  })
  const ageByName = new Map<string, number>()
  for (const meta of contextMeta ?? []) ageByName.set(meta.name, daysSince(meta.modified))
  const c = lang === 'en'
    ? {
      title: title ?? 'Conversation context',
      profile: 'Response profile',
      automatic: 'Automatic',
      manual: 'Manual',
      selection: 'Current selection',
      project: 'Project',
      environment: 'Environment',
      company: 'Company',
      complexity: 'Complexity',
      repository: 'Repository',
      localization: 'Fiscal localization',
      ai: 'AI',
      context: 'Markdown context',
      sources: 'Sources used',
      attachments: 'Attachments',
      none: 'None yet',
      general: 'General mode',
      version: 'Version',
      target: 'Target',
    }
    : {
      title: title ?? 'Contexte de discussion',
      profile: 'Profil de réponse',
      automatic: 'Automatique',
      manual: 'Manuel',
      selection: 'Sélection courante',
      project: 'Projet',
      environment: 'Environnement',
      company: 'Société',
      complexity: 'Complexité',
      repository: 'Dépôt',
      localization: 'Localisation fiscale',
      ai: 'IA',
      context: 'Contexte Markdown',
      sources: 'Sources utilisées',
      attachments: 'Pièces jointes',
      none: 'Aucun pour le moment',
      general: 'Mode général',
      version: 'Version',
      target: 'Cible',
    }

  const localizationFile = localizationContextFile(countryCode)

  return (
    <aside className="workspace-context conversation-context" aria-label={c.title}>
      <div className="workspace-context-header" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <PanelRight size={16} />
          <span>{c.title}</span>
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="ui-icon-button"
            aria-label={lang === 'en' ? 'Refresh project context' : 'Rafraîchir le contexte projet'}
            title={lang === 'en'
              ? 'Refresh repo + localization + complexity'
              : 'Rafraîchir dépôt + localisation + complexité'}
            style={{ opacity: refreshing ? 0.55 : 1 }}
          >
            <RefreshCw size={14} className={refreshing ? 'cc-refresh-spin' : undefined} />
          </button>
        )}
      </div>
      {refreshFlash && (
        <div className="cc-refresh-flash"
          role="status"
          style={{
            margin: '0 12px 6px',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 11,
            background: 'color-mix(in srgb, var(--brand) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--brand) 35%, transparent)',
            color: 'var(--th-text, inherit)',
            lineHeight: 1.35,
          }}>
          {refreshFlash}
        </div>
      )}

      <ContextBlock icon={<Sparkles size={15} />} label={c.profile}>
        {lockedProfileLabel ? (
          <div className="conversation-profile-card">
            <div className="conversation-profile-live"
              style={{ '--persp-color': 'var(--brand)' } as React.CSSProperties}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Lock size={12} style={{ opacity: 0.75 }} aria-hidden="true" />
                {lockedProfileLabel}
              </strong>
              <span>{lockedProfileHint ?? (lang === 'en' ? 'Locked for this mode' : 'Verrouillé pour ce mode')}</span>
            </div>
          </div>
        ) : onModeChange ? (
          <PerspectiveSelect
            value={mode}
            effectiveValue={effectivePerspective}
            onChange={onModeChange}
            disabled={disabled}
          />
        ) : (
          <div className="conversation-profile-card">
            <div className="conversation-profile-live"
              style={{ '--persp-color': PERSPECTIVE_COLORS[effectivePerspective] } as React.CSSProperties}>
              <strong>{perspectiveLabel(effectivePerspective, lang)}</strong>
              <span>{mode === 'auto' ? c.automatic : c.manual}</span>
            </div>
          </div>
        )}
      </ContextBlock>

      <ContextBlock icon={<Bot size={15} />} label={c.ai}>
        <strong>{provider || c.none}</strong>
        {model && <span>{model}</span>}
      </ContextBlock>

      <ContextBlock icon={<Workflow size={15} />} label={c.selection}>
        {project || environment || company || version ? (
          <div className="conversation-selection-chips" style={{
            display: 'flex', flexWrap: 'wrap', gap: 5,
          }}>
            {project && (
              <ContextChip tone="brand" title={c.project}>
                {project}
              </ContextChip>
            )}
            {environment && (
              <ContextChip tone="neutral" title={c.environment}>
                {environment}
              </ContextChip>
            )}
            {company && (
              <ContextChip tone="neutral" title={c.company}>
                {countryCode && <span style={{ fontSize: 12 }}>{countryFlag(countryCode)}</span>}
                {company}
              </ContextChip>
            )}
            {version && (
              <ContextChip tone="accent" title={c.version}>
                {targetVersion ? `v${version} → v${targetVersion}` : `v${version}`}
              </ContextChip>
            )}
            {complexity && (
              <ContextChip tone="muted" title={c.complexity} icon={<Layers3 size={10} />}>
                {complexity}
              </ContextChip>
            )}
            {repo && (
              <ContextChip tone="muted" title={c.repository} icon={<GitBranch size={10} />}>
                {repo.split('/').slice(-2).join('/')}
              </ContextChip>
            )}
          </div>
        ) : <span>{c.general}</span>}
      </ContextBlock>

      {localization && (
        <ContextBlock icon={<Globe2 size={15} />} label={c.localization}>
          <div className="context-pill-row">
            {localizationFile && (
              <span className="ui-badge" style={localizationBadgeStyle(countryCode)}>
                {localizationFile}
              </span>
            )}
          </div>
        </ContextBlock>
      )}

      <ContextBlock icon={<FileText size={15} />} label={c.context}>
        <FreshnessPillList items={contextFiles} empty={c.none} ageByName={ageByName}
          sources={contextFileSources} lang={lang} />
      </ContextBlock>

      {sources.length > 0 && (
        <ContextBlock icon={<Database size={15} />} label={c.sources}>
          <PillList items={sources} empty={c.none} tone="success" />
        </ContextBlock>
      )}

      {attachments.length > 0 && (
        <ContextBlock icon={<FolderCode size={15} />} label={c.attachments}>
          <PillList items={attachments} empty={c.none} tone="neutral" />
        </ContextBlock>
      )}
    </aside>
  )
}

function localizationContextFile(countryCode?: string | null) {
  const code = (countryCode || '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? `l10n_${code}.md` : null
}

function localizationBadgeStyle(countryCode?: string | null): React.CSSProperties {
  const tones: Record<string, { bg: string; fg: string }> = {
    CH: { bg: '#ff3341', fg: '#ffffff' },
    FR: { bg: '#114ee8', fg: '#ffffff' },
    BE: { bg: '#ffd735', fg: '#1a1a1a' },
    LU: { bg: '#48e7ff', fg: '#12313c' },
  }
  const tone = tones[(countryCode || '').toUpperCase()] ?? {
    bg: 'var(--brand)',
    fg: 'var(--brand-contrast)',
  }
  return {
    background: tone.bg,
    borderColor: tone.bg,
    color: tone.fg,
  }
}

function ContextChip({ children, tone, title, icon }: {
  children: React.ReactNode
  tone: 'brand' | 'accent' | 'neutral' | 'muted'
  title?: string
  icon?: React.ReactNode
}) {
  const toneStyles: Record<string, React.CSSProperties> = {
    brand:   { background: 'var(--brand)', color: 'var(--brand-contrast, #fff)', borderColor: 'var(--brand)' },
    accent:  { background: 'color-mix(in srgb, var(--brand) 18%, transparent)', color: 'var(--th-text)', borderColor: 'color-mix(in srgb, var(--brand) 40%, transparent)' },
    neutral: { background: 'var(--th-surface-2, #f3f4f6)', color: 'var(--th-text)', borderColor: 'var(--th-border)' },
    muted:   { background: 'transparent', color: 'var(--th-muted)', borderColor: 'var(--th-border)' },
  }
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 5,
        fontSize: 11, fontWeight: 600, lineHeight: 1.3,
        border: '1px solid', ...toneStyles[tone],
      }}>
      {icon}
      {children}
    </span>
  )
}

function ContextBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section className="workspace-context-block">
      <div className="workspace-context-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="workspace-context-content">{children}</div>
    </section>
  )
}

function FreshnessPillList({
  items, empty, ageByName, sources, lang,
}: {
  items: string[]
  empty: string
  ageByName: Map<string, number>
  sources?: Map<string, ContextFileSource>
  lang: 'fr' | 'en'
}) {
  if (!items.length) return <span>{empty}</span>
  const sourceLabel = (source?: ContextFileSource): string | null => {
    if (!source || source === 'system') return null
    if (source === 'complexity') return lang === 'en' ? 'project' : 'projet'
    if (source === 'keyword') return lang === 'en' ? 'keyword' : 'mots-clés'
    return null
  }
  // Surface the outliers (aging/stale) and the keyword/complexity-tagged
  // files; collapse the rest of the "fresh & untagged" pile into a single
  // counter so the panel doesn't drown the user in pills they don't need to act on.
  const flagged: string[] = []
  const quiet: string[] = []
  for (const item of items) {
    const age = ageByName.get(item)
    const tone = age !== undefined ? freshnessTone(age) : 'fresh'
    const source = sources?.get(item)
    const tagged = source === 'complexity' || source === 'keyword'
    if (tone !== 'fresh' || tagged) flagged.push(item)
    else quiet.push(item)
  }
  const visible = flagged.length ? flagged : items.slice(0, 8)
  return (
    <div className="context-pill-row">
      {visible.slice(0, 8).map(item => {
        const age = ageByName.get(item)
        const hasAge = age !== undefined
        // Only show the freshness dot when it's an outlier (aging or stale).
        // A fresh file gets a plain pill — no need to flag the obvious.
        const tone = hasAge ? freshnessTone(age) : 'fresh'
        const showDot = tone === 'aging' || tone === 'stale'
        const ageLabel = !hasAge
          ? null
          : age < 1
            ? (lang === 'en' ? 'today' : "aujourd'hui")
            : age < 30
              ? `${age}${lang === 'en' ? 'd' : 'j'}`
              : age < 365
                ? `${Math.round(age / 30)}${lang === 'en' ? 'mo' : 'm'}`
                : `${Math.round(age / 365)}${lang === 'en' ? 'y' : 'a'}`
        const ageHint = !hasAge
          ? null
          : lang === 'en'
            ? `Last edited ${age} day(s) ago`
            : `Dernière modification il y a ${age} jour(s)`
        const source = sources?.get(item)
        const srcLabel = sourceLabel(source)
        const srcHint = source === 'complexity'
          ? (lang === 'en' ? 'Loaded from project complexity' : 'Chargé via la complexité du projet')
          : source === 'keyword'
            ? (lang === 'en' ? 'Loaded from prompt keyword' : 'Chargé via un mot-clé du prompt')
            : null
        const title = [ageHint, srcHint].filter(Boolean).join(' · ') || undefined
        const dotColor = tone === 'stale' ? '#b02626' : '#caa804'
        const hasExtras = showDot || ageLabel || srcLabel
        return (
          <span key={item} className="ui-badge ui-badge-brand" title={title}
            style={hasExtras
              ? { display: 'inline-flex', alignItems: 'center', gap: 5 }
              : undefined}>
            {showDot && (
              <span aria-hidden="true" style={{
                width: 6, height: 6, borderRadius: 3, background: dotColor, flexShrink: 0,
              }} />
            )}
            <span>{item}</span>
            {ageLabel && (
              <span style={{ fontSize: 9.5, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                {ageLabel}
              </span>
            )}
            {srcLabel && (
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                padding: '1px 5px', borderRadius: 4,
                background: source === 'complexity'
                  ? 'color-mix(in srgb, var(--brand-contrast) 14%, transparent)'
                  : 'color-mix(in srgb, var(--brand-contrast) 8%, transparent)',
                opacity: 0.95,
              }}>{srcLabel}</span>
            )}
          </span>
        )
      })}
      {visible.length > 8 && (
        <span className="ui-badge ui-badge-neutral">+{visible.length - 8}</span>
      )}
      {flagged.length > 0 && quiet.length > 0 && (
        <span className="ui-badge ui-badge-neutral"
          title={lang === 'en'
            ? `${quiet.length} fresh context file(s) not shown`
            : `${quiet.length} fichier(s) à jour non affichés`}>
          {lang === 'en' ? `+${quiet.length} fresh` : `+${quiet.length} à jour`}
        </span>
      )}
    </div>
  )
}

function PillList({ items, empty, tone }: { items: string[]; empty: string; tone: 'brand' | 'success' | 'neutral' }) {
  if (!items.length) return <span>{empty}</span>
  const className = tone === 'brand' ? 'ui-badge ui-badge-brand' : tone === 'success' ? 'ui-badge ui-badge-success' : 'ui-badge ui-badge-neutral'
  return (
    <div className="context-pill-row">
      {items.slice(0, 8).map(item => <span key={item} className={className}>{item}</span>)}
      {items.length > 8 && <span className="ui-badge ui-badge-neutral">+{items.length - 8}</span>}
    </div>
  )
}
