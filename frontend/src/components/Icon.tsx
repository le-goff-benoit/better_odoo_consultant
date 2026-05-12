interface IconProps { size?: number; color?: string; style?: React.CSSProperties }

const icons = {
  dashboard: (
    <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>
  ),
  download: (
    <><path d="M12 3v13M7 11l5 5 5-5"/><path d="M3 20h18"/></>
  ),
  building: (
    <><path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21v-4a3 3 0 0 1 6 0v4"/></>
  ),
  folder: (
    <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>
  ),
  search: (
    <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></>
  ),
  clock: (
    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>
  ),
  check: (
    <><path d="M20 6 9 17l-5-5"/></>
  ),
  x: (
    <><path d="M18 6 6 18M6 6l12 12"/></>
  ),
  plus: (
    <><path d="M12 5v14M5 12h14"/></>
  ),
  chevronDown: (
    <><path d="m6 9 6 6 6-6"/></>
  ),
  chevronUp: (
    <><path d="m18 15-6-6-6 6"/></>
  ),
  arrowRight: (
    <><path d="M5 12h14M13 6l6 6-6 6"/></>
  ),
  key: (
    <><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3"/></>
  ),
  github: (
    <><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></>
  ),
  externalLink: (
    <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>
  ),
  cloud: (
    <><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></>
  ),
  globe: (
    <><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10A15 15 0 0 1 12 2z"/></>
  ),
  zap: (
    <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>
  ),
  refresh: (
    <><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>
  ),
  trash: (
    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>
  ),
  warning: (
    <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
  ),
  copy: (
    <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
  ),
  wifi: (
    <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></>
  ),
  settings: (
    <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>
  ),
}

export type IconName = keyof typeof icons

export default function Icon({ name, size = 16, color = 'currentColor', style }: IconProps & { name: IconName }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'inline-block', ...style }}
    >
      {icons[name]}
    </svg>
  )
}
