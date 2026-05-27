/**
 * ViewMockupBlock — wire-frame preview of an Odoo view.
 *
 * Rendered when the LLM includes a ```viewmock fence in a response.
 * The fence body is JSON produced by `inspect_odoo_view` → `mockup` key.
 *
 * Supported view types:  form | list | kanban
 *
 * The design intentionally mimics Odoo's UI chrome (white card, gray header,
 * statusbar breadcrumbs, field placeholders) to make the wire-frame immediately
 * recognizable to a consultant without being a full pixel-perfect replica.
 */
import { useState } from 'react'
import { Eye } from 'lucide-react'
import { t } from '../theme'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MockupField {
  name: string
  label: string
  type?: string
  widget?: string | null
  required?: boolean | null
  readonly?: boolean | null
}

interface MockupGroup {
  col: number
  fields: MockupField[]
}

interface MockupPage {
  name: string
  groups: MockupGroup[]
}

interface FormMockup {
  type: 'form'
  statusbar?: { name: string; label: string; visible?: string } | null
  header_buttons?: Array<{ label: string; type?: string }>
  smart_buttons?: Array<{ label: string }>
  groups?: MockupGroup[]
  pages?: MockupPage[]
}

interface ListMockup {
  type: 'list'
  columns: Array<{ name: string; label: string; optional?: string | null }>
}

interface KanbanMockup {
  type: 'kanban'
  fields: Array<{ name: string; label: string }>
}

type MockupData = FormMockup | ListMockup | KanbanMockup

// ─── Design tokens (Odoo-like) ───────────────────────────────────────────────

const OB = {
  // Odoo topbar white theme — used for the mock-up chrome
  bg:      '#ffffff',
  bgHdr:   '#f3f5f8',
  border:  '#d7dbe2',
  text:    '#151922',
  muted:   '#687284',
  active:  '#017e84',   // Odoo teal (statusbar active state)
  btnBg:   '#f0f2f5',
  field:   '#f8f9fa',
  placeholder: '#c5ccd6',
  required: '#c0392b',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldPlaceholder({ field }: { field: MockupField }) {
  const isLong = ['text', 'html', 'many2many'].includes(field.type || '')
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: OB.muted,
        marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3,
      }}>
        {field.label}
        {field.required && <span style={{ color: OB.required, fontSize: 10 }}>*</span>}
        {field.readonly && <span style={{ color: OB.muted, fontSize: 9, opacity: 0.6 }}>🔒</span>}
      </div>
      <div style={{
        height: isLong ? 44 : 22,
        background: field.readonly ? 'transparent' : OB.field,
        border: `1px solid ${field.readonly ? 'transparent' : OB.border}`,
        borderRadius: 3,
        borderBottom: field.readonly ? 'none' : undefined,
        borderTop: field.readonly ? 'none' : undefined,
        borderLeft: field.readonly ? 'none' : undefined,
        borderRight: field.readonly ? 'none' : undefined,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', paddingLeft: 6,
        }}>
          <div style={{
            height: 6, width: `${30 + ((field.name.length * 13) % 40)}%`,
            background: OB.placeholder, borderRadius: 3, opacity: 0.5,
          }} />
        </div>
      </div>
    </div>
  )
}

function GroupBlock({ group }: { group: MockupGroup }) {
  const cols = Math.min(group.col || 2, 2)
  if (cols === 1 || group.fields.length === 1) {
    return (
      <div style={{ marginBottom: 4 }}>
        {group.fields.map(f => <FieldPlaceholder key={f.name} field={f} />)}
      </div>
    )
  }
  // 2-column layout
  const half = Math.ceil(group.fields.length / 2)
  const left = group.fields.slice(0, half)
  const right = group.fields.slice(half)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 4 }}>
      <div>{left.map(f => <FieldPlaceholder key={f.name} field={f} />)}</div>
      <div>{right.map(f => <FieldPlaceholder key={f.name} field={f} />)}</div>
    </div>
  )
}

