// Design tokens — colors use CSS custom properties for theme support
export const t = {
  // Brand (set dynamically via --brand CSS var) — Better Odoo Assistant green.
  brand:       'var(--brand, #33f06f)',
  brandContrast: 'var(--brand-contrast, #0a0a0a)',
  brandFg:     'var(--brand-fg, #117a35)',
  brandDark:   'color-mix(in srgb, var(--brand, #33f06f) 72%, black)',
  brandLight:  'color-mix(in srgb, var(--brand, #33f06f) 10%, white)',
  // Transparent brand variants — use these instead of ${t.brand}XX (invalid on CSS vars)
  brand10: 'var(--brand-10)',
  brand15: 'var(--brand-15)',
  brand20: 'var(--brand-20)',
  brand40: 'var(--brand-40)',
  brand60: 'var(--brand-60)',

  // Sidebar (legacy aliases — kept for backwards compat in inline styles).
  sidebarBg:        'var(--th-bg-card, #ffffff)',
  sidebarHover:     'var(--th-bg-muted)',
  sidebarActive:    'var(--th-text)',
  sidebarText:      'var(--th-text-sub)',
  sidebarTextActive:'var(--th-text)',

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
  borderFocus: 'var(--brand, #33f06f)',
  borderLight: 'var(--th-border-light, #f1f5f9)',

  // Status (theme-aware foregrounds — adjust between light + dark so
  // inline `color: t.success` etc. stay readable on either background).
  success:   'var(--th-success-fg, #2f7a3f)',
  successBg: 'var(--th-success-bg, #e8f5e2)',
  warning:   'var(--th-warning-fg, #c97a00)',
  warningBg: 'var(--th-warning-bg, #fef3d8)',
  danger:    'var(--th-danger-fg, #c0392b)',
  dangerBg:  'var(--th-danger-bg, #fde8e8)',
  info:      'var(--th-info-fg, #1f4ec3)',
  infoBg:    'var(--th-info-bg, #e8f0ff)',
  // Solid status colors — same value in both themes. Use as a BACKGROUND
  // with white text (e.g. small ★ / ✓ chips). The theme-aware vars above
  // are not safe as backgrounds with white text because the dark-mode
  // variant is too light for AA contrast.
  successSolid: '#2f7a3f',
  warningSolid: '#8a5500',
  dangerSolid:  '#c0392b',
  infoSolid:    '#1f4ec3',

  // Shadows
  shadow:   'var(--th-shadow)',
  shadowMd: 'var(--th-shadow-hover)',
  shadowLg: '0 20px 48px rgba(0,0,0,.18)',

  // Aliases
  action:      'var(--brand, #33f06f)',
  actionHover: '#18b94b',
  white:       'var(--th-white, #ffffff)',

  // Shape
  radius:     'var(--radius-md)',
  radiusSm:   'var(--radius-sm)',
  radiusLg:   'var(--radius-lg)',
  radiusXl:   'var(--radius-xl)',
  radiusFull: 'var(--radius-full)',

  // Type
  font:     "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontDisplay: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  fontMono:    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 'var(--font-base)',
  navWidth: '232px',
} as const

import type React from 'react'

// Neo-retro inline button presets. Borders are 2px, corners square,
// labels uppercase with display-font letter-spacing. These mirror the
// .btn-* classes in theme.css for callers that compose inline styles.
const neoButtonBase: React.CSSProperties = {
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  cursor: 'pointer',
  minHeight: 36,
  borderRadius: 0,
}

export const btn = {
  primary: {
    ...neoButtonBase,
    padding: '8px 18px', background: 'var(--brand, #33f06f)', color: 'var(--brand-contrast, #0a0a0a)',
    border: '2px solid var(--brand, #33f06f)', fontSize: 14,
  } as React.CSSProperties,
  secondary: {
    ...neoButtonBase,
    padding: '8px 16px', background: 'var(--th-bg-card)', color: 'var(--th-text)',
    border: '2px solid var(--th-border)', fontSize: 14,
  } as React.CSSProperties,
  ghost: {
    ...neoButtonBase,
    padding: '7px 14px', background: 'transparent', color: 'var(--th-text-sub)',
    border: '2px solid var(--th-border-soft, var(--th-border))', fontSize: 13,
  } as React.CSSProperties,
  danger: {
    ...neoButtonBase,
    padding: '8px 16px', background: '#c0392b', color: '#fff',
    border: '2px solid #c0392b', fontSize: 14,
  } as React.CSSProperties,
  outline: (color: string): React.CSSProperties => ({
    ...neoButtonBase,
    padding: '7px 14px', background: 'transparent',
    border: `2px solid ${color}`, color,
    fontSize: 13,
  }),
}
