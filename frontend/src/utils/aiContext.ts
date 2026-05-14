import type { Perspective, PerspectiveMode } from '../components/PerspectiveToggle'

export interface AiEventLike {
  type: string
  name?: string
  args?: Record<string, unknown>
}

export interface ContextItem {
  type: 'context' | 'source' | 'tool'
  label: string
  detail?: string
}

// ── Term lists (per perspective) ──────────────────────────────────
// Strategy: each list is intentionally broad. We then SCORE the prompt
// against each list and pick the highest-scoring perspective. If no list
// scores, we fall back to "business_analyst" (a more neutral default
// than "developer" for everyday functional questions).

const SUPPORT_TERMS = [
  // incident vocabulary
  'incident', 'bloqué', 'bloque', 'blocked', 'erreur', 'error', 'bug', 'crash',
  'plante', 'crashe', 'problème', 'probleme', 'problem', 'issue',
  'urgence', 'urgent', 'critique', 'critical', 'p1', 'p2', 'priorité',
  'lenteur', 'lent', 'slow', 'slowness', 'freeze', 'gelé', 'gele', 'timeout',
  'ne fonctionne pas', "n'arrive pas", "n'arrive plus", 'ne marche pas',
  'ne charge pas', 'pas accessible', 'inaccessible', "n'affiche", 'naffiche',
  'corriger', 'fix', 'résoudre', 'resoudre', 'résolution', 'resolution',
  'workaround', 'contournement', 'ticket', 'sla', 'reproduire', 'reproduction',
  'down', 'panne', 'hors service',
]

const BA_TERMS = [
  // business / functional
  'process', 'processus', 'métier', 'metier', 'fonctionnel', 'fonctionnelle',
  'business', 'utilisateur', 'utilisateurs', 'user', 'users', 'as-is', 'to-be',
  'workflow', 'parcours', 'parcours utilisateur', 'formation', 'trainee',
  'recette', 'uat', 'besoin', 'besoins', 'requirement', 'requirements',
  'règle de gestion', 'regle de gestion', 'gap', 'écart', 'ecart',
  'compte-rendu', 'compte rendu', 'meeting', 'réunion', 'reunion',
  'adoption', 'conduite du changement', 'change management', 'kpi',
  // configuration / standard usage
  'configurer', 'configuration', 'paramétrer', 'parametrer', 'paramètre',
  'parametre', 'comment faire', 'how to', 'cas d\'usage', "cas d'usage", 'use case',
  'fonctionne', 'fonctionnement', 'utilise', 'utilisation', 'utiliser',
  'expliquer', 'explique', 'qu\'est-ce que', "qu'est ce que", 'what is',
  'pourquoi', 'why', 'qui peut', 'who can', 'à quoi sert', 'a quoi sert',
  // accounting/sales/inventory functional terms (without code keywords)
  'facture', 'factures', 'devis', 'commande', 'commandes', 'livraison',
  'stock', 'achat', 'achats', 'vente', 'ventes', 'crm', 'lead', 'opportunité',
  'opportunite', 'partenaire', 'fournisseur', 'client', 'employé', 'employe',
  'congé', 'conge', 'paie', 'projet', 'tâche', 'tache', 'fabrication',
  'production', 'point de vente', 'pos',
]

const ARCH_TERMS = [
  'architecture', 'architecte', 'architectural', 'sécurité', 'securite',
  'security', 'performance', 'performances', 'scalabilité', 'scalability',
  'urbanisation', 'urbain', 'haut niveau', 'cible', 'trajectoire',
  'dépendance', 'dependance', 'dépendances', 'dependances',
  'migration strategy', 'stratégie de migration', 'strategie de migration',
  'choix technique', 'décision', 'decision', 'adr',
  'risque', 'risques', 'risk', 'risks', 'sla architecture',
  'multi-société', 'multi-societe', 'multi-company', 'multi société',
  'audit', 'patron', 'pattern', 'patterns', 'volumétrie', 'volumetrie',
  'high availability', 'haute disponibilité', 'haute dispo', 'pra', 'rto', 'rpo',
  'backup strategy', 'stratégie de backup', 'strategie de backup',
  'indexation', 'index strategy', 'cluster', 'load balanc',
  'oca vs', 'community vs enterprise', 'community ou enterprise',
  'roadmap', 'feuille de route', 'gouvernance',
]

const DEV_TERMS = [
  // explicit code/dev signals
  'code', 'snippet', 'python', 'xml', 'js', 'javascript', 'typescript', 'sql',
  'modèle', 'modele', 'model', 'field', 'champ', 'method', 'méthode',
  'classe', 'class ', '_inherit', '_inherits', '_name', '_description',
  'api.', '@api', 'override', 'surcharge', 'surcharger', 'manifest',
  '__manifest__', 'traceback', 'stack trace', 'stacktrace', 'exception',
  'depends', '@depends', 'compute', 'related', 'onchange', 'constrains',
  'command.create', 'command.update', 'command.', 'browse', 'recordset',
  'env[', 'self.env', 'cron', 'wizard', 'controller', 'contrôleur',
  'controleur', 'route', 'http.', 'json-rpc', 'jsonrpc',
  'orm', 'sql query', 'requête sql', 'requete sql', 'psycopg', 'cursor',
  'pdb', 'breakpoint', 'log', 'logger', 'logging', 'debug',
  'odoo-bin', 'odoo.conf', 'web_studio',
  'github', 'pull request', 'commit', 'branch', 'merge', 'rebase',
  // test / quality
  'unittest', 'transactioncase', 'test unitaire', 'pytest', 'test suite',
]

