import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
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
  page: '#ebebeb',
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

/** Best-effort field type from the arch — the widget attribute first, then
 *  name heuristics (the arch carries no ttype). Drives the input shape so the
 *  consultant recognizes a many2one / date / text area at a glance. */
function fieldKind(el: Element): FieldKind {
  const w = (el.getAttribute('widget') || '').toLowerCase()
  const name = (el.getAttribute('name') || '').toLowerCase()
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

/** The schematic input control for a field, shaped by its kind. */
function FieldValue({ kind }: { kind: FieldKind }) {
  const box: CSSProperties = {
    border: `1px solid ${ODOO.inputBorder}`, background: ODOO.inputBg,
    borderRadius: 3, height: 20,
  }
  if (kind === 'boolean') {
    return <span style={{ ...box, width: 13, height: 13, borderRadius: 2,
      borderWidth: 1.5, display: 'inline-block' }} />
  }
  if (kind === 'text') return <span style={{ ...box, height: 42, display: 'block' }} />
  if (kind === 'image') {
    return <span style={{ ...box, width: 50, height: 50, display: 'inline-block' }} />
  }
  if (kind === 'numeric') return <span style={{ ...box, width: 104, display: 'inline-block' }} />
  if (kind === 'date') {
    return (
      <span style={{ ...box, width: 132, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{
          width: 19, height: '100%', borderLeft: `1px solid ${ODOO.inputBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: ODOO.muted,
        }}>▦</span>
      </span>
    )
  }
  if (kind === 'tags') {
    return (
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {[58, 42].map((w, i) => (
          <span key={i} style={{
            width: w, height: 15, borderRadius: 8,
            background: '#ece7ea', border: `1px solid ${ODOO.border}`,
          }} />
        ))}
      </span>
    )
  }
  if (kind === 'many2one' || kind === 'selection') {
    return (
      <span style={{
        ...box, width: kind === 'selection' ? 168 : '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      }}>
        <span style={{ fontSize: 8, color: ODOO.muted, paddingRight: 6 }}>▼</span>
      </span>
    )
  }
  return <span style={{ ...box, display: 'block' }} />
}

function FieldRow({ el, added }: { el: Element; added: Added }) {
  const name = el.getAttribute('name') || ''
  if ((el.getAttribute('widget') || '').toLowerCase() === 'statusbar') return null
  const label = el.getAttribute('string') || humanize(name)
  const isNew = !!name && added.fields.has(name)
  const kind = fieldKind(el)
  // `invisible` present but not a static "1"/"True" → conditionally shown.
  const conditional = el.hasAttribute('invisible') && !isStaticInvisible(el)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(64px, 36%) 1fr', gap: 10,
      alignItems: kind === 'text' || kind === 'image' ? 'flex-start' : 'center',
      padding: isNew ? '3px 5px' : '1.5px 0', borderRadius: 4,
      outline: isNew ? `2px solid ${ODOO.added}` : 'none',
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
      <FieldValue kind={kind} />
    </div>
  )
}

/** A single column of a group: stacked label|value field rows. */
function GroupColumn({ el, added }: { el: Element; added: Added }) {
  const rows: ReactNode[] = []
  Array.from(el.children).forEach((child, i) => {
    if (isStaticInvisible(child)) return
    const tag = child.tagName.toLowerCase()
    if (tag === 'field') {
      rows.push(<FieldRow key={i} el={child} added={added} />)
    } else if (tag === 'group') {
      rows.push(<GroupNode key={i} el={child} added={added} />)
    } else if (tag === 'separator') {
      rows.push(<Separator key={i} el={child} />)
    } else if (tag === 'label') {
      // Odoo label/field manual pairs — the field carries its own label.
    } else if (child.querySelector?.('field')) {
      Array.from(child.querySelectorAll(':scope field'))
        .filter(f => !isStaticInvisible(f))
        .forEach((f, j) => rows.push(<FieldRow key={`${i}-${j}`} el={f} added={added} />))
    }
  })
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{rows}</div>
}

/** A <group>: nested groups become side-by-side columns; bare fields stack. */
function GroupNode({ el, added }: { el: Element; added: Added }) {
  const title = el.getAttribute('string')
  const childGroups = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'group' && !isStaticInvisible(c))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {title && <SectionTitle>{title}</SectionTitle>}
      {childGroups.length > 0 ? (
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {childGroups.map((g, i) => (
            <div key={i} style={{ flex: '1 1 230px', minWidth: 190 }}>
              <GroupColumn el={g} added={added} />
            </div>
          ))}
        </div>
      ) : (
        <GroupColumn el={el} added={added} />
      )}
    </div>
  )
}

function HeaderButton({ el }: { el: Element }) {
  const label = el.getAttribute('string') || humanize(el.getAttribute('name') || 'Action')
  const cls = el.getAttribute('class') || ''
  const primary = cls.includes('oe_highlight') || cls.includes('btn-primary')
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 3,
      whiteSpace: 'nowrap',
      border: `1px solid ${primary ? ODOO.primary : ODOO.inputBorder}`,
      background: primary ? ODOO.primary : ODOO.sheet,
      color: primary ? ODOO.primaryText : ODOO.text,
    }}>{label}</span>
  )
}

function StatusBar({ el }: { el: Element }) {
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isStaticInvisible(b))
  const hasStatus = Array.from(el.querySelectorAll(':scope > field'))
    .some(f => (f.getAttribute('widget') || '') === 'statusbar')
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, flexWrap: 'wrap', maxWidth: 760, margin: '0 auto',
      background: ODOO.sheet, border: `1px solid ${ODOO.border}`,
      borderRadius: 3, padding: '5px 8px',
    }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {buttons.slice(0, 9).map((b, i) => <HeaderButton key={i} el={b} />)}
      </div>
      {hasStatus && (
        <div style={{ display: 'flex' }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              height: 16, width: 34, marginLeft: i ? -7 : 0,
              background: i === 2 ? ODOO.primary : '#e6e6ea',
              clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)',
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

function ButtonBox({ el }: { el: Element }) {
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isStaticInvisible(b))
  if (!buttons.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {buttons.slice(0, 8).map((b, i) => (
        <span key={i} style={{
          display: 'inline-flex', flexDirection: 'column', minWidth: 58,
          border: `1px solid ${ODOO.border}`, borderRadius: 3, padding: '4px 9px',
          background: ODOO.sheet, fontSize: 9.5, fontWeight: 600, color: ODOO.stat,
        }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>—</span>
          {b.getAttribute('string') || humanize(b.getAttribute('name') || '')}
        </span>
      ))}
    </div>
  )
}

function Notebook({ el, added }: { el: Element; added: Added }) {
  const pages = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'page' && !isStaticInvisible(c))
  const [active, setActive] = useState(0)
  if (!pages.length) return null
  const page = pages[Math.min(active, pages.length - 1)]
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${ODOO.border}` }}>
        {pages.map((p, i) => {
          const label = p.getAttribute('string') || p.getAttribute('name') || `Onglet ${i + 1}`
          const isNew = added.pages.has(label)
          return (
            <button
              key={i} type="button" onClick={() => setActive(i)}
              style={{
                fontSize: 10.5, fontWeight: 700, padding: '5px 11px', cursor: 'pointer',
                border: 'none', background: 'transparent',
                borderBottom: i === active ? `2px solid ${ODOO.primary}` : '2px solid transparent',
                color: i === active ? ODOO.text : ODOO.muted,
                display: 'inline-flex', gap: 5, alignItems: 'center',
              }}
            >
              {label}{isNew && <NewBadge />}
            </button>
          )
        })}
      </div>
      <div style={{ paddingTop: 12 }}>{renderSheetChildren(page, added)}</div>
    </div>
  )
}

/** The <div class="oe_title"> block — the prominent record title (e.g. the
 *  order reference), rendered larger than ordinary fields. */
function TitleBlock({ el, added }: { el: Element; added: Added }) {
  const fields = Array.from(el.querySelectorAll('field')).filter(f => !isStaticInvisible(f))
  if (!fields.length) return null
  return (
    <div style={{ borderBottom: `1px solid ${ODOO.border}`, paddingBottom: 8 }}>
      {fields.map((f, i) => {
        const name = f.getAttribute('name') || ''
        const isNew = added.fields.has(name)
        return (
          <div key={i} style={{ marginBottom: 5 }}>
            <span style={{
              fontSize: 8.5, color: ODOO.muted, textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              {f.getAttribute('string') || humanize(name)}
            </span>
            <div style={{
              height: i === 0 ? 24 : 18, width: i === 0 ? '60%' : '42%', marginTop: 2,
              background: ODOO.field, border: `1px solid ${ODOO.inputBorder}`, borderRadius: 3,
              outline: isNew ? `2px solid ${ODOO.added}` : 'none',
            }} />
          </div>
        )
      })}
    </div>
  )
}

/** Render the children of a <sheet> (or a notebook page). Consecutive sibling
 *  <group> elements are laid out side by side as columns, the way Odoo does. */
function renderSheetChildren(el: Element, added: Added): ReactNode {
  const out: ReactNode[] = []
  const children = Array.from(el.children).filter(c => !isStaticInvisible(c))
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
          ? <GroupNode key={k++} el={run[0]} added={added} />
          : (
            <div key={k++} style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              {run.map((g, j) => (
                <div key={j} style={{ flex: '1 1 220px', minWidth: 180 }}>
                  <GroupNode el={g} added={added} />
                </div>
              ))}
            </div>
          ),
      )
      continue
    }
    if (tag === 'div' && cls.includes('oe_button_box')) {
      out.push(<ButtonBox key={k++} el={child} />)
    } else if (tag === 'div' && cls.includes('oe_title')) {
      out.push(<TitleBlock key={k++} el={child} added={added} />)
    } else if (tag === 'notebook') {
      out.push(<Notebook key={k++} el={child} added={added} />)
    } else if (tag === 'field') {
      out.push(<FieldRow key={k++} el={child} added={added} />)
    } else if (tag === 'separator') {
      out.push(<Separator key={k++} el={child} />)
    } else if (child.children.length) {
      out.push(<div key={k++}>{renderSheetChildren(child, added)}</div>)
    }
    i++
  }
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>{out}</div>
}

function FormView({ root, added }: { root: Element; added: Added }) {
  const children = Array.from(root.children)
  const header = children.find(c => c.tagName.toLowerCase() === 'header')
  const sheet = children.find(c => c.tagName.toLowerCase() === 'sheet')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {header && <StatusBar el={header} />}
      <div style={{
        background: ODOO.sheet, border: `1px solid ${ODOO.border}`, borderRadius: 3,
        boxShadow: '0 1px 5px rgba(0,0,0,.12)', padding: '18px 22px',
        maxWidth: 760, width: '100%', margin: '0 auto',
      }}>
        {renderSheetChildren(sheet || root, added)}
      </div>
    </div>
  )
}

function ListView({ root, added }: { root: Element; added: Added }) {
  const cols = Array.from(root.querySelectorAll(':scope > field'))
    .filter(f => !isStaticInvisible(f))
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
                  {f.getAttribute('string') || humanize(name)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
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

function ViewWireframe({ arch, added }: { arch: string; added: Added }) {
  const root = useMemo(() => parseArch(arch), [arch])
  if (!arch) return <Hint>Vue indisponible.</Hint>
  if (!root) return <Hint>Architecture de vue illisible.</Hint>
  const tag = root.tagName.toLowerCase()
  return (
    <div style={{
      background: ODOO.page, borderRadius: 6, padding: 14, color: ODOO.text,
      fontFamily: 'system-ui, sans-serif',
    }}>
      {tag === 'form' ? (
        <FormView root={root} added={added} />
      ) : tag === 'tree' || tag === 'list' ? (
        <ListView root={root} added={added} />
      ) : (
        <div>
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
  const [expanded, setExpanded] = useState(false)
  const [changeText, setChangeText] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => { if (!open) { setChangeText(''); setExpanded(false) } }, [open])

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
                      <ViewWireframe arch={result.before_arch || ''} added={NO_ADD} />
                    </Pane>
                    <Pane title="Après (proposé)">
                      <ViewWireframe arch={result.after_arch || ''} added={added} />
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
