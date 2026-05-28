// StreamingText — lightweight renderer for in-progress AI responses.
//
// During streaming the full Markdown parser (Markdown.tsx) is bypassed because
// multi-line structures (volets, fenced blocks, tables) are parsed by consuming
// lines until a closing marker arrives.  Rendering them while tokens are still
// arriving causes flickering, broken structure, and Mermaid parse errors.
//
// This component renders the accumulated raw text with:
//   - basic heading detection (# ## ###)
//   - paragraph separation on double newlines
//   - unordered list items (- * •)
//   - inline formatting for **bold**, *italic*, `code`
//   - a blinking cursor at the end
//
// When the `done` event arrives, the parent switches to <Markdown> for the
// full rich render (tables, volets, mermaid, viewmock, odoo:// links…).

import { t } from '../theme'

// ── Inline markdown (bold / italic / inline-code) ──────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Pattern: **bold** | *italic* | `code`
  const RE = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const [full, , bold, italic, code] = match
    if (bold !== undefined) {
      parts.push(<strong key={match.index}>{bold}</strong>)
    } else if (italic !== undefined) {
      parts.push(<em key={match.index}>{italic}</em>)
    } else if (code !== undefined) {
      parts.push(
        <code key={match.index} style={{
          background: t.bgMuted, borderRadius: 3,
          padding: '1px 5px', fontSize: '0.9em',
          fontFamily: 'var(--font-mono, monospace)',
        }}>{code}</code>
      )
    }
    last = match.index + full.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// ── Block-level line renderer ───────────────────────────────────────────────

function renderLine(line: string, key: number): React.ReactNode {
  // Heading
  const hMatch = line.match(/^(#{1,3})\s+(.+)/)
  if (hMatch) {
    const level = hMatch[1].length
    const fs = level === 1 ? 18 : level === 2 ? 16 : 14
    const fw = level === 1 ? 700 : 650
    return (
      <div key={key} style={{ fontSize: fs, fontWeight: fw, color: t.text, marginTop: 10, marginBottom: 2 }}>
        {renderInline(hMatch[2])}
      </div>
    )
  }

  // Unordered list item
  const liMatch = line.match(/^(\s*)[-*•]\s+(.+)/)
  if (liMatch) {
    const depth = Math.min(Math.floor(liMatch[1].length / 2), 3)
    return (
      <div key={key} style={{ display: 'flex', gap: 6, paddingLeft: depth * 16, marginTop: 1 }}>
        <span style={{ color: t.muted, flexShrink: 0, fontSize: 11, lineHeight: '22px' }}>
          {depth === 0 ? '•' : '◦'}
        </span>
        <span>{renderInline(liMatch[2])}</span>
      </div>
    )
  }

  // Ordered list item
  const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/)
  if (olMatch) {
    const depth = Math.min(Math.floor(olMatch[1].length / 2), 3)
    return (
      <div key={key} style={{ display: 'flex', gap: 6, paddingLeft: depth * 16, marginTop: 1 }}>
        <span style={{ color: t.muted, flexShrink: 0, fontSize: 11, lineHeight: '22px' }}>{olMatch[2]}.</span>
        <span>{renderInline(olMatch[3])}</span>
      </div>
    )
  }

  // Empty line — small gap handled by paragraph grouping, nothing to render
  return null
}

// ── Main component ──────────────────────────────────────────────────────────

export function StreamingText({ text }: { text: string }) {
  // Split on double newlines first (paragraph breaks), then render each
  // paragraph line by line.
  const paragraphs = text.split(/\n{2,}/)

  return (
    <div style={{
      fontSize: 14, lineHeight: 1.7, color: t.text,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {paragraphs.map((para, pi) => {
        const lines = para.split('\n')
        const rendered = lines.map((l, li) => renderLine(l, li)).filter(Boolean)

        // If none of the lines matched a special pattern, treat the whole
        // paragraph as flowing text (preserve the newlines via pre-wrap).
        if (rendered.length === 0) {
          return (
            <div key={pi} style={{ marginBottom: 8 }}>
              {renderInline(para)}
            </div>
          )
        }
        return (
          <div key={pi} style={{ marginBottom: 8 }}>
            {lines.map((l, li) => renderLine(l, li))}
          </div>
        )
      })}
      <span className="streaming-cursor" aria-hidden="true" />
    </div>
  )
}
