import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { syncSource, testGithubSsh } from '../api/client'

export default function Sources() {
  const [version, setVersion] = useState('17.0')
  const [path, setPath] = useState('')
  const [enterprise, setEnterprise] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const { data: sshData } = useQuery({ queryKey: ['github-ssh'], queryFn: testGithubSsh })

  const sync = useMutation({
    mutationFn: () => syncSource({ version, path, community: true, enterprise }),
    onSuccess: (res) => setLog(res.data.results.map((r: { type: string; action: string; path: string; head: string }) => `${r.type}: ${r.action} → ${r.path} (${r.head})`)),
    onError: (e: { message: string }) => setLog([`Error: ${e.message}`]),
  })

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Odoo Sources</h1>
      <p style={{ marginBottom: 12 }}>
        GitHub SSH: <strong>{sshData?.data?.accessible ? '✓ Available' : '✗ Not available'}</strong>
      </p>
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>Version</label>
        <select value={version} onChange={e => setVersion(e.target.value)} style={{ marginBottom: 12, padding: 6 }}>
          {['15.0', '16.0', '17.0', '18.0', '19.0'].map(v => <option key={v}>{v}</option>)}
        </select>
        <label style={{ display: 'block', marginBottom: 8 }}>Local path</label>
        <input value={path} onChange={e => setPath(e.target.value)} placeholder="/home/user/odoo-sources" style={{ display: 'block', marginBottom: 12, padding: 6, width: 320 }} />
        <label style={{ marginBottom: 12, display: 'block' }}>
          <input type="checkbox" checked={enterprise} onChange={e => setEnterprise(e.target.checked)} style={{ marginRight: 6 }} />
          Include Enterprise (requires SSH)
        </label>
        <button onClick={() => sync.mutate()} disabled={!path || sync.isPending} style={{ padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {sync.isPending ? 'Syncing…' : 'Sync'}
        </button>
      </div>
      {log.map((l, i) => <p key={i} style={{ fontFamily: 'monospace', fontSize: 13 }}>{l}</p>)}
    </div>
  )
}
