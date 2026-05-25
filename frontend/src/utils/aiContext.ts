import { useEffect, useRef, useState } from 'react'
import type { Perspective, PerspectiveMode } from '../components/PerspectiveToggle'

export interface AiEventLike {
  type: string
  name?: string
  args?: Record<string, unknown>
  skills?: string[]
  candidates?: SkillRouteCandidateLike[]
  run_id?: string
  context_trace?: ContextTraceEventLike[]
}

export interface SkillRouteCandidateLike {
  name?: string
  score?: number
  reason?: string
  selected?: boolean
}

export interface ContextTraceEventLike {
  type?: string
  run_id?: string
  skill?: string
  filename?: string
  heading?: string
  chars?: number
  original_chars?: number
  capped_chars?: number
}

export interface ContextTraceSummary {
  runId?: string
  total: number
  references: ContextTraceEventLike[]
  truncations: ContextTraceEventLike[]
  cacheHits: ContextTraceEventLike[]
  latest: ContextTraceEventLike[]
}

export interface SkillRoutingSummary {
  selected: SkillRouteCandidateLike[]
  pruned: SkillRouteCandidateLike[]
  top: SkillRouteCandidateLike[]
}

export interface ContextItem {
  type: 'context' | 'source' | 'tool'
  label: string
  detail?: string
}

// ── Term lists (per perspective) ──────────────────────────────────
// Each term has an implicit weight of 1, except those listed in *_STRONG
// which weight 3. We score the prompt against each list, then pick the
// highest-scoring perspective above a minimum threshold. Below threshold,
// we fall back to the caller-provided default (typically the previously
// resolved perspective or "business_analyst").
//
// Guidelines for term picking:
// - Avoid ultra-generic words that appear in any business prompt
//   (e.g. "client", "user", "projet"). They were drowning every prompt
//   in BA score and rendered the auto-resolver useless.
// - Prefer multi-word phrases or specific tokens. A short generic word
//   should be a STRONG-only signal when its presence is unambiguous.

const SUPPORT_TERMS = [
  // incident vocabulary
  'incident', 'bug', 'crash', 'plante', 'crashe', 'workaround', 'contournement',
  'ticket', 'sla', 'reproduire', 'reproduction', 'panne', 'hors service',
  'urgence', 'urgent', 'critique', 'critical', 'p1', 'p2',
  'lenteur', 'slowness', 'freeze', 'timeout',
  'ne fonctionne pas', "n'arrive pas", "n'arrive plus", 'ne marche pas',
  'ne charge pas', 'pas accessible', 'inaccessible', "n'affiche", 'naffiche',
  'résoudre', 'resoudre', 'résolution', 'fix', 'corriger',
  // common error/blocking vocabulary users actually write
  'erreur', 'planté', 'plantée', 'bloqué', 'bloque', 'bloquée',
  'connexion', 'impossible',
]

// Strong support signals — almost always indicate an incident question.
const SUPPORT_STRONG = [
  'incident', 'workaround', 'contournement', 'ticket', 'sla', 'panne',
  'hors service', 'reproduire', 'p1', 'p2', "n'arrive plus",
  'ne fonctionne pas', 'ne marche pas',
  'bug',
  // Promote high-confidence single-word signals
  'plante', 'planté', 'plantée',   // "odoo plante" = crash
  'inaccessible',                   // "odoo inaccessible" = outage
  'lenteur',                        // "lenteur extrême" = incident
  // Multi-word patterns impossible to mistake for a BA question
  'page blanche', 'écran blanc',
  'erreur 500', 'erreur 404', 'erreur 403', 'internal server error',
  'connexion impossible', 'impossible de se connecter', 'login impossible',
]

