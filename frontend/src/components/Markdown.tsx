import React, { useState } from 'react'
import { t } from '../theme'

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

  return (
    <div
      className="markdown-table-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button
          onClick={downloadCsv}
          title="Exporter en CSV"
          className="markdown-table-export"
        >
          ↓ CSV
        </button>
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

    const hMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (hMatch) {
      const sizes = [18, 16, 14]
      result.push(<div key={i} style={{ fontSize: sizes[hMatch[1].length - 1], fontWeight: 700, color: t.text, margin: '12px 0 4px' }}>{hMatch[2]}</div>)
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

    result.push(<p key={i} style={{ margin: '0 0 4px' }}>{inlineMarkdown(line)}</p>)
    i++
  }

  return <>{result}</>
}
