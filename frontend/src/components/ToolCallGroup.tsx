import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown, Check, Loader2 } from 'lucide-react'
import { ODOO_APPS } from '../constants/odooApps'
import { useUiLanguage } from '../i18n'
import { getToolMeta, humanModel } from '../utils/toolMeta'

export interface ToolEvent {
  type: 'tool_call' | 'tool_result' | string
  name?: string
  args?: Record<string, unknown>
  count?: number
  records?: Record<string, unknown>[]
  ok?: boolean
}

interface ToolCallGroupProps {
  events: ToolEvent[]
  projectName?: string
}

interface ToolCallItem {
  call: ToolEvent
  count: number
  key: string
}

function OdooAppIcon({ name, size = 16 }: { name: string; size?: number }) {
  const def = ODOO_APPS[name]
  if (!def) return null
  return (
    <img
      src={def.iconUrl}
      alt={def.label}
      width={size}
      height={size}
      className="tool-chip-app-icon"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

function truncate(value: string, max = 52) {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function basename(path: string) {
  return path.split('/').filter(Boolean).pop() || path
}

function toolKey(call: ToolEvent) {
  const args = call.args ?? {}
  if (call.name === 'search_odoo_source' || call.name === 'search_target_source') {
    return `${call.name}:${args.version ?? ''}:${args.pattern ?? ''}`
  }
  if (call.name === 'search_project_source') return `${call.name}:${args.pattern ?? ''}`
  if (call.name === 'query_odoo' || call.name === 'count_odoo' || call.name === 'get_odoo_fields') {
    return `${call.name}:${args.model ?? ''}`
  }
  if (call.name === 'read_odoo_file' || call.name === 'read_target_file' || call.name === 'read_project_file') {
    return `${call.name}:${args.path ?? ''}`
  }
  if (call.name === 'inspect_odoo_view') return `${call.name}:${args.model ?? ''}:${args.view_type ?? ''}`
  if (call.name === 'inspect_odoo_report') return `${call.name}:${args.report_name ?? ''}:${args.model ?? ''}`
  return `${call.name}`
}

function toolSummary(name: string | undefined, args: Record<string, unknown> | undefined, lang: 'fr' | 'en') {
  const fr = lang === 'fr'
  const model = String(args?.model ?? '')
  const pattern = String(args?.pattern ?? '')
  const path = String(args?.path ?? '')
  const version = String(args?.version ?? '')
  const viewType = String(args?.view_type ?? '')
  const reportName = String(args?.report_name ?? '')

  switch (name) {
    case 'query_odoo':
      return { title: fr ? 'Base client' : 'Client DB', detail: model ? humanModel(model, lang) : (fr ? 'Requête Odoo' : 'Odoo query') }
    case 'count_odoo':
      return { title: fr ? 'Comptage' : 'Count', detail: model ? humanModel(model, lang) : (fr ? 'Enregistrements Odoo' : 'Odoo records') }
    case 'get_odoo_fields':
      return { title: fr ? 'Champs' : 'Fields', detail: model ? humanModel(model, lang) : (fr ? 'Structure modèle' : 'Model structure') }
    case 'search_odoo_source':
      return { title: fr ? 'Sources Odoo' : 'Odoo sources', detail: pattern ? truncate(pattern) : (version ? `v${version}` : (fr ? 'Recherche code standard' : 'Standard-code search')) }
    case 'read_odoo_file':
      return { title: fr ? 'Fichier Odoo' : 'Odoo file', detail: basename(path) || (fr ? 'Lecture fichier' : 'Reading file') }
    case 'search_target_source':
      return { title: fr ? 'Sources cible' : 'Target sources', detail: pattern ? truncate(pattern) : (version ? `v${version}` : (fr ? 'Recherche cible' : 'Target search')) }
    case 'read_target_file':
      return { title: fr ? 'Fichier cible' : 'Target file', detail: basename(path) || (fr ? 'Lecture cible' : 'Reading target') }
    case 'search_project_source':
      return { title: fr ? 'Code custom' : 'Custom code', detail: pattern ? truncate(pattern) : (fr ? 'Recherche repo client' : 'Client-repo search') }
    case 'read_project_file':
      return { title: fr ? 'Fichier custom' : 'Custom file', detail: basename(path) || (fr ? 'Lecture repo client' : 'Reading client repo') }
    case 'count_source_lines':
      return { title: fr ? 'Volumétrie' : 'Line count', detail: String(args?.scope ?? '') || (fr ? 'Sources' : 'Sources') }
    case 'inspect_studio':
      return { title: 'Studio', detail: String(args?.model_filter ?? '') || (fr ? 'Personnalisations' : 'Customizations') }
    case 'inspect_odoo_view':
      return { title: fr ? 'Vue Odoo' : 'Odoo view', detail: [viewType, model ? humanModel(model, lang) : ''].filter(Boolean).join(' · ') || (fr ? 'Inspection vue' : 'View inspection') }
    case 'inspect_odoo_report':
      return { title: fr ? 'Rapport PDF' : 'PDF report', detail: reportName || (model ? humanModel(model, lang) : (fr ? 'Inspection rapport' : 'Report inspection')) }
    default:
      return { title: fr ? 'Outil' : 'Tool', detail: name ?? (fr ? 'Appel outil' : 'Tool call') }
  }
}

function RecordsTable({ records }: { records: Record<string, unknown>[] }) {
  if (!records.length) return null
  const cols = Object.keys(records[0]).slice(0, 8)
  return (
    <table className="tool-records-table">
      <thead>
        <tr>{cols.map(c => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {records.map((r, i) => (
          <tr key={i}>
            {cols.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ToolCallGroup({ events, projectName }: ToolCallGroupProps) {
  const lang = useUiLanguage()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const calls = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')
  const c = lang === 'fr'
    ? { running: 'En cours', done: 'Vérifié', results: 'résultats', calls: 'appels', project: 'Projet', open: 'Voir les résultats', close: 'Masquer les résultats' }
    : { running: 'Running', done: 'Checked', results: 'results', calls: 'calls', project: 'Project', open: 'Show results', close: 'Hide results' }

  const dedupedCalls = calls.reduce<ToolCallItem[]>((acc, call) => {
    const key = toolKey(call)
    const existing = acc.find(item => item.key === key)
    if (existing) { existing.count += 1; return acc }
    return [...acc, { call, count: 1, key }]
  }, [])

  return (
    <div className="tool-call-group">
      <div className="tool-chip-row">
        {dedupedCalls.map(({ call, count, key }) => {
          const meta = getToolMeta(call.name!, call.args, lang)
          const result = results.find(r => r.name === call.name)
          const done = !!result
          const records = result?.records ?? []
          const hasRecords = records.length > 0
          const expanded = openKey === key
          const summary = toolSummary(call.name, call.args, lang)

          return (
            <button
              key={key}
              type="button"
              className={`tool-chip${done ? ' is-done' : ' is-running'}${hasRecords ? ' is-clickable' : ''}`}
              style={{ '--tool-color': meta.color } as CSSProperties}
              onClick={() => hasRecords && setOpenKey(expanded ? null : key)}
              aria-expanded={hasRecords ? expanded : undefined}
              title={hasRecords ? (expanded ? c.close : c.open) : undefined}
            >
              <span className="tool-chip-status" aria-hidden>
                {done ? <Check size={14} strokeWidth={2.4} /> : <Loader2 size={14} strokeWidth={2.4} />}
              </span>
              <span className="tool-chip-main">
                <span className="tool-chip-titleline">
                  {done && meta.appName ? <OdooAppIcon name={meta.appName} size={15} /> : <span className="tool-chip-emoji">{meta.icon}</span>}
                  <span className="tool-chip-title">{summary.title}</span>
                  <span className="tool-chip-state">{done ? c.done : c.running}</span>
                </span>
                <span className="tool-chip-detail">{summary.detail}</span>
              </span>
              <span className="tool-chip-meta">
                {meta.liveDb && projectName && <span className="tool-chip-badge tool-chip-badge-project">{c.project} · {projectName}</span>}
                {done && result?.count !== undefined && <span className="tool-chip-badge">{result.count} {c.results}</span>}
                {count > 1 && <span className="tool-chip-badge">{count} {c.calls}</span>}
                {hasRecords && <ChevronDown className={`tool-chip-chevron${expanded ? ' is-open' : ''}`} size={16} />}
              </span>
            </button>
          )
        })}
      </div>

      {dedupedCalls.map(({ key, call }) => {
        const result = results.find(r => r.name === call.name)
        const records = result?.records ?? []
        if (openKey !== key || records.length === 0) return null
        return (
          <div key={`${key}-records`} className="tool-records-panel">
            <RecordsTable records={records} />
          </div>
        )
      })}
    </div>
  )
}
