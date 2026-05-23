import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, CheckCircle2, AlertTriangle, FileText, PanelsTopLeft,
  Maximize2, Minimize2, Wand2,
} from 'lucide-react'

import { ViewWireframe } from './CreatorPreview/Wireframe'
import {
  NO_ADD, ODOO, collectNames,
  type Added, type FieldInfoMap, type SampleValues,
} from './CreatorPreview/wireframeUtils'
import { ErrorBoundary } from './ui'

const STUDIO_TONE: Record<StudioVerdict, { bg: string; fg: string; border: string; label: string; icon: string }> = {
  feasible:      { bg: 'rgba(26,122,60,.10)',  fg: '#1a7a3c', border: '#1a7a3c', label: 'Studio',           icon: '✓' },
  with_caveats:  { bg: 'rgba(202,138,4,.12)',  fg: '#8a5b00', border: '#caa804', label: 'Studio + manuel',  icon: '◐' },
  not_feasible:  { bg: 'rgba(176,38,38,.10)',  fg: '#a51717', border: '#b02626', label: 'Hors Studio',      icon: '✕' },
}

function StudioFeasibilityPanel({ feasibility }: { feasibility: StudioFeasibility }) {
  const tone = STUDIO_TONE[feasibility.verdict]
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8,
      border: `1px solid ${tone.border}`, borderLeft: `3px solid ${tone.border}`,
      background: tone.bg, color: tone.fg,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 9, background: tone.fg, color: 'white',
          fontSize: 11, fontWeight: 800,
        }}>{tone.icon}</span>
        Faisabilité Odoo Studio — {tone.label}
      </div>
      <div style={{ fontSize: 12.5 }}>{feasibility.summary}</div>
      {feasibility.operations.some(op => op.verdict !== 'feasible') && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 11.5, lineHeight: 1.5 }}>
          {feasibility.operations
            .filter(op => op.verdict !== 'feasible')
            .map(op => (
              <li key={op.index}>
                <strong style={{ fontFamily: 'monospace' }}>{op.type}</strong>
                {' — '}
                {op.reasons.join(' ')}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function WireframeFallback({ arch, error }: { arch: string; error: Error }) {
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Hint>Le rendu schématique a échoué : {error.message}. Voici le XML brut.</Hint>
      <pre style={{
        margin: 0, padding: 10, fontSize: 11, lineHeight: 1.4,
        background: 'var(--th-bg-muted)', border: '1px solid var(--th-border)',
        borderRadius: 6, overflow: 'auto', maxHeight: 420, whiteSpace: 'pre-wrap',
      }}>{arch || '(arch vide)'}</pre>
    </div>
  )
}

export type StudioVerdict = 'feasible' | 'with_caveats' | 'not_feasible'

export interface StudioFeasibility {
  verdict: StudioVerdict
  summary: string
  operations: Array<{
    index: number
    type: string
    verdict: StudioVerdict
    reasons: string[]
  }>
}

/** Result of POST /creator/preview. */
export interface PreviewResult {
  ok: boolean
  kind?: 'view' | 'report'
  valid?: boolean
  error?: string | null
  // view
  model?: string
  view_type?: string
  before_arch?: string
  after_arch?: string
  field_info?: FieldInfoMap
  sample_values?: SampleValues
  // report
  report_name?: string
  report_label?: string
  record?: { id: number; name: string }
  before_pdf?: string | null
  after_pdf?: string | null
  // studio feasibility (per-changeset advisory)
  studio_feasibility?: StudioFeasibility
}

function Hint({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--th-muted)', margin: 0 }}>{children}</p>
}

function PdfPane({ b64, emptyLabel }: { b64?: string | null; emptyLabel: string }) {
  if (!b64) return <Hint>{emptyLabel}</Hint>
  return (
    <iframe
      title="rapport"
      src={`data:application/pdf;base64,${b64}`}
      style={{ width: '100%', height: 480, border: `1px solid var(--th-border)`, borderRadius: 6 }}
    />
  )
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6,
        color: 'var(--th-muted)',
      }}>{title}</div>
      <div style={{
        flex: 1, minWidth: 0, overflow: 'auto', maxHeight: 540,
        border: '1px solid var(--th-border)', borderRadius: 8,
      }}>
        {children}
      </div>
    </div>
  )
}

