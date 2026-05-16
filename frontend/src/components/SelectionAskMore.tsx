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
    const update = () => {
      // Defer one tick so the browser has finalised the selection.
      window.setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setAnchor(null); return }
        const text = sel.toString().trim()
        const container = containerRef.current
        const range = sel.getRangeAt(0)
        const common = range.commonAncestorContainer
        const selectionNode = common.nodeType === Node.TEXT_NODE ? common.parentNode : common
        if (text.length < 12 || !container || !selectionNode || !container.contains(selectionNode)) {
          setAnchor(null)
          return
        }
        const rects = Array.from(range.getClientRects())
        const rect = rects[rects.length - 1] ?? range.getBoundingClientRect()
        if (!rect || (rect.width === 0 && rect.height === 0)) { setAnchor(null); return }
        const left = Math.min(window.innerWidth - 84, Math.max(84, rect.left + rect.width / 2))
        const top = Math.max(58, rect.top - 40)
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
