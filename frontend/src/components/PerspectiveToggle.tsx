import { Briefcase, Building2, Code2, Sparkles, Wrench } from 'lucide-react'
import { t } from '../theme'
import { useUiLanguage } from '../i18n'

export type Perspective = 'support' | 'business_analyst' | 'architect' | 'developer'
export type PerspectiveMode = Perspective | 'auto'

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

/**
 * Profile switcher to pick auto / support / BA / architect / developer response styles.
 * Theme-aware (uses CSS variables) and dynamic: the active button shows its label.
 */
export default function PerspectiveToggle({
  value, effectiveValue, onChange, size = 'md', disabled, showActiveLabel = true,
}: PerspectiveToggleProps) {
  const lang = useUiLanguage()
  const iconSize = size === 'sm' ? 12 : 14
  const padY     = size === 'sm' ? 4 : 5
  const padX     = size === 'sm' ? 7 : 9
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

  // Accent colors per perspective. `auto` echoes the inferred perspective's color.
  const colors: Record<PerspectiveMode, string> = {
    auto: '#7c3aed',
    support: '#0f766e',
    business_analyst: '#2563eb',
    architect: '#9333ea',
    developer: '#0f172a',
  }

  const items = [
    { id: 'auto',             icon: <Sparkles  size={iconSize} />, title: lang === 'en' ? 'Automatic' : 'Automatique', label: copy.auto },
    { id: 'support',          icon: <Wrench    size={iconSize} />, title: 'Support',          label: copy.support },
    { id: 'business_analyst', icon: <Briefcase size={iconSize} />, title: 'Business Analyst', label: copy.business_analyst },
    { id: 'architect',        icon: <Building2 size={iconSize} />, title: lang === 'en' ? 'Architect' : 'Architecte', label: copy.architect },
    { id: 'developer',        icon: <Code2     size={iconSize} />, title: lang === 'en' ? 'Developer' : 'Développeur', label: copy.developer },
  ] as const

  const buttonStyle = (id: PerspectiveMode, active: boolean, inferred: boolean): React.CSSProperties => {
    const accent = id === 'auto' && inferred && effectiveValue ? colors[effectiveValue] : colors[id]
    return {
      display: 'inline-flex', alignItems: 'center', gap: active && showActiveLabel ? 5 : 0,
      padding: `${padY}px ${active && showActiveLabel ? padX : padY + 2}px`,
      border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      borderRadius: 5,
      background: active ? accent : inferred ? `${accent}1f` : 'transparent',
      color: active ? '#fff' : inferred ? accent : t.muted,
      boxShadow: inferred && !active ? `inset 0 0 0 1px ${accent}55` : undefined,
      fontWeight: 600,
      fontSize: size === 'sm' ? 10.5 : 11.5,
      lineHeight: 1,
      transition: 'background .15s, color .15s, padding .15s, gap .15s, box-shadow .15s',
      opacity: disabled ? 0.55 : 1,
      flexShrink: 0,
    }
  }

  return (
    <div
      role="group"
      aria-label={copy.group}
      title={copy.active}
      className="perspective-toggle"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        background: 'var(--th-bg-muted)',
        border: '1px solid var(--th-border)',
        borderRadius: 7,
        padding: 2,
      }}
    >
      {items.map(p => {
        const isActive   = value === p.id
        const isInferred = value === 'auto' && effectiveValue === p.id
        return (
          <button
            key={p.id}
            type="button"
            title={p.title}
            aria-label={p.title}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => !disabled && onChange(p.id)}
            className={isInferred ? 'perspective-auto-inferred' : undefined}
            style={buttonStyle(p.id, isActive, isInferred)}
          >
            {p.icon}
            {isActive && showActiveLabel && <span>{p.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
