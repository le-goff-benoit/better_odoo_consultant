import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Loader2, Workflow, X } from 'lucide-react'
import { getSkillDiagram } from '../api/client'
import { useUiLanguage } from '../i18n'

interface DiagramPayload {
  inputs: string[]
  steps: string[]
  outputs: string[]
  inputs_en?: string[]
  steps_en?: string[]
  outputs_en?: string[]
  notes?: string | null
  notes_en?: string | null
}

interface DiagramResponse {
  name: string
  label: string
  label_en: string
  kind: 'core' | 'tool'
  builtin: boolean
  group: string
  diagram: DiagramPayload
}

interface Props {
  open: boolean
  skillName: string | null
  onClose: () => void
}

export default function SkillDiagramModal({ open, skillName, onClose }: Props) {
  const en = useUiLanguage() === 'en'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill-diagram', skillName],
    queryFn: () => getSkillDiagram(skillName as string).then(r => r.data as DiagramResponse),
    enabled: !!skillName && open,
    staleTime: 5 * 60_000,
  })

  if (!open) return null

  const diagram = data?.diagram
  const title = data ? (en ? data.label_en : data.label) : (skillName ?? '')
  const inputs = diagram ? (en && diagram.inputs_en?.length ? diagram.inputs_en : diagram.inputs) : []
  const steps = diagram ? (en && diagram.steps_en?.length ? diagram.steps_en : diagram.steps) : []
  const outputs = diagram ? (en && diagram.outputs_en?.length ? diagram.outputs_en : diagram.outputs) : []
  const notes = diagram ? (en && diagram.notes_en ? diagram.notes_en : diagram.notes) : null

  const labels = en
    ? { inputs: 'Inputs', logic: 'Logic', outputs: 'Outputs', kindCore: 'Core skill', kindTool: 'Tool skill', builtin: 'Built-in', empty: 'No diagram defined for this skill yet.', error: 'Unable to load the diagram.' }
    : { inputs: 'Entrées', logic: 'Logique', outputs: 'Sorties', kindCore: 'Skill cœur', kindTool: 'Skill outil', builtin: 'Intégré', empty: 'Aucun diagramme défini pour ce skill.', error: 'Impossible de charger le diagramme.' }

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(8, 10, 14, 0.86)',
        backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--th-bg, #0d1117)',
          color: 'var(--th-text)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '18px 28px',
          borderBottom: '1px solid var(--th-border)',
          background: 'var(--th-bg-card)',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 38, height: 38, borderRadius: 10,
            background: 'var(--brand-bg, rgba(37,99,235,0.12))',
            color: 'var(--brand, #2563EB)',
          }}>
            <Workflow size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
              {data && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 99,
                  background: data.kind === 'core' ? 'rgba(124,58,237,0.15)' : 'rgba(37,99,235,0.15)',
                  color: data.kind === 'core' ? '#7C3AED' : '#2563EB',
                  border: `1px solid ${data.kind === 'core' ? 'rgba(124,58,237,0.4)' : 'rgba(37,99,235,0.4)'}`,
                }}>
                  {data.kind === 'core' ? labels.kindCore : labels.kindTool}
                </span>
              )}
              {data?.builtin && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 99,
                  background: 'rgba(217,119,6,0.15)', color: '#D97706',
                  border: '1px solid rgba(217,119,6,0.4)',
                }}>
                  {labels.builtin}
                </span>
              )}
            </div>
            <code style={{
              display: 'inline-block', marginTop: 4,
              fontSize: 11, color: 'var(--th-muted)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}>
              {skillName}
            </code>
          </div>
          <button
            type="button" className="ui-icon-button" onClick={onClose}
            aria-label={en ? 'Close' : 'Fermer'}
            style={{ flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </header>

        <main style={{
          flex: 1, minHeight: 0,
          padding: '32px 28px',
          display: 'flex', flexDirection: 'column', gap: 20,
          overflow: 'auto',
        }}>
          {isLoading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--th-muted)' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} />
              {en ? 'Loading diagram…' : 'Chargement du diagramme…'}
            </div>
          )}
          {isError && (
            <div style={{ color: 'var(--th-danger, #DC2626)', textAlign: 'center', padding: 40 }}>
              {labels.error}
            </div>
          )}
          {!isLoading && !isError && !diagram && (
            <div style={{ color: 'var(--th-muted)', textAlign: 'center', padding: 40 }}>{labels.empty}</div>
          )}
          {diagram && (
            <DiagramBoard
              labels={labels}
              inputs={inputs}
              steps={steps}
              outputs={outputs}
            />
          )}
          {diagram && notes && (
            <div style={{
              maxWidth: 1100, margin: '0 auto',
              padding: '14px 18px',
              borderRadius: 10,
              background: 'var(--th-bg-muted)',
              border: '1px solid var(--th-border)',
              color: 'var(--th-text-sub)',
              fontSize: 13, lineHeight: 1.6,
            }}>
              {notes}
            </div>
          )}
        </main>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  )
}

function DiagramBoard({ labels, inputs, steps, outputs }: {
  labels: { inputs: string; logic: string; outputs: string }
  inputs: string[]
  steps: string[]
  outputs: string[]
}) {
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 920)
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 920)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div style={{
      maxWidth: 1200, width: '100%', margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: isNarrow ? '1fr' : '1fr 32px 1.4fr 32px 1fr',
      gap: 0, alignItems: 'stretch',
    }}>
      <Column title={labels.inputs} accent="#16A34A" items={inputs} />
      {!isNarrow && <Arrow />}
      <Column title={labels.logic} accent="#2563EB" items={steps} numbered />
      {!isNarrow && <Arrow />}
      <Column title={labels.outputs} accent="#D97706" items={outputs} />
    </div>
  )
}

function Column({ title, accent, items, numbered }: {
  title: string; accent: string; items: string[]; numbered?: boolean
}) {
  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '18px 18px 22px',
      border: `1px solid ${accent}55`,
      background: `${accent}0c`,
      borderRadius: 14,
    }}>
      <h3 style={{
        margin: 0, fontSize: 12, fontWeight: 700,
        letterSpacing: 0.6, textTransform: 'uppercase',
        color: accent,
      }}>{title}</h3>
      {items.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--th-muted)', fontStyle: 'italic' }}>—</p>
      )}
      {items.map((it, idx) => (
        <div key={idx} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 12px',
          background: 'var(--th-bg-card)',
          border: '1px solid var(--th-border)',
          borderRadius: 8,
          fontSize: 13, lineHeight: 1.5,
          color: 'var(--th-text)',
        }}>
          {numbered && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: '50%',
              background: accent, color: '#fff',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{idx + 1}</span>
          )}
          <span style={{ flex: 1 }}>{it}</span>
        </div>
      ))}
    </section>
  )
}

function Arrow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--th-muted)',
    }}>
      <ArrowRight size={24} />
    </div>
  )
}
