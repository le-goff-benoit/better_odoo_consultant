// Pure helpers + types + palette used by the Creator preview wireframe.
// Extracted from CreatorPreviewModal so the rendering pieces in Wireframe.tsx
// can be tested in isolation.

// Fixed Odoo-like palette — the wireframe represents an Odoo screen, so it
// keeps its own light theme regardless of the app's light/dark mode.
export const ODOO = {
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

export type FieldKind =
  | 'boolean' | 'many2one' | 'tags' | 'selection'
  | 'text' | 'date' | 'numeric' | 'image' | 'char'

export type FieldInfo = {
  string?: string
  type?: string
  selection?: Array<[unknown, string] | unknown[]>
  relation?: string
}
export type FieldInfoMap = Record<string, FieldInfo>
export type SampleValues = Record<string, unknown>
export type RelatedRowsSample = {
  ids?: unknown[]
  count?: number
  records?: Record<string, unknown>[]
  field_info?: FieldInfoMap
}

export type ViewSampleProps = {
  fieldInfo?: FieldInfoMap
  sampleValues?: SampleValues
}

export type VisibilityState = 'visible' | 'hidden' | 'conditional'

export interface Added { fields: Set<string>; pages: Set<string> }
export const NO_ADD: Added = { fields: new Set(), pages: new Set() }

// ── arch parsing helpers ─────────────────────────────────────────

export function parseArch(arch: string): Element | null {
  if (!arch) return null
  try {
    const doc = new DOMParser().parseFromString(arch, 'application/xml')
    if (doc.querySelector('parsererror')) return null
    return doc.documentElement
  } catch {
    return null
  }
}

export function collectNames(arch: string): { fields: Set<string>; pages: Set<string> } {
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

export function humanize(name: string): string {
  const base = name.replace(/^x_/, '').replace(/_id$/, '').replace(/_/g, ' ').trim()
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : name
}

export function isStaticInvisible(el: Element): boolean {
  const v = (el.getAttribute('invisible') || el.getAttribute('column_invisible') || '').trim()
  return v === '1' || v.toLowerCase() === 'true'
}

export function pageLabel(page: Element, index: number): string {
  return page.getAttribute('string') || page.getAttribute('name') || `Onglet ${index + 1}`
}

export function containsAddedField(el: Element, added: Added): boolean {
  if (!added.fields.size) return false
  return Array.from(el.querySelectorAll('field')).some(f => {
    const name = f.getAttribute('name')
    return !!name && added.fields.has(name)
  })
}

export function fieldLabel(el: Element, fieldInfo?: FieldInfoMap): string {
  const name = el.getAttribute('name') || ''
  return el.getAttribute('string') || fieldInfo?.[name]?.string || humanize(name)
}

export function parseMaybeObject(raw: string | null): unknown {
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

export function comparableValue(value: unknown): unknown {
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

export function isEmptyOdooValue(value: unknown): boolean {
  return value === false || value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0)
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  if (isEmptyOdooValue(left) && isEmptyOdooValue(right)) return true
  return String(comparableValue(left)) === String(comparableValue(right))
}

export function evalCondition(term: unknown, sampleValues?: SampleValues): boolean | null {
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

export function evalDomainNode(node: unknown, sampleValues?: SampleValues): boolean | null {
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

export function evalInlineExpression(expr: string | null, sampleValues?: SampleValues): boolean | null {
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

export function invisibleCondition(el: Element): unknown {
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

export function visibilityState(el: Element, sampleValues?: SampleValues): VisibilityState {
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

export function isHiddenForSample(el: Element, sampleValues?: SampleValues): boolean {
  return visibilityState(el, sampleValues) === 'hidden'
}

export function kindFromOdooType(ttype?: string): FieldKind | null {
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
export function fieldKind(el: Element, fieldInfo?: FieldInfoMap): FieldKind {
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

export function selectionLabel(value: unknown, info?: FieldInfo): string | null {
  const selection = info?.selection || []
  for (const item of selection) {
    if (!Array.isArray(item) || item.length < 2) continue
    if (String(item[0]) === String(value)) return String(item[1])
  }
  return null
}

export function valueText(value: unknown, kind: FieldKind, info?: FieldInfo): string {
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

export function relatedRowsSample(value: unknown): RelatedRowsSample | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as RelatedRowsSample
  return Array.isArray(obj.records) || Array.isArray(obj.ids) ? obj : null
}

export function embeddedListFieldElements(el: Element): Element[] {
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

export function relatedColumns(el: Element, sample?: RelatedRowsSample) {
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

export type StatusStep = { value: string; label: string }

export function statusbarSteps(field?: Element, fieldInfo?: FieldInfoMap): StatusStep[] {
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

export function smartButtonIcon(el: Element) {
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
