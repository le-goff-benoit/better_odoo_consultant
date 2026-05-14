import { ReactNode, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, Database, FolderKanban, KeyRound, PanelRight, Workflow } from 'lucide-react'
import { checkAllSources, getAiProviders, getUserProfile, listProfiles } from '../api/client'
import { normalizeUiLanguage } from '../i18n'
import Sidebar from './Sidebar'

export const WIDTH_OPTIONS = [
  { id: 'narrow',  label: 'Étroit', labelEn: 'Narrow', px: 800  },
  { id: 'medium',  label: 'Moyen', labelEn: 'Medium', px: 1100 },
  { id: 'wide',    label: 'Large', labelEn: 'Wide', px: 1400 },
  { id: 'full',    label: 'Pleine largeur', labelEn: 'Full width', px: 0 },
] as const

export type ContentWidth = typeof WIDTH_OPTIONS[number]['id']
export const WIDTH_KEY = 'app-content-width'
const CONTEXT_PANEL_KEY = 'app-context-panel-open'

export function isContentWidth(value: string | null): value is ContentWidth {
  return WIDTH_OPTIONS.some(option => option.id === value)
}

export function getStoredWidth(): ContentWidth {
  try {
    const value = localStorage.getItem(WIDTH_KEY)
    return isContentWidth(value) ? value : 'medium'
  } catch {
    return 'medium'
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<ContentWidth>(getStoredWidth)
  const [contextOpen, setContextOpen] = useState(() => {
    try { return localStorage.getItem(CONTEXT_PANEL_KEY) !== 'closed' } catch { return true }
  })

  useEffect(() => {
    const handler = () => setWidth(getStoredWidth())
    window.addEventListener('storage', handler)
    window.addEventListener('app-width-change', handler)
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('app-width-change', handler) }
  }, [])

  const opt = WIDTH_OPTIONS.find(o => o.id === width) ?? WIDTH_OPTIONS[1]
  const maxW = opt.px > 0 ? opt.px : undefined
  const toggleContext = () => {
    setContextOpen(prev => {
      const next = !prev
      try { localStorage.setItem(CONTEXT_PANEL_KEY, next ? 'open' : 'closed') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="app-shell">
      <Sidebar contextOpen={contextOpen} onToggleContext={toggleContext} />
      <div className="app-workspace">
        <main className="app-main">
          <div className="app-page" style={{ maxWidth: maxW }}>
            {children}
          </div>
        </main>
        {contextOpen && <WorkspaceContextPanel />}
      </div>
    </div>
  )
}

function WorkspaceContextPanel() {
  const { data: userData } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile, staleTime: 60_000 })
  const { data: profileData } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles, staleTime: 30_000 })
  const { data: providerData } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders, staleTime: 30_000 })
  const { data: sourceData } = useQuery({ queryKey: ['sources-all'], queryFn: checkAllSources, staleTime: 30_000 })

  const user = userData?.data ?? {}
  const lang = normalizeUiLanguage(user.language)
  const profiles = profileData?.data ?? []
  const providers = providerData?.data ?? {}
  const sources = sourceData?.data ?? {}

  const configuredProviders = Object.entries(providers).filter(([, ok]) => ok).map(([name]) => name)
  const installedSources = Object.keys(sources).filter(key => sources[key]?.installed && !key.endsWith('-enterprise'))
  const activeProfile = profiles[0]

  const c = lang === 'en'
    ? {
      title: 'Workspace context',
      profile: 'Consultant',
      ai: 'AI providers',
      projects: 'Projects',
      sources: 'Odoo sources',
      flow: 'Current flow',
      noProvider: 'No provider configured',
      noProject: 'No project yet',
      noSources: 'No sources installed',
      ready: 'ready',
      assistant: 'Assistant and Migration use this context plus page-specific selectors.',
    }
    : {
      title: 'Contexte workspace',
      profile: 'Consultant',
      ai: 'Providers IA',
      projects: 'Projets',
      sources: 'Sources Odoo',
      flow: 'Flux actif',
      noProvider: 'Aucun provider configuré',
      noProject: 'Aucun projet',
      noSources: 'Aucune source installée',
      ready: 'prêt',
      assistant: 'Assistant et Migration utilisent ce contexte avec les sélecteurs de page.',
    }

  return (
    <aside className="workspace-context" aria-label={c.title}>
      <div className="workspace-context-header">
        <PanelRight size={16} />
        <span>{c.title}</span>
      </div>

      <ContextBlock icon={<Bot size={15} />} label={c.profile}>
        <strong>{user.name || 'Odoo Consultant'}</strong>
        <span>{user.title || (lang === 'en' ? 'Consultant' : 'Consultant')}</span>
      </ContextBlock>

      <ContextBlock icon={<KeyRound size={15} />} label={c.ai}>
        {configuredProviders.length > 0 ? (
          <div className="context-pill-row">
            {configuredProviders.slice(0, 4).map(provider => <span key={provider} className="ui-badge ui-badge-brand">{provider}</span>)}
            {configuredProviders.length > 4 && <span className="ui-badge ui-badge-neutral">+{configuredProviders.length - 4}</span>}
          </div>
        ) : <span>{c.noProvider}</span>}
      </ContextBlock>

      <ContextBlock icon={<FolderKanban size={15} />} label={c.projects}>
        <strong>{profiles.length}</strong>
        <span>{activeProfile?.name || c.noProject}</span>
      </ContextBlock>

      <ContextBlock icon={<Database size={15} />} label={c.sources}>
        {installedSources.length > 0 ? (
          <div className="context-pill-row">
            {installedSources.slice(0, 5).map(version => <span key={version} className="ui-badge ui-badge-success">{version}</span>)}
            {installedSources.length > 5 && <span className="ui-badge ui-badge-neutral">+{installedSources.length - 5}</span>}
          </div>
        ) : <span>{c.noSources}</span>}
      </ContextBlock>

      <ContextBlock icon={<Workflow size={15} />} label={c.flow}>
        <span>{c.assistant}</span>
      </ContextBlock>
    </aside>
  )
}

function ContextBlock({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
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
