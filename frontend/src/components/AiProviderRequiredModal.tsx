import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, X } from 'lucide-react'
import { getAiProviders } from '../api/client'
import { useUiLanguage } from '../i18n'

/** True once we know at least one AI provider has an API key configured.
 *  `loading` stays true until the providers query resolves, so callers can
 *  avoid flashing the modal before the real state is known. */
export function useAiProvidersConfigured() {
  const { data, isLoading } = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const map = (data?.data ?? {}) as Record<string, boolean>
  return { configured: Object.values(map).some(Boolean), loading: isLoading }
}

/** Blocking notice shown when an AI feature is reached with no provider key.
 *  Warns the consultant that the feature cannot run and routes them to the
 *  API-key settings page. */
export default function AiProviderRequiredModal({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const en = useUiLanguage() === 'en'
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)', background: 'var(--th-bg-card)',
          color: 'var(--th-text)', borderRadius: 14,
          border: '1px solid var(--th-border)', boxShadow: 'var(--th-shadow-hover)',
          padding: '22px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: 'var(--th-warning-bg)', color: 'var(--th-warning-fg)',
          }}>
            <KeyRound size={18} />
          </span>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>
            {en ? 'AI provider required' : 'Fournisseur IA requis'}
          </h3>
          <button
            type="button" className="ui-icon-button" onClick={onClose}
            aria-label={en ? 'Close' : 'Fermer'}
          >
            <X size={16} />
          </button>
        </div>
        <p style={{
          margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.6,
          color: 'var(--th-text-sub)',
        }}>
          {en
            ? 'This feature uses AI and cannot run yet: no AI provider is configured. Add an API key (Claude, OpenAI, Gemini, Copilot or GitHub Models) to enable it.'
            : "Cette fonctionnalité utilise l'IA et ne peut pas démarrer : aucun fournisseur IA n'est configuré. Ajoutez une clé API (Claude, OpenAI, Gemini, Copilot ou GitHub Models) pour l'activer."}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="ui-button ui-button-outline" onClick={onClose}>
            {en ? 'Later' : 'Plus tard'}
          </button>
          <button
            type="button"
            className="ui-button ui-button-primary"
            onClick={() => { onClose(); navigate('/settings') }}
          >
            <KeyRound size={14} />
            {en ? 'Configure an API key' : 'Configurer une clé API'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
