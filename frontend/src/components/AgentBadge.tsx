// AgentBadge — displays the active agent (logo + name) with a soft tint
// using the agent's signature color. Used during AI streaming in
// Assistant / Migration / Creator so the user gets immediate visual feedback
// about which persona is answering.
import { Sparkles } from 'lucide-react'
import { useUiLanguage } from '../i18n'
import { agentIcon, useAgents, findAgent } from '../agents/registry'
import { perspectiveLabel } from '../utils/aiContext'
import type { Perspective } from './PerspectiveToggle'

interface AgentBadgeProps {
  /** Resolved agent slug (the concrete persona, not "auto"). */
  perspective: Perspective | string
  /** When true, render a tiny chip suitable for inline placement next to a
   * spinner or "thinking…" hint. When false (default), render a slightly
   * larger card-style badge. */
  compact?: boolean
  /** Optional override text shown after the agent name (e.g. "réfléchit…"). */
  status?: string
}

/** Convert a hex color (#rrggbb) into an rgba() with the given alpha so the
 * surrounding tint stays subtle on both light and dark themes. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return `rgba(100,116,139,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

export default function AgentBadge({ perspective, compact = false, status }: AgentBadgeProps) {
  const lang = useUiLanguage()
  const { data } = useAgents()
  const agent = findAgent(data?.agents, perspective)
  const color = agent?.color || '#64748b'
  const Icon = agent ? agentIcon(agent.icon) : Sparkles
  const label = agent
    ? (lang === 'en' ? agent.label_en : agent.label)
    : perspectiveLabel(perspective as Perspective, lang)

  const padding = compact ? '2px 8px' : '4px 10px'
  const iconSize = compact ? 12 : 14
  const fontSize = compact ? 11.5 : 12.5

  return (
    <span
      title={agent?.description || label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding, borderRadius: 999,
        background: tint(color, 0.13),
        border: `1px solid ${tint(color, 0.35)}`,
        color: 'var(--th-fg)',
        fontSize, lineHeight: 1, fontWeight: 600,
        maxWidth: compact ? 220 : 320,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      <Icon size={iconSize} color={color} strokeWidth={2.25} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {status && (
        <span style={{ fontWeight: 400, color: 'var(--th-muted)', fontSize: fontSize - 0.5 }}>
          · {status}
        </span>
      )}
    </span>
  )
}