const MEETING_TERMS = ['compte-rendu', 'compte rendu', 'meeting minute', 'réunion', 'reunion', 'pv de réunion', 'pv de reunion']
const STUDIO_TERMS = ['studio', 'x_studio', 'personnalisation', 'customisation', 'champ custom', 'modèle custom', 'modele custom', 'inspect_studio']
const VERSION_TERMS = ['version', 'migration', 'upgrade', 'nouveauté', 'nouveaute', 'changement', 'différence', 'difference', 'breaking', 'deprecated', 'dépréci', 'depreci', 'renommé', 'renomme', 'compatib', 'odoo 15', 'odoo 16', 'odoo 17', 'odoo 18', 'odoo 19']

function countMatches(text: string, terms: string[]): number {
  let n = 0
  for (const term of terms) if (text.includes(term)) n++
  return n
}

function hasAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

// Detect strong "developer" signals that should override softer BA matches.
function hasStrongDevSignal(text: string): boolean {
  // code block / triple backtick
  if (text.includes('```')) return true
  // python/xml indentation hints
  if (/\bdef\s+\w+\s*\(/.test(text)) return true
  if (/<\s*(record|field|template|odoo|menuitem)\b/.test(text)) return true
  // _inherit / api decorator / Command.*
  if (text.includes('_inherit') || text.includes('@api.') || text.includes('command.')) return true
  // python error idioms
  if (/traceback|stack ?trace|exception:/i.test(text)) return true
  return false
}

/**
 * Infer the best response profile from a prompt.
 * Uses a scoring approach: counts matches per category, picks the highest.
 * Falls back to `business_analyst` (more neutral than `developer` for
 * everyday functional/config questions).
 */
export function inferPerspective(text: string, fallback: Perspective = 'business_analyst'): Perspective {
  const normalized = text.toLocaleLowerCase()
  if (!normalized.trim()) return fallback

  // Strong dev signals (code, traceback, ORM inherit) → developer first.
  if (hasStrongDevSignal(normalized)) return 'developer'

  // Support has a hard cue: incident vocabulary almost always wins.
  if (hasAny(normalized, SUPPORT_TERMS.slice(0, 25))) return 'support'

  const scores: Record<Perspective, number> = {
    support: countMatches(normalized, SUPPORT_TERMS),
    architect: countMatches(normalized, ARCH_TERMS),
    developer: countMatches(normalized, DEV_TERMS),
    business_analyst: countMatches(normalized, BA_TERMS),
  }

  // Pick the highest-scoring perspective. Tie-breaker order: support > architect > developer > BA.
  const order: Perspective[] = ['support', 'architect', 'developer', 'business_analyst']
  let best: Perspective = fallback
  let bestScore = 0
  for (const p of order) {
    if (scores[p] > bestScore) {
      best = p
      bestScore = scores[p]
    }
  }
  return bestScore > 0 ? best : fallback
}

export function resolvePerspective(mode: PerspectiveMode, text: string, fallback: Perspective = 'business_analyst'): Perspective {
  return mode === 'auto' ? inferPerspective(text, fallback) : mode
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

export function routedContextFiles(params: {
  prompt: string
  perspective: Perspective
  version?: string | null
  targetVersion?: string | null
  migration?: boolean
}) {
  const text = params.prompt.toLocaleLowerCase()
  const files = new Set<string>(['skills.md', `profile-${params.perspective === 'business_analyst' ? 'business-analyst' : params.perspective}.md`])
  if (params.migration) files.add('migration.md')
  if (hasAny(text, MEETING_TERMS)) files.add('meeting-minute.md')
  if (hasAny(text, STUDIO_TERMS)) files.add('studio.md')
  if (params.version && (params.migration || !text || hasAny(text, VERSION_TERMS))) files.add(`odoo-${params.version}.md`)
  if (params.targetVersion && params.targetVersion !== params.version && (params.migration || hasAny(text, VERSION_TERMS))) files.add(`odoo-${params.targetVersion}.md`)
  return Array.from(files)
}

export function extractToolContextItems(events: AiEventLike[]): ContextItem[] {
  const seen = new Set<string>()
  const out: ContextItem[] = []
  for (const evt of events) {
    if (evt.type !== 'tool_call') continue
    const name = evt.name ?? ''
    const args = evt.args ?? {}
    if (name === 'read_odoo_file' || name === 'read_project_file') {
      const path = String(args.path ?? '')
      if (!path) continue
      const key = `${name}:${path}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'context', label: path, detail: name === 'read_odoo_file' ? 'Odoo' : 'Projet' })
    } else if (name === 'search_odoo_source' || name === 'search_target_source' || name === 'search_project_source') {
      const scope = name === 'search_project_source' ? 'Code custom' : name === 'search_target_source' ? 'Sources cible' : 'Sources Odoo'
      const pattern = String(args.pattern ?? '')
      const version = String(args.version ?? '')
      const label = pattern ? `Recherche: ${pattern}` : 'Recherche'
      const detail = version ? `${scope} · v${version}` : scope
      const key = `${name}:${pattern}:${version}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'source', label, detail })
    } else if (name === 'query_odoo' || name === 'count_odoo' || name === 'get_odoo_fields' || name === 'inspect_studio' || name === 'count_source_lines') {
      const model = String(args.model ?? args.scope ?? '')
      const key = `${name}:${model}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: 'tool', label: name, detail: model || undefined })
    }
  }
  return out.slice(-12)
}
