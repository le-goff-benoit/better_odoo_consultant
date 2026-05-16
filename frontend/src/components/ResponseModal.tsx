import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { useUiLanguage } from '../i18n'

/** Near-fullscreen overlay to read an AI response comfortably. */
export default function ResponseModal({ children, onClose }: {
  children: ReactNode
  onClose: () => void
}) {
  const lang = useUiLanguage()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
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
        <div className="response-modal-body">{children}</div>
      </div>
    </div>
  )
}