function StatusBar({ statusbar }: { statusbar: NonNullable<FormMockup['statusbar']> }) {
  const visible = (statusbar.visible || '').split(',').map(s => s.trim()).filter(Boolean)
  const states = visible.length > 0 ? visible : ['brouillon', 'confirmé', 'terminé']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginLeft: 'auto' }}>
      {states.map((s, idx) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          {idx > 0 && (
            <div style={{ width: 20, height: 1, background: OB.border, margin: '0 2px' }} />
          )}
          <div style={{
            padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            background: idx === 0 ? OB.active : OB.bgHdr,
            color: idx === 0 ? '#fff' : OB.muted,
            border: `1px solid ${idx === 0 ? OB.active : OB.border}`,
          }}>{s}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Form view ───────────────────────────────────────────────────────────────

function FormMockupRender({ data }: { data: FormMockup }) {
  const [activeTab, setActiveTab] = useState(0)
  const pages = data.pages || []
  const groups = data.groups || []
  const hbtns = data.header_buttons || []
  const sbtns = data.smart_buttons || []

  return (
    <div style={{
      background: OB.bg, border: `1px solid ${OB.border}`,
      borderRadius: 6, overflow: 'hidden', fontSize: 12,
    }}>
      {/* Toolbar: header buttons + statusbar */}
      {(hbtns.length > 0 || data.statusbar) && (
        <div style={{
          background: OB.bgHdr, borderBottom: `1px solid ${OB.border}`,
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {hbtns.map((b, i) => (
            <div key={i} style={{
              padding: '3px 10px', borderRadius: 4, border: `1px solid ${OB.border}`,
              background: OB.bg, color: OB.text, fontSize: 11, fontWeight: 500,
              cursor: 'default',
            }}>{b.label}</div>
          ))}
          {data.statusbar && <StatusBar statusbar={data.statusbar} />}
        </div>
      )}

      {/* Smart buttons */}
      {sbtns.length > 0 && (
        <div style={{
          background: OB.bg, borderBottom: `1px solid ${OB.border}`,
          padding: '6px 12px', display: 'flex', gap: 8,
        }}>
          {sbtns.map((b, i) => (
            <div key={i} style={{
              padding: '4px 12px', borderRadius: 4, background: OB.btnBg,
              border: `1px solid ${OB.border}`, fontSize: 11, color: OB.text, fontWeight: 500,
            }}>{b.label}</div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: '12px 16px' }}>
        {groups.map((g, i) => <GroupBlock key={i} group={g} />)}

        {/* Notebook */}
        {pages.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {/* Tabs */}
            <div style={{
              display: 'flex', borderBottom: `2px solid ${OB.border}`, marginBottom: 10, gap: 2,
            }}>
              {pages.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  style={{
                    padding: '5px 14px', fontSize: 11, fontWeight: 600, border: 'none',
                    background: 'none', cursor: 'pointer',
                    color: i === activeTab ? OB.active : OB.muted,
                    borderBottom: i === activeTab ? `2px solid ${OB.active}` : '2px solid transparent',
                    marginBottom: -2,
                  }}
                >{p.name}</button>
              ))}
            </div>
            {/* Active page */}
            {pages[activeTab]?.groups.map((g, i) => <GroupBlock key={i} group={g} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── List view ───────────────────────────────────────────────────────────────

function ListMockupRender({ data }: { data: ListMockup }) {
  const cols = data.columns.slice(0, 8)
  const MOCK_ROWS = 3
  return (
    <div style={{
      background: OB.bg, border: `1px solid ${OB.border}`,
      borderRadius: 6, overflow: 'hidden', fontSize: 12,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: OB.bgHdr }}>
            {cols.map(c => (
              <th key={c.name} style={{
                padding: '7px 12px', textAlign: 'left', fontWeight: 700,
                color: OB.text, fontSize: 11, borderBottom: `1px solid ${OB.border}`,
                whiteSpace: 'nowrap',
              }}>
                {c.label}
                {c.optional && <span style={{ color: OB.muted, fontWeight: 400, marginLeft: 4 }}>(opt.)</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: MOCK_ROWS }).map((_, ri) => (
            <tr key={ri} style={{ borderBottom: `1px solid ${OB.border}` }}>
              {cols.map(c => (
                <td key={c.name} style={{ padding: '8px 12px' }}>
                  <div style={{
                    height: 8, width: `${35 + ((c.name.length + ri * 7) % 45)}%`,
                    background: OB.placeholder, borderRadius: 3, opacity: 0.45,
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

// ─── Kanban view ─────────────────────────────────────────────────────────────

function KanbanMockupRender({ data }: { data: KanbanMockup }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {['À faire', 'En cours', 'Terminé'].map(col => (
        <div key={col} style={{
          flex: 1, background: OB.bgHdr, borderRadius: 6,
          border: `1px solid ${OB.border}`, padding: 8,
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: OB.muted, marginBottom: 8 }}>{col}</div>
          <div style={{
            background: OB.bg, border: `1px solid ${OB.border}`, borderRadius: 4,
            padding: '8px 10px',
          }}>
            {data.fields.slice(0, 4).map(f => (
              <div key={f.name} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: OB.muted, marginBottom: 2 }}>{f.label}</div>
                <div style={{
                  height: 7, width: `${40 + (f.name.length * 9 % 40)}%`,
                  background: OB.placeholder, borderRadius: 3, opacity: 0.45,
                }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Public component ────────────────────────────────────────────────────────

export default function ViewMockupBlock({ code }: { code: string }) {
  let data: MockupData | null = null
  try {
    data = JSON.parse(code) as MockupData
  } catch {
    return (
      <div style={{ color: t.muted, fontSize: 12, padding: '8px 0', fontStyle: 'italic' }}>
        [viewmock — JSON invalide]
      </div>
    )
  }

  return (
    <div style={{ margin: '12px 0' }}>
      {/* Header label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 6, color: t.muted, fontSize: 11,
      }}>
        <Eye size={12} />
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Aperçu de la vue {data.type === 'form' ? 'formulaire' : data.type === 'list' ? 'liste' : 'kanban'}
        </span>
      </div>

      {data.type === 'form' && <FormMockupRender data={data} />}
      {data.type === 'list' && <ListMockupRender data={data} />}
      {data.type === 'kanban' && <KanbanMockupRender data={data} />}
    </div>
  )
}
