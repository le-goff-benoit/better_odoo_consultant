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
  document.documentElement.style.setProperty('--brand-contrast', readableTextColor(color))
}

function readableTextColor(color: string) {
  const match = color.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return '#ffffff'
  const [, r, g, b] = match.map((part, index) => index === 0 ? part : parseInt(part, 16)) as unknown as [string, number, number, number]
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  return luminance > 0.36 ? '#0a0a0a' : '#ffffff'
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
      document.documentElement.lang = res.data?.language === 'en' ? 'en' : 'fr'
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
