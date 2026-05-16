import { ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import SelectionAskMore from './SelectionAskMore'

/** Near-fullscreen overlay to read an AI response comfortably. */
export default function ResponseModal({ children, onClose, onAskMore, askMoreLabel, askMoreDisabled }: {
  children: ReactNode
  onClose: () => void
  onAskMore?: (selectedText: string) => void
  askMoreLabel?: string
  askMoreDisabled?: boolean
}) {
  const lang = useUiLanguage()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  return createPortal(
    <div className="response-modal-overlay" role="presentation" onClick={onClose}>
      <div className="response-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="response-modal-header">
          <span>{lang === 'fr' ? 'Réponse' : 'Answer'}</span>
          <button
            type="button"
            className="ui-icon-button"
            onClick={onClose}
            aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
            title={lang === 'fr' ? 'Fermer (Échap)' : 'Close (Esc)'}
          >
            <X size={16} />
          </button>
        </div>
        <div className="response-modal-body" ref={bodyRef}>{children}</div>
        {onAskMore && (
          <SelectionAskMore
            containerRef={bodyRef}
            onAsk={onAskMore}
            label={askMoreLabel ?? (lang === 'fr' ? 'Plus de détail' : 'More detail')}
            disabled={askMoreDisabled}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}
