import { useState } from 'react'
import { AlertTriangle, BookOpen, ChevronDown, ChevronRight, Info, Layers, Lightbulb, StickyNote, XCircle } from 'lucide-react'

/** Semantic types for a volet block — each maps to a distinct color + icon. */
export type VoletType = 'info' | 'warning' | 'error' | 'tip' | 'note' | 'section'

interface VoletConfig {
  Icon: React.FC<{ size?: number; color?: string }>
  /** Header icon and accent color */
  color: string
  /** Header background */
  headerBg: string
  /** Body background */
  bodyBg: string
  /** Border/accent color */
  border: string
  /** Default label when no title is given */
  defaultLabel: string
}

const CONFIGS: Record<VoletType, VoletConfig> = {
  info: {
    Icon: Info,
    color: '#60a5fa',
    headerBg: 'rgba(30, 58, 138, 0.40)',
    bodyBg: 'rgba(30, 58, 138, 0.15)',
    border: '#1e3a8a',
    defaultLabel: 'Information',
  },
  warning: {
    Icon: AlertTriangle,
    color: '#fbbf24',
    headerBg: 'rgba(120, 53, 15, 0.45)',
    bodyBg: 'rgba(120, 53, 15, 0.15)',
    border: '#78350f',
    defaultLabel: 'Attention',
  },
  error: {
    Icon: XCircle,
    color: '#f87171',
    headerBg: 'rgba(127, 29, 29, 0.45)',
    bodyBg: 'rgba(127, 29, 29, 0.15)',
    border: '#7f1d1d',
    defaultLabel: 'Erreur',
  },
  tip: {
    Icon: Lightbulb,
    color: '#34d399',
    headerBg: 'rgba(6, 78, 59, 0.45)',
    bodyBg: 'rgba(6, 78, 59, 0.15)',
    border: '#065f46',
    defaultLabel: 'Conseil',
  },
  note: {
    Icon: StickyNote,
    color: '#94a3b8',
    headerBg: 'rgba(30, 41, 59, 0.50)',
    bodyBg: 'rgba(30, 41, 59, 0.20)',
    border: '#334155',
    defaultLabel: 'Note',
  },
  section: {
    Icon: Layers,
    color: '#a78bfa',
    headerBg: 'rgba(76, 29, 149, 0.45)',
    bodyBg: 'rgba(76, 29, 149, 0.15)',
    border: '#4c1d95',
    defaultLabel: 'Section',
  },
}

/** Normalise a raw type string coming from the LLM into a known VoletType.
 *  Falls back to 'note' for anything unrecognised. */
export function parseVoletType(raw: string): VoletType {
  const s = raw.toLowerCase().trim()
  if (s === 'info' || s === 'information') return 'info'
  if (s === 'warning' || s === 'attention' || s === 'warn' || s === 'alerte') return 'warning'
  if (s === 'error' || s === 'erreur' || s === 'danger' || s === 'critique') return 'error'
  if (s === 'tip' || s === 'conseil' || s === 'success' || s === 'succès' || s === 'astuce') return 'tip'
  if (s === 'section') return 'section'
  return 'note'
}

/** Collapsible disclosure panel rendered from `:::volet[type] Title` fences.
 *
 * - Header: full-width colored bar, always visible. Click to toggle body.
 * - Body: rendered via the parent's Markdown component (passed as `children`).
 * - When no body content exists the chevron is hidden and the panel stays flat.
 *
 * The `defaultOpen` prop controls the initial state (default: true).
 */
export default function VoletBlock({
  type = 'note',
  title,
  children,
  defaultOpen = true,
}: {
  type?: VoletType
  title?: string
  children?: React.ReactNode
  defaultOpen?: boolean
}) {
  const cfg = CONFIGS[type] ?? CONFIGS.note
  const { Icon } = cfg
  const hasBody = !!children
  const [open, setOpen] = useState(defaultOpen)

  const displayTitle = title?.trim() || cfg.defaultLabel

  return (
    <div
      className="volet-block"
      style={{ borderColor: cfg.border }}
      data-type={type}
    >
      {/* ── Header ────────────────────────────────── */}
      <div
        className="volet-header"
        style={{ background: cfg.headerBg, borderBottomColor: open && hasBody ? cfg.border : 'transparent' }}
        role={hasBody ? 'button' : undefined}
        tabIndex={hasBody ? 0 : undefined}
        aria-expanded={hasBody ? open : undefined}
        onClick={() => hasBody && setOpen(o => !o)}
        onKeyDown={e => hasBody && (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
      >
        <span className="volet-icon" style={{ background: `${cfg.color}22`, borderColor: `${cfg.color}44` }}>
          <Icon size={14} color={cfg.color} />
        </span>
        <span className="volet-title" style={{ color: cfg.color }}>{displayTitle}</span>
        {hasBody && (
          <span className="volet-chevron" style={{ color: cfg.color, opacity: 0.7 }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </div>

      {/* ── Body ──────────────────────────────────── */}
      {hasBody && open && (
        <div
          className="volet-body"
          style={{ background: cfg.bodyBg }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// Kept for library documentation
export { BookOpen }
