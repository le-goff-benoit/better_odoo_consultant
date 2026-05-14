import { useQuery } from '@tanstack/react-query'
import { listHistory } from '../api/client'
import { useUiLanguage } from '../i18n'
import PageHeader from '../components/PageHeader'
import { EmptyState, StatusPill } from '../components/ui'

interface Entry { id: number; date: string; profile_name?: string; mode: string; prompt: string; result_summary?: string; status: string; duration_ms?: number }

export default function History() {
  const lang = useUiLanguage()
  const copy = lang === 'en'
    ? { title: 'Query history', description: 'Recent Odoo queries and AI-assisted actions executed from the application.', empty: 'No history yet.', emptyDesc: 'Searches and exports will appear here after the first run.', headers: ['Date', 'Profile', 'Mode', 'Prompt', 'Summary', 'Status', 'Duration'] }
    : { title: 'Historique des requêtes', description: 'Dernières requêtes Odoo et actions assistées par IA lancées depuis l’application.', empty: 'Aucun historique pour le moment.', emptyDesc: 'Les recherches et exports apparaîtront ici après la première exécution.', headers: ['Date', 'Profil', 'Mode', 'Prompt', 'Résumé', 'Statut', 'Durée'] }
  const { data } = useQuery({ queryKey: ['history'], queryFn: () => listHistory(100) })
  const entries: Entry[] = data?.data ?? []

  return (
    <div className="page-stack">
      <PageHeader title={copy.title} description={copy.description} />
      {entries.length === 0 ? (
        <div className="page-card">
          <EmptyState title={copy.empty} description={copy.emptyDesc} />
        </div>
      ) : (
        <div className="ui-data-table-wrap">
          <table className="ui-data-table">
            <thead>
              <tr>
                {copy.headers.map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleString()}</td>
                  <td>{e.profile_name || '-'}</td>
                  <td><span className="ui-badge ui-badge-neutral">{e.mode}</span></td>
                  <td><div className="ui-truncate" title={e.prompt}>{e.prompt}</div></td>
                  <td>{e.result_summary || '-'}</td>
                  <td><StatusPill tone={e.status === 'done' ? 'ok' : e.status === 'error' ? 'error' : 'running'}>{e.status}</StatusPill></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{e.duration_ms ? `${e.duration_ms}ms` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
