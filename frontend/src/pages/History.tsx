import { useQuery } from '@tanstack/react-query'
import { listHistory } from '../api/client'

interface Entry { id: number; date: string; profile_name?: string; mode: string; prompt: string; result_summary?: string; status: string; duration_ms?: number }

export default function History() {
  const { data } = useQuery({ queryKey: ['history'], queryFn: () => listHistory(100) })
  const entries: Entry[] = data?.data ?? []

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Query History</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            {['Date', 'Profile', 'Mode', 'Prompt', 'Summary', 'Status', 'Duration'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleString()}</td>
              <td style={{ padding: '8px 12px' }}>{e.profile_name}</td>
              <td style={{ padding: '8px 12px' }}>{e.mode}</td>
              <td style={{ padding: '8px 12px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.prompt}</td>
              <td style={{ padding: '8px 12px' }}>{e.result_summary}</td>
              <td style={{ padding: '8px 12px', color: e.status === 'done' ? 'green' : 'orange' }}>{e.status}</td>
              <td style={{ padding: '8px 12px' }}>{e.duration_ms ? `${e.duration_ms}ms` : ''}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No history yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
