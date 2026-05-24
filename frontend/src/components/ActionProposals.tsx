import { PlayCircle } from 'lucide-react'
import { actionPromptFor } from './Markdown'

/** Chip strip surfaced beneath an AI response — one chip per action item
 *  extracted from the response (« Prochaines actions / Action items / Todo »
 *  list). Visually mirrors the composer suggestion chips so the user sees
 *  ONE consistent way to trigger a prompt, regardless of whether it comes
 *  from the initial suggestions or from a previous answer.
 *
 *  Click → calls `onPromptAction(actionPromptFor(item))` — i.e. immediately
 *  re-sends a prompt to the AI asking it to execute that specific item.
 *  Disabled (greyed) while a stream is in flight to avoid double-sends. */
export default function ActionProposals({ items, onPromptAction, disabled, lang }: {
  items: string[]
  onPromptAction?: (prompt: string) => void
  disabled?: boolean
  lang?: 'fr' | 'en'
}) {
  if (!items.length || !onPromptAction) return null
  const label = lang === 'en' ? 'Action proposals' : 'Propositions d\'action'
  const aria = lang === 'en' ? 'Run this action' : 'Lancer cette action'
  return (
    <div className="action-proposals">
      <span className="action-proposals-label">
        <PlayCircle size={12} /> {label}
      </span>
      <div className="action-proposals-list">
        {items.map((item, idx) => (
          <button
            key={`${idx}-${item}`}
            type="button"
            className="action-proposal-chip"
            disabled={disabled}
            title={aria + ' — ' + item}
            aria-label={aria}
            onClick={() => onPromptAction(actionPromptFor(item))}
          >
            <PlayCircle size={13} />
            <span>{item}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
