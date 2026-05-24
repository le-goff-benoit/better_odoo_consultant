import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { listProfiles, searchRecords, getFields } from '../api/client'
import { useUiLanguage } from '../i18n'
import PageHeader from '../components/PageHeader'
import { Button, Card, Field, StatusPill } from '../components/ui'

interface Profile { id: number; name: string }

export default function Query() {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { title: 'Query', description: 'Read live Odoo records from a configured project; large results are fetched safely with pagination.', profile: 'Profile', select: 'Select a project', model: 'Model', modelHint: 'Example: res.partner, sale.order, account.move', exportAs: 'Export as', none: 'None', loadFields: 'Load fields', loading: 'Loading…', search: 'Search', fields: 'Fields', more: 'more', records: 'records', result: 'Result preview', noResult: 'Run a search to preview records or an export.', shownOf: 'fetched of', preview: 'Preview: first 20 fetched records shown below.' }
    : { title: 'Requêtes', description: 'Lisez des enregistrements Odoo en direct ; les gros volumes sont récupérés proprement par pagination.', profile: 'Profil', select: 'Sélectionner un projet', model: 'Modèle', modelHint: 'Exemple : res.partner, sale.order, account.move', exportAs: 'Exporter en', none: 'Aucun', loadFields: 'Charger les champs', loading: 'Chargement…', search: 'Rechercher', fields: 'Champs', more: 'en plus', records: 'enregistrements', result: 'Aperçu du résultat', noResult: 'Lancez une recherche pour prévisualiser les enregistrements ou un export.', shownOf: 'récupérés sur', preview: 'Aperçu : seuls les 20 premiers records récupérés sont affichés ci-dessous.' }
  const { data: profilesData } = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const profiles: Profile[] = profilesData?.data ?? []
  const [profileId, setProfileId] = useState<number | ''>('')
  const [model, setModel] = useState('res.partner')
  const [exportFormat, setExportFormat] = useState('')
  const [result, setResult] = useState<{ records?: object[]; export?: string; count?: number; total_count?: number; warning?: string; note?: string } | null>(null)
  const [fields, setFields] = useState<Record<string, { string: string; type: string }>>({})

  const fetchFields = useMutation({
    mutationFn: () => getFields(profileId as number, model),
    onSuccess: (res) => setFields(res.data),
  })

  const search = useMutation({
    mutationFn: () => searchRecords({ profile_id: profileId, model, domain: [], export_format: exportFormat || null }),
    onSuccess: (res) => setResult(res.data),
    onError: (e: { message: string }) => setResult({ export: `Error: ${e.message}` }),
  })

  return (
    <div className="page-stack">
      <PageHeader title={c.title} description={c.description} />

      <Card className="page-card" style={{ marginBottom: 24 }}>
        <div className="page-card-body">
          <div className="ui-form-grid" style={{ marginBottom: 16 }}>
            <Field label={c.profile}>
              <select value={profileId} onChange={e => setProfileId(e.target.value ? Number(e.target.value) : '')} className="ui-input">
              <option value="">{c.select}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={c.model} hint={c.modelHint}>
              <input value={model} onChange={e => setModel(e.target.value)} className="ui-input" />
            </Field>
            <Field label={c.exportAs}>
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} className="ui-input">
              <option value="">{c.none}</option>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
              </select>
            </Field>
          </div>
          <div className="ui-actions-row">
            <Button variant="secondary" onClick={() => profileId && fetchFields.mutate()} disabled={!profileId || fetchFields.isPending}>
              {fetchFields.isPending ? c.loading : c.loadFields}
            </Button>
            <Button variant="primary" onClick={() => search.mutate()} disabled={!profileId || search.isPending}>
              {search.isPending ? c.loading : c.search}
            </Button>
          </div>
        </div>
      </Card>

      {Object.keys(fields).length > 0 && (
        <Card className="page-card" style={{ marginBottom: 16 }}>
          <div className="page-card-body-compact">
            <div className="ui-section-title">{c.fields}</div>
            <div className="ui-actions-row">
              {Object.entries(fields).slice(0, 20).map(([k, v]) => (
                <span className="ui-badge ui-badge-neutral" key={k}>{k} · {v.type}</span>
              ))}
              {Object.keys(fields).length > 20 && <StatusPill tone="idle">+{Object.keys(fields).length - 20} {c.more}</StatusPill>}
            </div>
          </div>
        </Card>
      )}

      <Card className="page-card">
        <div className="page-card-body">
          <div className="ui-section-title">{c.result}</div>
          {!result && <div className="ui-empty-description">{c.noResult}</div>}
          {result && (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--th-muted)' }}>
                {result.total_count && result.total_count !== result.count
                  ? `${result.count ?? 0} ${c.shownOf} ${result.total_count} ${c.records}`
                  : `${result.count ?? 0} ${c.records}`}
              </p>
              {result.note && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--th-muted)' }}>{result.note}</p>}
              {result.warning && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--th-warning-fg)' }}>{result.warning}</p>}
              {result.export && <pre className="ui-code-block">{result.export}</pre>}
              {result.records && !result.export && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--th-muted)' }}>{c.preview}</p>
                  <pre className="ui-code-block">{JSON.stringify(result.records.slice(0, 20), null, 2)}</pre>
                </>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
