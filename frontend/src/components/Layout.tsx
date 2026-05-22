import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import UpdateBanner from './UpdateBanner'

export const WIDTH_OPTIONS = [
  { id: 'narrow',  label: 'Étroit', labelEn: 'Narrow', px: 800  },
  { id: 'medium',  label: 'Moyen', labelEn: 'Medium', px: 1100 },
  { id: 'wide',    label: 'Large', labelEn: 'Wide', px: 1400 },
  { id: 'full',    label: 'Pleine largeur', labelEn: 'Full width', px: 0 },
] as const

export type ContentWidth = typeof WIDTH_OPTIONS[number]['id']
export const WIDTH_KEY = 'app-content-width'
const CONTEXT_PANEL_KEY = 'app-context-panel-open'

const WorkspaceContextState = createContext({ contextOpen: true })

export function useWorkspaceContext() {
  return useContext(WorkspaceContextState)
}

export function isContentWidth(value: string | null): value is ContentWidth {
  return WIDTH_OPTIONS.some(option => option.id === value)
}

export function getStoredWidth(): ContentWidth {
  try {
    const value = localStorage.getItem(WIDTH_KEY)
    return isContentWidth(value) ? value : 'medium'
  } catch {
    return 'medium'
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<ContentWidth>(getStoredWidth)
  const [contextOpen, setContextOpen] = useState(() => {
    try { return localStorage.getItem(CONTEXT_PANEL_KEY) !== 'closed' } catch { return true }
  })

  useEffect(() => {
    const handler = () => setWidth(getStoredWidth())
    window.addEventListener('storage', handler)
    window.addEventListener('app-width-change', handler)
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('app-width-change', handler) }
  }, [])

  const opt = WIDTH_OPTIONS.find(o => o.id === width) ?? WIDTH_OPTIONS[1]
  const maxW = opt.px > 0 ? opt.px : undefined
  const toggleContext = () => {
    setContextOpen(prev => {
      const next = !prev
      try { localStorage.setItem(CONTEXT_PANEL_KEY, next ? 'open' : 'closed') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className="app-shell">
      <UpdateBanner />
      <Sidebar contextOpen={contextOpen} onToggleContext={toggleContext} />
      <WorkspaceContextState.Provider value={{ contextOpen }}>
        <div className="app-workspace">
          <main className="app-main">
            <div className="app-page" data-content-width={width} style={{ maxWidth: maxW }}>
              {children}
            </div>
          </main>
        </div>
      </WorkspaceContextState.Provider>
    </div>
  )
}
