import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, CheckCircle2, AlertTriangle, FileText, PanelsTopLeft,
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

/** Collect field names and notebook-page labels present in an arch. */
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

/** A static-invisible node is hidden from the schematic; a dynamic one is kept. */
function isStaticInvisible(el: Element): boolean {
  const v = (el.getAttribute('invisible') || el.getAttribute('column_invisible') || '').trim()
  return v === '1' || v.toLowerCase() === 'true'
}

interface Added { fields: Set<string>; pages: Set<string> }

// ── wireframe pieces ─────────────────────────────────────────────

const NEW_OUTLINE = '2px solid #16A34A'

function NewBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
      color: '#fff', background: '#16A34A', borderRadius: 4, padding: '1px 5px',
    }}>nouveau</span>
  )
}

function FieldBox({ el, added }: { el: Element; added: Added }) {
  const name = el.getAttribute('name') || ''
  const label = el.getAttribute('string') || humanize(name)
  const widget = (el.getAttribute('widget') || '').toLowerCase()
  const isNew = !!name && added.fields.has(name)
  const dynamic = !!(el.getAttribute('invisible') || el.getAttribute('readonly'))
  const boolean = widget.includes('boolean') || widget === 'checkbox'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: isNew ? '5px 7px' : 0,
      borderRadius: 6,
      outline: isNew ? NEW_OUTLINE : 'none',
      background: isNew ? 'rgba(22,163,74,.07)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--th-muted)' }}>{label}</span>
        {isNew && <NewBadge />}
        {dynamic && !isNew && (
          <span style={{ fontSize: 9, color: 'var(--th-muted)', opacity: 0.7 }}>conditionnel</span>
        )}
      </div>
      {boolean ? (
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          border: '1.5px solid var(--th-border)', background: 'var(--th-bg-muted)',
        }} />
      ) : (
        <span style={{
          height: 22, borderRadius: 5, background: 'var(--th-bg-muted)',
          border: '1px solid var(--th-border)',
        }} />
      )}
    </div>
  )
}

function ButtonPill({ el }: { el: Element }) {
  const label = el.getAttribute('string') || humanize(el.getAttribute('name') || 'Action')
  const primary = (el.getAttribute('class') || '').includes('btn-primary')
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 5,
      border: '1px solid var(--th-border)',
      background: primary ? 'var(--brand)' : 'var(--th-bg-card)',
      color: primary ? 'var(--brand-contrast)' : 'var(--th-text)',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

/** Render the descendant fields of a group into a responsive 2-col grid,
 *  recursing into nested groups and rendering their `string` as a sub-title. */
function GroupBlock({ el, added }: { el: Element; added: Added }) {
  const title = el.getAttribute('string')
  const blocks: ReactNode[] = []
  let bucket: Element[] = []
  let k = 0

  const flush = () => {
    if (!bucket.length) return
    const fields = bucket
    bucket = []
    blocks.push(
      <div key={`g${k++}`} style={{
        display: 'grid', gap: '10px 18px',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      }}>
        {fields.map((f, i) => <FieldBox key={i} el={f} added={added} />)}
      </div>,
    )
  }

  Array.from(el.children).forEach(child => {
    const tag = child.tagName.toLowerCase()
    if (isStaticInvisible(child)) return
    if (tag === 'field') {
      bucket.push(child)
    } else if (tag === 'group') {
      flush()
      blocks.push(<GroupBlock key={`n${k++}`} el={child} added={added} />)
    } else if (tag === 'separator') {
      flush()
      const s = child.getAttribute('string')
      if (s) blocks.push(<SectionTitle key={`s${k++}`}>{s}</SectionTitle>)
    } else {
      // div / span wrappers — descend.
      bucket.push(...Array.from(child.querySelectorAll(':scope > field')))
    }
  })
  flush()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <SectionTitle>{title}</SectionTitle>}
      {blocks}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
      color: 'var(--th-text)', borderBottom: '1px solid var(--th-border)', paddingBottom: 3,
    }}>{children}</div>
  )
}

