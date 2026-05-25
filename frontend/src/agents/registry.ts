// Frontend agent registry — fetches /api/agents and exposes typed
// helpers (icon, color, label) used by the agent selector and the
// streaming-time badge. Built so adding a new agent on disk (back end)
// surfaces in the UI automatically with no code change here.
import { useQuery } from '@tanstack/react-query'
import {
  Bot, Briefcase, Building2, Code2, Compass, Cpu, Database, FlaskConical,
  Gauge, Layers, Megaphone, Palette, Rocket, Server, ShieldCheck, Sparkles,
  Workflow, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getAgents } from '../api/client'

export interface AgentKeywords {
  weak: string[]
  strong: string[]
}

export interface Agent {
  name: string
  folder_name: string
  label: string
  label_en: string
  description: string
  description_en: string
  icon: string
  color: string
  default: boolean
  builtin: boolean
  version: string
  author: string
  aliases: string[]
  modes: string[]
  recommended_model: string | null
  preferred_skills: string[]
  avoided_skills: string[]
  denied_skills: string[]
  preferred_tools: string[]
  scope: string
  agent_type: string
  handoff: { can_handoff_to: string[] }
  auto_keywords: AgentKeywords
  has_migration: boolean
  has_migration_en: boolean
  has_eval_queries: boolean
}

export interface AgentsResponse {
  agents: Agent[]
  diagnostics: Array<{
    severity: 'warning' | 'error'
    agent: string
    folder: string
    code: string
    message: string
    field: string | null
  }>
}

const ICON_MAP: Record<string, LucideIcon> = {
  Wrench, Briefcase, Building2, Code2, Sparkles, Bot, Compass, Cpu, Database,
  FlaskConical, Gauge, Layers, Megaphone, Palette, Rocket, Server, ShieldCheck,
  Workflow,
}

/** Resolve a Lucide icon by name with a sensible fallback (Sparkles). */
export function agentIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Sparkles
  return ICON_MAP[name] ?? Sparkles
}

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<AgentsResponse> => {
      const r = await getAgents()
      return r.data
    },
    staleTime: 60_000,
  })
}

/** Look up an agent in the cached list by name (or legacy alias).
 * Returns ``null`` when the list has not loaded yet — callers should
 * gracefully fall back to a generic appearance. */
export function findAgent(agents: Agent[] | undefined, name: string | null | undefined): Agent | null {
  if (!agents || !name) return null
  return agents.find(a => a.name === name || a.folder_name === name || a.aliases.includes(name)) ?? null
}

export function agentLabel(agent: Agent | null, lang: 'fr' | 'en'): string {
  if (!agent) return ''
  return (lang === 'en' ? agent.label_en : agent.label) || agent.name
}