const BA_TERMS = [
  // business process & analysis vocabulary (NOT generic words like "client" / "user")
  'process', 'processus', 'métier', 'metier', 'fonctionnel', 'fonctionnelle',
  'as-is', 'to-be', 'workflow', 'parcours utilisateur', 'formation', 'trainee',
  'recette', 'uat', 'besoin', 'besoins', 'requirement', 'requirements',
  'règle de gestion', 'regle de gestion', 'gap', 'écart', 'ecart',
  'compte-rendu', 'compte rendu', 'meeting', 'réunion', 'reunion',
  'adoption', 'conduite du changement', 'change management', 'kpi',
  // configuration / standard usage
  'configurer', 'paramétrer', 'parametrer',
  'comment faire', 'how to', "cas d'usage", 'use case',
  "qu'est-ce que", 'what is', 'à quoi sert', 'a quoi sert',
  // multi-word functional phrases (preferred over single common nouns)
  'point de vente', 'note de frais', 'feuille de temps', 'bon de livraison',
  'bon de commande', 'tableau de bord',
  // ── Odoo business domain vocabulary ─────────────────────────────────────
  // Accounting & Finance (specific enough to be unambiguous in context)
  'avoir', 'avoirs', 'acompte', 'comptable',
  'rapprochement', 'lettrage', 'trésorerie', 'tresorerie',
  'recouvrement', 'encaissement', 'relance',
  'solde client', 'solde fournisseur',
  // Sales & CRM
  'devis', 'opportunité', 'opportunite',
  'commande client', 'commandes client',
  // Purchase
  'fournisseur', 'fournisseurs',
  'bon de réception', 'bon de reception',
  // Inventory / Warehouse
  'inventaire', 'mouvement de stock',
  // HR & Payroll
  'congé', 'conge', 'absence', 'employé', 'employe',
  'fiche de salaire', 'bulletin de salaire',
]

const BA_STRONG = [
  'métier', 'metier', 'fonctionnel', 'as-is', 'to-be', "cas d'usage",
  'règle de gestion', 'compte-rendu', 'compte rendu', 'recette', 'uat',
  'parcours utilisateur',
  // Accounting domain — a single mention is a reliable BA signal
  'facture', 'factures', 'invoice', 'invoices',
  'comptabilité', 'accounting',
  'rapprochement bancaire', 'plan comptable',
]

const ARCH_TERMS = [
  'architecture', 'architecte', 'architectural', 'scalabilité', 'scalability',
  'urbanisation', 'haut niveau', 'cible', 'trajectoire',
  'dépendance', 'dependance', 'dépendances', 'dependances',
  'migration strategy', 'stratégie de migration', 'strategie de migration',
  'choix technique', 'décision', 'adr',
  'risque', 'risques', 'risk', 'risks',
  'multi-société', 'multi-societe', 'multi-company', 'multi société',
  'patron', 'pattern', 'patterns', 'volumétrie', 'volumetrie',
  'high availability', 'haute disponibilité', 'haute dispo', 'pra', 'rto', 'rpo',
  'backup strategy', 'stratégie de backup', 'strategie de backup',
  'indexation', 'cluster', 'load balanc',
  'oca vs', 'community vs enterprise', 'community ou enterprise',
  'roadmap', 'feuille de route', 'gouvernance',
  // Infrastructure / hosting / deployment — always an architecture concern
  'hébergement', 'hébergeur', 'héberger',
  'infrastructure', 'on-premise', 'on premise',
  'déploiement', 'deploiement',
  'saas', 'cloud', 'dimensionnement',
  // Multi-entity / multi-country
  'multi-pays', 'multicompany', 'multi pays',
  // Community ecosystem decision
  'oca', 'développement interne', 'developpement interne',
]

const ARCH_STRONG = [
  'architecture', 'architecte', 'adr', 'haute disponibilité', 'haute dispo',
  'multi-société', 'multi-company', 'stratégie de migration', 'community vs enterprise',
  'oca vs', 'scalabilité', 'scalability', 'gouvernance',
  // Promote signals that reliably indicate an architecture decision question
  'community ou enterprise',  // "community ou enterprise" = make/buy decision
  'hébergeur',                // choosing a host = infra decision
  'roadmap',                  // roadmap = planning = arch scope
  'trajectoire',              // "trajectoire technique" = arch planning
  'choix technique',          // "choix technique" = ADR = arch
  'multi-pays',               // multi-country deployment = arch scope
]

const DEV_TERMS = [
  // explicit code/dev signals
  'snippet', 'python', 'xml', 'javascript', 'typescript', 'sql',
  '_inherit', '_inherits', '_name', '_description',
  'api.', '@api', 'override', 'surcharge', 'surcharger',
  '__manifest__', 'traceback', 'stack trace', 'stacktrace', 'exception',
  '@depends', 'compute', 'related', 'onchange', 'constrains',
  'command.create', 'command.update', 'browse', 'recordset',
  'env[', 'self.env', 'cron', 'wizard', 'controller',
  'http.', 'json-rpc', 'jsonrpc',
  'orm', 'requête sql', 'requete sql', 'psycopg', 'cursor',
  'pdb', 'breakpoint', 'logger',
  'odoo-bin', 'odoo.conf', 'web_studio',
  'pull request', 'rebase',
  'unittest', 'transactioncase', 'pytest',
]