function ChangeSummary({ opSummary, result, added }: {
  opSummary?: string
  result: PreviewResult
  added: Added
}) {
  const details: string[] = []
  if (result.kind === 'view') {
    if (added.fields.size) details.push(`Champ(s) ajouté(s) : ${[...added.fields].join(', ')}`)
    if (added.pages.size) details.push(`Onglet(s) ajouté(s) : ${[...added.pages].join(', ')}`)
  }
  if (result.kind === 'report' && result.report_label) {
    details.push(`Rapport : ${result.report_label}`)
  }
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8,
      border: '1px solid var(--th-border)', borderLeft: '3px solid var(--brand)',
      background: 'var(--th-bg-muted)',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: 0.5, color: 'var(--th-muted)',
      }}>
        Modification proposée
      </div>
      {opSummary && <div style={{ fontSize: 13, fontWeight: 600 }}>{opSummary}</div>}
      {details.map((d, i) => (
        <div key={i} style={{ fontSize: 11.5, color: 'var(--th-text-sub)' }}>{d}</div>
      ))}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
      borderRadius: 8, fontSize: 12.5, lineHeight: 1.5,
      maxHeight: 150, overflow: 'auto', wordBreak: 'break-word',
      background: ok ? 'var(--th-success-bg)' : 'var(--th-danger-bg)',
      color: ok ? 'var(--th-success-fg)' : 'var(--th-danger-fg)',
    }}>
      {ok ? <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        : <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span>{children}</span>
    </div>
  )
}

