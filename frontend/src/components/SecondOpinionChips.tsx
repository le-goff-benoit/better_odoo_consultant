import { MessageSquarePlus } from 'lucide-react'
import { useAgents, findAgent, agentIcon, agentLabel, type Agent } from '../agents/registry'

/** Chip strip surfaced beneath an AI response — one chip per agent the
 *  current agent declares it can hand off to (``handoff_can_handoff_to``).
 *  Unlike `agent_handoff_propose` which *replaces* the current agent for
 *  the next turn, this asks for a **complementary opinion**: the AI is
 *  invited to enrich (not rewrite) the previous answer through another
 *  role's lens.
 *
 *  Click → calls `onSecondOpinion(targetAgent)` — the parent builds the
 *  structured prompt prefix and sends a new turn with a perspective
 *  override. Disabled (greyed) while streaming.
 *
 *  Capped at two chips to stay scannable. Hidden entirely when the
 *  current agent declares no handoff targets, when the agent registry
 *  hasn't loaded yet, or when the response is empty. */
export default function SecondOpinionChips({
  currentAgent,
  onSecondOpinion,
  disabled,
  lang,
}: {
  currentAgent?: string | null
  onSecondOpinion?: (target: Agent) => void
  disabled?: boolean
  lang?: 'fr' | 'en'
}) {
  const agentsQ = useAgents()
  if (!currentAgent || !onSecondOpinion || !agentsQ.data) return null

  const current = findAgent(agentsQ.data.agents, currentAgent)
  const targets = current?.handoff?.can_handoff_to ?? []
  if (!targets.length) return null

  const candidates = targets
    .map(name => findAgent(agentsQ.data.agents, name))
    .filter((a): a is Agent => a !== null)
    .slice(0, 2)
  if (!candidates.length) return null

  const label = lang === 'en' ? 'Second opinion' : 'Avis complémentaire'
  const aria = lang === 'en' ? 'Ask for a complementary opinion' : 'Demander un avis complémentaire'

  return (
    <div className="action-proposals" style={{ marginTop: 4 }}>
      <span className="action-proposals-label">
        <MessageSquarePlus size={12} /> {label}
      </span>
      <div className="action-proposals-list">
        {candidates.map(agent => {
          const Icon = agentIcon(agent.icon)
          const text = agentLabel(agent, lang ?? 'fr')
          return (
            <button
              key={agent.name}
              type="button"
              className="action-proposal-chip"
              disabled={disabled}
              title={`${aria} — ${text}`}
              aria-label={`${aria} — ${text}`}
              onClick={() => onSecondOpinion(agent)}
              style={{ borderColor: agent.color }}
            >
              <Icon size={13} color={agent.color} />
              <span>{text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Build the structured prefix injected as the next user turn. The
 *  invited agent reads (a) what the previous agent answered and (b) an
 *  explicit instruction to *complete*, not rewrite, that answer. */
export function buildSecondOpinionPrompt({
  previousAgentLabel,
  previousAnswer,
  invitedAgentLabel,
  lang,
}: {
  previousAgentLabel: string
  previousAnswer: string
  invitedAgentLabel: string
  lang: 'fr' | 'en'
}): string {
  // Cap the previous answer so a very long response doesn't blow the
  // turn-level token budget — 4000 chars is enough to carry the gist.
  const body = previousAnswer.length > 4000
    ? previousAnswer.slice(0, 4000) + '\n[...réponse tronquée pour rester dans le budget...]'
    : previousAnswer
  if (lang === 'en') {
    return [
      `[Previous answer — agent: ${previousAgentLabel}]`,
      body,
      '',
      `[Request] As **${invitedAgentLabel}**, give a complementary opinion: where do you agree, what risks were missed, what alternatives would you consider? Do not rewrite the answer — complete it.`,
    ].join('\n')
  }
  return [
    `[Réponse précédente — agent : ${previousAgentLabel}]`,
    body,
    '',
    `[Demande] En tant qu'**${invitedAgentLabel}**, donne un avis complémentaire : points d'accord, risques manqués, alternatives à considérer. Ne réécris pas la réponse — complète-la.`,
  ].join('\n')
}
