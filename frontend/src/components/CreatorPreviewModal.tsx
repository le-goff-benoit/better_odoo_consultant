import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, CheckCircle2, AlertTriangle, FileText, PanelsTopLeft,
  Maximize2, Minimize2, Wand2,
} from 'lucide-react'

/** Result of POST /creator/preview. */
export interface PreviewResult {
  ok: boolean
  kind?: 'view' | 'report'
  valid?: boolean
  error?: string | null
  // view
  model?: string
  view_type?: string
  before_arch?: string
  after_arch?: string
  field_info?: FieldInfoMap
  sample_values?: SampleValues
  // report
  report_name?: string
  report_label?: string
  record?: { id: number; name: string }
  before_pdf?: string | null
  after_pdf?: string | null
}

// Fixed Odoo-like palette — the wireframe represents an Odoo screen, so it
// keeps its own light theme regardless of the app's light/dark mode.
const ODOO = {
  page: '#f3f4f6',
  chrome: '#f8f8f8',
  control: '#ffffff',
  sheet: '#ffffff',
  text: '#37323e',
  muted: '#7c7d8a',
  border: '#d7d9e0',
  inputBorder: '#c5c9d2',
  inputBg: '#ffffff',
  field: '#eef0f3',
  primary: '#714B67',       // Odoo aubergine
  primaryText: '#ffffff',
  stat: '#5b6b7d',
  added: '#1a7a3c',
  addedBg: 'rgba(26,122,60,.10)',
}

// ── arch parsing helpers ─────────────────────────────────────────

function parseArch(arch: string): Element | null {
  if (!arch) return null
  try {
    const doc = new DOMParser().parseFromString(arch, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    return doc.documentElement
  } catch {
    return null
  }
}

function collectNames(arch: string): { fields: Set<string>; pages: Set<string> } {
  const fields = new Set<string>()
  const pages = new Set<string>()
  const root = parseArch(arch)
  if (root) {
    root.querySelectorAll('field').forEach(f => {
      const n = f.getAttribute('name')
      if (n) fields.add(n)
    })
    root.querySelectorAll('page').forEach(p => {
      const s = p.getAttribute('string') || p.getAttribute('name')
      if (s) pages.add(s)
    })
  }
  return { fields, pages }
}

function humanize(name: string): string {
  const base = name.replace(/^x_/, '').replace(/_id$/, '').replace(/_/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : name
}

function isStaticInvisible(el: Element): boolean {
  const v = (el.getAttribute('invisible') || el.getAttribute('column_invisible') || '').trim()
  return v === '1' || v.toLowerCase() === 'true'
}

interface Added { fields: Set<string>; pages: Set<string> }
const NO_ADD: Added = { fields: new Set(), pages: new Set() }

function pageLabel(page: Element, index: number): string {
  return page.getAttribute('string') || page.getAttribute('name') || `Onglet ${index + 1}`
}

function containsAddedField(el: Element, added: Added): boolean {
  if (!added.fields.size) return false
  return Array.from(el.querySelectorAll('field')).some(f => {
    const name = f.getAttribute('name')
    return !!name && added.fields.has(name)
  })
}

// ── wireframe pieces ─────────────────────────────────────────────

function NewBadge() {
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
      color: '#fff', background: ODOO.added, borderRadius: 3, padding: '1px 4px',
    }}>nouveau</span>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, color: ODOO.text, marginTop: 2,
      borderBottom: `1px solid ${ODOO.border}`, paddingBottom: 3,
    }}>{children}</div>
  )
}

/** <separator>: a titled section header, or a plain horizontal rule. */
function Separator({ el }: { el: Element }) {
  const s = el.getAttribute('string')
  if (s) return <SectionTitle>{s}</SectionTitle>
  return <div style={{ borderTop: `1px solid ${ODOO.border}`, margin: '3px 0' }} />
}

type FieldKind =
  | 'boolean' | 'many2one' | 'tags' | 'selection'
  | 'text' | 'date' | 'numeric' | 'image' | 'char'

type FieldInfo = {
  string?: string
  type?: string
  selection?: Array<[unknown, string] | unknown[]>
  relation?: string
}
type FieldInfoMap = Record<string, FieldInfo>
type SampleValues = Record<string, unknown>
type RelatedRowsSample = {
  ids?: unknown[]
  count?: number
  records?: Record<string, unknown>[]
  field_info?: FieldInfoMap
}

type ViewSampleProps = {
  fieldInfo?: FieldInfoMap
  sampleValues?: SampleValues
}

type VisibilityState = 'visible' | 'hidden' | 'conditional'

function fieldLabel(el: Element, fieldInfo?: FieldInfoMap): string {
  const name = el.getAttribute('name') || ''
  return el.getAttribute('string') || fieldInfo?.[name]?.string || humanize(name)
}

function parseMaybeObject(raw: string | null): unknown {
  if (!raw) return null
  const normalized = raw
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/'/g, '"')
  try {
    return JSON.parse(normalized)
  } catch {
    return null
  }
}

function comparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return false
    if (value.length >= 2 && (typeof value[0] === 'number' || typeof value[0] === 'string')) {
      return value[0]
    }
    return value.map(comparableValue)
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return obj.id ?? obj.value ?? obj.name ?? value
  }
  return value
}

function isEmptyOdooValue(value: unknown): boolean {
  return value === false || value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (isEmptyOdooValue(left) && isEmptyOdooValue(right)) return true
  return String(comparableValue(left)) === String(comparableValue(right))
}

function evalCondition(term: unknown, sampleValues?: SampleValues): boolean | null {
  if (!Array.isArray(term) || term.length < 3) return null
  const [field, op, expected] = term
  if (typeof field !== 'string' || typeof op !== 'string') return null
  const actual = sampleValues?.[field]
  const left = comparableValue(actual)
  const right = comparableValue(expected)
  switch (op) {
    case '=':
    case '==':
      return valuesEqual(actual, expected)
    case '!=':
    case '<>':
      return !valuesEqual(actual, expected)
    case 'in':
      return Array.isArray(expected)
        ? expected.some(v => valuesEqual(actual, v))
        : String(expected).includes(String(left ?? ''))
    case 'not in':
      return Array.isArray(expected)
        ? !expected.some(v => valuesEqual(actual, v))
        : !String(expected).includes(String(left ?? ''))
    case '>':
      return Number(left) > Number(right)
    case '>=':
      return Number(left) >= Number(right)
    case '<':
      return Number(left) < Number(right)
    case '<=':
      return Number(left) <= Number(right)
    case 'ilike':
    case 'like':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase())
    case 'not ilike':
    case 'not like':
      return !String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase())
    default:
      return null
  }
}

