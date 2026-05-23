import { useState } from 'react'
import type { CSSProperties } from 'react'
import { CheckCircle2, ChevronDown, Loader2 } from 'lucide-react'
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
      return { title: fr ? 'Lit les données' : 'Reads data', detail: model ? humanModel(model, lang) : (fr ? 'Base Odoo' : 'Odoo database') }
    case 'count_odoo':
      return { title: fr ? 'Compte' : 'Counts', detail: model ? humanModel(model, lang) : (fr ? 'Enregistrements Odoo' : 'Odoo records') }
    case 'get_odoo_fields':
      return { title: fr ? 'Inspecte les champs' : 'Inspects fields', detail: model ? humanModel(model, lang) : (fr ? 'Structure modèle' : 'Model structure') }
    case 'search_odoo_source':
      return { title: fr ? 'Cherche dans Odoo' : 'Searches Odoo', detail: pattern ? truncate(pattern) : (version ? `v${version}` : (fr ? 'Code standard' : 'Standard code')) }
    case 'read_odoo_file':
      return { title: fr ? 'Ouvre un fichier Odoo' : 'Opens Odoo file', detail: basename(path) || (fr ? 'Fichier standard' : 'Standard file') }
    case 'search_target_source':
      return { title: fr ? 'Cherche en version cible' : 'Searches target version', detail: pattern ? truncate(pattern) : (version ? `v${version}` : (fr ? 'Code cible' : 'Target code')) }
    case 'read_target_file':
      return { title: fr ? 'Ouvre un fichier cible' : 'Opens target file', detail: basename(path) || (fr ? 'Fichier cible' : 'Target file') }
    case 'search_project_source':
      return { title: fr ? 'Cherche dans le custom' : 'Searches custom code', detail: pattern ? truncate(pattern) : (fr ? 'Dépôt client' : 'Client repository') }
    case 'read_project_file':
      return { title: fr ? 'Ouvre un fichier custom' : 'Opens custom file', detail: basename(path) || (fr ? 'Dépôt client' : 'Client repository') }
    case 'count_source_lines':
      return { title: fr ? 'Mesure le volume' : 'Measures volume', detail: String(args?.scope ?? '') || (fr ? 'Sources' : 'Sources') }
    case 'inspect_studio':
      return { title: fr ? 'Inspecte Studio' : 'Inspects Studio', detail: String(args?.model_filter ?? '') || (fr ? 'Personnalisations' : 'Customizations') }
    case 'inspect_odoo_view':
      return { title: fr ? 'Inspecte une vue' : 'Inspects view', detail: [viewType, model ? humanModel(model, lang) : ''].filter(Boolean).join(' · ') || (fr ? 'Vue Odoo' : 'Odoo view') }
    case 'inspect_odoo_report':
      return { title: fr ? 'Inspecte un rapport' : 'Inspects report', detail: reportName || (model ? humanModel(model, lang) : (fr ? 'Rapport PDF' : 'PDF report')) }
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
  const [open, setOpen] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const calls = events.filter(e => e.type === 'tool_call')
  const results = events.filter(e => e.type === 'tool_result')
  const c = lang === 'fr'
    ? { results: 'résultats', calls: 'passages', open: 'Voir les résultats', close: 'Masquer les résultats', workDone: 'Recherche terminée', workRunning: 'Recherche en cours', operation: 'opération', operations: 'opérations', done: 'terminées', running: 'en cours', details: 'Détails', db: 'Base active' }
    : { results: 'results', calls: 'passes', open: 'Show results', close: 'Hide results', workDone: 'Search complete', workRunning: 'Search in progress', operation: 'operation', operations: 'operations', done: 'done', running: 'running', details: 'Details', db: 'Active DB' }

  const dedupedCalls = calls.reduce<ToolCallItem[]>((acc, call) => {
    const key = toolKey(call)
    const existing = acc.find(item => item.key === key)
    if (existing) { existing.count += 1; return acc }
    return [...acc, { call, count: 1, key }]
  }, [])

  const doneCount = dedupedCalls.filter(({ call }) => results.some(r => r.name === call.name)).length
  const runningCount = Math.max(0, dedupedCalls.length - doneCount)
  const activityPreview = dedupedCalls
    .map(({ call }) => toolSummary(call.name, call.args, lang).title)
    .filter((label, idx, arr) => arr.indexOf(label) === idx)
    .slice(0, 3)
    .join(' · ')

  return (
    <div className="tool-call-group">
      <button type="button" className="tool-call-summary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={`tool-call-summary-icon${runningCount ? ' is-running' : ''}`}>
          {runningCount ? <Loader2 size={14} /> : <CheckCircle2 size={14} />}
        </span>
        <span className="tool-call-summary-main">
          <strong>{runningCount ? c.workRunning : c.workDone}</strong>
          <span>
            {dedupedCalls.length} {dedupedCalls.length > 1 ? c.operations : c.operation}
            {runningCount ? ` · ${runningCount} ${c.running}` : ` · ${doneCount} ${c.done}`}
            {activityPreview ? ` · ${activityPreview}` : ''}
          </span>
        </span>
        <ChevronDown className={`tool-chip-chevron${open ? ' is-open' : ''}`} size={15} />
      </button>

      {open && (
        <div className="tool-step-list">
          {dedupedCalls.map(({ call, count, key }, idx) => {
          const meta = getToolMeta(call.name!, call.args, lang)
          const result = results.find(r => r.name === call.name)
          const done = !!result
          const records = result?.records ?? []
          const hasRecords = records.length > 0
          const expanded = openKey === key
          const summary = toolSummary(call.name, call.args, lang)

          return (
            <div key={key} className="tool-step-wrap">
              <button
                type="button"
                className={`tool-step${done ? ' is-done' : ' is-running'}${hasRecords ? ' is-clickable' : ''}`}
                style={{ '--tool-color': meta.color } as CSSProperties}
                onClick={() => hasRecords && setOpenKey(expanded ? null : key)}
                aria-expanded={hasRecords ? expanded : undefined}
                title={hasRecords ? (expanded ? c.close : c.open) : undefined}
              >
                <span className="tool-step-index" aria-hidden>{String(idx + 1).padStart(2, '0')}</span>
                <span className={`tool-step-status${done ? ' is-done' : ' is-running'}`} aria-hidden />
                <span className="tool-step-main">
                  <span className="tool-step-title">{summary.title}</span>
                  <span className="tool-step-detail">{summary.detail}</span>
                </span>
                <span className="tool-step-meta">
                  {meta.liveDb && projectName && <span>{c.db}</span>}
                  {done && result?.count !== undefined && <span>{result.count} {c.results}</span>}
                  {count > 1 && <span>{count} {c.calls}</span>}
                  {hasRecords && <ChevronDown className={`tool-chip-chevron${expanded ? ' is-open' : ''}`} size={16} />}
                </span>
              </button>
            </div>
          )
          })}
        </div>
      )}

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