function Notebook({ el, added }: { el: Element; added: Added }) {
  const pages = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'page')
  const [active, setActive] = useState(0)
  if (!pages.length) return null
  const page = pages[Math.min(active, pages.length - 1)]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--th-border)' }}>
        {pages.map((p, i) => {
          const label = p.getAttribute('string') || p.getAttribute('name') || `Onglet ${i + 1}`
          const isNew = added.pages.has(label)
          return (
            <button
              key={i} type="button" onClick={() => setActive(i)}
              style={{
                fontSize: 10.5, fontWeight: 700, padding: '5px 10px', cursor: 'pointer',
                border: 'none', borderBottom: i === active ? '2px solid var(--brand)' : '2px solid transparent',
                background: 'transparent', color: i === active ? 'var(--th-text)' : 'var(--th-muted)',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              {label}
              {isNew && <NewBadge />}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 2px 6px' }}>
        {renderChildren(page, added)}
      </div>
    </div>
  )
}

function renderNode(el: Element, added: Added, key: number): ReactNode {
  if (isStaticInvisible(el)) return null
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'header': {
      const buttons = Array.from(el.querySelectorAll(':scope > button'))
      if (!buttons.length) return null
      return (
        <div key={key} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {buttons.map((b, i) => <ButtonPill key={i} el={b} />)}
        </div>
      )
    }
    case 'sheet':
      return (
        <div key={key} style={{
          background: 'var(--th-bg-card)', border: '1px solid var(--th-border)',
          borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {renderChildren(el, added)}
        </div>
      )
    case 'notebook':
      return <Notebook key={key} el={el} added={added} />
    case 'group':
      return <GroupBlock key={key} el={el} added={added} />
    case 'field':
      return <FieldBox key={key} el={el} added={added} />
    case 'button':
      return <ButtonPill key={key} el={el} />
    case 'separator': {
      const s = el.getAttribute('string')
      return s ? <SectionTitle key={key}>{s}</SectionTitle> : null
    }
    default:
      return <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renderChildren(el, added)}
      </div>
  }
}

function renderChildren(el: Element, added: Added): ReactNode[] {
  return Array.from(el.children)
    .map((c, i) => renderNode(c, added, i))
    .filter(Boolean)
}

function ListWireframe({ root, added }: { root: Element; added: Added }) {
  const cols = Array.from(root.querySelectorAll(':scope > field'))
    .filter(f => !isStaticInvisible(f))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map((f, i) => {
              const name = f.getAttribute('name') || ''
              const isNew = added.fields.has(name)
              return (
                <th key={i} style={{
                  textAlign: 'left', padding: '6px 8px', fontWeight: 700,
                  borderBottom: '2px solid var(--th-border)',
                  color: 'var(--th-text)', whiteSpace: 'nowrap',
                  background: isNew ? 'rgba(22,163,74,.10)' : 'transparent',
                  outline: isNew ? NEW_OUTLINE : 'none',
                }}>
                  {f.getAttribute('string') || humanize(name)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map(r => (
            <tr key={r}>
              {cols.map((_, i) => (
                <td key={i} style={{ padding: '7px 8px', borderBottom: '1px solid var(--th-border)' }}>
                  <span style={{
                    display: 'block', height: 9, width: `${50 + ((i + r) % 4) * 12}%`,
                    background: 'var(--th-bg-muted)', borderRadius: 3,
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
  if (!arch) {
    return <Hint>Vue indisponible.</Hint>
  }
  if (!root) {
    return <Hint>Architecture de vue illisible.</Hint>
  }
  const tag = root.tagName.toLowerCase()
  if (tag === 'tree' || tag === 'list') return <ListWireframe root={root} added={added} />
  if (tag === 'form') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renderChildren(root, added)}
      </div>
    )
  }
  // kanban / search / other — list the fields, schematic only.
  return (
    <div>
      <Hint>Aperçu schématique limité pour une vue « {tag} » — champs présents :</Hint>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {Array.from(root.querySelectorAll('field')).map((f, i) => {
          const name = f.getAttribute('name') || ''
          const isNew = added.fields.has(name)
          return (
            <span key={i} className="ui-badge ui-badge-neutral" style={{
              fontSize: 11, outline: isNew ? NEW_OUTLINE : 'none',
            }}>{name}{isNew ? ' ·●' : ''}</span>
          )
        })}
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
      style={{ width: '100%', height: 460, border: '1px solid var(--th-border)', borderRadius: 6 }}
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
        flex: 1, minWidth: 0, overflow: 'auto', padding: 12,
        background: 'var(--th-bg-muted)', borderRadius: 8,
        border: '1px solid var(--th-border)',
      }}>
        {children}
      </div>
    </div>
  )
}

export default function CreatorPreviewModal({ open, onClose, loading, result, error, opSummary }: {
  open: boolean
  onClose: () => void
  loading: boolean
  result: PreviewResult | null
  error: string | null
  opSummary?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const added = useMemo<Added>(() => {
    if (result?.kind !== 'view') return { fields: new Set(), pages: new Set() }
    const before = collectNames(result.before_arch || '')
    const after = collectNames(result.after_arch || '')
    return {
      fields: new Set([...after.fields].filter(f => !before.fields.has(f))),
      pages: new Set([...after.pages].filter(p => !before.pages.has(p))),
    }
  }, [result])

  if (!open) return null

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
          width: 'min(1080px, 97vw)', maxHeight: '90vh',
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
          <button type="button" className="ui-icon-button" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflow: 'auto' }}>
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
              padding: '40px 0', color: 'var(--th-muted)', fontSize: 13,
            }}>
              <Loader2 size={18} className="creator-spin" />
              Calcul de l'aperçu sur l'instance Odoo…
            </div>
          )}

          {!loading && error && (
            <Banner tone="error">{error}</Banner>
          )}

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
                      <ViewWireframe arch={result.before_arch || ''}
                        added={{ fields: new Set(), pages: new Set() }} />
                    </Pane>
                    <Pane title="Après (proposé)">
                      <ViewWireframe arch={result.after_arch || ''} added={added} />
                    </Pane>
                  </>
                )}
              </div>

              {result.kind === 'view' && (added.fields.size > 0 || added.pages.size > 0) && (
                <Hint>
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>●</span>{' '}
                  En vert : éléments ajoutés par cette opération.
                </Hint>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
      borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
      background: ok ? 'var(--th-success-bg)' : 'var(--th-danger-bg)',
      color: ok ? 'var(--th-success-fg)' : 'var(--th-danger-fg)',
    }}>
      {ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{children}</span>
    </div>
  )
}
