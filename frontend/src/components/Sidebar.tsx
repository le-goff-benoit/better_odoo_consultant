import { NavLink } from 'react-router-dom'
import { t } from '../theme'
import Icon, { IconName } from './Icon'

const links: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
  { to: '/sources',   label: 'Sources',          icon: 'download'  },
  { to: '/profiles',  label: 'Mes projets',      icon: 'building'  },
  { to: '/assistant', label: 'Assistant IA',     icon: 'zap'       },
  { to: '/query',     label: 'Requêtes',         icon: 'search'    },
  { to: '/history',   label: 'Historique',       icon: 'clock'     },
]

export default function Sidebar() {
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
          background: `linear-gradient(135deg, ${t.brand} 0%, ${t.brandDark} 100%)`,
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
                  color={isActive ? t.brand : 'rgba(255,255,255,.5)'}
                />
                {l.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,.07)',
        color: 'rgba(255,255,255,.25)',
        fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>v0.1.0</span>
        <span>MVP</span>
      </div>
    </nav>
  )
}