function evalDomainNode(node: unknown, sampleValues?: SampleValues): boolean | null {
  if (!Array.isArray(node)) return null
  if (node.length >= 3 && typeof node[0] === 'string' && typeof node[1] === 'string') {
    return evalCondition(node, sampleValues)
  }
  if (node[0] === '|') {
    const left = evalDomainNode(node[1], sampleValues)
    const right = evalDomainNode(node[2], sampleValues)
    return left === null || right === null ? null : left || right
  }
  if (node[0] === '&') {
    const left = evalDomainNode(node[1], sampleValues)
    const right = evalDomainNode(node[2], sampleValues)
    return left === null || right === null ? null : left && right
  }
  if (node[0] === '!') {
    const value = evalDomainNode(node[1], sampleValues)
    return value === null ? null : !value
  }
  const values = node.map(part => evalDomainNode(part, sampleValues))
  if (values.some(v => v === null)) return null
  return values.every(Boolean)
}

function evalInlineExpression(expr: string | null, sampleValues?: SampleValues): boolean | null {
  const raw = (expr || '').trim()
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') return false
  if (raw === '1' || raw.toLowerCase() === 'true') return true
  const match = raw.match(/^([A-Za-z_][\w.]*)\s*(==|=|!=|<>|not in|in|>=|<=|>|<)\s*(.+)$/)
  if (!match) {
    if (/^[A-Za-z_]\w*$/.test(raw)) return !isEmptyOdooValue(sampleValues?.[raw])
    return null
  }
  const [, field, op, rhs] = match
  const parsed = parseMaybeObject(rhs)
  const expected = parsed !== null
    ? parsed
    : rhs.replace(/^["']|["']$/g, '')
  return evalCondition([field, op, expected], sampleValues)
}

function invisibleCondition(el: Element): unknown {
  const modifiers = parseMaybeObject(el.getAttribute('modifiers'))
  if (modifiers && typeof modifiers === 'object' && !Array.isArray(modifiers)) {
    const value = (modifiers as Record<string, unknown>).invisible
    if (value !== undefined) return value
  }
  const attrs = parseMaybeObject(el.getAttribute('attrs'))
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    const value = (attrs as Record<string, unknown>).invisible
    if (value !== undefined) return value
  }
  return el.getAttribute('invisible') || el.getAttribute('column_invisible')
}

function visibilityState(el: Element, sampleValues?: SampleValues): VisibilityState {
  if (isStaticInvisible(el)) return 'hidden'
  const condition = invisibleCondition(el)
  if (condition === null || condition === undefined || condition === '') return 'visible'
  if (typeof condition === 'boolean') return condition ? 'hidden' : 'visible'
  if (Array.isArray(condition)) {
    const value = evalDomainNode(condition, sampleValues)
    return value === null ? 'conditional' : value ? 'hidden' : 'visible'
  }
  if (typeof condition === 'string') {
    const value = evalInlineExpression(condition, sampleValues)
    return value === null ? 'conditional' : value ? 'hidden' : 'visible'
  }
  return 'conditional'
}

function isHiddenForSample(el: Element, sampleValues?: SampleValues): boolean {
  return visibilityState(el, sampleValues) === 'hidden'
}

function kindFromOdooType(ttype?: string): FieldKind | null {
  switch ((ttype || '').toLowerCase()) {
    case 'boolean': return 'boolean'
    case 'many2one': return 'many2one'
    case 'many2many':
    case 'one2many': return 'tags'
    case 'selection': return 'selection'
    case 'text':
    case 'html': return 'text'
    case 'date':
    case 'datetime': return 'date'
    case 'float':
    case 'integer':
    case 'monetary': return 'numeric'
    case 'binary': return 'image'
    case 'char': return 'char'
    default: return null
  }
}

/** Best-effort field type from the arch and Odoo metadata. The widget wins,
 * then fields_get metadata, then name heuristics as fallback. */
function fieldKind(el: Element, fieldInfo?: FieldInfoMap): FieldKind {
  const w = (el.getAttribute('widget') || '').toLowerCase()
  const rawName = el.getAttribute('name') || ''
  const name = rawName.toLowerCase()
  if (w) {
    if (w.includes('boolean') || w === 'checkbox' || w === 'toggle') return 'boolean'
    if (w.includes('tags')) return 'tags'
    if (w.includes('many2one')) return 'many2one'
    if (w === 'selection' || w === 'radio' || w.includes('selection') || w === 'priority') return 'selection'
    if (w === 'text' || w === 'html') return 'text'
    if (w.includes('image') || w === 'binary') return 'image'
    if (w === 'date' || w === 'datetime' || w === 'daterange') return 'date'
    if (w === 'monetary' || w === 'float' || w === 'integer'
        || w === 'percentage' || w === 'float_time') return 'numeric'
    return 'char'
  }
  const metaKind = kindFromOdooType((fieldInfo?.[rawName] || fieldInfo?.[name])?.type)
  if (metaKind) return metaKind
  if (name.endsWith('_ids')) return 'tags'
  if (name.endsWith('_id')) return 'many2one'
  if (name === 'state' || name.endsWith('stage_id')) return 'selection'
  if (name.startsWith('is_') || name.startsWith('has_')) return 'boolean'
  if (name.includes('date')) return 'date'
  if (/^(amount|price|qty|quantity)/.test(name)
      || /(_total|_amount|_qty|_price|_count|_tax)$/.test(name)) return 'numeric'
  if (name.includes('note') || name.includes('description') || name.includes('comment')) return 'text'
  return 'char'
}

function selectionLabel(value: unknown, info?: FieldInfo): string | null {
  const selection = info?.selection || []
  for (const item of selection) {
    if (!Array.isArray(item) || item.length < 2) continue
    if (String(item[0]) === String(value)) return String(item[1])
  }
  return null
}

function valueText(value: unknown, kind: FieldKind, info?: FieldInfo): string {
  if (value === null || value === undefined || value === false || value === '') return ''
  if (kind === 'selection') {
    const label = selectionLabel(value, info)
    if (label) return label
  }
  if (Array.isArray(value)) {
    if (kind === 'many2one' && value.length >= 2) return String(value[1] || '')
    const labels = value.map(item => {
      if (Array.isArray(item) && item.length >= 2) return String(item[1] || item[0])
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return String(obj.display_name || obj.name || obj.id || '')
      }
      return String(item)
    }).filter(Boolean)
    return labels.slice(0, 3).join(', ')
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj.display_name || obj.name || obj.id || '')
  }
  const text = String(value)
  return text.length > 72 ? `${text.slice(0, 69)}...` : text
}

