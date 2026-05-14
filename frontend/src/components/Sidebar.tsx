import { useQuery } from '@tanstack/react-query'
import { NavLink, useLocation } from 'react-router-dom'
import { Bot, ArrowRightLeft, Database, FolderKanban, Info, Settings, Workflow, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { getUserProfile } from '../api/client'
import { normalizeUiLanguage } from '../i18n'
import { APP_VERSION } from '../version'

const labels = {
  fr: {
    sources: 'Sources',
    profiles: 'Mes projets',
    assistant: 'Assistant IA',
    migration: 'Migration',
    how: 'Fonctionnement',
    settings: 'Paramètres',
    about: 'À propos',
    consultant: 'Consultant',
    context: 'Contexte',
  },
  en: {
    sources: 'Sources',
    profiles: 'Projects',
    assistant: 'AI Assistant',
    migration: 'Migration',
    how: 'How it works',
    settings: 'Settings',
    about: 'About',
    consultant: 'Consultant',
    context: 'Context',
  },
}

const primaryLinks = [
  { to: '/assistant', labelKey: 'assistant', icon: Bot },
  { to: '/migration', labelKey: 'migration', icon: ArrowRightLeft },
  { to: '/profiles',  labelKey: 'profiles',  icon: FolderKanban },
  { to: '/sources',   labelKey: 'sources',   icon: Database },
]

const secondaryLinks = [
  { to: '/how-it-works', labelKey: 'how', icon: Workflow },
  { to: '/settings',  labelKey: 'settings',  icon: Settings },
  { to: '/about',     labelKey: 'about',     icon: Info },
]

export default function Sidebar({
  contextOpen,
  onToggleContext,
}: {
  contextOpen: boolean
  onToggleContext: () => void
}) {
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile, staleTime: 60_000 })
  const location = useLocation()
  const up = data?.data ?? {}
  const lang = normalizeUiLanguage(up.language)
  const tr = labels[lang]
  const avatarIsImg = (up.avatar as string | undefined)?.startsWith('data:')
  const ContextIcon = contextOpen ? PanelRightClose : PanelRightOpen
  const showContextToggle = location.pathname === '/assistant' || location.pathname === '/migration'

  return (
    <header className="app-topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">
          O
        </div>
        <div className="topbar-title">
          <div>Odoo Consultant</div>
          <span>v{APP_VERSION}</span>
        </div>
      </div>

      <nav className="topbar-nav" aria-label="Navigation principale">
        {primaryLinks.map(l => {
          const Icon = l.icon
          return (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} aria-hidden />
              {tr[l.labelKey as keyof typeof tr]}
            </NavLink>
          )
        })}
      </nav>

      <div className="topbar-spacer" />

      <nav className="topbar-secondary" aria-label="Navigation secondaire">
        {secondaryLinks.map(l => {
          const Icon = l.icon
          return (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `topbar-icon-link${isActive ? ' active' : ''}`}
              title={tr[l.labelKey as keyof typeof tr]}
            >
              <Icon size={16} aria-hidden />
              <span>{tr[l.labelKey as keyof typeof tr]}</span>
            </NavLink>
          )
        })}
      </nav>

      {showContextToggle && (
        <button type="button" className="topbar-context-button" onClick={onToggleContext} title={tr.context}>
          <ContextIcon size={16} />
          <span>{tr.context}</span>
        </button>
      )}

      <div className="topbar-user">
        <div className="topbar-avatar">
          {avatarIsImg
            ? <img src={up.avatar as string} alt="avatar" />
            : up.avatar && up.avatar !== '👤'
              ? <span>{up.avatar}</span>
              : <span>O</span>
          }
        </div>
        <div className="topbar-user-text">
          <div>
            {up.name || 'Odoo Portal'}
          </div>
          <span>
            {up.title || tr.consultant}
          </span>
        </div>
      </div>
    </header>
  )
}
