import React, { useState } from 'react'
import { t } from '../theme'

// ── Markdown table with CSV export ────────────────────────────

function MarkdownTable({ headers, dataRows }: { headers: string[]; dataRows: string[][] }) {
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
      style={{ overflowX: 'auto', margin: '8px 0', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <button
          onClick={downloadCsv}
          title="Exporter en CSV"
          style={{
            position: 'absolute', top: 4, right: 4, zIndex: 10,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', fontSize: 11, fontWeight: 600,
            background: t.bgCard, color: t.action,
            border: `1px solid ${t.brand40}`, borderRadius: t.radius,
            cursor: 'pointer', boxShadow: t.shadow,
            transition: 'opacity .15s',
          }}
        >
          ↓ CSV
        </button>
      )}
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, j) => (
              <th key={j} style={{ padding: '6px 12px', textAlign: 'left', background: t.bgMuted, borderBottom: `2px solid ${t.border}`, fontWeight: 600, color: t.textSub }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? t.bgCard : t.bgMuted }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '5px 12px', borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
                  {cell}
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

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      result.push(
        <pre key={i} style={{ background: 'var(--code-bg)', borderRadius: t.radiusSm, padding: '10px 14px', overflowX: 'auto', margin: '8px 0' }}>
          <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--code-fg)' }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++; continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const rows = tableLines.filter(l => !l.match(/^\|[-| :]+\|$/))
      if (rows.length) {
        const headers = rows[0].split('|').filter(Boolean).map(s => s.trim())
        const dataRows = rows.slice(1).map(row => row.split('|').filter(Boolean).map(c => c.trim()))
        result.push(<MarkdownTable key={i} headers={headers} dataRows={dataRows} />)
      }
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
          <span style={{ color: t.brand, flexShrink: 0 }}>•</span>
          <span>{inlineMarkdown(listMatch[1])}</span>
        </div>
      )
      i++; continue
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (olMatch) {
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: t.brand, flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{olMatch[1]}.</span>
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