const DEV_STRONG = [
  '_inherit', '_inherits', '_name', '_description', '@api', 'api.depends',
  '__manifest__', 'traceback', 'stack trace', 'self.env', 'env[',
  'transactioncase', 'recordset', 'psycopg',
  // Programming language mentions are unambiguous dev signals
  'python', 'javascript', 'typescript', 'sql',
  // Override/inheritance vocabulary — always dev in French Odoo context
  'surcharger', 'hériter', 'heriter',
]

const MEETING_TERMS = ['compte-rendu', 'compte rendu', 'meeting minute', 'réunion', 'reunion', 'pv de réunion', 'pv de reunion']
const STUDIO_TERMS = ['studio', 'x_studio', 'personnalisation', 'customisation', 'champ custom', 'modèle custom', 'modele custom', 'odoo_inspect_studio']
// Mirrors the backend `_DEV_TERMS` in context_service.py — keep in sync.
const DEV_FILE_TERMS = [
  'module custom', 'custom module', 'dev custom', 'custom dev',
  '_inherit', '_inherits', '@api.depends', '@api.constrains', '@api.onchange',
  'repo_search_code', 'repo_read_file', 'code custom',
  'depot client', 'dépôt client', 'client repo', 'modules sur mesure',
  'surcharge', 'monkey patch', 'monkey_patch',
]
const VERSION_TERMS = ['version', 'migration', 'upgrade', 'nouveauté', 'nouveaute', 'changement', 'différence', 'difference', 'breaking', 'deprecated', 'dépréci', 'depreci', 'renommé', 'renomme', 'compatib', 'odoo 15', 'odoo 16', 'odoo 17', 'odoo 18', 'odoo 19']
const FISCAL_TERMS = ['compta', 'comptabil', 'account', 'accounting', 'fiscal', 'tax', 'taxe', 'tva', 'vat', 'factur', 'invoice', 'journal', 'plan comptable', 'chart of accounts', 'fec', 'intrastat', 'qr-bill', 'qr bill', 'pos cert', 'paie', 'payroll']

// Weighted scoring: each "weak" term match = 1 point, each "strong" term = 3.
// A perspective wins only if its score is ≥ MIN_SCORE AND strictly above the
// second-best (otherwise we keep the fallback — usually the previous answer).
const MIN_SCORE = 3

function scoreTerms(text: string, weak: string[], strong: string[]): number {
  let n = 0
  for (const term of weak) if (text.includes(term)) n++
  for (const term of strong) if (text.includes(term)) n += 3
  return n
}

function hasAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

