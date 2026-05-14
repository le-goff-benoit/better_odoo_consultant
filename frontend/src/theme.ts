// Design tokens — colors use CSS custom properties for theme support
export const t = {
  // Brand (set dynamically via --brand CSS var)
  brand:       'var(--brand, #0f766e)',
  brandDark:   '#115e59',
  brandLight:  '#f0fdfa',
  // Transparent brand variants — use these instead of ${t.brand}XX (invalid on CSS vars)
  brand10: 'var(--brand-10)',
  brand15: 'var(--brand-15)',
  brand20: 'var(--brand-20)',
  brand40: 'var(--brand-40)',
  brand60: 'var(--brand-60)',

  // Sidebar
  sidebarBg:        'var(--th-bg-card, #ffffff)',
  sidebarHover:     '#334155',
  sidebarActive:    '#0f172a',
  sidebarText:      'rgba(255,255,255,.72)',
  sidebarTextActive:'#ffffff',

  // Backgrounds
  bg:       'var(--th-bg, #f7f8fa)',
  bgCard:   'var(--th-bg-card, #ffffff)',
  bgMuted:  'var(--th-bg-muted, #f1f5f9)',

  // Text
  text:        'var(--th-text, #0f172a)',
  textSub:     'var(--th-text-sub, #334155)',
  muted:       'var(--th-muted, #64748b)',
  placeholder: 'var(--th-placeholder, #94a3b8)',

  // Borders
  border:      'var(--th-border, #e2e8f0)',
  borderFocus: 'var(--brand, #0f766e)',
  borderLight: 'var(--th-border-light, #f1f5f9)',

  // Status
  success:   '#16a34a',
  successBg: 'var(--th-success-bg, #f0fdf4)',
  warning:   '#d97706',
  warningBg: 'var(--th-warning-bg, #fffbeb)',
  danger:    '#dc2626',
  dangerBg:  'var(--th-danger-bg, #fef2f2)',
  info:      '#2563eb',

  // Shadows
  shadow:   'var(--th-shadow)',
  shadowMd: 'var(--th-shadow-hover)',
  shadowLg: '0 20px 48px rgba(0,0,0,.18)',

  // Aliases
  action:      'var(--brand, #0f766e)',
  actionHover: '#115e59',
  white:       'var(--th-white, #ffffff)',

  // Shape
  radius:     'var(--radius-md)',
  radiusSm:   'var(--radius-sm)',
  radiusLg:   'var(--radius-lg)',
  radiusXl:   'var(--radius-xl)',
  radiusFull: 'var(--radius-full)',

  // Type
  font:     "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 'var(--font-base)',
  navWidth: '232px',
} as const

import type React from 'react'

export const btn = {
  primary: {
    padding: '8px 18px', background: 'var(--brand, #0f766e)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 650, cursor: 'pointer', minHeight: 36,
  } as React.CSSProperties,
  secondary: {
    padding: '8px 16px', background: 'transparent', color: 'var(--th-text-sub, #334155)',
    border: '1px solid var(--th-border, #e2e8f0)', borderRadius: 'var(--radius-md)', fontSize: 14, cursor: 'pointer', minHeight: 36,
  } as React.CSSProperties,
  ghost: {
    padding: '7px 14px', background: 'var(--th-bg-muted, #f1f5f9)', color: 'var(--th-text-sub, #334155)',
    border: '1px solid var(--th-border, #e2e8f0)', borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer', fontWeight: 500, minHeight: 36,
  } as React.CSSProperties,
  danger: {
    padding: '8px 16px', background: '#dc2626', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 650, cursor: 'pointer', minHeight: 36,
  } as React.CSSProperties,
  outline: (color: string): React.CSSProperties => ({
    padding: '7px 14px', background: 'transparent',
    border: `1px solid ${color}`, color,
    borderRadius: 'var(--radius-md)', fontSize: 13, cursor: 'pointer', fontWeight: 600, minHeight: 36,
  }),
}
