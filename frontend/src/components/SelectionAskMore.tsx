import { RefObject, useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

interface Anchor { text: string; top: number; left: number }

/** Floating "more detail" action shown when the user selects text inside a
 *  response. Clicking it builds a follow-up prompt and submits it. */
export default function SelectionAskMore({ containerRef, onAsk, label, disabled }: {
  containerRef: RefObject<HTMLElement | null>
  onAsk: (selectedText: string) => void
  label: string
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)

  useEffect(() => {
    const clear = () => setAnchor(null)
    const onMouseUp = () => {
      // Defer one tick so the browser has finalised the selection.
      window.setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setAnchor(null); return }
        const text = sel.toString().trim()
        const container = containerRef.current
        if (text.length < 12 || !container || !container.contains(sel.anchorNode)) {
          setAnchor(null)
          return
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        if (!rect || (rect.width === 0 && rect.height === 0)) { setAnchor(null); return }
        setAnchor({ text, top: rect.top, left: rect.left + rect.width / 2 })
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('scroll', clear, true)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('scroll', clear, true)
    }
  }, [containerRef])

  if (disabled || !anchor) return null

  return (
    <button
      type="button"
      className="selection-ask-more"
      style={{ position: 'fixed', top: anchor.top - 40, left: anchor.left }}
      // Keep the text selection alive through the click.
      onMouseDown={e => e.preventDefault()}
      onClick={() => {
        onAsk(anchor.text)
        window.getSelection()?.removeAllRanges()
        setAnchor(null)
      }}
    >
      <Sparkles size={13} /> {label}
    </button>
  )
}
