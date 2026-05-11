// Modern design tokens — inspired by Odoo 17 + Linear/Vercel aesthetic
export const t = {
  // Brand
  brand:       '#017e84',   // Odoo teal — primary action
  brandDark:   '#015f64',
  brandLight:  '#e6f4f5',

  // Sidebar (deep slate — modern, not the old purple)
  sidebarBg:   '#1e293b',
  sidebarHover:'#334155',
  sidebarActive:'#0f172a',
  sidebarText: 'rgba(255,255,255,.72)',
  sidebarTextActive: '#ffffff',

  // Backgrounds
  bg:          '#f8fafc',   // slate-50 — clean neutral, no old brown
  bgCard:      '#ffffff',
  bgMuted:     '#f1f5f9',   // slate-100

  // Text
  text:        '#0f172a',   // slate-900
  textSub:     '#334155',   // slate-700
  muted:       '#64748b',   // slate-500
  placeholder: '#94a3b8',   // slate-400

  // Borders
  border:      '#e2e8f0',   // slate-200
  borderFocus: '#017e84',

  // Status
  success:     '#16a34a',
  successBg:   '#f0fdf4',
  warning:     '#d97706',
  warningBg:   '#fffbeb',
  danger:      '#dc2626',
  dangerBg:    '#fef2f2',
  info:        '#2563eb',

  // Shadows
  shadow:      '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)',
  shadowMd:    '0 4px 12px rgba(0,0,0,.10), 0 2px 4px rgba(0,0,0,.06)',
  shadowLg:    '0 20px 48px rgba(0,0,0,.18)',

  // Aliases (backward compat with older pages)
  action:      '#017e84',
  actionHover: '#015f64',
  white:       '#ffffff',
  borderLight: '#f1f5f9',

  // Shape
  radius:      '6px',
  radiusSm:    '4px',
  radiusLg:    '10px',
  radiusXl:    '14px',
  radiusFull:  '9999px',

  // Type
  font:        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize:    '14px',
  navWidth:    '232px',
} as const