// Detect strong "developer" signals that should override softer BA matches.
// These are very specific tokens — no false positives like "command." matching
// a sentence ending.
function hasStrongDevSignal(text: string): boolean {
  // fenced code block
  if (text.includes('```')) return true
  // python def line: "def name(" with leading whitespace
  if (/(^|\n)\s*def\s+\w+\s*\(/.test(text)) return true
  // XML/Odoo data tags
  if (/<\s*(record|field|template|menuitem)\b/.test(text)) return true
  // ORM signals
  if (text.includes('_inherit') || text.includes('@api.') || text.includes('self.env')) return true
  // python traceback
  if (/\btraceback\b|\bstack ?trace\b|\bexception:/i.test(text)) return true
  return false
}

/**
 * Infer the best response profile from a prompt.
 *
 * Strategy:
 * 1. Strong dev signals (code block, ORM tokens, traceback) → developer.
 * 2. Otherwise compute a weighted score for each of the 4 perspectives.
 * 3. Return the winner only if it scores ≥ MIN_SCORE AND beats #2 by a
 *    margin. Otherwise return the fallback (caller passes the previous
 *    perspective for stability across keystrokes).
 *
 * The function is pure and deterministic — call sites debounce it to avoid
 * flicker on long prompts.
 */
export function inferPerspective(text: string, fallback: Perspective = 'business_analyst'): Perspective {
  const normalized = text.toLocaleLowerCase()
  if (!normalized.trim()) return fallback

  if (hasStrongDevSignal(normalized)) return 'developer'

  const scores: Record<Perspective, number> = {
    support: scoreTerms(normalized, SUPPORT_TERMS, SUPPORT_STRONG),
    architect: scoreTerms(normalized, ARCH_TERMS, ARCH_STRONG),
    developer: scoreTerms(normalized, DEV_TERMS, DEV_STRONG),
    business_analyst: scoreTerms(normalized, BA_TERMS, BA_STRONG),
  }

  // Find the top two, with tie-breaker order: support > architect > developer > BA.
  const order: Perspective[] = ['support', 'architect', 'developer', 'business_analyst']
  let best: Perspective = fallback
  let bestScore = 0
  let secondScore = 0
  for (const p of order) {
    if (scores[p] > bestScore) {
      secondScore = bestScore
      bestScore = scores[p]
      best = p
    } else if (scores[p] > secondScore) {
      secondScore = scores[p]
    }
  }
  // Require enough confidence: minimum score and a margin over the runner-up.
  if (bestScore >= MIN_SCORE && bestScore - secondScore >= 2) return best
  return fallback
}

export function resolvePerspective(mode: PerspectiveMode, text: string, fallback: Perspective = 'business_analyst'): Perspective {
  return mode === 'auto' ? inferPerspective(text, fallback) : mode
}

/**
 * Debounced + sticky perspective resolution for live UIs.
 *
 * - When `mode` is a fixed value (not "auto") the result switches immediately.
 * - When `mode === 'auto'`, the inferred perspective is recomputed only after
 *   `delayMs` ms of input inactivity, and the previously resolved perspective
 *   is used as the fallback. This prevents the badge from flickering between
 *   roles while the user types a long prompt.
 */
export function useResolvedPerspective(
  mode: PerspectiveMode,
  text: string,
  initial: Perspective = 'developer',
  delayMs = 350,
): Perspective {
  const [resolved, setResolved] = useState<Perspective>(() =>
    mode === 'auto' ? inferPerspective(text, initial) : mode,
  )
  const last = useRef<Perspective>(resolved)

  useEffect(() => {
    if (mode !== 'auto') {
      last.current = mode
      setResolved(mode)
      return
    }
    const t = setTimeout(() => {
      const next = inferPerspective(text, last.current)
      if (next !== last.current) {
        last.current = next
        setResolved(next)
      }
    }, delayMs)
    return () => clearTimeout(t)
  }, [mode, text, delayMs])

  return resolved
}

export function perspectiveLabel(value: Perspective, lang: 'fr' | 'en') {
  const labels = lang === 'en'
    ? {
      support: 'Support',
      business_analyst: 'Business Analyst',
      architect: 'Architect',
      developer: 'Developer',
    }
    : {
      support: 'Support',
      business_analyst: 'Business Analyst',
      architect: 'Architecte',
      developer: 'Développeur',
    }
  return labels[value]
}

export type ComplexityMode = 'standard' | 'studio' | 'dev' | 'studio_dev'
export type ContextFileSource = 'complexity' | 'keyword' | 'system'

export function routedContextFiles(params: {
  prompt: string
  perspective: Perspective
  version?: string | null
  targetVersion?: string | null
  migration?: boolean
  countryCode?: string | null
  forceLocalization?: boolean
  complexityMode?: ComplexityMode | null
  creation?: boolean
}): string[] {
  return routedContextFilesWithSource(params).map(f => f.name)
}

/** Same as `routedContextFiles` but returns each file with WHY it was loaded
 * (project complexity, prompt keyword, or system default). Used by the
 * context panel to display a small origin tag next to each pill. */
export function routedContextFilesWithSource(params: {
  prompt: string
  perspective: Perspective
  version?: string | null
  targetVersion?: string | null
  migration?: boolean
  countryCode?: string | null
  forceLocalization?: boolean
  complexityMode?: ComplexityMode | null
  creation?: boolean
}): Array<{ name: string; source: ContextFileSource }> {
  const text = params.prompt.toLocaleLowerCase()
  const out: Array<{ name: string; source: ContextFileSource }> = []
  const seen = new Set<string>()
  const add = (name: string, source: ContextFileSource) => {
    if (seen.has(name)) return
    seen.add(name)
    out.push({ name, source })
  }
  add('consultant-memo.md', 'system')
  // Response-agent roles now live only in agents/<slug>/AGENT.md. Creator mode
  // adds its Studio write-safety conventions as a context file; regular chat
  // does not load legacy profile-*.md files anymore.
  if (params.creation) {
    add('creator-conventions.md', 'system')
  }
  if (params.migration) add('migration.md', 'system')
  if (params.creation) add('creation.md', 'system')
  if (hasAny(text, MEETING_TERMS)) add('meeting-minute.md', 'keyword')
  // Studio guide: complexity wins as source; keyword as fallback; creation
  // always loads it as part of the Creator briefing.
  const complexity = params.complexityMode ?? null
  const studioByComplexity = complexity === 'studio' || complexity === 'studio_dev'
  if (params.creation) add('studio.md', 'system')
  else if (studioByComplexity) add('studio.md', 'complexity')
  else if (hasAny(text, STUDIO_TERMS)) add('studio.md', 'keyword')
  // Custom-dev guide: same OR logic.
  const devByComplexity = complexity === 'dev' || complexity === 'studio_dev'
  if (devByComplexity) add('dev.md', 'complexity')
  else if (hasAny(text, DEV_FILE_TERMS)) add('dev.md', 'keyword')
  if (params.version) add(`odoo-${params.version}.md`, 'system')
  if (params.targetVersion && params.targetVersion !== params.version) {
    add(`odoo-${params.targetVersion}.md`, 'system')
  }
  const countryCode = (params.countryCode ?? '').trim().toLocaleLowerCase()
  if (/^[a-z]{2}$/.test(countryCode) && (params.forceLocalization || hasAny(text, FISCAL_TERMS))) {
    add(`l10n_${countryCode}.md`, 'keyword')
  }
  return out
}

export function extractToolContextItems(events: AiEventLike[]): ContextItem[] {
  const seen = new Set<string>()
  const out: ContextItem[] = []
  for (const evt of events) {
    if (evt.type !== 'tool_call') continue
    const name = evt.name ?? ''
    const args = evt.args ?? {}
    if (name === 'source_read_odoo_file' || name === 'repo_read_file' || name === 'migration_read_target_file') {
      const path = String(args.path ?? '')
      if (!path) continue
      const key = `${name}:${path}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'context', label: path, detail: name === 'repo_read_file' ? 'Projet' : name === 'migration_read_target_file' ? 'Cible' : 'Odoo' })
    } else if (name === 'source_search_odoo' || name === 'migration_search_target_source' || name === 'repo_search_code') {
      const scope = name === 'repo_search_code' ? 'Code custom' : name === 'migration_search_target_source' ? 'Sources cible' : 'Sources Odoo'
      const pattern = String(args.pattern ?? '')
      const version = String(args.version ?? '')
      const label = pattern ? `Recherche: ${pattern}` : 'Recherche'
      const detail = version ? `${scope} · v${version}` : scope
      const key = `${name}:${pattern}:${version}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'source', label, detail })
    } else if (
      name === 'odoo_query_records' || name === 'odoo_count_records' || name === 'odoo_aggregate_records' ||
      name === 'odoo_inspect_fields' || name === 'odoo_inspect_studio' ||
      name === 'odoo_inspect_modules' || name === 'odoo_inspect_security' ||
      name === 'odoo_inspect_navigation' || name === 'odoo_inspect_view' ||
      name === 'odoo_inspect_report' || name === 'repo_list_modules' ||
      name === 'repo_count_source_lines'
    ) {
      const model = String(args.model ?? args.scope ?? '')
      const key = `${name}:${model}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'tool', label: name, detail: model || undefined })
    }
  }
  return out.slice(-12)
}

export function extractUsedSkillNames(events: AiEventLike[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const evt of events) {
    if (evt.type === 'skills_selected' && Array.isArray(evt.skills)) {
      for (const name of evt.skills) {
        if (!name || seen.has(name)) continue
        seen.add(name)
        names.push(name)
      }
      continue
    }
    if (evt.type !== 'tool_call' || !evt.name) continue
    if (seen.has(evt.name)) continue
    seen.add(evt.name)
    names.push(evt.name)
  }
  return names
}

export function extractLatestContextTrace(events: AiEventLike[]): ContextTraceSummary | null {
  const carrier = [...events].reverse().find(evt => Array.isArray(evt.context_trace) && evt.context_trace.length > 0)
  const trace = carrier?.context_trace ?? []
  if (!trace.length) return null
  const references = trace.filter(evt => evt.type === 'reference_auto_loaded')
  const truncations = trace.filter(evt => evt.type === 'priority_block_truncated')
  const cacheHits = trace.filter(evt => evt.type === 'context_cache_hit')
  return {
    runId: carrier?.run_id ?? trace.find(evt => evt.run_id)?.run_id,
    total: trace.length,
    references,
    truncations,
    cacheHits,
    latest: trace.slice(-4),
  }
}

export function extractLatestSkillRouting(events: AiEventLike[]): SkillRoutingSummary | null {
  const carrier = [...events].reverse().find(evt => evt.type === 'skills_selected' && Array.isArray(evt.candidates))
  const candidates = carrier?.candidates ?? []
  if (!candidates.length) return null
  const selected = candidates.filter(candidate => candidate.selected === true)
  const pruned = candidates.filter(candidate => candidate.selected === false && String(candidate.reason ?? '').includes('pruned:'))
  return {
    selected: selected.slice(0, 8),
    pruned: pruned.slice(0, 6),
    top: candidates.slice(0, 10),
  }
}
