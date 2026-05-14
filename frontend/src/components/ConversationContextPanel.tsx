import { Bot, Database, FileText, FolderCode, Globe2, PanelRight, Sparkles, Workflow } from 'lucide-react'
import { t } from '../theme'
import { useUiLanguage } from '../i18n'
import type { ContextItem } from '../utils/aiContext'
import type { Perspective, PerspectiveMode } from './PerspectiveToggle'
import { perspectiveLabel } from '../utils/aiContext'

interface ConversationContextPanelProps {
  title?: string
  mode: PerspectiveMode
  effectivePerspective: Perspective
  provider?: string
  model?: string
  project?: string
  environment?: string
  company?: string
  localization?: string
  version?: string | null
  targetVersion?: string | null
  repo?: string | null
  contextFiles: string[]
  sources: string[]
  attachments: string[]
  toolItems: ContextItem[]
}

export default function ConversationContextPanel({
  title,
  mode,
  effectivePerspective,
  provider,
  model,
  project,
  environment,
  company,
  localization,
  version,
  targetVersion,
  repo,
  contextFiles,
  sources,
  attachments,
  toolItems,
}: ConversationContextPanelProps) {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      title: title ?? 'Conversation context',
      profile: 'Response profile',
      automatic: 'Automatic',
      manual: 'Manual',
      selection: 'Current selection',
      localization: 'Fiscal localization',
      ai: 'AI',
      context: 'Markdown context',
      sources: 'Sources used',
      tools: 'Live lookups',
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
      localization: 'Localisation fiscale',
      ai: 'IA',
      context: 'Contexte Markdown',
      sources: 'Sources utilisées',
      tools: 'Recherches live',
      attachments: 'Pièces jointes',
      none: 'Aucun pour le moment',
      general: 'Mode général',
      version: 'Version',
      target: 'Cible',
    }

  const selectionRows = [
    project || c.general,
    environment,
    company,
    version ? `${c.version} ${version}` : undefined,
    targetVersion ? `${c.target} ${targetVersion}` : undefined,
    repo ? repo.split('/').slice(-2).join('/') : undefined,
  ].filter(Boolean) as string[]

  return (
    <aside className="workspace-context conversation-context" aria-label={c.title}>
      <div className="workspace-context-header">
        <PanelRight size={16} />
        <span>{c.title}</span>
      </div>

      <ContextBlock icon={<Sparkles size={15} />} label={c.profile}>
        <div className="conversation-profile-live">
          <strong>{perspectiveLabel(effectivePerspective, lang)}</strong>
          <span>{mode === 'auto' ? c.automatic : c.manual}</span>
        </div>
      </ContextBlock>

      <ContextBlock icon={<Bot size={15} />} label={c.ai}>
        <strong>{provider || c.none}</strong>
        {model && <span>{model}</span>}
      </ContextBlock>

      <ContextBlock icon={<Workflow size={15} />} label={c.selection}>
        {selectionRows.length > 0 ? selectionRows.map(row => <span key={row}>{row}</span>) : <span>{c.none}</span>}
      </ContextBlock>

      {localization && (
        <ContextBlock icon={<Globe2 size={15} />} label={c.localization}>
          <span>{localization}</span>
        </ContextBlock>
      )}

      <ContextBlock icon={<FileText size={15} />} label={c.context}>
        <PillList items={contextFiles} empty={c.none} tone="brand" />
      </ContextBlock>

      <ContextBlock icon={<Database size={15} />} label={c.sources}>
        <PillList items={sources} empty={c.none} tone="success" />
      </ContextBlock>

      {(attachments.length > 0 || repo) && (
        <ContextBlock icon={<FolderCode size={15} />} label={attachments.length > 0 ? c.attachments : 'Repo'}>
          <PillList items={attachments.length > 0 ? attachments : [repo!]} empty={c.none} tone="neutral" />
        </ContextBlock>
      )}

      <ContextBlock icon={<Database size={15} />} label={c.tools}>
        {toolItems.length > 0 ? (
          <div className="conversation-tool-list">
            {toolItems.map((item, idx) => (
              <div key={`${item.label}-${idx}`} className="conversation-tool-item">
                <span>{item.type === 'tool' ? 'Tool' : item.type === 'source' ? 'Source' : 'File'}</span>
                <strong>{item.label}</strong>
                {item.detail && <small>{item.detail}</small>}
              </div>
            ))}
          </div>
        ) : <span>{c.none}</span>}
      </ContextBlock>
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
