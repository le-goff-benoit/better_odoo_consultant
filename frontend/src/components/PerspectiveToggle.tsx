import type React from 'react'
import { Briefcase, Building2, Code2, Sparkles, Wrench } from 'lucide-react'
import { useUiLanguage } from '../i18n'

export type Perspective = 'support' | 'business_analyst' | 'architect' | 'developer'
export type PerspectiveMode = Perspective | 'auto'

export const PERSPECTIVE_COLORS: Record<PerspectiveMode, string> = {
  auto:             '#7c3aed',
  support:          '#0f766e',
  business_analyst: '#2563eb',
  architect:        '#9333ea',
  developer:        '#c0392b',
}

const STORAGE_PREFIX = 'perspective:'

export function loadPerspective(scope: string, fallback: PerspectiveMode = 'auto'): PerspectiveMode {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + scope)
    if (v === 'auto') return 'auto'
    if (v === 'support' || v === 'business_analyst' || v === 'architect' || v === 'developer') return v
    if (v === 'functional') return 'business_analyst'
    if (v === 'technical') return 'developer'
  } catch { /* ignore */ }
  return fallback
}

export function savePerspective(scope: string, value: PerspectiveMode) {
  try { localStorage.setItem(STORAGE_PREFIX + scope, value) } catch { /* ignore */ }
}

interface PerspectiveToggleProps {
  value: PerspectiveMode
  effectiveValue?: Perspective
  onChange: (v: PerspectiveMode) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  /** When true (default), display label of active option next to its icon. */
  showActiveLabel?: boolean
}

export default function PerspectiveToggle({
  value, effectiveValue, onChange, size = 'md', disabled, showActiveLabel = true,
}: PerspectiveToggleProps) {
  const lang = useUiLanguage()
  const iconSize = size === 'sm' ? 12 : 14
  const activeLabel = value === 'auto' ? `auto → ${effectiveValue ?? 'developer'}` : value
  const copy = lang === 'en'
    ? {
      group: `Response profile, active mode ${activeLabel}`,
      active: `Active mode: ${activeLabel}`,
      auto: 'Auto',
      support: 'Support',
      business_analyst: 'BA',
      architect: 'Architect',
      developer: 'Dev',
    }
    : {
      group: `Profil de réponse, mode actif ${activeLabel}`,
      active: `Mode actif : ${activeLabel}`,
      auto: 'Auto',
      support: 'Support',
      business_analyst: 'BA',
      architect: 'Archi',
      developer: 'Dev',
    }

  const items = [
    { id: 'auto',             icon: <Sparkles  size={iconSize} />, title: lang === 'en' ? 'Automatic' : 'Automatique', label: copy.auto },
    { id: 'support',          icon: <Wrench    size={iconSize} />, title: 'Support',          label: copy.support },
    { id: 'business_analyst', icon: <Briefcase size={iconSize} />, title: 'Business Analyst', label: copy.business_analyst },
    { id: 'architect',        icon: <Building2 size={iconSize} />, title: lang === 'en' ? 'Architect' : 'Architecte', label: copy.architect },
    { id: 'developer',        icon: <Code2     size={iconSize} />, title: lang === 'en' ? 'Developer' : 'Développeur', label: copy.developer },
  ] as const

  return (
    <div
      role="group"
      aria-label={copy.group}
      title={copy.active}
      className={`perspective-toggle perspective-toggle--${size}`}
    >
      {items.map(p => {
        const isActive   = value === p.id
        const isInferred = value === 'auto' && effectiveValue === p.id
        const accent = p.id === 'auto' && isInferred && effectiveValue
          ? PERSPECTIVE_COLORS[effectiveValue]
          : PERSPECTIVE_COLORS[p.id]
        const classes = [
          'perspective-toggle-btn',
          isActive   ? 'is-active'   : '',
          isInferred ? 'is-inferred' : '',
          isActive && showActiveLabel ? 'has-label' : '',
        ].filter(Boolean).join(' ')
        return (
          <button
            key={p.id}
            type="button"
            title={p.title}
            aria-label={p.title}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !disabled && onChange(p.id)}
            className={classes}
            style={{ '--persp-accent': accent } as React.CSSProperties}
          >
            {p.icon}
            {isActive && showActiveLabel && <span>{p.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
