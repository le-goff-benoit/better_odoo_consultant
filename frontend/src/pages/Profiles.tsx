import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProfiles, createProfile, deleteProfile, testProfile } from '../api/client'

interface Profile { id: number; name: string; db_url: string; db_name: string; login: string; odoo_version?: string }

export default function Profiles() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const profiles: Profile[] = data?.data ?? []
  const [form, setForm] = useState({ name: '', db_url: '', db_name: '', login: '', api_key: '', odoo_version: '' })
  const [msg, setMsg] = useState('')

  const create = useMutation({
    mutationFn: () => createProfile(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); setMsg('Created!'); setForm({ name: '', db_url: '', db_name: '', login: '', api_key: '', odoo_version: '' }) },
    onError: (e: { message: string }) => setMsg(`Error: ${e.message}`),
  })
  const del = useMutation({
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
  const test = useMutation({
    mutationFn: (id: number) => testProfile(id),
    onSuccess: (res) => setMsg(`Connection OK (uid=${res.data.uid})`),
    onError: (e: { message: string }) => setMsg(`Test failed: ${e.message}`),
  })

  const fields = ['name', 'db_url', 'db_name', 'login', 'api_key', 'odoo_version'] as const

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Profiles</h1>
      {msg && <p style={{ marginBottom: 12, color: '#444' }}>{msg}</p>}
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>New Profile</h2>
        {fields.map(f => (
          <div key={f} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>{f}</label>
            <input type={f === 'api_key' ? 'password' : 'text'} value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} style={{ padding: 6, width: 320 }} />
          </div>
        ))}
        <button onClick={() => create.mutate()} style={{ marginTop: 12, padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Save
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8 }}>
        <thead><tr style={{ background: '#eee' }}>{['ID', 'Name', 'DB URL', 'Version', ''].map(h => <th key={h} style={{ padding: 10, textAlign: 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {profiles.map(p => (
            <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 10 }}>{p.id}</td>
              <td style={{ padding: 10 }}>{p.name}</td>
              <td style={{ padding: 10, fontSize: 12 }}>{p.db_url}</td>
              <td style={{ padding: 10 }}>{p.odoo_version}</td>
              <td style={{ padding: 10 }}>
                <button onClick={() => test.mutate(p.id)} style={{ marginRight: 8, cursor: 'pointer' }}>Test</button>
                <button onClick={() => del.mutate(p.id)} style={{ cursor: 'pointer', color: 'red' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
