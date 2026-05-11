import { NavLink } from 'react-router-dom'
import { t } from '../theme'

const links = [
  { to: '/dashboard', label: 'Dashboard',  icon: '⊞' },
  { to: '/sources',   label: 'Sources',    icon: '⬇' },
  { to: '/profiles',  label: 'Mes projets', icon: '🏢' },
  { to: '/projects',  label: 'Dépôts',     icon: '📁' },
  { to: '/query',     label: 'Requêtes',   icon: '🔍' },
  { to: '/history',   label: 'Historique', icon: '🕐' },
]

export default function Sidebar() {
  return (
    <nav style={{
      width: t.navWidth,
      minHeight: '100vh',
      background: t.brand,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
    }}>
      {/* Logo / Brand */}
      <div style={{
        padding: '18px 20px 20px',
        borderBottom: `1px solid rgba(255,255,255,.12)`,
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32,
            background: t.action,
            borderRadius: t.radius,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>O</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Odoo</div>
            <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 11 }}>Consultant Portal</div>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <div style={{ flex: 1, padding: '4px 8px' }}>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: t.radius,
              color: isActive ? '#fff' : 'rgba(255,255,255,.72)',
              textDecoration: 'none',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              background: isActive ? 'rgba(255,255,255,.15)' : 'transparent',
              marginBottom: 2,
              transition: 'background .15s',
            })}
          >
            <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </div>

      {/* Version footer */}
      <div style={{
        padding: '12px 20px',
        borderTop: 'rgba(255,255,255,.1) 1px solid',
        color: 'rgba(255,255,255,.4)',
        fontSize: 11,
      }}>
        v0.1.0
      </div>
    </nav>
  )
}
