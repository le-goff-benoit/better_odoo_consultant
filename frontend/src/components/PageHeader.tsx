import { ReactNode, useState, useEffect } from 'react'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function PageHeader({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  const now = useClock()
  const date = now.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="page-header">
      <div className="page-header-meta">
        <div className="neo-section-clock">
          <span className="neo-section-clock-date">{date}</span>
          <span className="neo-section-clock-time">{time}</span>
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  )
}