function relatedRowsSample(value: unknown): RelatedRowsSample | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as RelatedRowsSample
  return Array.isArray(obj.records) || Array.isArray(obj.ids) ? obj : null
}

function embeddedListFieldElements(el: Element): Element[] {
  const container = Array.from(el.children).find(child => {
    const tag = child.tagName.toLowerCase()
    return tag === 'tree' || tag === 'list'
  }) || Array.from(el.children).find(child => child.tagName.toLowerCase() === 'form')
  if (!container) return []
  const tag = container.tagName.toLowerCase()
  const selector = tag === 'form' ? 'field' : ':scope > field'
  return Array.from(container.querySelectorAll(selector))
    .filter(field => !isStaticInvisible(field))
}

function relatedColumns(el: Element, sample?: RelatedRowsSample) {
  const fromArch = embeddedListFieldElements(el)
    .map(field => {
      const name = field.getAttribute('name') || ''
      return name ? {
        name,
        label: field.getAttribute('string') || sample?.field_info?.[name]?.string || humanize(name),
        kind: fieldKind(field, sample?.field_info),
        info: sample?.field_info?.[name],
      } : null
    })
    .filter(Boolean) as Array<{ name: string; label: string; kind: FieldKind; info?: FieldInfo }>
  if (fromArch.length) return fromArch.slice(0, 8)
  const first = sample?.records?.[0]
  if (!first) return []
  return Object.keys(first)
    .filter(name => name !== 'id' && name !== 'display_name')
    .slice(0, 8)
    .map(name => ({
      name,
      label: sample?.field_info?.[name]?.string || humanize(name),
      kind: kindFromOdooType(sample?.field_info?.[name]?.type) || 'char',
      info: sample?.field_info?.[name],
    }))
}

