import { Briefcase, Code2 } from 'lucide-react'
import { t } from '../theme'
import { useUiLanguage } from '../i18n'

export type Perspective = 'functional' | 'technical'

const STORAGE_PREFIX = 'perspective:'

export function loadPerspective(scope: string, fallback: Perspective = 'technical'): Perspective {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + scope)
    if (v === 'functional' || v === 'technical') return v
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
 * Compact 2-icon segmented toggle to switch between a "functional" (AM / BA)
 * and a "technical" (Architect / Dev) reasoning perspective for the AI.
 *
 * Icons + tooltips, no visible labels — meant to sit next to the send button.
 */
export default function PerspectiveToggle({ value, onChange, size = 'md', disabled }: PerspectiveToggleProps) {
  const lang = useUiLanguage()
  const dim   = size === 'sm' ? 26 : 30
  const icon  = size === 'sm' ? 13 : 15
  const activeLabel = value === 'functional' ? 'AM / BA' : 'Archi / Dev'
  const copy = lang === 'en'
    ? {
      group: `Response perspective, active mode ${activeLabel}`,
      active: `Active mode: ${activeLabel}`,
      functionalTitle: 'Functional perspective (AM / BA) — user journeys, business processes, configuration',
      functionalAria: 'Enable functional AM / BA perspective',
      technicalTitle: 'Technical perspective (Archi / Dev) — models, code, XML views, performance',
      technicalAria: 'Enable technical Archi / Dev perspective',
    }
    : {
      group: `Perspective de réponse, mode actif ${activeLabel}`,
      active: `Mode actif : ${activeLabel}`,
      functionalTitle: 'Perspective fonctionnelle (AM / BA) — orientée parcours utilisateur, processus métier, configuration',
      functionalAria: 'Activer la perspective fonctionnelle AM / BA',
      technicalTitle: 'Perspective technique (Archi / Dev) — orientée modèles, code, vues XML, performance',
      technicalAria: 'Activer la perspective technique Archi / Dev',
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
        display: 'inline-flex',
        background: t.bgMuted,
        border: `1px solid ${t.border}`,
        borderRadius: t.radiusFull,
        overflow: 'hidden',
        height: dim,
      }}
    >
      <button
        type="button"
        title={copy.functionalTitle}
        aria-label={copy.functionalAria}
        aria-pressed={value === 'functional'}
        disabled={disabled}
        onClick={() => !disabled && onChange('functional')}
        style={itemStyle(value === 'functional')}
      >
        <Briefcase size={icon} />
      </button>
      <button
        type="button"
        title={copy.technicalTitle}
        aria-label={copy.technicalAria}
        aria-pressed={value === 'technical'}
        disabled={disabled}
        onClick={() => !disabled && onChange('technical')}
        style={itemStyle(value === 'technical')}
      >
        <Code2 size={icon} />
      </button>
    </div>
  )
}
