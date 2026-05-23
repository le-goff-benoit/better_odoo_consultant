import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import {
  ODOO,
  NO_ADD,
  containsAddedField,
  effectiveVisibility,
  embeddedListFieldElements,
  fieldKind,
  fieldLabel,
  humanize,
  isStaticInvisible,
  pageLabel,
  parseArch,
  relatedColumns,
  relatedRowsSample,
  smartButtonIcon,
  statusbarSteps,
  valueText,
  visibilityState,
  type Added,
  type FieldInfo,
  type FieldInfoMap,
  type FieldKind,
  type RelatedRowsSample,
  type SampleValues,
  type ViewSampleProps,
  type VisibilityState,
} from './wireframeUtils'

// Context-aware visibility: when the user enables "Tout afficher" in the
// preview modal, an indeterminate `conditional` element is rendered as
// `visible` (ghosted) instead of being collapsed to `hidden`. Without that
// override we ship the safer default — hide what we can't prove visible.
const ShowAllContext = createContext(false)

export function WireframeOptionsProvider({ showAll, children }: {
  showAll: boolean
  children: ReactNode
}) {
  return <ShowAllContext.Provider value={showAll}>{children}</ShowAllContext.Provider>
}

function useVis(): (el: Element, sample?: SampleValues) => VisibilityState {
  const showAll = useContext(ShowAllContext)
  return (el, sample) => (showAll ? visibilityState(el, sample) : effectiveVisibility(el, sample))
}

function useIsHidden(): (el: Element, sample?: SampleValues) => boolean {
  const vis = useVis()
  return (el, sample) => vis(el, sample) === 'hidden'
}

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
export function FieldValue({ kind, value, info }: { kind: FieldKind; value?: unknown; info?: FieldInfo }) {
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

export function FieldRow({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const vis = useVis()
  const isHidden = useIsHidden()
  const name = el.getAttribute('name') || ''
  const visibility = vis(el, sampleValues)
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
  const isHidden = useIsHidden()
  const rows: ReactNode[] = []
  Array.from(el.children).forEach((child, i) => {
    if (isHidden(child, sampleValues)) return
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
        .filter(f => !isHidden(f, sampleValues))
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
  const isHidden = useIsHidden()
  const title = el.getAttribute('string')
  const childGroups = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'group' && !isHidden(c, sampleValues))
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
  const vis = useVis()
  const label = el.getAttribute('string') || humanize(el.getAttribute('name') || 'Action')
  const cls = el.getAttribute('class') || ''
  const primary = cls.includes('oe_highlight') || cls.includes('btn-primary')
  const visibility = vis(el, sampleValues)
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

function StatusBar({ el, fieldInfo, sampleValues }: {
  el: Element
} & ViewSampleProps) {
  const isHidden = useIsHidden()
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isHidden(b, sampleValues))
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

function ButtonBox({ el, sampleValues }: { el: Element; sampleValues?: SampleValues }) {
  const vis = useVis()
  const isHidden = useIsHidden()
  const buttons = Array.from(el.querySelectorAll(':scope > button'))
    .filter(b => !isHidden(b, sampleValues))
  if (!buttons.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {buttons.slice(0, 8).map((b, i) => {
        const conditional = vis(b, sampleValues) === 'conditional'
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
  const isHidden = useIsHidden()
  const pages = Array.from(el.children)
    .filter(c => c.tagName.toLowerCase() === 'page' && !isHidden(c, sampleValues))
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
        <SheetChildren el={page} added={added}
          fieldInfo={fieldInfo} sampleValues={sampleValues} />
      </div>
    </div>
  )
}

/** The <div class="oe_title"> block — the prominent record title (e.g. the
 *  order reference), rendered larger than ordinary fields. */
function TitleBlock({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const isHidden = useIsHidden()
  const fields = Array.from(el.querySelectorAll('field'))
    .filter(f => !isHidden(f, sampleValues))
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
function SheetChildren({ el, added, fieldInfo, sampleValues }: {
  el: Element; added: Added
} & ViewSampleProps) {
  const isHidden = useIsHidden()
  const out: ReactNode[] = []
  const children = Array.from(el.children).filter(c => !isHidden(c, sampleValues))
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
        <SheetChildren el={child} added={added}
          fieldInfo={fieldInfo} sampleValues={sampleValues} />
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
        <SheetChildren el={sheet || root} added={added}
          fieldInfo={fieldInfo} sampleValues={sampleValues} />
      </div>
    </div>
  )
}

function ListView({ root, added, fieldInfo, sampleValues }: {
  root: Element; added: Added
} & ViewSampleProps) {
  const isHidden = useIsHidden()
  const cols = Array.from(root.querySelectorAll(':scope > field'))
    .filter(f => !isHidden(f, sampleValues))
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

function HintInline({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--th-muted)', margin: 0 }}>{children}</p>
}

export function ViewWireframe({ arch, added, fieldInfo, sampleValues, record, model }: {
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
  if (!arch) return <HintInline>Vue indisponible.</HintInline>
  if (!root) return <HintInline>Architecture de vue illisible.</HintInline>
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

export { NO_ADD }
export type { Added, FieldInfoMap, SampleValues, RelatedRowsSample }
