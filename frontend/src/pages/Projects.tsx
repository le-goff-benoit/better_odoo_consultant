import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProjects, createProject, cloneProject, pullProject } from '../api/client'
import PageHeader from '../components/PageHeader'
import { Button, Card, Field } from '../components/ui'
import { useUiLanguage } from '../i18n'

interface Project { id: number; name: string; local_path: string; remote_url?: string }

export default function Projects() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { title: 'Repositories', description: 'Legacy repository workspace for local project clones.', name: 'Name', localPath: 'Local path', remoteUrl: 'Remote URL', add: 'Add repository', clone: 'Clone', pull: 'Pull', empty: 'No repository configured.' }
    : { title: 'Dépôts', description: 'Espace historique de gestion des dépôts projet clonés localement.', name: 'Nom', localPath: 'Chemin local', remoteUrl: 'URL distante', add: 'Ajouter le dépôt', clone: 'Cloner', pull: 'Mettre à jour', empty: 'Aucun dépôt configuré.' }
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
    <div className="page-stack">
      <PageHeader title={c.title} description={c.description} />
      {msg && <div className="ui-alert" style={{ marginBottom: 16, borderLeftColor: msg.startsWith('Error') ? '#dc2626' : 'var(--brand)' }}>{msg}</div>}

      <Card className="page-card" style={{ marginBottom: 24 }}>
        <div className="page-card-body">
          <div className="ui-form-grid" style={{ marginBottom: 16 }}>
            <Field label={c.name}>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="ui-input" />
            </Field>
            <Field label={c.localPath}>
              <input value={form.local_path} onChange={e => setForm(p => ({ ...p, local_path: e.target.value }))} className="ui-input" />
            </Field>
            <Field label={c.remoteUrl}>
              <input value={form.remote_url} onChange={e => setForm(p => ({ ...p, remote_url: e.target.value }))} className="ui-input" />
            </Field>
          </div>
          <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim()}>{c.add}</Button>
        </div>
      </Card>

      <div className="ui-data-table-wrap">
        <table className="ui-data-table">
          <thead><tr>{['ID', c.name, c.localPath, ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--th-muted)' }}>{c.empty}</td></tr>}
            {projects.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td><code>{p.local_path}</code></td>
                <td>
                  <div className="ui-actions-row">
                    <Button size="sm" variant="secondary" onClick={() => clone.mutate(p.id)}>{c.clone}</Button>
                    <Button size="sm" variant="ghost" onClick={() => pull.mutate(p.id)}>{c.pull}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
