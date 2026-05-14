import { ReactNode } from 'react'

// Map of page → stable 8-digit code. Lets us number every section in the
// HARRY.SYS / OPERATIONS.SYS aesthetic without forcing every caller to
// pass a sectionId. Hash-based assignment from the title.
function formatSectionId(seed: string | undefined): string {
  if (!seed) return ''
  if (/^\d+$/.test(seed)) return seed.padStart(8, '0')
  // Deterministic small hash → 0001..9999, prefixed to 8 digits.
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff
  const n = (h % 9999) + 1
  return String(n).padStart(8, '0')
}

export default function PageHeader({ title, description, action, sectionId }: {
  title: string
  description?: string
  action?: ReactNode
  /** Numeric or label section id. If omitted, derived from the title. */
  sectionId?: string
}) {
  const id = formatSectionId(sectionId ?? title)
  return (
    <div className="page-header">
      <div className="page-header-meta">
        {id && <div className="neo-section-number">{id}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  )
}
