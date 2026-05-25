import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import {
  PERSPECTIVE_COLORS,
  type Perspective,
  type PerspectiveMode,
} from './PerspectiveToggle'
import { perspectiveLabel } from '../utils/aiContext'
import { agentIcon, useAgents, type Agent } from '../agents/registry'

interface PerspectiveSelectProps {
  value: PerspectiveMode
  effectiveValue?: Perspective
  onChange: (v: PerspectiveMode) => void
  disabled?: boolean
}

/** Compact replacement for the 5-button PerspectiveToggle row: a single chip
 * showing the active profile (with a colored dot) + auto/manual sub-label,
 * opening a popover menu. Replaces the live-chip + toggle pair that previously
 * lived in the conversation context panel. */
export default function PerspectiveSelect({
  value, effectiveValue, onChange, disabled,
}: PerspectiveSelectProps) {
  const lang = useUiLanguage()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Pull the live agent catalog so icons/colors/labels stay aligned with
  // backend frontmatter (a new agent surfaces here automatically).
  const { data: agentsData } = useAgents()
  const agents: Agent[] = agentsData?.agents ?? []
  const agentBy = useMemo(() => {
    const m = new Map<string, Agent>()
    for (const a of agents) m.set(a.name, a)
    return m
  }, [agents])

  const renderAgentIcon = (name: string, size = 14) => {
    const ag = agentBy.get(name)
    const Icon = agentIcon(ag?.icon)
    return <Icon size={size} />
  }
  const colorFor = (id: PerspectiveMode): string => {
    if (id === 'auto') return PERSPECTIVE_COLORS.auto
    const ag = agentBy.get(id)
    return ag?.color || PERSPECTIVE_COLORS[id as Perspective] || '#64748b'
  }
  const items: { id: PerspectiveMode; label: string }[] = [
    { id: 'auto', label: lang === 'en' ? 'Automatic' : 'Automatique' },
    ...(agents.length
      ? agents.map(a => ({ id: a.name as PerspectiveMode, label: lang === 'en' ? a.label_en : a.label }))
      // Fallback: when the catalog has not loaded yet, keep the historical 4
      // built-ins so the UI never appears empty during the initial fetch.
      : [
        { id: 'support' as PerspectiveMode,          label: 'Support' },
        { id: 'business_analyst' as PerspectiveMode, label: lang === 'en' ? 'Business Analyst' : 'Analyste métier' },
        { id: 'architect' as PerspectiveMode,        label: lang === 'en' ? 'Architect' : 'Architecte' },
        { id: 'developer' as PerspectiveMode,        label: lang === 'en' ? 'Developer' : 'Développeur' },
      ]),
  ]

  const activePersp: Perspective = value === 'auto'
    ? (effectiveValue ?? 'developer')
    : (value as Perspective)
  const dotColor = colorFor(activePersp)
  const subLabel = value === 'auto'
    ? (lang === 'en' ? 'auto' : 'auto')
    : (lang === 'en' ? 'manual' : 'manuel')
  const activeIcon = value === 'auto'
    ? <Sparkles size={14} />
    : renderAgentIcon(activePersp, 14)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="perspective-select-trigger"
        style={{ '--persp-color': dotColor } as React.CSSProperties}>
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: 4, background: dotColor, flexShrink: 0,
        }} />
        <span className="perspective-select-icon" aria-hidden>{activeIcon}</span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, lineHeight: 1.15 }}>
          <strong style={{ fontSize: 12.5, fontWeight: 650 }}>
            {perspectiveLabel(activePersp, lang)}
          </strong>
          <span style={{ fontSize: 10.5, color: 'var(--th-muted)', letterSpacing: '.04em' }}>
            {subLabel}
          </span>
        </span>
        <ChevronDown size={13} style={{
          opacity: 0.7, transition: 'transform .15s',
          transform: open ? 'rotate(180deg)' : 'none',
        }} />
      </button>
      {open && (
        <div role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--th-surface)',
            border: '1px solid var(--th-border)', borderRadius: 7,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            padding: 4, zIndex: 50,
          }}>
          {items.map(it => {
            const selected = value === it.id
            const dotIfNotAuto = it.id !== 'auto' ? colorFor(it.id) : null
            const icon = it.id === 'auto' ? <Sparkles size={14} /> : renderAgentIcon(it.id, 14)
            return (
              <button
                key={it.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(it.id); setOpen(false) }}
                className={`perspective-select-option${selected ? ' is-selected' : ''}`}
                style={{ '--persp-color': dotIfNotAuto ?? colorFor(activePersp) } as React.CSSProperties}>
                {dotIfNotAuto
                  ? <span aria-hidden="true" style={{
                      width: 7, height: 7, borderRadius: 4, background: dotIfNotAuto, flexShrink: 0,
                    }} />
                  : <span style={{ width: 7, flexShrink: 0 }} />}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  {icon}
                  <span>{it.label}</span>
                </span>
                {selected && <Check size={13} style={{ color: 'var(--brand-fg)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
