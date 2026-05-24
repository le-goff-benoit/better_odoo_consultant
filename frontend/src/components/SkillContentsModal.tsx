import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Copy, FileCode2, FileText, Layout, Loader2, X } from 'lucide-react'
import { getSkillReference, getSkillTemplate, getSkillExample } from '../api/client'
import { useUiLanguage } from '../i18n'
import Markdown from './Markdown'

export type SkillContentKind = 'reference' | 'template' | 'example'

interface Props {
  open: boolean
  skillName: string | null
  skillLabel?: string
  kind: SkillContentKind
  files: string[]
  onClose: () => void
}

const KIND_META: Record<SkillContentKind, { fr: string; en: string; icon: typeof BookOpen; accent: string }> = {
  reference: { fr: 'Références', en: 'References', icon: BookOpen, accent: '#7C3AED' },
  template:  { fr: 'Templates',  en: 'Templates',  icon: Layout,   accent: '#2563EB' },
  example:   { fr: 'Exemples',   en: 'Examples',   icon: FileCode2, accent: '#16A34A' },
}

const FETCHER: Record<SkillContentKind, (skill: string, file: string) => Promise<{ data: { content: string } }>> = {
  reference: getSkillReference,
  template:  getSkillTemplate,
  example:   getSkillExample,
}

export default function SkillContentsModal({ open, skillName, skillLabel, kind, files, onClose }: Props) {
  const en = useUiLanguage() === 'en'
  const meta = KIND_META[kind]
  const Icon = meta.icon
  const [active, setActive] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // First file selected by default on open / kind change.
  useEffect(() => {
    if (!open) return
    setActive(files[0] ?? null)
  }, [open, kind, files])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill-content', skillName, kind, active],
    queryFn: () => FETCHER[kind](skillName as string, active as string).then(r => r.data),
    enabled: !!(open && skillName && active),
    staleTime: 60_000,
  })

  const onCopy = async () => {
    if (!data?.content) return
    try {
      await navigator.clipboard.writeText(data.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore — clipboard blocked */
    }
  }

  const headerLabel = en ? meta.en : meta.fr
  const emptyMsg = en ? 'This skill has no files of this kind yet.' : 'Aucun fichier de ce type pour ce skill.'

  if (!open) return null

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(8, 10, 14, 0.86)', backdropFilter: 'blur(6px)',
        display: 'flex',
      }}
    >
      <div
        role="dialog" aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          background: 'var(--th-bg, #0d1117)', color: 'var(--th-text)',
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
            background: `${meta.accent}22`, color: meta.accent,
          }}>
            <Icon size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              {headerLabel} — {skillLabel ?? skillName}
            </h2>
            <code style={{
              display: 'inline-block', marginTop: 2,
              fontSize: 11, color: 'var(--th-muted)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}>
              {skillName}
            </code>
          </div>
          <button
            type="button" className="ui-icon-button" onClick={onClose}
            aria-label={en ? 'Close' : 'Fermer'} style={{ flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </header>

        <main style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Left — file list */}
          <aside style={{
            width: 260, flexShrink: 0,
            borderRight: '1px solid var(--th-border)',
            overflow: 'auto',
            background: 'var(--th-bg-card)',
            padding: 12,
          }}>
            {files.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--th-muted)', textAlign: 'center', padding: 20 }}>
                {emptyMsg}
              </p>
            )}
            {files.map(f => {
              const selected = f === active
              return (
                <button
                  key={f}
                  onClick={() => setActive(f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left',
                    padding: '8px 10px', marginBottom: 4,
                    border: '1px solid ' + (selected ? meta.accent : 'transparent'),
                    borderRadius: 6,
                    background: selected ? `${meta.accent}15` : 'transparent',
                    color: selected ? meta.accent : 'var(--th-text)',
                    fontSize: 12.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                </button>
              )
            })}
          </aside>

          {/* Right — content render */}
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {active && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderBottom: '1px solid var(--th-border)',
                background: 'var(--th-bg-muted)',
              }}>
                <code style={{ flex: 1, fontSize: 12, color: 'var(--th-muted)' }}>{active}</code>
                <button
                  type="button"
                  className="ui-button ui-button-outline"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                  onClick={onCopy}
                  disabled={!data?.content}
                >
                  <Copy size={12} /> {copied ? (en ? 'Copied' : 'Copié') : (en ? 'Copy' : 'Copier')}
                </button>
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px' }}>
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--th-muted)' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  {en ? 'Loading…' : 'Chargement…'}
                </div>
              )}
              {isError && (
                <div style={{ color: 'var(--th-danger, #DC2626)' }}>
                  {en ? 'Unable to load this file.' : 'Impossible de charger ce fichier.'}
                </div>
              )}
              {data?.content && (
                <Markdown text={data.content} />
              )}
              {!active && files.length === 0 && (
                <p style={{ color: 'var(--th-muted)', fontStyle: 'italic' }}>{emptyMsg}</p>
              )}
            </div>
          </section>
        </main>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  )
}
