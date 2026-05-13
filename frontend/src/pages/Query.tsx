import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listProfiles, searchRecords, getFields } from '../api/client'
import { useUiLanguage } from '../i18n'

interface Profile { id: number; name: string }

export default function Query() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { title: 'Query', profile: 'Profile', select: '— select —', model: 'Model', limit: 'Limit', exportAs: 'Export as', none: 'none', loadFields: 'Load fields', loading: 'Loading…', search: 'Search', fields: 'Fields:', more: 'more', records: 'records' }
    : { title: 'Requêtes', profile: 'Profil', select: '— sélectionner —', model: 'Modèle', limit: 'Limite', exportAs: 'Exporter en', none: 'aucun', loadFields: 'Charger les champs', loading: 'Chargement…', search: 'Rechercher', fields: 'Champs :', more: 'en plus', records: 'enregistrements' }
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const profiles: Profile[] = profilesData?.data ?? []
  const [profileId, setProfileId] = useState<number | ''>('')
  const [model, setModel] = useState('res.partner')
  const [limit, setLimit] = useState(20)
  const [exportFormat, setExportFormat] = useState('')
  const [result, setResult] = useState<{ records?: object[]; export?: string; count?: number } | null>(null)
  const [fields, setFields] = useState<Record<string, { string: string; type: string }>>({})

  const fetchFields = useMutation({
    mutationFn: () => getFields(profileId as number, model),
    onSuccess: (res) => setFields(res.data),
  })

  const search = useMutation({
    mutationFn: () => searchRecords({ profile_id: profileId, model, domain: [], limit, export_format: exportFormat || null }),
    onSuccess: (res) => setResult(res.data),
    onError: (e: { message: string }) => setResult({ export: `Error: ${e.message}` }),
  })

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>{c.title}</h1>
      <div style={{ background: '#fff', padding: 20, borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{c.profile}</label>
            <select value={profileId} onChange={e => setProfileId(Number(e.target.value))} style={{ padding: 6, width: '100%' }}>
              <option value="">{c.select}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{c.model}</label>
            <input value={model} onChange={e => setModel(e.target.value)} style={{ padding: 6, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{c.limit}</label>
            <input type="number" value={limit} onChange={e => setLimit(Number(e.target.value))} style={{ padding: 6, width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12 }}>{c.exportAs}</label>
            <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} style={{ padding: 6, width: '100%' }}>
              <option value="">{c.none}</option>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
            </select>
          </div>
        </div>
        <button onClick={() => profileId && fetchFields.mutate()} style={{ marginRight: 8, padding: '8px 14px', cursor: 'pointer' }}>{c.loadFields}</button>
        <button onClick={() => search.mutate()} disabled={!profileId} style={{ padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {search.isPending ? c.loading : c.search}
        </button>
      </div>
      {Object.keys(fields).length > 0 && (
        <div style={{ background: '#fff', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
          <strong>{c.fields}</strong> {Object.entries(fields).slice(0, 20).map(([k, v]) => `${k} (${v.type})`).join(', ')}
          {Object.keys(fields).length > 20 && ` … +${Object.keys(fields).length - 20} ${c.more}`}
        </div>
      )}
      {result && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
          <p style={{ marginBottom: 8, fontSize: 13 }}>{result.count} {c.records}</p>
          {result.export && <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 400, background: '#f5f5f5', padding: 12 }}>{result.export}</pre>}
          {result.records && !result.export && (
            <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(result.records.slice(0, 5), null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
