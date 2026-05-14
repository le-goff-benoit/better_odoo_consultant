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

const SUPPORT_TERMS = [
  'incident', 'bloqué', 'bloque', 'blocked', 'erreur', 'error', 'bug', 'problème', 'probleme',
  'urgence', 'urgent', 'corriger', 'fix', 'workaround', 'contournement', 'ticket', 'sla',
]

const BA_TERMS = [
  'process', 'processus', 'métier', 'metier', 'fonctionnel', 'business', 'utilisateur',
  'workflow', 'formation', 'recette', 'uat', 'besoin', 'règle de gestion', 'regle de gestion',
  'compte-rendu', 'compte rendu', 'meeting', 'réunion', 'reunion',
]

const ARCH_TERMS = [
  'architecture', 'architecte', 'sécurité', 'securite', 'performance', 'scalabilité',
  'scalability', 'urbanisation', 'dépendance', 'dependance', 'migration strategy',
  'trajectoire', 'cible', 'risque', 'risques',
]

const DEV_TERMS = [
  'code', 'python', 'xml', 'js', 'javascript', 'typescript', 'sql', 'modèle', 'modele',
  'model', 'field', 'champ', 'method', 'méthode', 'classe', 'class ', '_inherit', '_name',
  'api.', 'override', 'manifest', '__manifest__', 'traceback', 'stack trace',
]

const MEETING_TERMS = ['compte-rendu', 'compte rendu', 'meeting minute', 'réunion', 'reunion', 'pv de réunion', 'pv de reunion']
const STUDIO_TERMS = ['studio', 'x_studio', 'personnalisation', 'customisation', 'champ custom', 'modèle custom', 'modele custom', 'inspect_studio']
const VERSION_TERMS = ['version', 'migration', 'upgrade', 'nouveauté', 'nouveaute', 'changement', 'différence', 'difference', 'breaking', 'deprecated', 'dépréci', 'depreci', 'renommé', 'renomme', 'compatib', 'odoo 15', 'odoo 16', 'odoo 17', 'odoo 18', 'odoo 19']

function hasAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term))
}

export function inferPerspective(text: string, fallback: Perspective = 'developer'): Perspective {
  const normalized = text.toLocaleLowerCase()
  if (!normalized.trim()) return fallback
  if (hasAny(normalized, SUPPORT_TERMS)) return 'support'
  if (hasAny(normalized, ARCH_TERMS)) return 'architect'
  if (hasAny(normalized, DEV_TERMS)) return 'developer'
  if (hasAny(normalized, BA_TERMS)) return 'business_analyst'
  return fallback
}

export function resolvePerspective(mode: PerspectiveMode, text: string, fallback: Perspective = 'developer'): Perspective {
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
