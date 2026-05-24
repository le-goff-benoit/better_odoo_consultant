import React, { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Send, X } from 'lucide-react'
import { t } from '../theme'

// Lets a parent renderer hand the Markdown subtree a callback so the
// MarkdownTable "edit with AI" button can dispatch a contextualised prompt
// back to the assistant composer.
const MarkdownActionsCtx = createContext<{
  onEditTable?: (prompt: string) => void
  onPromptAction?: (prompt: string) => void
}>({})
export function MarkdownActionsProvider({
  onEditTable, onPromptAction, children,
}: {
  onEditTable?: (prompt: string) => void
  onPromptAction?: (prompt: string) => void
  children: React.ReactNode
}) {
  return <MarkdownActionsCtx.Provider value={{ onEditTable, onPromptAction }}>{children}</MarkdownActionsCtx.Provider>
}

// ── Markdown table with CSV export ────────────────────────────

type TableAlign = 'left' | 'center' | 'right'

export interface ParsedMarkdownTable {
  headers: string[]
  aligns: TableAlign[]
  dataRows: string[][]
}

function isEscaped(value: string, index: number): boolean {
  let slashCount = 0
  for (let i = index - 1; i >= 0 && value[i] === '\\'; i--) slashCount++
  return slashCount % 2 === 1
}

