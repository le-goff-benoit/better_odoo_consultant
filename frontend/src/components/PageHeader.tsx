import { ReactNode } from 'react'
import { t } from '../theme'

export default function PageHeader({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 28,
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, margin: 0 }}>{title}</h1>
        {description && (
          <p style={{ fontSize: 13, color: t.muted, margin: 0, marginTop: 5 }}>{description}</p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0, marginLeft: 20 }}>{action}</div>}
    </div>
  )
}
