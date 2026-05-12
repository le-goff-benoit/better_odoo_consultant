import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import { t } from '../theme'
import Icon, { IconName } from './Icon'
import { getUserProfile } from '../api/client'

const links: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
  { to: '/sources',   label: 'Sources',          icon: 'download'  },
  { to: '/profiles',  label: 'Mes projets',      icon: 'building'  },
  { to: '/assistant', label: 'Assistant IA',     icon: 'zap'       },
  { to: '/query',     label: 'Requêtes',         icon: 'search'    },
  { to: '/history',   label: 'Historique',       icon: 'clock'     },
  { to: '/settings',  label: 'Paramètres',       icon: 'settings'  },
  { to: '/about',     label: 'À propos',         icon: 'info'      },
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
      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid rgba(255,255,255,.07)',
        marginBottom: 8,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `var(--brand, ${t.brand})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, boxShadow: '0 2px 8px rgba(1,126,132,.4)',
        }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.5px' }}>O</span>
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Odoo Portal</div>
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, marginTop: 1 }}>Consultant</div>
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
                  color={isActive ? `var(--brand, ${t.brand})` : 'rgba(255,255,255,.5)'}
                />
                {l.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer / user identity */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}>
        {up.name ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: `${up.primaryColor ?? t.brand}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            }}>
              {avatarIsImg
                ? <img src={up.avatar as string} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (up.avatar || '👤')}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {up.name}
              </div>
              {up.title && (
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {up.title}
                </div>
              )}
            </div>
          </div>
        ) : null}
        <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span>v0.8.0</span>
          <span>© Benoît Le Goff</span>
        </div>
      </div>
    </nav>
  )
}
