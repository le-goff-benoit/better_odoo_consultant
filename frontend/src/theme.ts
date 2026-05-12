// Design tokens — colors use CSS custom properties for theme support
export const t = {
  // Brand (set dynamically via --brand CSS var)
  brand:       'var(--brand, #017e84)',
  brandDark:   '#015f64',
  brandLight:  '#e6f4f5',

  // Sidebar
  sidebarBg:        'var(--th-sidebar-bg, #1e293b)',
  sidebarHover:     '#334155',
  sidebarActive:    '#0f172a',
  sidebarText:      'rgba(255,255,255,.72)',
  sidebarTextActive:'#ffffff',

  // Backgrounds
  bg:       'var(--th-bg, #f8fafc)',
  bgCard:   'var(--th-bg-card, #ffffff)',
  bgMuted:  'var(--th-bg-muted, #f1f5f9)',

  // Text
  text:        'var(--th-text, #0f172a)',
  textSub:     'var(--th-text-sub, #334155)',
  muted:       'var(--th-muted, #64748b)',
  placeholder: 'var(--th-placeholder, #94a3b8)',

  // Borders
  border:      'var(--th-border, #e2e8f0)',
  borderFocus: 'var(--brand, #017e84)',
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
  shadow:   '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,.10), 0 2px 4px rgba(0,0,0,.06)',
  shadowLg: '0 20px 48px rgba(0,0,0,.18)',

  // Aliases
  action:      'var(--brand, #017e84)',
  actionHover: '#015f64',
  white:       'var(--th-white, #ffffff)',

  // Shape
  radius:     '6px',
  radiusSm:   '4px',
  radiusLg:   '10px',
  radiusXl:   '14px',
  radiusFull: '9999px',

  // Type
  font:     "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: '14px',
  navWidth: '232px',
} as const
