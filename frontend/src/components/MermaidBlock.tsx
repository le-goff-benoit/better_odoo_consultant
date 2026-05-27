import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, Maximize2, X } from 'lucide-react'

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; error: string }

let mermaidInit: Promise<typeof import('mermaid')> | null = null

/** Light sanitizer for LLM-generated Mermaid code.
 *  Common mistakes:
 *  - literal `\n` inside quoted labels → replace with `<br/>`
 *  - trailing garbage text on a node definition line after the closing `]`
 *  - non-printable / emoji characters in labels that break the Mermaid parser */
function sanitizeMermaid(code: string): string {
  return code
    .split('\n')
    .map(line => {
      // Replace literal \n (backslash + n) inside double-quoted strings with <br/>
      line = line.replace(/"([^"]*)"/g, (_, inner) => `"${inner.replace(/\\n/g, '<br/>')}"`)
      // Remove trailing garbage after a node definition closing bracket:
      // matches lines like: NodeId["label"]:::class  some garbage here
      // We keep up to the optional :::class, then drop anything that isn't
      // an arrow or a valid Mermaid token (starts with space + word or -->).
      line = line.replace(/(\](?:::[\w-]+)?)\s+(?!-->|$|%%)[^\n]*/, '$1')
      // Strip non-printable / high codepoint characters from inside labels
      // (emoji, CJK ranges often come from hallucinated garbage text)
      line = line.replace(/"([^"]*)"/g, (_, inner) => {
        // eslint-disable-next-line no-control-regex
        const cleaned = inner.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2E80-\uFFFF]/g, '')
        return `"${cleaned}"`
      })
      return line
    })
    .join('\n')
}

function loadMermaid() {
  if (!mermaidInit) {
    mermaidInit = import('mermaid').then(mod => {
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        flowchart: {
          curve: 'linear',
          htmlLabels: true,
          nodeSpacing: 65,
          rankSpacing: 75,
        },
        themeVariables: {
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          primaryColor: '#F8FAFC',
          primaryTextColor: '#111827',
          primaryBorderColor: '#CBD5E1',
          lineColor: '#64748B',
          secondaryColor: '#EFF6FF',
          tertiaryColor: '#ECFDF5',
        },
      })
      return mod
    })
  }
  return mermaidInit
}

export default function MermaidBlock({ code }: { code: string }) {
  const rawId = useId()
  const id = useMemo(() => `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId])
  // Sanitize common LLM mistakes before handing to Mermaid:
  // 1. Replace literal \n inside quoted node labels with <br/>
  // 2. Strip trailing garbage after a closing bracket on a node definition line
  const sanitized = useMemo(() => sanitizeMermaid(code), [code])
  const [state, setState] = useState<RenderState>({ status: 'loading' })
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loadMermaid()
      .then(async mod => {
        const { svg } = await mod.default.render(id, sanitized)
        if (!cancelled) setState({ status: 'ready', svg })
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => { cancelled = true }
  }, [sanitized, id])

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const downloadRaw = () => {
    const blob = new Blob([code], { type: 'text/vnd.mermaid;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diagram.mmd'
    a.click()
    URL.revokeObjectURL(url)
  }

  const actions = (
    <div className="mermaid-block-actions">
      <button
        type="button"
        className="markdown-table-action-btn"
        onClick={copyRaw}
        title={copied ? 'Copié' : 'Copier le Mermaid brut'}
        aria-label={copied ? 'Mermaid copié' : 'Copier le Mermaid brut'}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <button
        type="button"
        className="markdown-table-action-btn"
        onClick={downloadRaw}
        title="Télécharger le Mermaid brut"
        aria-label="Télécharger le Mermaid brut"
      >
        <Download size={12} />
      </button>
      <button
        type="button"
        className="markdown-table-action-btn"
        onClick={() => setOpen(true)}
        disabled={state.status !== 'ready'}
        title="Agrandir le diagramme"
        aria-label="Agrandir le diagramme"
      >
        <Maximize2 size={12} />
      </button>
    </div>
  )

  return (
    <div className="mermaid-block">
      <div className="mermaid-block-toolbar">
        <span className="mermaid-block-label">Mermaid</span>
        {actions}
      </div>
      <MermaidContent state={state} code={code} />
      {open && state.status === 'ready' && createPortal(
        <div className="ui-modal-overlay mermaid-modal-overlay" onClick={() => setOpen(false)}>
          <div className="ui-modal mermaid-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="ui-modal-header">
              <h2>Diagramme Mermaid</h2>
              <div className="mermaid-modal-actions">
                <button
                  type="button"
                  className="markdown-table-action-btn"
                  onClick={copyRaw}
                  title={copied ? 'Copié' : 'Copier le Mermaid brut'}
                  aria-label={copied ? 'Mermaid copié' : 'Copier le Mermaid brut'}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
                <button
                  type="button"
                  className="markdown-table-action-btn"
                  onClick={downloadRaw}
                  title="Télécharger le Mermaid brut"
                  aria-label="Télécharger le Mermaid brut"
                >
                  <Download size={12} />
                </button>
                <button type="button" className="ui-icon-button" onClick={() => setOpen(false)} aria-label="Fermer">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="ui-modal-body mermaid-modal-body">
              <div className="mermaid-render mermaid-render-large" dangerouslySetInnerHTML={{ __html: state.svg }} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function MermaidContent({ state, code }: { state: RenderState; code: string }) {
  if (state.status === 'loading') {
    return <div className="mermaid-placeholder">Rendu du diagramme…</div>
  }
  if (state.status === 'error') {
    return (
      <div className="mermaid-error">
        <div>Impossible de rendre ce diagramme Mermaid.</div>
        <pre><code>{code}</code></pre>
      </div>
    )
  }
  return <div className="mermaid-render" dangerouslySetInnerHTML={{ __html: state.svg }} />
}
