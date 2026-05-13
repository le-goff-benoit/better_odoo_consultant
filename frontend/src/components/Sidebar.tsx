import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { Bot, ArrowRightLeft, Database, FolderKanban, Info, Settings, Workflow } from 'lucide-react'
import { t } from '../theme'
import { getUserProfile } from '../api/client'
import { APP_VERSION } from '../version'

const links = [
  { to: '/sources',   label: 'Sources',      icon: Database },
  { to: '/profiles',  label: 'Mes projets',  icon: FolderKanban },
  { to: '/assistant', label: 'Assistant IA', icon: Bot },
  { to: '/migration', label: 'Migration',    icon: ArrowRightLeft },
  { to: '/how-it-works', label: 'Fonctionnement', icon: Workflow },
  { to: '/settings',  label: 'Paramètres',   icon: Settings },
  { to: '/about',     label: 'À propos',     icon: Info },
]

export default function Sidebar() {
  const { data } = useQuery({ queryKey: ['user-profile'], queryFn: getUserProfile, staleTime: 60_000 })
  const up = data?.data ?? {}
  const avatarIsImg = (up.avatar as string | undefined)?.startsWith('data:')

  return (
    <nav style={{
      width: t.navWidth,
      minHeight: '100vh',
      background: t.sidebarBg,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
      borderRight: '1px solid rgba(255,255,255,.06)',
    }}>
      {/* Profile header */}
      <div style={{
        padding: '18px 16px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid rgba(255,255,255,.07)',
        marginBottom: 8,
      }}>
        {/* Avatar / O logo */}
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `var(--brand, #017e84)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        }}>
          {avatarIsImg
            ? <img src={up.avatar as string} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="avatar" />
            : up.avatar && up.avatar !== '👤'
              ? <span style={{ fontSize: 18 }}>{up.avatar}</span>
              : <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.5px' }}>O</span>
          }
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {up.name || 'Odoo Portal'}
          </div>
          <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {up.title || 'Consultant'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '4px 10px' }}>
        {links.map(l => {
          const Icon = l.icon
          return (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon size={16} aria-hidden />
            {l.label}
          </NavLink>
          )
        })}
      </div>

      {/* Footer — version only */}
      <div style={{
        padding: '8px 16px 12px',
        borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 10 }}>v{APP_VERSION}</span>
        <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 10 }}>© Benoît Le Goff</span>
      </div>
    </nav>
  )
}
