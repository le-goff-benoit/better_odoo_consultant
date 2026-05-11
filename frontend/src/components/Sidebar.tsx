import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/sources', label: 'Sources' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/projects', label: 'Projects' },
  { to: '/query', label: 'Query' },
  { to: '/history', label: 'History' },
]

const style: React.CSSProperties = {
  width: 200, background: '#1a1a2e', color: '#eee', display: 'flex',
  flexDirection: 'column', padding: '16px 0',
}
const linkStyle: React.CSSProperties = { display: 'block', padding: '10px 20px', color: '#ccc', textDecoration: 'none' }
const activeStyle: React.CSSProperties = { ...linkStyle, background: '#16213e', color: '#fff', fontWeight: 600 }

export default function Sidebar() {
  return (
    <nav style={style}>
      <div style={{ padding: '16px 20px 24px', fontWeight: 700, fontSize: 16, color: '#fff' }}>
        Odoo Portal
      </div>
      {links.map(l => (
        <NavLink key={l.to} to={l.to} style={({ isActive }) => isActive ? activeStyle : linkStyle}>
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
