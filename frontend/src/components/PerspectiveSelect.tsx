import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Briefcase, Building2, Check, ChevronDown, Code2, Sparkles, Wrench } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import {
  PERSPECTIVE_COLORS,
  type Perspective,
  type PerspectiveMode,
} from './PerspectiveToggle'
import { perspectiveLabel } from '../utils/aiContext'

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

  const activePersp: Perspective = value === 'auto'
    ? (effectiveValue ?? 'developer')
    : value
  const dotColor = PERSPECTIVE_COLORS[activePersp]
  const subLabel = value === 'auto'
    ? (lang === 'en' ? 'auto' : 'auto')
    : (lang === 'en' ? 'manual' : 'manuel')

  const items: { id: PerspectiveMode; icon: React.ReactNode; label: string }[] = [
    { id: 'auto',             icon: <Sparkles size={14} />,  label: lang === 'en' ? 'Automatic' : 'Automatique' },
    { id: 'support',          icon: <Wrench size={14} />,    label: 'Support' },
    { id: 'business_analyst', icon: <Briefcase size={14} />, label: lang === 'en' ? 'Business Analyst' : 'Analyste métier' },
    { id: 'architect',        icon: <Building2 size={14} />, label: lang === 'en' ? 'Architect' : 'Architecte' },
    { id: 'developer',        icon: <Code2 size={14} />,     label: lang === 'en' ? 'Developer' : 'Développeur' },
  ]

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="perspective-select-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '7px 10px',
          background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
          border: '1px solid var(--th-border)', borderRadius: 6,
          color: 'var(--th-text)',
        }}>
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: 4, background: dotColor, flexShrink: 0,
        }} />
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
            const dotIfNotAuto = it.id !== 'auto' ? PERSPECTIVE_COLORS[it.id as Perspective] : null
            return (
              <button
                key={it.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(it.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 9px',
                  background: selected ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : 'transparent',
                  border: 'none', borderRadius: 5, cursor: 'pointer',
                  textAlign: 'left', color: 'var(--th-text)', fontSize: 12.5,
                }}>
                {dotIfNotAuto
                  ? <span aria-hidden="true" style={{
                      width: 7, height: 7, borderRadius: 4, background: dotIfNotAuto, flexShrink: 0,
                    }} />
                  : <span style={{ width: 7, flexShrink: 0 }} />}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  {it.icon}
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
