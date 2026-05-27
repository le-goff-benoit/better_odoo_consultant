import { RefObject, useEffect, useState } from 'react'
import { Quote, Sparkles } from 'lucide-react'

interface Anchor { text: string; top: number; left: number }

function nodeInside(container: HTMLElement, node: Node | null) {
  if (!node) return false
  const candidate = node.nodeType === Node.TEXT_NODE ? node.parentNode : node
  return !!candidate && container.contains(candidate)
}

/** Floating action strip shown when the user selects text inside a response.
 *  - "Plus de détails" submits a follow-up prompt automatically.
 *  - "Citer" inserts a blockquote citation block into the prompt input so the
 *    user can manually complete their question. */
export default function SelectionAskMore({ containerRef, onAsk, onCite, label, citeLabel, disabled }: {
  containerRef: RefObject<HTMLElement | null>
  onAsk: (selectedText: string) => void
  onCite?: (selectedText: string) => void
  label: string
  citeLabel?: string
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  useEffect(() => {
    const clear = () => setAnchor(null)
    const update = () => {
      // Defer one tick so the browser has finalised the selection.
      window.setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setAnchor(null); return }
        const text = sel.toString().trim()
        const container = containerRef.current
        const range = sel.getRangeAt(0)
        const isInside = !!container && (
          nodeInside(container, sel.anchorNode) ||
          nodeInside(container, sel.focusNode) ||
          range.intersectsNode(container)
        )
        if (text.length < 12 || !isInside) {
          setAnchor(null)
          return
        }
        const rects = Array.from(range.getClientRects())
        const rect = rects[rects.length - 1] ?? range.getBoundingClientRect()
        if (!rect || (rect.width === 0 && rect.height === 0)) { setAnchor(null); return }
        const left = Math.min(window.innerWidth - 84, Math.max(84, rect.left + rect.width / 2))
        const below = rect.bottom + 10
        const above = rect.top - 42
        const top = below < window.innerHeight - 44 ? below : Math.max(58, above)
        setAnchor({ text, top, left })
      }, 0)
    }
    const onMouseUp = () => update()
    const onKeyUp = () => update()
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('scroll', clear, true)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('scroll', clear, true)
    }
  }, [containerRef])

  if (disabled || !anchor) return null

  return (
    <div
      className="selection-ask-more-strip"
      style={{ position: 'fixed', top: anchor.top, left: anchor.left, display: 'flex', gap: 4 }}
    >
      <button
        type="button"
        className="selection-ask-more"
        style={{ position: 'static' }}
        onMouseDown={e => e.preventDefault()}
        onClick={() => {
          onAsk(anchor.text)
          window.getSelection()?.removeAllRanges()
          setAnchor(null)
        }}
      >
        <Sparkles size={13} /> {label}
      </button>
      {onCite && (
        <button
          type="button"
          className="selection-ask-more"
          style={{ position: 'static' }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            onCite(anchor.text)
            window.getSelection()?.removeAllRanges()
            setAnchor(null)
          }}
        >
          <Quote size={13} /> {citeLabel ?? 'Citer'}
        </button>
      )}
    </div>
  )
}
