import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bot, ArrowRightLeft, ChevronDown, Database, FolderKanban, Info, Settings, Workflow, Wand2, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react'
import { getUserProfile } from '../api/client'
import { normalizeUiLanguage } from '../i18n'
import { APP_VERSION } from '../version'
import { streamingSignals, type StreamStatus } from '../utils/streamingSignals'
import { sourceSyncSignals } from '../utils/sourceSyncSignals'

const labels = {
  fr: {
    sources: 'Sources',
    profiles: 'Mes projets',
    assistant: 'Assistant IA',
    migration: 'Migration',
    creator: 'Création',
    how: 'Fonctionnement',
    settings: 'Paramètres',
    about: 'À propos',
    consultant: 'Consultant',
    context: 'Contexte',
    sourcesUpdating: 'Sources en cours',
  },
  en: {
    sources: 'Sources',
    profiles: 'Projects',
    assistant: 'AI Assistant',
    migration: 'Migration',
    creator: 'Creator',
    how: 'How it works',
    settings: 'Settings',
    about: 'About',
    consultant: 'Consultant',
    context: 'Context',
    sourcesUpdating: 'Sources running',
  },
}

const primaryLinks = [
  { to: '/sources',   labelKey: 'sources',   icon: Database },
  { to: '/profiles',  labelKey: 'profiles',  icon: FolderKanban },
]

const workflowLinks = [
  { to: '/assistant', labelKey: 'assistant', icon: Bot },
  { to: '/migration', labelKey: 'migration', icon: ArrowRightLeft },
  { to: '/creator',   labelKey: 'creator',   icon: Wand2 },
]

const secondaryLinks = [
  { to: '/how-it-works', labelKey: 'how', icon: Workflow },
  { to: '/settings',  labelKey: 'settings',  icon: Settings },
  { to: '/about',     labelKey: 'about',     icon: Info },
]

function TopbarClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const date = now.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="topbar-clock" title={`${date} ${time}`} aria-label={`${date} ${time}`}>
      <span className="topbar-clock-date">{date}</span>
      <span className="topbar-clock-time">{time}</span>
    </div>
  )
}

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

  // Subscribe to global activity signals so nav indicators update live.
  const [, rerender] = useState(0)
  useEffect(() => {
    const offStreaming = streamingSignals.subscribe(() => rerender(n => n + 1))
    const offSourceSync = sourceSyncSignals.subscribe(() => rerender(n => n + 1))
    return () => { offStreaming(); offSourceSync() }
  }, [])

  const signalFor = (pageKey: string): StreamStatus | null => {
    const sigs = streamingSignals.forPage(pageKey as 'assistant' | 'migration' | 'creator')
    if (sigs.some(s => s.status === 'streaming')) return 'streaming'
    if (sigs.some(s => s.status === 'done')) return 'done'
    return null
  }
  const lang = normalizeUiLanguage(up.language)
  const tr = labels[lang]
  const sourceSyncRunning = sourceSyncSignals.running()
  const avatarIsImg = (up.avatar as string | undefined)?.startsWith('data:')
  const ContextIcon = contextOpen ? PanelRightClose : PanelRightOpen
  const showContextToggle = location.pathname === '/assistant' || location.pathname === '/migration' || location.pathname === '/creator'

  return (
    <header className="app-topbar">
      <div className="topbar-brand">
        <div className="topbar-title">
          <div>
            Better Odoo Assistant
          </div>
          <span>v{APP_VERSION} · CONSULTING WORKSPACE</span>
        </div>
      </div>

      <nav className="topbar-nav" aria-label="Navigation principale">
        {primaryLinks.map(l => {
          const Icon = l.icon
          const isSourcesLink = l.labelKey === 'sources'
          return (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} aria-hidden />
              <span className="topbar-link-label">{tr[l.labelKey as keyof typeof tr]}</span>
              {isSourcesLink && sourceSyncRunning.length > 0 && (
                <span
                  className="stream-dot stream-dot--streaming"
                  title={tr.sourcesUpdating}
                  aria-hidden
                />
              )}
            </NavLink>
          )
        })}
        <span className="topbar-nav-separator" aria-hidden="true" />
        {workflowLinks.map(l => {
          const Icon = l.icon
          const pageKey = l.labelKey
          const sig = signalFor(pageKey)
          return (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} aria-hidden />
              <span className="topbar-link-label">{tr[l.labelKey as keyof typeof tr]}</span>
              {sig && (
                <span
                  className={`stream-dot stream-dot--${sig}`}
                  title={sig === 'streaming' ? 'Réponse en cours…' : 'Réponse disponible'}
                  aria-hidden
                />
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="topbar-spacer" />

      {sourceSyncRunning.length > 0 && (
        <NavLink to="/sources" className="topbar-sync-indicator" title={tr.sourcesUpdating}>
          <RefreshCw size={13} aria-hidden />
          <span>{tr.sources}</span>
          <b>{sourceSyncRunning.length}</b>
        </NavLink>
      )}

      <TopbarClock />

      {showContextToggle && (
        <button type="button" className="topbar-context-button" onClick={onToggleContext} title={tr.context}>
          <ContextIcon size={16} />
          <span>{tr.context}</span>
        </button>
      )}

      <UserMenu
        avatar={up.avatar as string | undefined}
        avatarIsImg={avatarIsImg ?? false}
        name={up.name as string | undefined}
        subtitle={(up.title as string | undefined) || tr.consultant}
        items={secondaryLinks.map(l => ({
          to: l.to,
          label: tr[l.labelKey as keyof typeof tr],
          Icon: l.icon,
        }))}
        activePath={location.pathname}
      />
    </header>
  )
}

function UserMenu({ avatar, avatarIsImg, name, subtitle, items, activePath }: {
  avatar?: string
  avatarIsImg: boolean
  name?: string
  subtitle: string
  items: { to: string; label: string; Icon: typeof Info }[]
  activePath: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onEsc) }
  }, [open])

  return (
    <div ref={ref} className="topbar-user-menu" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="topbar-user topbar-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="topbar-avatar">
          {avatarIsImg && avatar
            ? <img src={avatar} alt="avatar" />
            : avatar && avatar !== '👤'
              ? <span>{avatar}</span>
              : <span>O</span>
          }
        </div>
        <div className="topbar-user-text">
          <div>{name || 'Better Odoo Assistant'}</div>
          <span>{subtitle}</span>
        </div>
        <ChevronDown size={14} aria-hidden style={{
          marginLeft: 4, opacity: 0.7,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .15s',
        }} />
      </button>
      {open && (
        <div className="topbar-user-dropdown" role="menu">
          {items.map(({ to, label, Icon }) => {
            const isActive = activePath === to
            return (
              <button
                key={to}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); navigate(to) }}
                className={`topbar-user-dropdown-item${isActive ? ' is-active' : ''}`}
              >
                <Icon size={15} aria-hidden />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
