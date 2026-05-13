import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { getUserProfile } from './api/client'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sources   = lazy(() => import('./pages/Sources'))
const Profiles  = lazy(() => import('./pages/Profiles'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Migration = lazy(() => import('./pages/Migration'))
const Query     = lazy(() => import('./pages/Query'))
const History   = lazy(() => import('./pages/History'))
const Settings  = lazy(() => import('./pages/Settings'))
const About     = lazy(() => import('./pages/About'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))

export function applyBrandColor(color: string) {
  document.documentElement.style.setProperty('--brand', color)
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const mix = (brand: number, base: number) => Math.round(brand * 0.25 + base * 0.75)
    document.documentElement.style.setProperty('--th-sidebar-bg',
      `rgb(${mix(r, 0x1e)},${mix(g, 0x29)},${mix(b, 0x3b)})`)
  }
}

export function applyThemeMode(mode?: string) {
  if (mode === 'dark' || mode === 'sepia') {
    document.documentElement.setAttribute('data-theme', mode)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export default function App() {
  useEffect(() => {
    getUserProfile().then(res => {
      const { primaryColor, themeMode } = res.data ?? {}
      if (primaryColor) applyBrandColor(primaryColor)
      applyThemeMode(themeMode)
    }).catch(() => {})
  }, [])

  return (
    <Layout>
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Navigate to="/sources" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/profiles" element={<Profiles />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/migration" element={<Migration />} />
        <Route path="/query" element={<Query />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/about" element={<About />} />
      </Routes>
      </Suspense>
    </Layout>
  )
}
