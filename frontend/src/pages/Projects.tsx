import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProjects, createProject, cloneProject, pullProject } from '../api/client'

interface Project { id: number; name: string; local_path: string; remote_url?: string }

export default function Projects() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const projects: Project[] = data?.data ?? []
  const [form, setForm] = useState({ name: '', local_path: '', remote_url: '' })
  const [msg, setMsg] = useState('')

  const create = useMutation({
    mutationFn: () => createProject(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); setMsg('Created!') },
  })
  const clone = useMutation({
    mutationFn: (id: number) => cloneProject(id),
    onSuccess: (res) => setMsg(`Cloned: ${res.data.path}`),
    onError: (e: { message: string }) => setMsg(`Error: ${e.message}`),
  })
  const pull = useMutation({
    mutationFn: (id: number) => pullProject(id),
    onSuccess: () => setMsg('Pulled'),
    onError: (e: { message: string }) => setMsg(`Error: ${e.message}`),
  })

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Projects</h1>
      {msg && <p style={{ marginBottom: 12 }}>{msg}</p>}
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, marginBottom: 24 }}>
        {(['name', 'local_path', 'remote_url'] as const).map(f => (
          <div key={f} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12 }}>{f}</label>
            <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} style={{ padding: 6, width: 320 }} />
          </div>
        ))}
        <button onClick={() => create.mutate()} style={{ marginTop: 12, padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Add Project
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead><tr style={{ background: '#eee' }}>{['ID', 'Name', 'Path', ''].map(h => <th key={h} style={{ padding: 10, textAlign: 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 10 }}>{p.id}</td>
              <td style={{ padding: 10 }}>{p.name}</td>
              <td style={{ padding: 10, fontSize: 12 }}>{p.local_path}</td>
              <td style={{ padding: 10 }}>
                <button onClick={() => clone.mutate(p.id)} style={{ marginRight: 8, cursor: 'pointer' }}>Clone</button>
                <button onClick={() => pull.mutate(p.id)} style={{ cursor: 'pointer' }}>Pull</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
