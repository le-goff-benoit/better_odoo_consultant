import { ReactNode } from 'react'
import { t } from '../theme'
import Sidebar from './Sidebar'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg }}>
      <Sidebar />
      <main style={{
        flex: 1, padding: '32px 36px',
        overflowY: 'auto', minWidth: 0,
        animation: 'fadeIn .2s ease',
      }}>
        {children}
      </main>
    </div>
  )
}
