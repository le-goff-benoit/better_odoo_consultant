import { Briefcase, Building2, Code2, Wrench } from 'lucide-react'
import { t } from '../theme'
import { useUiLanguage } from '../i18n'

export type Perspective = 'support' | 'business_analyst' | 'architect' | 'developer'

const STORAGE_PREFIX = 'perspective:'

export function loadPerspective(scope: string, fallback: Perspective = 'developer'): Perspective {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + scope)
    if (v === 'support' || v === 'business_analyst' || v === 'architect' || v === 'developer') return v
    if (v === 'functional') return 'business_analyst'
    if (v === 'technical') return 'developer'
  } catch { /* ignore */ }
  return fallback
}

export function savePerspective(scope: string, value: Perspective) {
  try { localStorage.setItem(STORAGE_PREFIX + scope, value) } catch { /* ignore */ }
}

interface PerspectiveToggleProps {
  value: Perspective
  onChange: (v: Perspective) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

/**
 * 2x2 profile switcher to pick support / BA / architect / developer response styles.
 */
export default function PerspectiveToggle({ value, onChange, size = 'md', disabled }: PerspectiveToggleProps) {
  const lang = useUiLanguage()
  const dim   = size === 'sm' ? 28 : 32
  const icon  = size === 'sm' ? 12 : 14
  const activeLabel = value
  const copy = lang === 'en'
    ? {
      group: `Response profile, active mode ${activeLabel}`,
      active: `Active mode: ${activeLabel}`,
    }
    : {
      group: `Profil de réponse, mode actif ${activeLabel}`,
      active: `Mode actif : ${activeLabel}`,
    }

  const itemStyle = (active: boolean): React.CSSProperties => ({
    width: dim, height: dim,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? `var(--brand, ${t.brand})` : 'transparent',
    color: active ? '#fff' : t.muted,
    transition: 'background .15s, color .15s',
    opacity: disabled ? 0.5 : 1,
  })

  return (
    <div
      role="group"
      aria-label={copy.group}
      title={copy.active}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(2, ${dim}px)`,
        gap: 2,
        background: '#f3f4f6',
        border: `1px solid ${t.border}`,
        borderRadius: t.radius,
        padding: 2,
      }}
    >
      {[{ id: 'support', icon: <Wrench size={icon} />, title: 'Support' }, { id: 'business_analyst', icon: <Briefcase size={icon} />, title: 'Business Analyst' }, { id: 'architect', icon: <Building2 size={icon} />, title: 'Architecte' }, { id: 'developer', icon: <Code2 size={icon} />, title: 'Développeur' }].map(p => (
        <button key={p.id} type="button" title={p.title} aria-label={p.title} aria-pressed={value === p.id}
          disabled={disabled} onClick={() => !disabled && onChange(p.id as Perspective)}
          style={{ ...itemStyle(value === p.id), borderRadius: 6, background: value === p.id ? '#6b7280' : 'transparent' }}>
          {p.icon}
        </button>
      ))}
    </div>
  )
}
