import { Bot, Database, FileText, FolderCode, Globe2, PanelRight, Sparkles, Workflow } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import type { Perspective, PerspectiveMode } from './PerspectiveToggle'
import PerspectiveToggle from './PerspectiveToggle'
import { perspectiveLabel } from '../utils/aiContext'
import { countryFlag } from '../utils/countryFlag'

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
  sources: string[]
  attachments: string[]
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
  sources,
  attachments,
}: ConversationContextPanelProps) {
  const lang = useUiLanguage()
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

  const flag = countryFlag(countryCode)
  const companyWithFlag = company && flag ? `${flag} ${company}` : company
  const selectionRows = [
    { label: c.project, value: project || c.general },
    { label: c.environment, value: environment },
    { label: c.company, value: companyWithFlag },
    { label: c.complexity, value: complexity },
    { label: c.version, value: version || undefined },
    { label: c.target, value: targetVersion || undefined },
    { label: c.repository, value: repo ? repo.split('/').slice(-2).join('/') : undefined },
  ].filter(row => row.value)

  return (
    <aside className="workspace-context conversation-context" aria-label={c.title}>
      <div className="workspace-context-header">
        <PanelRight size={16} />
        <span>{c.title}</span>
      </div>

      <ContextBlock icon={<Sparkles size={15} />} label={c.profile}>
        <div className="conversation-profile-card">
          <div className="conversation-profile-live">
            <strong>{perspectiveLabel(effectivePerspective, lang)}</strong>
            <span>{mode === 'auto' ? c.automatic : c.manual}</span>
          </div>
          {onModeChange && (
            <PerspectiveToggle
              value={mode}
              effectiveValue={effectivePerspective}
              onChange={onModeChange}
              size="sm"
              disabled={disabled}
            />
          )}
        </div>
      </ContextBlock>

      <ContextBlock icon={<Bot size={15} />} label={c.ai}>
        <strong>{provider || c.none}</strong>
        {model && <span>{model}</span>}
      </ContextBlock>

      <ContextBlock icon={<Workflow size={15} />} label={c.selection}>
        {selectionRows.length > 0 ? (
          <div className="conversation-selection-list">
            {selectionRows.map(row => (
              <div key={row.label} className="conversation-selection-row">
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : <span>{c.none}</span>}
      </ContextBlock>

      {localization && (
        <ContextBlock icon={<Globe2 size={15} />} label={c.localization}>
          <span>{flag ? `${flag} ${localization}` : localization}</span>
        </ContextBlock>
      )}

      <ContextBlock icon={<FileText size={15} />} label={c.context}>
        <PillList items={contextFiles} empty={c.none} tone="brand" />
      </ContextBlock>

      <ContextBlock icon={<Database size={15} />} label={c.sources}>
        <PillList items={sources} empty={c.none} tone="success" />
      </ContextBlock>

      {attachments.length > 0 && (
        <ContextBlock icon={<FolderCode size={15} />} label={c.attachments}>
          <PillList items={attachments} empty={c.none} tone="neutral" />
        </ContextBlock>
      )}
    </aside>
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
