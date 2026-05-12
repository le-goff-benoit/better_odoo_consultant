import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { t } from '../theme'
import Icon, { IconName } from './Icon'
import { getUserProfile } from '../api/client'

const links: { to: string; label: string; icon: IconName }[] = [
  { to: '/sources',   label: 'Sources',      icon: 'download'  },
  { to: '/profiles',  label: 'Mes projets',  icon: 'building'  },
  { to: '/assistant', label: 'Assistant IA', icon: 'zap'       },
  { to: '/settings',  label: 'Paramètres',   icon: 'settings'  },
  { to: '/about',     label: 'À propos',     icon: 'info'      },
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
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 6, marginBottom: 2,
              color: isActive ? t.sidebarTextActive : t.sidebarText,
              background: isActive ? 'rgba(255,255,255,.1)' : 'transparent',
              textDecoration: 'none', fontWeight: isActive ? 600 : 400,
              fontSize: 13, transition: 'background .12s, color .12s',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon
                  name={l.icon}
                  size={15}
                  color={isActive ? `var(--brand, #017e84)` : 'rgba(255,255,255,.5)'}
                />
                {l.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer — version only */}
      <div style={{
        padding: '8px 16px 12px',
        borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 10 }}>v0.10.0</span>
        <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 10 }}>© Benoît Le Goff</span>
      </div>
    </nav>
  )
}