export default function CreatorPreviewModal({
  open, onClose, loading, result, error, opSummary, onRequestChange,
}: {
  open: boolean
  onClose: () => void
  loading: boolean
  result: PreviewResult | null
  error: string | null
  opSummary?: string
  onRequestChange: (instruction: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [changeText, setChangeText] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      setExpanded(true)
      return
    }
    setChangeText('')
  }, [open])

  const added = useMemo<Added>(() => {
    if (result?.kind !== 'view') return NO_ADD
    const before = collectNames(result.before_arch || '')
    const after = collectNames(result.after_arch || '')
    return {
      fields: new Set([...after.fields].filter(f => !before.fields.has(f))),
      pages: new Set([...after.pages].filter(p => !before.pages.has(p))),
    }
  }, [result])

  if (!open) return null

  const previewError = error || (result?.valid === false ? (result.error || null) : null)

  const submitChange = () => {
    const text = changeText.trim()
    if (!text) return
    onRequestChange(
      previewError ? `${text}\n\n(Pour rappel, l'aperçu a signalé : ${previewError})` : text,
    )
  }

  const autoFix = () => {
    if (!previewError) return
    onRequestChange(
      `Corrige cette opération : l'aperçu a échoué. Erreur signalée par Odoo : ${previewError}`,
    )
  }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: expanded ? '98vw' : 'min(1080px, 97vw)',
          height: expanded ? '96vh' : undefined,
          maxHeight: expanded ? '96vh' : '92vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--th-bg-card)', color: 'var(--th-text)',
          borderRadius: 14, border: '1px solid var(--th-border)',
          boxShadow: 'var(--th-shadow-hover)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--th-border)',
        }}>
          {result?.kind === 'report' ? <FileText size={17} /> : <PanelsTopLeft size={17} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Aperçu de la modification</div>
            {opSummary && (
              <div style={{
                fontSize: 11.5, color: 'var(--th-muted)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{opSummary}</div>
            )}
          </div>
          <button
            type="button" className="ui-icon-button"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Réduire' : 'Plein écran'}
            title={expanded ? 'Réduire' : 'Plein écran'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className="ui-icon-button" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
              padding: '40px 0', color: 'var(--th-muted)', fontSize: 13,
            }}>
              <Loader2 size={18} className="creator-spin" />
              Calcul de l'aperçu sur l'instance Odoo…
            </div>
          )}

          {!loading && error && <Banner tone="error">{error}</Banner>}

          {!loading && !error && result && (
            <>
              {result.valid === false ? (
                <Banner tone="error">
                  L'opération ne s'assemble pas correctement : {result.error || 'erreur inconnue'}
                </Banner>
              ) : (
                <Banner tone="ok">
                  L'opération s'assemble correctement — voici le rendu avant / après.
                </Banner>
              )}

              {result.valid === false && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    onClick={autoFix}
                  >
                    <Wand2 size={14} />
                    Corriger automatiquement cette erreur
                  </button>
                </div>
              )}

              <ChangeSummary opSummary={opSummary} result={result} added={added} />

              {result.studio_feasibility && (
                <StudioFeasibilityPanel feasibility={result.studio_feasibility} />
              )}

              {result.kind === 'report' && (result.record || result.report_label) && (
                <Hint>
                  {result.report_label ? `Rapport « ${result.report_label} »` : result.report_name}
                  {result.record ? ` — enregistrement témoin : ${result.record.name}` : ''}
                </Hint>
              )}

              {result.kind === 'view' && result.record && (
                <Hint>
                  Valeurs témoin chargées depuis Odoo : {result.record.name}
                </Hint>
              )}

              <div style={{ display: 'flex', gap: 14, marginTop: 12, alignItems: 'stretch' }}>
                {result.kind === 'report' ? (
                  <>
                    <Pane title="Avant">
                      <PdfPane b64={result.before_pdf} emptyLabel="Rapport actuel indisponible." />
                    </Pane>
                    <Pane title="Après (proposé)">
                      <PdfPane b64={result.after_pdf}
                        emptyLabel="Le rapport modifié n'a pas pu être rendu." />
                    </Pane>
                  </>
                ) : (
                  <>
                    <Pane title="Avant">
                      <ErrorBoundary fallback={(err) => (
                        <WireframeFallback arch={result.before_arch || ''} error={err} />
                      )}>
                        <ViewWireframe arch={result.before_arch || ''} added={NO_ADD}
                          fieldInfo={result.field_info} sampleValues={result.sample_values}
                          record={result.record} model={result.model} />
                      </ErrorBoundary>
                    </Pane>
                    <Pane title="Après (proposé)">
                      <ErrorBoundary fallback={(err) => (
                        <WireframeFallback arch={result.after_arch || ''} error={err} />
                      )}>
                        <ViewWireframe arch={result.after_arch || ''} added={added}
                          fieldInfo={result.field_info} sampleValues={result.sample_values}
                          record={result.record} model={result.model} />
                      </ErrorBoundary>
                    </Pane>
                  </>
                )}
              </div>

              {result.kind === 'view' && (added.fields.size > 0 || added.pages.size > 0) && (
                <div style={{ marginTop: 10 }}>
                  <Hint>
                    <span style={{ color: ODOO.added, fontWeight: 700 }}>●</span>{' '}
                    En vert : éléments ajoutés par cette opération.
                  </Hint>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{
          borderTop: '1px solid var(--th-border)', padding: '12px 18px',
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--th-muted)' }}>
              Demander une modification de cette proposition
            </label>
            <textarea
              className="ui-input"
              rows={2}
              value={changeText}
              onChange={e => setChangeText(e.target.value)}
              placeholder="Ex. : place plutôt le champ dans l'onglet « Autres informations »…  (Ctrl+Entrée pour envoyer)"
              style={{ resize: 'vertical', fontFamily: 'inherit', marginTop: 4, width: '100%' }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitChange()
              }}
            />
          </div>
          <button
            type="button"
            className="ui-button ui-button-primary"
            disabled={!changeText.trim()}
            onClick={submitChange}
          >
            <Wand2 size={14} />
            Demander
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
