import { ReactNode, useEffect, useState } from 'react'
import { t } from '../theme'
import Sidebar from './Sidebar'

export const WIDTH_OPTIONS = [
  { id: 'narrow',  label: 'Étroit', labelEn: 'Narrow', px: 800  },
  { id: 'medium',  label: 'Moyen', labelEn: 'Medium', px: 1100 },
  { id: 'wide',    label: 'Large', labelEn: 'Wide', px: 1400 },
  { id: 'full',    label: 'Pleine largeur', labelEn: 'Full width', px: 0 },
] as const

export type ContentWidth = typeof WIDTH_OPTIONS[number]['id']
export const WIDTH_KEY = 'app-content-width'

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

  useEffect(() => {
    const handler = () => setWidth(getStoredWidth())
    window.addEventListener('storage', handler)
    window.addEventListener('app-width-change', handler)
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('app-width-change', handler) }
  }, [])

  const opt = WIDTH_OPTIONS.find(o => o.id === width) ?? WIDTH_OPTIONS[1]
  const maxW = opt.px > 0 ? opt.px : undefined

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <div className="app-page" style={{ maxWidth: maxW }}>
          {children}
        </div>
      </main>
    </div>
  )
}