function X2ManyRows({ el, value, label }: {
  el: Element
  value: unknown
  label: string
}) {
  const sample = relatedRowsSample(value)
  const columns = relatedColumns(el, sample || undefined)
  const records = sample?.records || []
  const count = sample?.count ?? (Array.isArray(sample?.ids) ? sample.ids.length : records.length)
  return (
    <div style={{
      border: `1px solid ${ODOO.border}`, background: ODOO.sheet,
      borderRadius: 3, overflow: 'hidden', width: '100%',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', background: '#f6f6f8', borderBottom: `1px solid ${ODOO.border}`,
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: ODOO.text }}>{label}</span>
        <span style={{ fontSize: 9.5, color: ODOO.muted }}>{count ? `${count} ligne(s)` : 'Aucune ligne'}</span>
      </div>
      {columns.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.name} style={{
                  textAlign: col.kind === 'numeric' ? 'right' : 'left',
                  padding: '6px 8px', color: ODOO.muted, fontWeight: 700,
                  borderBottom: `1px solid ${ODOO.border}`, whiteSpace: 'nowrap',
                }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length ? records.map((record, i) => (
              <tr key={String(record.id ?? i)}>
                {columns.map(col => {
                  const text = valueText(record[col.name], col.kind, col.info)
                  return (
                    <td key={col.name} style={{
                      padding: '6px 8px', borderBottom: `1px solid ${ODOO.border}`,
                      textAlign: col.kind === 'numeric' ? 'right' : 'left',
                      color: ODOO.text, maxWidth: 180,
                    }}>
                      <span style={{
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{text}</span>
                    </td>
                  )
                })}
              </tr>
            )) : [0, 1].map(row => (
              <tr key={row}>
                {columns.map((col, i) => (
                  <td key={col.name} style={{ padding: '7px 8px', borderBottom: `1px solid ${ODOO.border}` }}>
                    <span style={{
                      display: 'block', height: 8, borderRadius: 2, background: ODOO.field,
                      width: `${50 + ((i + row) % 3) * 16}%`,
                    }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '10px 8px', color: ODOO.muted, fontSize: 10.5 }}>
          {count ? `${count} ligne(s) liée(s)` : 'Sous-liste sans colonnes détectées.'}
        </div>
      )}
    </div>
  )
}

/** The schematic input control for a field, shaped by its kind. */
function FieldValue({ kind, value, info }: { kind: FieldKind; value?: unknown; info?: FieldInfo }) {
  const text = valueText(value, kind, info)
  const box: CSSProperties = {
    border: `1px solid ${ODOO.inputBorder}`, background: ODOO.inputBg,
    borderRadius: 3, height: 20,
  }
  if (kind === 'boolean') {
    return <span style={{ ...box, width: 13, height: 13, borderRadius: 2,
      borderWidth: 1.5, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 10, color: ODOO.primary,
      fontWeight: 800 }}>{value === true ? '✓' : ''}</span>
  }
  if (kind === 'text') {
    return <span style={{
      ...box, minHeight: 42, height: 'auto', display: 'block',
      padding: text ? '5px 7px' : 0, color: ODOO.text, fontSize: 10.5,
      lineHeight: 1.35, overflow: 'hidden',
    }}>{text}</span>
  }
  if (kind === 'image') {
    return <span style={{ ...box, width: 50, height: 50, display: 'inline-block' }} />
  }
  if (kind === 'numeric') {
    return <span style={{
      ...box, width: 118, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'flex-end', padding: '0 6px', color: ODOO.text,
      fontSize: 10.5,
    }}>{text}</span>
  }
  if (kind === 'date') {
    return (
      <span style={{ ...box, width: 132, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', paddingLeft: 6, fontSize: 10.5, color: ODOO.text,
        }}>{text}</span>
        <span style={{
          width: 19, height: '100%', borderLeft: `1px solid ${ODOO.inputBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: ODOO.muted,
        }}>▦</span>
      </span>
    )
  }
  if (kind === 'tags') {
    const tags = text ? text.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3) : []
    return (
      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
        {(tags.length ? tags : ['', '']).map((tag, i) => (
          <span key={i} style={{
            minWidth: tag ? 0 : (i === 0 ? 58 : 42), height: 16, borderRadius: 8,
            background: '#ece7ea', border: `1px solid ${ODOO.border}`,
            padding: tag ? '1px 6px' : 0, fontSize: 9.5, color: ODOO.text,
            maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{tag}</span>
        ))}
      </span>
    )
  }
  if (kind === 'many2one' || kind === 'selection') {
    return (
      <span style={{
        ...box, width: kind === 'selection' ? 168 : '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', paddingLeft: 6, color: ODOO.text, fontSize: 10.5,
        }}>{text}</span>
        <span style={{ fontSize: 8, color: ODOO.muted, paddingRight: 6 }}>▼</span>
      </span>
    )
  }
  return <span style={{
    ...box, display: 'block', padding: text ? '3px 6px' : 0,
    color: ODOO.text, fontSize: 10.5, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }}>{text}</span>
}

function FieldRow({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const name = el.getAttribute('name') || ''
  const visibility = visibilityState(el, sampleValues)
  if (visibility === 'hidden') return null
  if ((el.getAttribute('widget') || '').toLowerCase() === 'statusbar') return null
  const label = fieldLabel(el, fieldInfo)
  const isNew = !!name && added.fields.has(name)
  const kind = fieldKind(el, fieldInfo)
  const info = fieldInfo?.[name]
  const value = sampleValues?.[name]
  const conditional = visibility === 'conditional'
  const isRelationalRows = (info?.type === 'one2many' || info?.type === 'many2many')
    && (embeddedListFieldElements(el).length > 0 || relatedRowsSample(value))
  if (isRelationalRows) {
    return (
      <div data-preview-added={isNew ? 'true' : undefined} style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: isNew ? '7px' : '4px 0', borderRadius: 4,
        outline: isNew ? `2px solid ${ODOO.added}` : 'none',
        outlineOffset: isNew ? 1 : 0,
        background: isNew ? ODOO.addedBg : 'transparent',
        opacity: conditional && !isNew ? 0.5 : 1,
      }}>
        <div style={{
          display: 'flex', gap: 5, alignItems: 'center',
          fontSize: 10.5, color: ODOO.muted, fontWeight: 700,
        }}>
          {label}
          {conditional && !isNew && (
            <span title="Affichage conditionnel" style={{ fontSize: 9 }}>◇</span>
          )}
          {isNew && <NewBadge />}
        </div>
        <X2ManyRows el={el} value={value} label={label} />
      </div>
    )
  }
  return (
    <div data-preview-added={isNew ? 'true' : undefined} style={{
      display: 'grid', gridTemplateColumns: 'minmax(64px, 36%) 1fr', gap: 10,
      alignItems: kind === 'text' || kind === 'image' ? 'flex-start' : 'center',
      padding: isNew ? '6px 7px' : '3px 0', borderRadius: 4,
      outline: isNew ? `2px solid ${ODOO.added}` : 'none',
      outlineOffset: isNew ? 1 : 0,
      background: isNew ? ODOO.addedBg : 'transparent',
      opacity: conditional && !isNew ? 0.5 : 1,
    }}>
      <span style={{
        fontSize: 10.5, color: ODOO.muted, textAlign: 'right',
        display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center',
        paddingTop: kind === 'text' || kind === 'image' ? 3 : 0,
      }}>
        {label}
        {conditional && !isNew && (
          <span title="Affichage conditionnel" style={{ fontSize: 9 }}>◇</span>
        )}
        {isNew && <NewBadge />}
      </span>
      <FieldValue kind={kind} value={value} info={info} />
    </div>
  )
}

/** A single column of a group: stacked label|value field rows. */
function GroupColumn({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const rows: ReactNode[] = []
  Array.from(el.children).forEach((child, i) => {
    if (isHiddenForSample(child, sampleValues)) return
    const tag = child.tagName.toLowerCase()
    if (tag === 'field') {
      rows.push(<FieldRow key={i} el={child} added={added}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />)
    } else if (tag === 'group') {
      rows.push(<GroupNode key={i} el={child} added={added}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />)
    } else if (tag === 'separator') {
      rows.push(<Separator key={i} el={child} />)
    } else if (tag === 'label') {
      // Odoo label/field manual pairs — the field carries its own label.
    } else if (child.querySelector?.('field')) {
      Array.from(child.querySelectorAll(':scope field'))
        .filter(f => !isHiddenForSample(f, sampleValues))
        .forEach((f, j) => rows.push(<FieldRow key={`${i}-${j}`} el={f} added={added}
          fieldInfo={fieldInfo} sampleValues={sampleValues} />))
    }
  })
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{rows}</div>
}

/** A <group>: nested groups become side-by-side columns; bare fields stack. */
function GroupNode({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const title = el.getAttribute('string')
  const childGroups = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'group' && !isHiddenForSample(c, sampleValues))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <SectionTitle>{title}</SectionTitle>}
      {childGroups.length > 0 ? (
        <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
          {childGroups.map((g, i) => (
            <div key={i} style={{ flex: '1 1 260px', minWidth: 210 }}>
              <GroupColumn el={g} added={added}
                fieldInfo={fieldInfo} sampleValues={sampleValues} />
            </div>
          ))}
        </div>
      ) : (
        <GroupColumn el={el} added={added}
          fieldInfo={fieldInfo} sampleValues={sampleValues} />
      )}
    </div>
  )
}

function HeaderButton({ el, sampleValues }: { el: Element; sampleValues?: SampleValues }) {
  const label = el.getAttribute('string') || humanize(el.getAttribute('name') || 'Action')
  const cls = el.getAttribute('class') || ''
  const primary = cls.includes('oe_highlight') || cls.includes('btn-primary')
  const visibility = visibilityState(el, sampleValues)
  if (visibility === 'hidden') return null
  const conditional = visibility === 'conditional'
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 3,
      whiteSpace: 'nowrap',
      border: `1px solid ${primary ? ODOO.primary : ODOO.inputBorder}`,
      background: primary ? ODOO.primary : ODOO.sheet,
      color: primary ? ODOO.primaryText : ODOO.text,
      opacity: conditional ? 0.38 : 1,
    }} title={conditional ? 'Bouton affiché conditionnellement dans Odoo' : undefined}>{label}</span>
  )
}

type StatusStep = { value: string; label: string }

function statusbarSteps(field?: Element, fieldInfo?: FieldInfoMap): StatusStep[] {
  const name = field?.getAttribute('name') || ''
  const visible = field?.getAttribute('statusbar_visible')
  const values = visible
    ? visible.split(',').map(v => v.trim()).filter(Boolean)
    : []
  const selection = fieldInfo?.[name]?.selection || []
  if (selection.length) {
    const allSteps = selection
      .filter(item => Array.isArray(item) && item.length >= 2)
      .map(item => ({ value: String(item[0]), label: String(item[1]) }))
    const filtered = values.length
      ? allSteps.filter(step => values.includes(step.value))
      : allSteps
    if (filtered.length) return filtered.slice(0, 5)
  }
  const fallback = ['draft', 'sent', 'sale']
  return (values.length ? values : fallback)
    .slice(0, 5)
    .map(value => ({ value, label: humanize(value) }))
}

function StatusBar({ el, fieldInfo, sampleValues }: {
  el: Element
} & ViewSampleProps) {
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isHiddenForSample(b, sampleValues))
  const statusField = Array.from(el.querySelectorAll(':scope > field'))
    .find(f => (f.getAttribute('widget') || '') === 'statusbar')
  const steps = statusbarSteps(statusField, fieldInfo)
  const statusName = statusField?.getAttribute('name') || ''
  const statusValue = sampleValues?.[statusName]
  const activeIndex = steps.findIndex(step => String(step.value) === String(statusValue))
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, flexWrap: 'wrap',
      background: ODOO.sheet, border: `1px solid ${ODOO.border}`,
      borderRadius: 0, padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {buttons.slice(0, 9).map((b, i) => (
          <HeaderButton key={i} el={b} sampleValues={sampleValues} />
        ))}
      </div>
      {statusField && (
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
          {steps.map((step, i) => {
            const active = activeIndex >= 0 ? i === activeIndex : i === Math.min(steps.length - 1, 1)
            return (
              <span key={`${step.value}-${i}`} style={{
                minWidth: 58, maxWidth: 118, height: 22, marginLeft: i ? -8 : 0,
                padding: '0 15px 0 12px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: active ? ODOO.primary : '#e6e6ea',
                color: active ? '#fff' : ODOO.muted,
                fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)',
              }} title={step.label}>
                {step.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function smartButtonIcon(el: Element) {
  const raw = `${el.getAttribute('name') || ''} ${el.getAttribute('string') || ''}`.toLowerCase()
  if (raw.includes('invoice') || raw.includes('facture')) return '▤'
  if (raw.includes('delivery') || raw.includes('picking') || raw.includes('dropship')) return '▦'
  if (raw.includes('project')) return '▥'
  if (raw.includes('timesheet')) return '◷'
  if (raw.includes('purchase')) return '◇'
  if (raw.includes('spreadsheet')) return '▧'
  if (raw.includes('sale')) return '◫'
  return '□'
}

function ButtonBox({ el, sampleValues }: { el: Element; sampleValues?: SampleValues }) {
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isHiddenForSample(b, sampleValues))
  if (!buttons.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {buttons.slice(0, 8).map((b, i) => {
        const conditional = visibilityState(b, sampleValues) === 'conditional'
        return (
          <span key={i} style={{
            display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', alignItems: 'center',
            minWidth: 120, maxWidth: 180, minHeight: 42,
            border: `1px solid ${ODOO.border}`, borderRadius: 3, padding: '5px 8px',
            background: conditional ? '#fafafa' : ODOO.sheet,
            fontSize: 9.5, fontWeight: 600, color: ODOO.stat,
            opacity: conditional ? 0.42 : 1,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 3,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: '#f1edf1', color: ODOO.primary, fontSize: 12, fontWeight: 800,
            }}>{smartButtonIcon(b)}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {b.getAttribute('string') || humanize(b.getAttribute('name') || '')}
            </span>
          </span>
        )
      })}
    </div>
  )
}

function Notebook({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const pages = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'page' && !isHiddenForSample(c, sampleValues))
  const [active, setActive] = useState(0)
  const preferred = pages.findIndex((p, i) => added.pages.has(pageLabel(p, i)) || containsAddedField(p, added))
  useEffect(() => {
    if (preferred >= 0) setActive(preferred)
  }, [preferred])
  if (!pages.length) return null
  const page = pages[Math.min(active, pages.length - 1)]
  return (
    <div data-preview-added={preferred >= 0 ? 'true' : undefined}>
      <div style={{
        display: 'flex', gap: 0, flexWrap: 'wrap',
        borderBottom: `1px solid ${ODOO.border}`, marginTop: 4,
      }}>
        {pages.map((p, i) => {
          const label = pageLabel(p, i)
          const isNew = added.pages.has(label)
          const hasAdded = containsAddedField(p, added)
          return (
            <button
              key={i} type="button" onClick={() => setActive(i)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '8px 12px', cursor: 'pointer',
                border: `1px solid ${i === active ? ODOO.border : 'transparent'}`,
                borderBottom: i === active ? `1px solid ${ODOO.sheet}` : `1px solid ${ODOO.border}`,
                background: i === active ? ODOO.sheet : '#f6f6f7',
                marginBottom: -1,
                color: i === active ? ODOO.text : ODOO.muted,
                display: 'inline-flex', gap: 5, alignItems: 'center',
              }}
            >
              {label}{(isNew || hasAdded) && <NewBadge />}
            </button>
          )
        })}
      </div>
      <div style={{ padding: '16px 0 4px' }}>
        {renderSheetChildren(page, added, fieldInfo, sampleValues)}
      </div>
    </div>
  )
}

/** The <div class="oe_title"> block — the prominent record title (e.g. the
 *  order reference), rendered larger than ordinary fields. */
function TitleBlock({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const fields = Array.from(el.querySelectorAll('field'))
    .filter(f => !isHiddenForSample(f, sampleValues))
  if (!fields.length) return null
  return (
    <div style={{ borderBottom: `1px solid ${ODOO.border}`, paddingBottom: 8 }}>
      {fields.map((f, i) => {
        const name = f.getAttribute('name') || ''
        const isNew = added.fields.has(name)
        const kind = fieldKind(f, fieldInfo)
        const text = valueText(sampleValues?.[name], kind, fieldInfo?.[name])
        return (
          <div key={i} style={{ marginBottom: 5 }}>
            <span style={{
              fontSize: 8.5, color: ODOO.muted, textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              {fieldLabel(f, fieldInfo)}
            </span>
            <div style={{
              minHeight: i === 0 ? 24 : 18, width: i === 0 ? '60%' : '42%', marginTop: 2,
              background: ODOO.field, border: `1px solid ${ODOO.inputBorder}`, borderRadius: 3,
              outline: isNew ? `2px solid ${ODOO.added}` : 'none',
              padding: text ? (i === 0 ? '2px 8px' : '1px 7px') : 0,
              color: ODOO.text, fontSize: i === 0 ? 16 : 12, fontWeight: i === 0 ? 650 : 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{text}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Render the children of a <sheet> (or a notebook page). Consecutive sibling
 *  <group> elements are laid out side by side as columns, the way Odoo does. */
function renderSheetChildren(
  el: Element,
  added: Added,
  fieldInfo?: FieldInfoMap,
  sampleValues?: SampleValues,
): ReactNode {
  const out: ReactNode[] = []
  const children = Array.from(el.children).filter(c => !isHiddenForSample(c, sampleValues))
  let i = 0
  let k = 0
  while (i < children.length) {
    const child = children[i]
    const tag = child.tagName.toLowerCase()
    const cls = child.getAttribute('class') || ''
    if (tag === 'group') {
      const run: Element[] = []
      while (i < children.length && children[i].tagName.toLowerCase() === 'group') {
        run.push(children[i]); i++
      }
      out.push(
        run.length === 1
          ? <GroupNode key={k++} el={run[0]} added={added}
            fieldInfo={fieldInfo} sampleValues={sampleValues} />
          : (
            <div key={k++} style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
              {run.map((g, j) => (
                <div key={j} style={{ flex: '1 1 260px', minWidth: 210 }}>
                  <GroupNode el={g} added={added}
                    fieldInfo={fieldInfo} sampleValues={sampleValues} />
                </div>
              ))}
            </div>
          ),
      )
      continue
    }
    if (tag === 'div' && cls.includes('oe_button_box')) {
      out.push(<ButtonBox key={k++} el={child} sampleValues={sampleValues} />)
    } else if (tag === 'div' && cls.includes('oe_title')) {
      out.push(<TitleBlock key={k++} el={child} added={added}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />)
    } else if (tag === 'notebook') {
      out.push(<Notebook key={k++} el={child} added={added}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />)
    } else if (tag === 'field') {
      out.push(<FieldRow key={k++} el={child} added={added}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />)
    } else if (tag === 'separator') {
      out.push(<Separator key={k++} el={child} />)
    } else if (child.children.length) {
      out.push(<div key={k++}>
        {renderSheetChildren(child, added, fieldInfo, sampleValues)}
      </div>)
    }
    i++
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{out}</div>
}

function FormView({ root, added, fieldInfo, sampleValues }: {
  root: Element; added: Added
} & ViewSampleProps) {
  const children = Array.from(root.children)
  const header = children.find(c => c.tagName.toLowerCase() === 'header')
  const sheet = children.find(c => c.tagName.toLowerCase() === 'sheet')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {header && <StatusBar el={header}
        fieldInfo={fieldInfo} sampleValues={sampleValues} />}
      <div style={{
        background: ODOO.sheet, border: `1px solid ${ODOO.border}`, borderRadius: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,.10)', padding: '24px 28px 30px',
        maxWidth: 980, width: '100%', margin: '0 auto',
      }}>
        {renderSheetChildren(sheet || root, added, fieldInfo, sampleValues)}
      </div>
    </div>
  )
}

function ListView({ root, added, fieldInfo, sampleValues }: {
  root: Element; added: Added
} & ViewSampleProps) {
  const cols = Array.from(root.querySelectorAll(':scope > field'))
    .filter(f => !isHiddenForSample(f, sampleValues))
  const hasSample = cols.some(f => sampleValues?.[f.getAttribute('name') || ''] !== undefined)
  return (
    <div style={{
      background: ODOO.sheet, border: `1px solid ${ODOO.border}`,
      borderRadius: 3, overflow: 'auto',
    }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10.5 }}>
        <thead>
          <tr>
            {cols.map((f, i) => {
              const name = f.getAttribute('name') || ''
              const isNew = added.fields.has(name)
              return (
                <th key={i} style={{
                  textAlign: 'left', padding: '7px 9px', fontWeight: 700, color: ODOO.text,
                  borderBottom: `1px solid ${ODOO.border}`, background: '#f6f6f8',
                  whiteSpace: 'nowrap', outline: isNew ? `2px solid ${ODOO.added}` : 'none',
                }}>
                  {fieldLabel(f, fieldInfo)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {hasSample && (
            <tr>
              {cols.map((f, i) => {
                const name = f.getAttribute('name') || ''
                const kind = fieldKind(f, fieldInfo)
                const text = valueText(sampleValues?.[name], kind, fieldInfo?.[name])
                return (
                  <td key={i} style={{
                    padding: '7px 9px', borderBottom: `1px solid ${ODOO.border}`,
                    color: ODOO.text, maxWidth: 210,
                  }}>
                    <span style={{
                      display: 'block', minHeight: 12, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{text}</span>
                  </td>
                )
              })}
            </tr>
          )}
          {[0, 1, 2, 3].map(r => (
            <tr key={r}>
              {cols.map((_, i) => (
                <td key={i} style={{ padding: '7px 9px', borderBottom: `1px solid ${ODOO.border}` }}>
                  <span style={{
                    display: 'block', height: 8, borderRadius: 2, background: ODOO.field,
                    width: `${45 + ((i + r) % 4) * 14}%`,
                  }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ViewWireframe({ arch, added, fieldInfo, sampleValues, record, model }: {
  arch: string
  added: Added
  record?: { id: number; name: string }
  model?: string
} & ViewSampleProps) {
  const root = useMemo(() => parseArch(arch), [arch])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!added.fields.size && !added.pages.size) return
    const target = ref.current?.querySelector('[data-preview-added="true"]')
    if (!target) return
    window.setTimeout(() => target.scrollIntoView({ block: 'center', inline: 'nearest' }), 60)
  }, [arch, added])
  if (!arch) return <Hint>Vue indisponible.</Hint>
  if (!root) return <Hint>Architecture de vue illisible.</Hint>
  const tag = root.tagName.toLowerCase()
  return (
    <div ref={ref} style={{
      background: ODOO.page, borderRadius: 0, color: ODOO.text,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <OdooChrome viewType={tag} record={record} model={model}>
        {tag === 'form' ? (
          <FormView root={root} added={added}
            fieldInfo={fieldInfo} sampleValues={sampleValues} />
        ) : tag === 'tree' || tag === 'list' ? (
          <ListView root={root} added={added}
            fieldInfo={fieldInfo} sampleValues={sampleValues} />
        ) : (
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: ODOO.muted, marginBottom: 8 }}>
              Aperçu schématique limité pour une vue « {tag} » — champs présents :
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Array.from(root.querySelectorAll('field')).map((f, i) => {
                const name = f.getAttribute('name') || ''
                const isNew = added.fields.has(name)
                return (
                  <span key={i} style={{
                    fontSize: 10, padding: '3px 7px', borderRadius: 3,
                    border: `1px solid ${isNew ? ODOO.added : ODOO.border}`,
                    background: isNew ? ODOO.addedBg : ODOO.sheet,
                  }}>{name}</span>
                )
              })}
            </div>
          </div>
        )}
      </OdooChrome>
    </div>
  )
}

function OdooChrome({
  viewType, children, record, model,
}: {
  viewType: string
  children: ReactNode
  record?: { id: number; name: string }
  model?: string
}) {
  const title = viewType === 'form' ? 'Formulaire' : viewType === 'list' || viewType === 'tree' ? 'Liste' : humanize(viewType)
  const breadcrumb = model ? humanize(model) : 'Ventes'
  return (
    <div style={{ minWidth: 420, background: ODOO.page }}>
      <div style={{
        height: 31, display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 12px', background: ODOO.primary, color: '#fff',
        fontSize: 12, fontWeight: 600,
      }}>
        <span>Odoo</span>
        <span style={{ opacity: .72, fontWeight: 500 }}>Ventes</span>
        <span style={{ marginLeft: 'auto', opacity: .75 }}>Utilisateur</span>
      </div>
      <div style={{
        background: ODOO.control, borderBottom: `1px solid ${ODOO.border}`,
        padding: '10px 14px 11px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{
            border: `1px solid ${ODOO.primary}`, background: ODOO.primary,
            color: '#fff', borderRadius: 3, padding: '4px 10px',
            fontSize: 11, fontWeight: 700,
          }}>Nouveau</button>
          <button type="button" style={{
            border: `1px solid ${ODOO.inputBorder}`, background: '#fff',
            color: ODOO.text, borderRadius: 3, padding: '4px 10px',
            fontSize: 11, fontWeight: 600,
          }}>Action</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, color: ODOO.muted }}>
              {breadcrumb} / Aperçu Creator{record?.name ? ` / ${record.name}` : ''}
            </div>
            <div style={{ fontSize: 15, color: ODOO.text, fontWeight: 650 }}>
              {record?.name || title}
            </div>
          </div>
          <div style={{
            width: 150, height: 24, border: `1px solid ${ODOO.inputBorder}`,
            background: '#fff', borderRadius: 3,
          }} />
        </div>
      </div>
      <div style={{ padding: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--th-muted)', margin: 0 }}>{children}</p>
}

// ── report PDF pane ──────────────────────────────────────────────

function PdfPane({ b64, emptyLabel }: { b64?: string | null; emptyLabel: string }) {
  if (!b64) return <Hint>{emptyLabel}</Hint>
  return (
    <iframe
      title="rapport"
      src={`data:application/pdf;base64,${b64}`}
      style={{ width: '100%', height: 480, border: `1px solid var(--th-border)`, borderRadius: 6 }}
    />
  )
}

// ── modal ────────────────────────────────────────────────────────

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
        color: 'var(--th-muted)',
      }}>{title}</div>
      <div style={{
        flex: 1, minWidth: 0, overflow: 'auto', maxHeight: 540,
        border: '1px solid var(--th-border)', borderRadius: 8,
      }}>
        {children}
      </div>
    </div>
  )
}

export default function CreatorPreviewModal({
  open, onClose, loading, result, error, opSummary, onRequestChange,
}: {
  open: boolean
  onClose: () => void
  loading: boolean
  result: PreviewResult | null
  error: string | null
  opSummary?: string
  onRequestChange: (instruction: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [changeText, setChangeText] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setExpanded(true)
      return
    }
    setChangeText('')
  }, [open])

  const added = useMemo<Added>(() => {
    if (result?.kind !== 'view') return NO_ADD
    const before = collectNames(result.before_arch || '')
    const after = collectNames(result.after_arch || '')
    return {
      fields: new Set([...after.fields].filter(f => !before.fields.has(f))),
      pages: new Set([...after.pages].filter(p => !before.pages.has(p))),
    }
  }, [result])

  if (!open) return null

  const previewError = error || (result?.valid === false ? (result.error || null) : null)

  const submitChange = () => {
    const text = changeText.trim()
    if (!text) return
    onRequestChange(
      previewError ? `${text}\n\n(Pour rappel, l'aperçu a signalé : ${previewError})` : text,
    )
  }

  const autoFix = () => {
    if (!previewError) return
    onRequestChange(
      `Corrige cette opération : l'aperçu a échoué. Erreur signalée par Odoo : ${previewError}`,
    )
  }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: expanded ? '98vw' : 'min(1080px, 97vw)',
          height: expanded ? '96vh' : undefined,
          maxHeight: expanded ? '96vh' : '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--th-bg-card)', color: 'var(--th-text)',
          borderRadius: 14, border: '1px solid var(--th-border)',
          boxShadow: 'var(--th-shadow-hover)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--th-border)',
        }}>
          {result?.kind === 'report' ? <FileText size={17} /> : <PanelsTopLeft size={17} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Aperçu de la modification</div>
            {opSummary && (
              <div style={{
                fontSize: 11.5, color: 'var(--th-muted)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{opSummary}</div>
            )}
          </div>
          <button
            type="button" className="ui-icon-button"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Réduire' : 'Plein écran'}
            title={expanded ? 'Réduire' : 'Plein écran'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className="ui-icon-button" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
              padding: '40px 0', color: 'var(--th-muted)', fontSize: 13,
            }}>
              <Loader2 size={18} className="creator-spin" />
              Calcul de l'aperçu sur l'instance Odoo…
            </div>
          )}

          {!loading && error && <Banner tone="error">{error}</Banner>}

          {!loading && !error && result && (
            <>
              {result.valid === false ? (
                <Banner tone="error">
                  L'opération ne s'assemble pas correctement : {result.error || 'erreur inconnue'}
                </Banner>
              ) : (
                <Banner tone="ok">
                  L'opération s'assemble correctement — voici le rendu avant / après.
                </Banner>
              )}

              {result.valid === false && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    onClick={autoFix}
                  >
                    <Wand2 size={14} />
                    Corriger automatiquement cette erreur
                  </button>
                </div>
              )}

              <ChangeSummary opSummary={opSummary} result={result} added={added} />

              {result.kind === 'report' && (result.record || result.report_label) && (
                <Hint>
                  {result.report_label ? `Rapport « ${result.report_label} »` : result.report_name}
                  {result.record ? ` — enregistrement témoin : ${result.record.name}` : ''}
                </Hint>
              )}

              {result.kind === 'view' && result.record && (
                <Hint>
                  Valeurs témoin chargées depuis Odoo : {result.record.name}
                </Hint>
              )}

              <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'stretch' }}>
                {result.kind === 'report' ? (
                  <>
                    <Pane title="Avant">
                      <PdfPane b64={result.before_pdf} emptyLabel="Rapport actuel indisponible." />
                    </Pane>
                    <Pane title="Après (proposé)">
                      <PdfPane b64={result.after_pdf}
                        emptyLabel="Le rapport modifié n'a pas pu être rendu." />
                    </Pane>
                  </>
                ) : (
                  <>
                    <Pane title="Avant">
                      <ViewWireframe arch={result.before_arch || ''} added={NO_ADD}
                        fieldInfo={result.field_info} sampleValues={result.sample_values}
                        record={result.record} model={result.model} />
                    </Pane>
                    <Pane title="Après (proposé)">
                      <ViewWireframe arch={result.after_arch || ''} added={added}
                        fieldInfo={result.field_info} sampleValues={result.sample_values}
                        record={result.record} model={result.model} />
                    </Pane>
                  </>
                )}
              </div>

              {result.kind === 'view' && (added.fields.size > 0 || added.pages.size > 0) && (
                <div style={{ marginTop: 10 }}>
                  <Hint>
                    <span style={{ color: ODOO.added, fontWeight: 700 }}>●</span>{' '}
                    En vert : éléments ajoutés par cette opération.
                  </Hint>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--th-border)', padding: '12px 18px',
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)' }}>
              Demander une modification de cette proposition
            </label>
            <textarea
              className="ui-input"
              rows={2}
              value={changeText}
              onChange={e => setChangeText(e.target.value)}
              placeholder="Ex. : place plutôt le champ dans l'onglet « Autres informations »…  (Ctrl+Entrée pour envoyer)"
              style={{ resize: 'vertical', fontFamily: 'inherit', marginTop: 4, width: '100%' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitChange()
              }}
            />
          </div>
          <button
            type="button"
            className="ui-button ui-button-primary"
            disabled={!changeText.trim()}
            onClick={submitChange}
          >
            <Wand2 size={14} />
            Demander
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ChangeSummary({ opSummary, result, added }: {
  opSummary?: string
  result: PreviewResult
  added: Added
}) {
  const details: string[] = []
  if (result.kind === 'view') {
    if (added.fields.size) details.push(`Champ(s) ajouté(s) : ${[...added.fields].join(', ')}`)
    if (added.pages.size) details.push(`Onglet(s) ajouté(s) : ${[...added.pages].join(', ')}`)
  }
  if (result.kind === 'report' && result.report_label) {
    details.push(`Rapport : ${result.report_label}`)
  }
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8,
      border: '1px solid var(--th-border)', borderLeft: '3px solid var(--brand)',
      background: 'var(--th-bg-muted)',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--th-muted)',
      }}>
        Modification proposée
      </div>
      {opSummary && <div style={{ fontSize: 13, fontWeight: 600 }}>{opSummary}</div>}
      {details.map((d, i) => (
        <div key={i} style={{ fontSize: 11.5, color: 'var(--th-text-sub)' }}>{d}</div>
      ))}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
      borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
      maxHeight: 150, overflow: 'auto', wordBreak: 'break-word',
      background: ok ? 'var(--th-success-bg)' : 'var(--th-danger-bg)',
      color: ok ? 'var(--th-success-fg)' : 'var(--th-danger-fg)',
    }}>
      {ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{children}</span>
    </div>
  )
}
