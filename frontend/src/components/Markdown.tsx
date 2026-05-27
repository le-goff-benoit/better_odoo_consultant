import React, { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, ExternalLink, Lightbulb, Pencil, Send, X } from 'lucide-react'
import { t } from '../theme'
import MermaidBlock from './MermaidBlock'
import VoletBlock, { parseVoletType } from './VoletBlock'
import ViewMockupBlock from './ViewMockupBlock'

// v0.100.2 — fenced code block with language badge + copy button.
// Replaces the bare <pre><code> rendering. The label and copy affordance
// matter for BA "Actuellement / Proposé" snippets the user wants to apply,
// and for any short Python/XML excerpt of a cron / server action.
const LANGUAGE_LABELS: Record<string, string> = {
  python: 'Python', py: 'Python', xml: 'XML', javascript: 'JavaScript', js: 'JavaScript',
  ts: 'TypeScript', typescript: 'TypeScript', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  sql: 'SQL', bash: 'Bash', sh: 'Shell', diff: 'Diff', text: 'Texte',
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const label = language ? (LANGUAGE_LABELS[language] ?? language) : undefined
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignored */ }
  }
  return (
    <div style={{ position: 'relative', margin: '8px 0' }} className="markdown-code-block">
      {label && (
        <span style={{
          position: 'absolute', top: 4, left: 8, fontSize: 10, fontFamily: 'monospace',
          color: t.muted, textTransform: 'uppercase', letterSpacing: '0.06em', userSelect: 'none',
        }}>{label}</span>
      )}
      <button
        type="button"
        onClick={onCopy}
        title={copied ? 'Copié' : 'Copier'}
        aria-label={copied ? 'Code copié' : 'Copier le code'}
        className="markdown-code-copy"
        style={{
          position: 'absolute', top: 4, right: 4, background: 'transparent', border: 'none',
          padding: 4, borderRadius: t.radiusSm, cursor: 'pointer', color: copied ? t.brand : t.muted,
          opacity: 0.6, transition: 'opacity 120ms',
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <pre style={{
        background: 'var(--code-bg)', borderRadius: t.radiusSm,
        padding: label ? '22px 14px 10px 14px' : '10px 14px', overflowX: 'auto', margin: 0,
      }}>
        <code style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--code-fg)' }}>{code}</code>
      </pre>
    </div>
  )
}

// Lets a parent renderer hand the Markdown subtree a callback so the
// MarkdownTable "edit with AI" button can dispatch a contextualised prompt
// back to the assistant composer. Since v0.100.0 it also carries the
// active Odoo base URL so `odoo://<model>/<id>` links produced by the LLM
// can be resolved to clickable URLs that open the actual record in Odoo.
const MarkdownActionsCtx = createContext<{
  onEditTable?: (prompt: string) => void
  onPromptAction?: (prompt: string) => void
  odooBaseUrl?: string
}>({})
export function MarkdownActionsProvider({
  onEditTable, onPromptAction, odooBaseUrl, children,
}: {
  onEditTable?: (prompt: string) => void
  onPromptAction?: (prompt: string) => void
  odooBaseUrl?: string
  children: React.ReactNode
}) {
  return <MarkdownActionsCtx.Provider value={{ onEditTable, onPromptAction, odooBaseUrl }}>{children}</MarkdownActionsCtx.Provider>
}

/**
 * Resolve an `odoo://<model>/<id>` URI to a clickable URL on the active
 * Odoo instance. The pattern is LLM-friendly (standard Markdown link with
 * a custom scheme) and the renderer rewrites it at display time using the
 * profile's base URL passed via {@link MarkdownActionsProvider}.
 *
 * We use the canonical `/web#id=<id>&model=<model>&view_type=form` URL
 * because it works across Odoo 15 → 19 without needing the action id of
 * the relevant menu. Returns null when the URI is invalid or no base URL
 * is available (the renderer falls back to a disabled-style label).
 */
export function resolveOdooUri(uri: string, baseUrl: string | undefined): string | null {
  if (!baseUrl) return null
  const match = uri.match(/^odoo:\/\/([a-zA-Z0-9_.]+)\/(\d+)(?:[?#].*)?$/)
  if (!match) return null
  const [, model, id] = match
  const trimmed = baseUrl.replace(/\/+$/, '')
  return `${trimmed}/web#id=${encodeURIComponent(id)}&model=${encodeURIComponent(model)}&view_type=form`
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

// Captures Markdown links `[label](url)` AND inline emphasis tokens. Links
// must come first so we don't split through a label/URL with `**` inside.
const INLINE_SPLIT_RE = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g

export function inlineMarkdown(text: string): React.ReactNode {
  return text.split(INLINE_SPLIT_RE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: 'color-mix(in srgb, var(--brand) 40%, var(--th-text))' }}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: t.bgMuted, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) return <MarkdownLink key={i} label={link[1]} href={link[2]} />
    return part
  })
}