export function splitMarkdownTableRow(row: string): string[] {
  let value = row.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|') && !isEscaped(value, value.length - 1)) value = value.slice(0, -1)

  const cells: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && value[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

function parseAlignment(cell: string): TableAlign | null {
  const normalized = cell.trim().replace(/\s+/g, '')
  if (!/^:?-{3,}:?$/.test(normalized)) return null
  if (normalized.startsWith(':') && normalized.endsWith(':')) return 'center'
  if (normalized.endsWith(':')) return 'right'
  return 'left'
}

function normalizeRow(cells: string[], width: number): string[] {
  const row = cells.slice(0, width)
  while (row.length < width) row.push('')
  return row
}

export function parseMarkdownTable(tableLines: string[]): ParsedMarkdownTable | null {
  if (tableLines.length < 2) return null
  const headers = splitMarkdownTableRow(tableLines[0])
  const separator = splitMarkdownTableRow(tableLines[1])
  if (!headers.length || separator.length < headers.length) return null
  const aligns = separator.slice(0, headers.length).map(parseAlignment)
  if (aligns.some(align => align === null)) return null
  return {
    headers,
    aligns: aligns as TableAlign[],
    dataRows: tableLines.slice(2).map(row => normalizeRow(splitMarkdownTableRow(row), headers.length)),
  }
}

function isPotentialTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false
  if (!lines[index].includes('|')) return false
  return parseMarkdownTable([lines[index], lines[index + 1]]) !== null
}

function isTableContinuation(line: string): boolean {
  return line.trim().length > 0 && line.includes('|')
}

function MarkdownTable({ headers, aligns, dataRows }: ParsedMarkdownTable) {
  const [hovered, setHovered] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editText, setEditText] = useState('')
  const { onEditTable } = useContext(MarkdownActionsCtx)

  const downloadCsv = () => {
    const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      headers.map(escape).join(','),
      ...dataRows.map(row => row.map(escape).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const tableMarkdown = () => {
    const head = '| ' + headers.join(' | ') + ' |'
    const sep = '| ' + aligns.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : '---').join(' | ') + ' |'
    const body = dataRows.map(row => '| ' + row.join(' | ') + ' |').join('\n')
    return [head, sep, body].join('\n')
  }

  const submitEdit = () => {
    if (!onEditTable || !editText.trim()) return
    const md = tableMarkdown()
    const prompt =
      `Voici le tableau de ta réponse précédente :\n\n${md}\n\nDemande : ${editText.trim()}\n\n` +
      `Renvoie une version mise à jour de ce tableau en Markdown.`
    onEditTable(prompt)
    setEditOpen(false)
    setEditText('')
  }

  return (
    <div
      className="markdown-table-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div className="markdown-table-actions">
          {onEditTable && (
            <button
              onClick={() => setEditOpen(true)}
              title="Demander à l'IA une modification de ce tableau"
              className="markdown-table-action-btn"
            >
              <Pencil size={11} style={{ verticalAlign: '-2px' }} />
            </button>
          )}
          <button
            onClick={downloadCsv}
            title="Exporter en CSV"
            className="markdown-table-action-btn"
          >
            ↓ CSV
          </button>
        </div>
      )}
      {editOpen && createPortal(
        <div className="ui-modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="ui-modal" role="dialog" aria-modal="true"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 560, width: '100%' }}>
            <div className="ui-modal-header">
              <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 16, fontWeight: 700 }}>
                <Pencil size={15} /> Modifier ce tableau via l'IA
              </h2>
              <button onClick={() => setEditOpen(false)} className="ui-icon-button" aria-label="Fermer" title="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="ui-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--th-muted)', lineHeight: 1.5 }}>
                Décrivez la modification souhaitée — ajouter une colonne, reformater, agréger, filtrer…
                La demande sera envoyée à l'IA avec le tableau en contexte.
              </div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                placeholder="Ex : ajoute une colonne « marge en % » calculée à partir des colonnes existantes."
                autoFocus
                style={{
                  width: '100%', minHeight: 110, padding: '10px 12px',
                  border: `1px solid ${t.border}`, borderRadius: t.radius,
                  fontSize: 13, color: t.text, background: t.white,
                  fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitEdit()
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={submitEdit} disabled={!editText.trim()}>
                  <Send size={13} /> Envoyer à l'IA
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <table className="markdown-table">
        <thead>
          <tr>
            {headers.map((h, j) => (
              <th key={j} style={{ textAlign: aligns[j] }}>
                {inlineMarkdown(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri}>
              {headers.map((_, ci) => (
                <td key={ci} style={{ textAlign: aligns[ci] }}>
                  {inlineMarkdown(row[ci] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────────

export function inlineMarkdown(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: 'color-mix(in srgb, var(--brand) 40%, var(--th-text))' }}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    return part
  })
}

const ACTION_HEADING_RE = /\b(prochaines?\s+actions?|points?\s+d['’]actions?|actions?\s+à\s+faire|next\s+actions?|action\s+items?|todo)\b/i

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function actionPrompt(actionText: string): string {
  return [
    "Réalise ce point d'action de ta réponse précédente :",
    '',
    actionText,
    '',
    "Utilise les outils nécessaires et restitue le résultat directement.",
  ].join('\n')
}

function isListLine(line: string): boolean {
  return /^[-*]\s+(.+)/.test(line) || /^(\d+)\.\s+(.+)/.test(line)
}

function nextContentLine(lines: string[], start: number): string {
  for (let idx = start; idx < lines.length; idx++) {
    if (lines[idx].trim()) return lines[idx]
  }
  return ''
}

/** Build the prompt that will be sent to the AI when the user picks one of
 *  the action items extracted from a previous response. Exported so the
 *  bubbles can build chip click handlers without duplicating the wording. */
export function actionPromptFor(actionText: string): string {
  return actionPrompt(stripMarkdownInline(actionText))
}

/** Walk a Markdown string and return the list items found under any
 *  « Actions à faire / Next actions / Todo » heading. Used to surface the
 *  action items as a chip strip beneath the response (unified with the
 *  initial composer suggestions). Stops collecting at the next heading. */
export function extractActionItems(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let inActionList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.trimStart().startsWith('```')
    if (fence) {
      // skip code block
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) i++
      continue
    }
    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      inActionList = ACTION_HEADING_RE.test(stripMarkdownInline(hMatch[2]))
      continue
    }
    if (
      ACTION_HEADING_RE.test(stripMarkdownInline(line))
      && isListLine(nextContentLine(lines, i + 1))
    ) {
      inActionList = true
      continue
    }
    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      if (inActionList) out.push(stripMarkdownInline(listMatch[1]))
      continue
    }
    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      if (inActionList) out.push(stripMarkdownInline(olMatch[2]))
      continue
    }
    // Non-list non-empty line ends an action list section.
    if (line.trim()) inActionList = false
  }
  // De-dupe while preserving order.
  const seen = new Set<string>()
  return out.filter(item => {
    if (seen.has(item)) return false
    seen.add(item)
    return true
  })
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(lines[i]); i++ }
      result.push(
        <pre key={i} style={{ background: 'var(--code-bg)', borderRadius: t.radiusSm, padding: '10px 14px', overflowX: 'auto', margin: '8px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--code-fg)' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

    if (isPotentialTableStart(lines, i)) {
      const tableLines: string[] = []
      while (i < lines.length && isTableContinuation(lines[i])) { tableLines.push(lines[i]); i++ }
      const table = parseMarkdownTable(tableLines)
      if (table) result.push(<MarkdownTable key={i} {...table} />)
      continue
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      const sizes = [18, 16, 14, 13, 12, 12]
      const margins = ['14px 0 4px', '12px 0 4px', '10px 0 3px', '8px 0 3px', '8px 0 3px', '8px 0 3px']
      const level = hMatch[1].length
      result.push(<div key={i} style={{
        fontSize: sizes[level - 1], fontWeight: 700, color: t.text, margin: margins[level - 1],
      }}>{hMatch[2]}</div>)
      i++; continue
    }

    const listMatch = line.match(/^[-*]\s+(.+)/)
    if (listMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brandFg, flexShrink: 0 }}>•</span>
          <span>{inlineMarkdown(listMatch[1])}</span>
        </div>
      )
      i++; continue
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brandFg, flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{olMatch[1]}.</span>
          <span>{inlineMarkdown(olMatch[2])}</span>
        </div>
      )
      i++; continue
    }

    if (!line.trim()) { result.push(<div key={i} style={{ height: 8 }} />); i++; continue }

    if (
      ACTION_HEADING_RE.test(stripMarkdownInline(line))
      && isListLine(nextContentLine(lines, i + 1))
    ) {
      result.push(<p key={i} style={{ margin: '0 0 4px', fontWeight: 700 }}>{inlineMarkdown(line)}</p>)
      i++; continue
    }

    result.push(<p key={i} style={{ margin: '0 0 4px' }}>{inlineMarkdown(line)}</p>)
    i++
  }

  return <>{result}</>
}
