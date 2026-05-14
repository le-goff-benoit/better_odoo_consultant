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
}

/**
 * 2x2 profile switcher to pick support / BA / architect / developer response styles.
 */
export default function PerspectiveToggle({ value, effectiveValue, onChange, size = 'md', disabled }: PerspectiveToggleProps) {
  const lang = useUiLanguage()
  const dim   = size === 'sm' ? 28 : 32
  const icon  = size === 'sm' ? 12 : 14
  const activeLabel = value === 'auto' ? `auto → ${effectiveValue ?? 'developer'}` : value
  const copy = lang === 'en'
    ? {
      group: `Response profile, active mode ${activeLabel}`,
      active: `Active mode: ${activeLabel}`,
      auto: 'Automatic',
    }
    : {
      group: `Profil de réponse, mode actif ${activeLabel}`,
      active: `Mode actif : ${activeLabel}`,
      auto: 'Automatique',
    }

  const itemStyle = (active: boolean, inferred = false): React.CSSProperties => ({
    width: dim, height: dim,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? `var(--brand, ${t.brand})` : inferred ? t.brand10 : 'transparent',
    color: active ? '#fff' : inferred ? t.brand : t.muted,
    boxShadow: inferred && !active ? `inset 0 0 0 1px ${t.brand40}` : undefined,
    transition: 'background .15s, color .15s, box-shadow .15s, transform .15s',
    opacity: disabled ? 0.5 : 1,
  })

  const items = [
    { id: 'auto', icon: <Sparkles size={icon} />, title: copy.auto },
    { id: 'support', icon: <Wrench size={icon} />, title: 'Support' },
    { id: 'business_analyst', icon: <Briefcase size={icon} />, title: 'Business Analyst' },
    { id: 'architect', icon: <Building2 size={icon} />, title: 'Architecte' },
    { id: 'developer', icon: <Code2 size={icon} />, title: 'Développeur' },
  ] as const

  return (
    <div
      role="group"
      aria-label={copy.group}
      title={copy.active}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(5, ${dim}px)`,
        gap: 2,
        background: '#f3f4f6',
        border: `1px solid ${t.border}`,
        borderRadius: t.radius,
        padding: 2,
      }}
    >
      {items.map(p => (
        <button key={p.id} type="button" title={p.title} aria-label={p.title} aria-pressed={value === p.id}
          disabled={disabled} onClick={() => !disabled && onChange(p.id)}
          className={value === 'auto' && effectiveValue === p.id ? 'perspective-auto-inferred' : undefined}
          style={{ ...itemStyle(value === p.id, value === 'auto' && effectiveValue === p.id), borderRadius: 6, background: value === p.id ? '#6b7280' : undefined }}>
          {p.icon}
        </button>
      ))}
    </div>
  )
}
