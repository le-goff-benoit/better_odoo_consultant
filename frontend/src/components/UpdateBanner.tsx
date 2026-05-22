import { useEffect, useState } from 'react'
import { DownloadCloud, Loader2, RefreshCw, X } from 'lucide-react'
import { applyUpdate, getUpdateStatus } from '../api/client'
import { useUiLanguage } from '../i18n'

interface UpdateStatus {
  ok: boolean
  update_available: boolean
  local_short?: string
  remote_short?: string
  behind?: number
  latest_subject?: string
  error?: string
}

export default function UpdateBanner() {
  const lang = useUiLanguage()
  const en = lang === 'en'
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissedSha, setDismissedSha] = useState<string | null>(() => {
    try { return sessionStorage.getItem('dismissed-update-sha') } catch { return null }
  })
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await getUpdateStatus()
        if (!cancelled) setStatus(res.data as UpdateStatus)
      } catch {
        if (!cancelled) setStatus(null)
      }
    }
    check()
    const id = window.setInterval(check, 5 * 60 * 1000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  const remote = status?.remote_short ?? ''
  const visible = Boolean(status?.ok && status.update_available && remote !== dismissedSha)
  if (!visible) return null

  const dismiss = () => {
    setDismissedSha(remote)
    try { sessionStorage.setItem('dismissed-update-sha', remote) } catch { /* ignore */ }
  }

  const runUpdate = async () => {
    setApplying(true)
    setMessage('')
    try {
      await applyUpdate()
      setMessage(en
        ? 'Update started. The portal will close and restart automatically.'
        : 'Mise à jour lancée. Le portail va se fermer et redémarrer automatiquement.')
      window.setTimeout(() => {
        window.close()
        window.location.href = 'about:blank'
      }, 900)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setMessage(detail ?? (en ? 'Unable to start update.' : 'Impossible de lancer la mise à jour.'))
      setApplying(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <DownloadCloud size={18} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={styles.title}>
            {en ? 'A new update is available' : 'Une nouvelle mise à jour est disponible'}
            {status?.behind ? <span style={styles.badge}>+{status.behind}</span> : null}
          </div>
          <div style={styles.sub}>
            {status?.local_short && status?.remote_short && `${status.local_short} → ${status.remote_short}`}
            {status?.latest_subject ? ` · ${status.latest_subject}` : ''}
            {message ? ` · ${message}` : ''}
          </div>
        </div>
        <button type="button" style={styles.action} onClick={runUpdate} disabled={applying}>
          {applying ? <Loader2 size={14} className="creator-spin" /> : <RefreshCw size={14} />}
          {applying ? (en ? 'Updating…' : 'Mise à jour…') : (en ? 'Update' : 'Mettre à jour')}
        </button>
        <button type="button" style={styles.close} onClick={dismiss} aria-label={en ? 'Dismiss' : 'Masquer'} disabled={applying}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1200,
    width: 'min(860px, calc(100vw - 28px))', pointerEvents: 'none',
  },
  inner: {
    pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 12,
    background: 'var(--th-warning-bg)', color: 'var(--th-warning-fg)',
    border: '1px solid var(--th-warning-fg)', boxShadow: 'var(--th-shadow-hover)',
  },
  title: { fontSize: 13, fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center' },
  sub: { fontSize: 12, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  badge: {
    fontSize: 11, padding: '1px 6px', borderRadius: 999,
    background: 'var(--th-bg-card)', border: '1px solid currentColor',
  },
  action: {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid currentColor',
    borderRadius: 9, padding: '7px 10px', background: 'var(--th-bg-card)', color: 'inherit',
    fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  close: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 8, border: '1px solid transparent',
    background: 'transparent', color: 'inherit', cursor: 'pointer',
  },
}