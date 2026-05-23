import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { getUserProfile } from './api/client'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Sources   = lazy(() => import('./pages/Sources'))
const Profiles  = lazy(() => import('./pages/Profiles'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Migration = lazy(() => import('./pages/Migration'))
const Creator   = lazy(() => import('./pages/Creator'))
const Query     = lazy(() => import('./pages/Query'))
const History   = lazy(() => import('./pages/History'))
const Settings  = lazy(() => import('./pages/Settings'))
const About     = lazy(() => import('./pages/About'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))

export function applyBrandColor(color: string) {
  document.documentElement.style.setProperty('--brand', color)
  document.documentElement.style.setProperty('--brand-contrast', readableTextColor(color))
  applyBrandForeground(color)
}

function readableTextColor(color: string) {
  const parsed = parseHexColor(color)
  if (!parsed) return '#ffffff'
  return contrastRatio(parsed, parseHexColor('#0a0a0a')!) >= contrastRatio(parsed, parseHexColor('#ffffff')!)
    ? '#0a0a0a'
    : '#ffffff'
}

function applyBrandForeground(color?: string) {
  const current = color || getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#33f06f'
  document.documentElement.style.setProperty('--brand-fg', readableBrandOnSurface(current, currentThemeMode()))
}

function currentThemeMode(): 'light' | 'dark' | 'sepia' {
  const mode = document.documentElement.getAttribute('data-theme')
  return mode === 'dark' || mode === 'sepia' ? mode : 'light'
}

function readableBrandOnSurface(color: string, mode: 'light' | 'dark' | 'sepia') {
  const parsed = parseHexColor(color)
  if (!parsed) return mode === 'dark' ? '#33f06f' : '#117a35'
  const surface = parseHexColor(mode === 'dark' ? '#232832' : mode === 'sepia' ? '#faf7f2' : '#ffffff')!
  if (contrastRatio(parsed, surface) >= 4.5) return toHex(parsed)

  const target = mode === 'dark' ? parseHexColor('#ffffff')! : parseHexColor('#000000')!
  for (let pct = 0.12; pct <= 1; pct += 0.04) {
    const mixed = mixRgb(parsed, target, pct)
    if (contrastRatio(mixed, surface) >= 4.5) return toHex(mixed)
  }
  return toHex(target)
}

function parseHexColor(color: string) {
  const match = color.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

type Rgb = NonNullable<ReturnType<typeof parseHexColor>>

function relativeLuminance({ r, g, b }: Rgb) {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function contrastRatio(a: Rgb, b: Rgb) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

function mixRgb(a: Rgb, b: Rgb, pct: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * pct),
    g: Math.round(a.g + (b.g - a.g) * pct),
    b: Math.round(a.b + (b.b - a.b) * pct),
  }
}

function toHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export function applyThemeMode(mode?: string) {
  if (mode === 'dark' || mode === 'sepia') {
    document.documentElement.setAttribute('data-theme', mode)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  applyBrandForeground()
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
        <Route path="/creator" element={<Creator />} />
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
