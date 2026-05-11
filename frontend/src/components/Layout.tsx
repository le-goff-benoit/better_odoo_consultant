import { ReactNode } from 'react'
import Sidebar from './Sidebar'

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh' },
  main: { flex: 1, padding: '24px', overflowY: 'auto' },
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={styles.root}>
      <Sidebar />
      <main style={styles.main}>{children}</main>
    </div>
  )
}
