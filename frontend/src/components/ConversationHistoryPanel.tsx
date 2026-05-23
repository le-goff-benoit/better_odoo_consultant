import { History, X } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import { t } from '../theme'

/** Generic side history panel used by Assistant + Migration (and Creator via
 * its dedicated wrapper). Each page just supplies items + selectors for the
 * fields it cares about — avoids ~40 lines of duplicated JSX per page.
 *
 * The container class `assistant-history-panel` is kept for now to preserve
 * existing CSS positioning; a future pass can rename it to `workspace-history-panel`. */
export interface HistoryItem {
  id: string | number
  title: string
  updatedAt: number | string
  messageCount: number
  /** Right-aligned badge content shown below the title — e.g. "v18.0" for
   * Assistant or "v18 → v17" for Migration. Pass null/undefined to hide. */
  badge?: string | null
}

interface ConversationHistoryPanelProps<T extends HistoryItem> {
  rows: T[]
  onClose: () => void
  onResume: (item: T) => void
  onDelete: (item: T) => void
  /** Optional override of the panel title. Defaults to "Historique" / "History". */
  title?: string
  /** Date formatter — pass through fmtDate util to keep page-specific format. */
  formatDate: (epochOrIso: HistoryItem['updatedAt']) => string
}

export default function ConversationHistoryPanel<T extends HistoryItem>({
  rows, onClose, onResume, onDelete, title, formatDate,
}: ConversationHistoryPanelProps<T>) {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { history: title ?? 'History', close: 'Close', empty: 'No saved conversations', resume: 'Resume', delete: 'Delete', msg: 'msg' }
    : { history: title ?? 'Historique', close: 'Fermer', empty: 'Aucune conversation sauvegardée', resume: 'Reprendre', delete: 'Supprimer', msg: 'msg' }
  return (
    <div className="assistant-history-panel">
      <div style={{
        padding: '12px 14px 10px',
        borderBottom: `var(--neo-border-w) solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
          color: t.text, textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          <History size={14} /> {c.history}
        </span>
        <button onClick={onClose} className="ui-icon-button" aria-label={c.close} title={c.close}>
          <X size={15} />
        </button>
      </div>
      {rows.length === 0
        ? <div style={{ padding: '20px 14px', fontSize: 12, color: t.muted, textAlign: 'center' }}>{c.empty}</div>
        : rows.map(item => (
          <div key={item.id} style={{
            padding: '11px 14px',
            borderBottom: `1px solid ${t.borderLight}`,
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <span style={{
                fontSize: 12, fontWeight: 650, color: t.text, lineHeight: 1.4, flex: 1,
              }} title={item.title}>{item.title}</span>
              <button onClick={() => onDelete(item)}
                className="ui-icon-button" aria-label={c.delete} title={c.delete}>
                <X size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: t.muted }}>{formatDate(item.updatedAt)}</span>
              {item.badge && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: t.brand20, color: t.brand,
                }}>{item.badge}</span>
              )}
              <span style={{ fontSize: 10, color: t.muted, marginLeft: 'auto' }}>
                {item.messageCount} {c.msg}
              </span>
            </div>
            <button className="btn btn-primary" onClick={() => onResume(item)}
              style={{ marginTop: 3, fontSize: 11, padding: '5px 10px' }}>
              <History size={12} /> {c.resume}
            </button>
          </div>
        ))
      }
    </div>
  )
}