function MarkdownLink({ label, href }: { label: string; href: string }) {
  const ctx = useContext(MarkdownActionsCtx)
  if (href.startsWith('odoo://')) {
    const resolved = resolveOdooUri(href, ctx.odooBaseUrl)
    if (!resolved) {
      // Pas de profil actif → on rend le label mais on grise pour signaler
      // que le lien n'est pas opérant dans ce contexte (mode général).
      return (
        <span
          title={`Lien Odoo indisponible (aucun projet actif) : ${href}`}
          style={{ color: t.muted, textDecoration: 'underline dotted', cursor: 'help' }}
        >
          {label}
        </span>
      )
    }
    return (
      <a
        href={resolved}
        target="_blank"
        rel="noopener noreferrer"
        title={`Ouvrir dans Odoo : ${href}`}
        style={{
          color: t.brandFg,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 3,
        }}
      >
        {label}
        <ExternalLink size={11} style={{ alignSelf: 'center', flexShrink: 0, opacity: 0.7 }} />
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: t.brandFg, textDecoration: 'underline', textUnderlineOffset: 2 }}
    >
      {label}
    </a>
  )
}

const ACTION_HEADING_RE = /(?<![a-zA-Z])(prochaines?\s+(?:actions?|[EeéÉ]tapes?)|[EeéÉ]tapes?\s+suivantes?|[Pp]oints?\s+d[''\']actions?|[Aa]ctions?\s+(?:à\s+faire|recommand[ée]es?)|[Nn]ext\s+(?:actions?|steps?)|[Rr]ecommended\s+actions?|[Aa]ction\s+items?|todo)(?![a-zA-Z])/i

// Section heading that triggers the « Exemples concrets » callout. Matches
// both FR and EN variants the LLM is encouraged to produce in the BA
// template (cf. business_impact_review.md).
const CONCRETE_EXAMPLES_HEADING_RE = /^\s*(exemples?\s+(?:concrets?|r[ée]els?)(?:\s+sur\s+cette\s+base)?|concrete\s+examples?(?:\s+(?:in|on)\s+this\s+(?:database|base))?)\s*[:?]?\s*$/i

/**
 * Tinted card used to render the « Exemples concrets sur cette base »
 * section the BA produces with grounded data + clickable `odoo://` links.
 * Goal : make this section visually distinct so the consultant immediately
 * spots the « voici la preuve en live sur ta base » bloc and can click
 * straight through to Odoo.
 */
function ConcreteExamplesCallout({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        margin: '14px 0',
        padding: '12px 16px 10px',
        background: `${t.brand}10`,
        border: `1px solid ${t.brand}40`,
        borderLeft: `3px solid ${t.brand}`,
        borderRadius: t.radius,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 6, color: t.brand, fontWeight: 700, fontSize: 13,
      }}>
        <Lightbulb size={14} />
        <span>{title}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        {/* Recursive render — odoo:// links resolve through the same provider. */}
        {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
        <Markdown text={body} />
      </div>
    </div>
  )
}

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

/**
 * Indented list markers : the LLM produces nested sub-bullets with 2 or 4
 * spaces of leading whitespace (`  - sub item`). Pre-fix v0.99.3, the regex
 * anchored at `^` (start of line, no leading space) so indented sub-items
 * fell through to the `<p>` renderer and the literal `- ` was visible in
 * the output. We now allow any amount of leading whitespace and report it
 * back so the renderer can apply a nesting indent.
 */
const UNORDERED_LIST_RE = /^(\s*)[-*•]\s+(.+)/
const ORDERED_LIST_RE = /^(\s*)(\d+)\.\s+(.+)/

function isListLine(line: string): boolean {
  return UNORDERED_LIST_RE.test(line) || ORDERED_LIST_RE.test(line)
}

/** Convert leading whitespace into a nesting depth (2 spaces or 1 tab = 1 level). */
function indentDepth(indent: string): number {
  // Tabs count as 4 spaces (de-facto standard for the Markdown indent column).
  const cols = indent.replace(/\t/g, '    ').length
  return Math.min(3, Math.floor(cols / 2))
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
 *  « Actions à faire / Prochaines étapes / Next actions / Todo » heading. Used to surface the
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
    const listMatch = line.match(UNORDERED_LIST_RE)
    if (listMatch) {
      // v0.100.4 — only top-level bullets count as actions. Sub-bullets
      // (indented) are detail of the parent action ("Inspecter X pour
      // voir : \n  - condition 1 \n  - condition 2") and would create
      // fragmentary chips like "condition 1," that aren't standalone
      // actions to launch.
      if (inActionList && listMatch[1].length === 0) out.push(stripMarkdownInline(listMatch[2]))
      continue
    }
    const olMatch = line.match(ORDERED_LIST_RE)
    if (olMatch) {
      // Same rule for numbered items: only top-level ones are actions.
      if (inActionList && olMatch[1].length === 0) out.push(stripMarkdownInline(olMatch[3]))
      continue
    }
    // Non-list non-empty line ends an action list section. But a blank line
    // between an action and its sub-bullets must NOT end the section, so we
    // only break on real content (already filtered via `line.trim()` below).
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

    // v0.100.9 — volet directive: :::volet[type] Title
    // The LLM produces `:::volet[info] Mon titre` … `:::` to wrap structured
    // sections in a collapsible colored panel. Parsed before code fences so
    // `::: ` lines are never mistaken for content.
    if (line.trimStart().startsWith(':::')) {
      const directiveMatch = line.trimStart().match(/^:::volet(?:\[(\w+)\])?\s*(.*)/i)
      if (directiveMatch) {
        const rawType = directiveMatch[1] ?? 'note'
        const title = directiveMatch[2]?.trim() ?? ''
        const bodyLines: string[] = []
        i++
        while (i < lines.length && !lines[i].trimStart().startsWith(':::')) {
          bodyLines.push(lines[i])
          i++
        }
        const body = bodyLines.join('\n').trim()
        const type = parseVoletType(rawType)
        result.push(
          <VoletBlock key={i} type={type} title={title}>
            {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
            {body ? <Markdown text={body} /> : null}
          </VoletBlock>
        )
        i++; continue
      }
    }

    if (line.trimStart().startsWith('```')) {
      const fence = line.trimStart()
      const language = fence.slice(3).trim().split(/\s+/)[0]?.toLowerCase()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) { codeLines.push(lines[i]); i++ }
      const code = codeLines.join('\n')
      result.push(
        language === 'mermaid'
          ? <MermaidBlock key={i} code={code} />
          : language === 'viewmock'
            ? <ViewMockupBlock key={i} code={code} />
            : <CodeBlock key={i} code={code} language={language} />
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

    // Horizontal rule — `---` (or `***`, `___`) seuls sur une ligne. Avant
    // 0.100.0, ces marqueurs passaient en `<p>` et apparaissaient comme
    // texte brut au lieu d'un séparateur visuel.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      result.push(
        <hr key={i} style={{
          border: 'none',
          borderTop: `1px solid ${t.border}`,
          margin: '14px 0',
          opacity: 0.6,
        }} />
      )
      i++; continue
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (hMatch) {
      // « Exemples concrets sur cette base » et variantes → callout dédié.
      // Le LLM produit cette section depuis le template business_impact_review
      // (v0.100.0) avec des liens `odoo://<model>/<id>` pour pointer
      // vers les enregistrements réels. On la rend en carte tintée pour
      // la rendre immédiatement repérable côté consultant.
      const headingText = hMatch[2].trim()
      if (CONCRETE_EXAMPLES_HEADING_RE.test(stripMarkdownInline(headingText))) {
        // Collect lines until the next heading of same-or-higher level, or EOF.
        const startLevel = hMatch[1].length
        const collected: string[] = []
        let j = i + 1
        while (j < lines.length) {
          const peek = lines[j]
          const peekH = peek.match(/^(#{1,6})\s+/)
          if (peekH && peekH[1].length <= startLevel) break
          collected.push(peek)
          j++
        }
        result.push(<ConcreteExamplesCallout key={i} title={headingText} body={collected.join('\n')} />)
        i = j; continue
      }
      const sizes = [18, 16, 14, 13, 12, 12]
      const margins = ['14px 0 4px', '12px 0 4px', '10px 0 3px', '8px 0 3px', '8px 0 3px', '8px 0 3px']
      const level = hMatch[1].length
      result.push(<div key={i} style={{
        fontSize: sizes[level - 1], fontWeight: 700, color: t.text, margin: margins[level - 1],
      }}>{inlineMarkdown(hMatch[2])}</div>)
      i++; continue
    }

    const listMatch = line.match(UNORDERED_LIST_RE)
    if (listMatch) {
      const depth = indentDepth(listMatch[1])
      // Use a hollow bullet at depth ≥1 to visually distinguish nested items.
      const marker = depth === 0 ? '•' : '◦'
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: depth * 18 }}>
          <span style={{ color: t.brandFg, flexShrink: 0 }}>{marker}</span>
          <span>{inlineMarkdown(listMatch[2])}</span>
        </div>
      )
      i++; continue
    }

    const olMatch = line.match(ORDERED_LIST_RE)
    if (olMatch) {
      const depth = indentDepth(olMatch[1])
      result.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, paddingLeft: depth * 18 }}>
          <span style={{ color: t.brandFg, flexShrink: 0, minWidth: 18, textAlign: 'right' }}>{olMatch[2]}.</span>
          <span>{inlineMarkdown(olMatch[3])}</span>
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
