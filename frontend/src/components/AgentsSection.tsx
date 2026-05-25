// Settings → Agents tab.
// Mirrors the SkillsSection UX (list of cards on the left, detail panel
// on the right with tabs for AGENT.md / Migration / Routing tests)
// so a consultant can inspect each persona the same way they inspect skills.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUiLanguage } from '../i18n'
import {
  getAgentMarkdown,
  getAgentMigration,
  getAgentEvalQueries,
} from '../api/client'
import { agentIcon, useAgents, type Agent } from '../agents/registry'
import { ChevronRight, FileText, Hash, ListChecks, Star, Wrench, Ban, ArrowRight, ShieldOff } from 'lucide-react'

type DetailTab = 'agent' | 'migration' | 'eval'

function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return `rgba(100,116,139,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

function AgentCard({ agent, active, onSelect }: { agent: Agent; active: boolean; onSelect: () => void }) {
  const lang = useUiLanguage()
  const Icon = agentIcon(agent.icon)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`agent-card${active ? ' is-active' : ''}`}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', width: '100%', textAlign: 'left',
        background: active ? tint(agent.color, 0.12) : 'var(--th-surface)',
        border: `1px solid ${active ? tint(agent.color, 0.55) : 'var(--th-border)'}`,
        borderRadius: 6, cursor: 'pointer', transition: 'background .12s, border-color .12s',
      }}
    >
      <span style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: tint(agent.color, 0.18), color: agent.color,
      }}>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong style={{ fontSize: 13.5 }}>{lang === 'en' ? agent.label_en : agent.label}</strong>
          {agent.default && (
            <span title={lang === 'en' ? 'Default agent' : 'Agent par défaut'}
              style={{ display: 'inline-flex', alignItems: 'center', color: agent.color }}>
              <Star size={12} />
            </span>
          )}
          {agent.builtin && (
            <span style={{
              fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
              background: 'var(--th-bg-muted)', color: 'var(--th-muted)', letterSpacing: '.04em',
            }}>built-in</span>
          )}
        </div>
        <p style={{
          margin: '3px 0 0', fontSize: 11.5, color: 'var(--th-muted)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {lang === 'en' ? agent.description_en : agent.description}
        </p>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--th-muted)', marginTop: 8, flexShrink: 0 }} />
    </button>
  )
}

function AgentDetail({ agent }: { agent: Agent }) {
  const lang = useUiLanguage()
  const [tab, setTab] = useState<DetailTab>('agent')
  const Icon = agentIcon(agent.icon)

  const md = useQuery({
    queryKey: ['agent-md', agent.name],
    queryFn: async () => (await getAgentMarkdown(agent.name)).data.content as string,
    enabled: tab === 'agent',
  })
  const migration = useQuery({
    queryKey: ['agent-migration', agent.name, lang],
    queryFn: async () => (await getAgentMigration(agent.name, lang as 'fr' | 'en')).data.content as string,
    enabled: tab === 'migration' && (lang === 'en' ? agent.has_migration_en : agent.has_migration),
  })
  const evalQ = useQuery({
    queryKey: ['agent-eval', agent.name],
    queryFn: async () => (await getAgentEvalQueries(agent.name)).data,
    enabled: tab === 'eval' && agent.has_eval_queries,
  })

  const copy = lang === 'en'
    ? { agent: 'AGENT.md', migration: 'Migration', eval: 'Routing tests',
        preferred: 'Preferred skills', avoided: 'Avoided skills', denied: 'Denied skills',
        tools: 'Preferred tools', keywords: 'Auto keywords',
        model: 'Recommended model', positive: 'Positive prompts', negative: 'Negative prompts',
        scope: 'Scope', agentType: 'Type', handoff: 'Can hand off to',
        none: 'Not declared', notProvided: 'No content for this language.' }
    : { agent: 'AGENT.md', migration: 'Migration', eval: 'Tests routing',
        preferred: 'Skills préférés', avoided: 'Skills évités', denied: 'Skills interdits',
        tools: 'Tools préférés', keywords: 'Mots-clés auto',
        model: 'Modèle recommandé', positive: 'Prompts positifs', negative: 'Prompts négatifs',
        scope: 'Périmètre', agentType: 'Type', handoff: 'Handoff possible vers',
        none: 'Non déclaré', notProvided: 'Aucun contenu pour cette langue.' }

  const tabs: { id: DetailTab; label: string; icon: JSX.Element }[] = [
    { id: 'agent',     label: copy.agent,     icon: <FileText size={13} /> },
    { id: 'migration', label: copy.migration, icon: <Hash size={13} /> },
    { id: 'eval',      label: copy.eval,      icon: <ListChecks size={13} /> },
  ]

  return (
    <div style={{
      background: 'var(--th-surface)', border: '1px solid var(--th-border)', borderRadius: 8,
      padding: 16,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 8,
          background: tint(agent.color, 0.18), color: agent.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} strokeWidth={2.25} />
        </span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{lang === 'en' ? agent.label_en : agent.label}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--th-muted)' }}>
            {lang === 'en' ? agent.description_en : agent.description}
          </p>
          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={metaBadgeStyle}>{copy.scope}: {agent.scope}</span>
            <span style={metaBadgeStyle}>{copy.agentType}: {agent.agent_type}</span>
          </div>
        </div>
      </header>

      {/* Compact metadata grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px',
        fontSize: 11.5, marginBottom: 14, color: 'var(--th-muted)',
      }}>
        <span>{copy.model}:</span>
        <span style={{ color: 'var(--th-fg)', fontFamily: 'monospace' }}>{agent.recommended_model || copy.none}</span>
        <span>{copy.preferred}:</span>
        <span style={{ color: 'var(--th-fg)' }}>
          {agent.preferred_skills.length
            ? agent.preferred_skills.map(s => (
              <code key={s} style={{
                fontSize: 10.5, padding: '1px 5px', marginRight: 4,
                background: 'var(--th-bg-muted)', borderRadius: 3,
              }}>{s}</code>
            ))
            : copy.none}
        </span>
        <span><Ban size={11} style={{ verticalAlign: 'middle' }} /> {copy.avoided}:</span>
        <span style={{ color: 'var(--th-fg)' }}>
          {agent.avoided_skills.length
            ? agent.avoided_skills.map(s => (
              <code key={s} style={{
                fontSize: 10.5, padding: '1px 5px', marginRight: 4,
                background: 'rgba(245, 158, 11, 0.14)', color: '#b45309', borderRadius: 3,
              }}>{s}</code>
            ))
            : copy.none}
        </span>
        <span><ShieldOff size={11} style={{ verticalAlign: 'middle' }} /> {copy.denied}:</span>
        <span style={{ color: 'var(--th-fg)' }}>
          {agent.denied_skills.length
            ? agent.denied_skills.map(s => (
              <code key={s} style={{
                fontSize: 10.5, padding: '1px 5px', marginRight: 4,
                background: 'rgba(239, 68, 68, 0.14)', color: '#b91c1c', borderRadius: 3,
              }}>{s}</code>
            ))
            : copy.none}
        </span>
        <span><Wrench size={11} style={{ verticalAlign: 'middle' }} /> {copy.tools}:</span>
        <span style={{ color: 'var(--th-fg)' }}>
          {agent.preferred_tools.length
            ? agent.preferred_tools.map(s => (
              <code key={s} style={{
                fontSize: 10.5, padding: '1px 5px', marginRight: 4,
                background: 'var(--th-bg-muted)', borderRadius: 3,
              }}>{s}</code>
            ))
            : copy.none}
        </span>
        <span><ArrowRight size={11} style={{ verticalAlign: 'middle' }} /> {copy.handoff}:</span>
        <span style={{ color: 'var(--th-fg)' }}>
          {agent.handoff?.can_handoff_to?.length
            ? agent.handoff.can_handoff_to.map(s => (
              <code key={s} style={{
                fontSize: 10.5, padding: '1px 5px', marginRight: 4,
                background: 'var(--th-bg-muted)', borderRadius: 3,
              }}>{s}</code>
            ))
            : copy.none}
        </span>
      </div>

      <nav role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--th-border)', marginBottom: 12 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '6px 10px', fontSize: 12,
              border: 'none', borderBottom: `2px solid ${tab === t.id ? agent.color : 'transparent'}`,
              background: 'transparent', color: tab === t.id ? 'var(--th-fg)' : 'var(--th-muted)',
              fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      <div style={{ minHeight: 200 }}>
        {tab === 'agent' && (
          <pre style={preStyle}>{md.isLoading ? '…' : (md.data ?? '')}</pre>
        )}
        {tab === 'migration' && (
          (lang === 'en' ? agent.has_migration_en : agent.has_migration)
            ? <pre style={preStyle}>{migration.isLoading ? '…' : (migration.data ?? '')}</pre>
            : <p style={emptyStyle}>{copy.notProvided}</p>
        )}
        {tab === 'eval' && (
          !agent.has_eval_queries
            ? <p style={emptyStyle}>{copy.notProvided}</p>
            : evalQ.isLoading
              ? <p style={emptyStyle}>…</p>
              : <EvalQueriesView data={evalQ.data?.queries} agentColor={agent.color} copy={copy} />
        )}
      </div>

      {/* Auto-keywords (collapsible would be nicer but keep it scannable) */}
      <details style={{ marginTop: 14 }}>
        <summary style={{ fontSize: 12, color: 'var(--th-muted)', cursor: 'pointer' }}>
          {copy.keywords} ({agent.auto_keywords.weak.length + agent.auto_keywords.strong.length})
        </summary>
        <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.7 }}>
          <div><strong>strong:</strong> {agent.auto_keywords.strong.map(k => (
            <code key={k} style={kwStyle('strong', agent.color)}>{k}</code>
          ))}</div>
          <div style={{ marginTop: 4 }}><strong>weak:</strong> {agent.auto_keywords.weak.map(k => (
            <code key={k} style={kwStyle('weak', agent.color)}>{k}</code>
          ))}</div>
        </div>
      </details>
    </div>
  )
}

type EvalQuery = {
  prompt: string
  expected_agent?: string
  not_expected_agent?: string
  category?: string
}

function EvalQueriesView({ data, agentColor, copy }: {
  data: { positive?: EvalQuery[]; negative?: EvalQuery[] } | undefined
  agentColor: string
  copy: { positive: string; negative: string }
}) {
  if (!data) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
      {(['positive', 'negative'] as const).map(group => {
        const items = data[group] ?? []
        return (
          <div key={group}>
            <div style={{
              fontWeight: 600, marginBottom: 4,
              color: group === 'positive' ? agentColor : 'var(--th-muted)',
            }}>
              {group === 'positive' ? copy.positive : copy.negative} ({items.length})
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {items.map((q, i) => (
                <li key={i} style={{ marginBottom: 3 }}>
                  <span>{q.prompt}</span>
                  {q.expected_agent && (
                    <code style={{
                      marginLeft: 6, fontSize: 10, padding: '1px 4px',
                      background: 'var(--th-bg-muted)', borderRadius: 3, color: 'var(--th-muted)',
                    }}>
                      → {q.expected_agent}
                    </code>
                  )}
                  {q.not_expected_agent && (
                    <code style={{
                      marginLeft: 6, fontSize: 10, padding: '1px 4px',
                      background: 'rgba(239,68,68,0.12)', color: '#b91c1c', borderRadius: 3,
                    }}>
                      ≠ {q.not_expected_agent}
                    </code>
                  )}
                  {q.category && q.category !== 'positive' && q.category !== 'negative' && (
                    <code style={{
                      marginLeft: 6, fontSize: 9.5, padding: '1px 4px',
                      background: 'rgba(99,102,241,0.14)', color: '#4338ca', borderRadius: 3,
                      letterSpacing: '.02em', textTransform: 'uppercase',
                    }}>
                      {q.category}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

const preStyle: React.CSSProperties = {
  margin: 0, padding: 12,
  background: 'var(--th-bg-muted)', border: '1px solid var(--th-border)', borderRadius: 6,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  maxHeight: 500, overflowY: 'auto',
}

const emptyStyle: React.CSSProperties = {
  margin: 0, padding: '14px 6px', fontSize: 12, color: 'var(--th-muted)', fontStyle: 'italic',
}

const metaBadgeStyle: React.CSSProperties = {
  fontSize: 10, padding: '1px 6px', borderRadius: 3,
  background: 'var(--th-bg-muted)', color: 'var(--th-muted)',
  letterSpacing: '.02em',
}

function kwStyle(kind: 'weak' | 'strong', color: string): React.CSSProperties {
  return {
    fontSize: 10, padding: '1px 5px', marginRight: 3, borderRadius: 3,
    background: kind === 'strong' ? tint(color, 0.18) : 'var(--th-bg-muted)',
    color: kind === 'strong' ? color : 'var(--th-muted)',
  }
}

export default function AgentsSection() {
  const lang = useUiLanguage()
  const { data, isLoading, isError } = useAgents()
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const agents: Agent[] = data?.agents ?? []
  const selected = useMemo(
    () => agents.find(a => a.name === selectedName) ?? agents.find(a => a.default) ?? agents[0] ?? null,
    [agents, selectedName],
  )

  const copy = lang === 'en'
    ? {
      intro: 'Response agents define the tone, depth, format and skill bias of the AI assistant. Each agent is a folder under agents/ (frontmatter + Markdown), editable as code.',
      empty: 'No agents found. Create a folder under agents/<slug>/ with an AGENT.md file.',
      loading: 'Loading agents…',
      error: 'Failed to load agents.',
    }
    : {
      intro: 'Les agents de réponse définissent le ton, la profondeur, le format et l\'orientation skills de l\'assistant IA. Chaque agent est un dossier sous agents/ (frontmatter + Markdown), éditable comme du code.',
      empty: 'Aucun agent trouvé. Créez un dossier agents/<slug>/ avec un fichier AGENT.md.',
      loading: 'Chargement des agents…',
      error: 'Échec du chargement des agents.',
    }

  if (isLoading) return <section className="settings-panel"><p style={{ fontSize: 13, color: 'var(--th-muted)' }}>{copy.loading}</p></section>
  if (isError)   return <section className="settings-panel"><p style={{ fontSize: 13, color: 'var(--th-danger)' }}>{copy.error}</p></section>
  if (!agents.length) return <section className="settings-panel"><p style={{ fontSize: 13, color: 'var(--th-muted)' }}>{copy.empty}</p></section>

  return (
    <section className="settings-panel settings-panel-plain">
      <p className="settings-intro">{copy.intro}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(a => (
            <AgentCard
              key={a.name}
              agent={a}
              active={selected?.name === a.name}
              onSelect={() => setSelectedName(a.name)}
            />
          ))}
        </div>
        {selected && <AgentDetail agent={selected} />}
      </div>
    </section>
  )
}
