export interface ModelDef {
  id: string
  label: string
  desc: string
  tags?: string[]
  recommended?: boolean
  /** Famille d'origine (vendor) du modèle. Utile pour grouper les listes
   * GitHub Models / Copilot qui agrègent OpenAI + Anthropic + Mistral + …
   * Pour les providers mono-vendor (Claude/OpenAI/Gemini), laisser
   * undefined : la carte du provider n'affichera pas de sous-en-tête. */
  family?: ModelFamily
}

export type ModelFamily =
  | 'OpenAI'
  | 'Anthropic'
  | 'Google'
  | 'Mistral'
  | 'Meta Llama'
  | 'Microsoft Phi'
  | 'DeepSeek'
  | 'xAI Grok'
  | 'Cohere'
  | 'AI21'
  | 'Autres'

/**
 * Devine la famille d'un modèle à partir de son id. Sert au grouping UI
 * pour les IDs **live-only** que GitHub Models ou Copilot retournent et
 * qui ne figurent pas dans la liste statique.
 *
 * Les préfixes/marqueurs sont volontairement larges pour rattraper les
 * variantes (`Mistral-Large-2411`, `mistral-large-2407`, `mistral_small`).
 * Ordre des tests : on commence par les plus spécifiques (o-series et
 * gpt-* renvoient `OpenAI`, claude-* renvoie `Anthropic`, etc.).
 */
export function inferFamily(id: string): ModelFamily {
  const lo = id.toLowerCase()
  if (lo.startsWith('gpt-') || /^o\d/.test(lo) || lo.includes('openai') || lo.startsWith('text-embedding-')) return 'OpenAI'
  if (lo.startsWith('claude') || lo.includes('anthropic')) return 'Anthropic'
  if (lo.startsWith('gemini') || lo.startsWith('text-bison') || lo.startsWith('palm')) return 'Google'
  if (lo.startsWith('mistral') || lo.startsWith('mixtral') || lo.startsWith('ministral') || lo.startsWith('codestral')) return 'Mistral'
  if (lo.startsWith('llama') || lo.startsWith('meta-llama') || lo.includes('llama-')) return 'Meta Llama'
  if (lo.startsWith('phi-') || lo.startsWith('phi3') || lo.startsWith('phi4')) return 'Microsoft Phi'
  if (lo.startsWith('deepseek')) return 'DeepSeek'
  if (lo.startsWith('grok')) return 'xAI Grok'
  if (lo.startsWith('cohere') || lo.startsWith('command-')) return 'Cohere'
  if (lo.startsWith('ai21') || lo.startsWith('jamba')) return 'AI21'
  return 'Autres'
}

export type ProviderDef = { id: string; label: string; color: string; models: ModelDef[] }

/**
 * Providers dont les modèles disponibles sont fetchés en live depuis leur API
 * (cf. 0.98.1). Pour ces providers, la liste statique sert de fallback et
 * l'utilisateur peut cocher des IDs absents du catalogue local — ces IDs sont
 * légitimes et doivent être synthétisés en sortie de `buildConfiguredProviders`.
 *
 * Pour les autres providers (OpenAI, Anthropic, Gemini) la liste statique est
 * la source de vérité : un ID coché qui n'y figure plus est forcément un
 * vestige obsolète (modèle retiré du catalogue, ex. `gpt-5.5` jamais valide
 * cf. fix v0.99.1) et doit être silencieusement écarté plutôt que synthétisé.
 */
export const LIVE_FETCH_PROVIDERS: ReadonlySet<string> = new Set(['github', 'copilot'])

/**
 * Compute the list of providers visible in Assistant / Migration / Creator,
 * filtered by configured API keys AND by the user's enabled-model selection.
 *
 * Comportement :
 * - Provider absent de `allProviders` ou avec valeur falsy → exclu.
 * - Pas de `modelConfig` sauvegardé pour ce provider, ou liste vide → on
 *   garde la liste statique complète (compatibilité historique).
 * - Sinon :
 *   - Pour les providers à live fetch (cf. {@link LIVE_FETCH_PROVIDERS}) :
 *     `models = ∪(modèles statiques cochés, IDs cochés synthétisés en
 *     {id, label: id, desc: '', family: inferFamily(id)})`.
 *   - Pour les autres providers : `models = modèles statiques cochés`
 *     uniquement. Les IDs inconnus sont écartés (probablement périmés).
 * - Provider final avec `models.length === 0` → exclu.
 */
export function buildConfiguredProviders(
  allProviders: Record<string, boolean>,
  modelConfig: Record<string, string[]>,
): ProviderDef[] {
  return PROVIDERS
    .filter(p => allProviders[p.id])
    .map(p => {
      const enabled = modelConfig[p.id]
      if (!enabled || enabled.length === 0) return p
      const known = p.models.filter(m => enabled.includes(m.id))
      if (!LIVE_FETCH_PROVIDERS.has(p.id)) return { ...p, models: known }
      const knownIds = new Set(p.models.map(m => m.id))
      const synthetic: ModelDef[] = enabled
        .filter(id => !knownIds.has(id))
        .map(id => ({ id, label: id, desc: '', family: inferFamily(id) }))
      return { ...p, models: [...known, ...synthetic] }
    })
    .filter(p => p.models.length > 0)
}

export const PROVIDERS: { id: string; label: string; color: string; models: ModelDef[] }[] = [
  {
    id: 'claude', label: 'Claude', color: '#D97706',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', recommended: true,
        desc: 'Meilleur rapport qualité/prix selon Anthropic — développement, analyse et génération de contenu',
        tags: ['usage quotidien', 'développement', 'analyse'] },
      { id: 'claude-opus-4-7', label: 'Opus 4.7',
        desc: 'Modèle le plus puissant d\'Anthropic — raisonnement avancé, recherche approfondie, tâches complexes',
        tags: ['analyse complexe', 'recherche', 'raisonnement'] },
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',
        desc: 'Le plus rapide et économique d\'Anthropic — questions simples, classification, résumés',
        tags: ['rapide', 'économique', 'questions simples'] },
    ],
  },
  {
    id: 'openai', label: 'GPT', color: '#16A34A',
    models: [
      // IDs verrouillés sur le catalogue réel exposé par /v1/models. Les entrées
      // doivent être accessibles via /v1/chat/completions — éviter les
      // extrapolations de version futures non publiées (cf. fix v0.99.1).
      // ── Génération GPT-5 ──
      { id: 'gpt-5', label: 'GPT-5',
        desc: 'GPT-5 — modèle phare OpenAI, raisonnement et code, très grand contexte',
        tags: ['puissant', 'raisonnement', 'code'] },
      { id: 'gpt-5-mini', label: 'GPT-5 mini',
        desc: 'GPT-5 mini — version rapide et plus économique de GPT-5',
        tags: ['rapide', 'économique'] },
      // ── GPT-4o (recommandé par défaut : largement accessible et stable) ──
      { id: 'gpt-4o', label: 'GPT-4o', recommended: true,
        desc: 'GPT-4o — modèle multimodal stable, accessible sur tous les plans payants OpenAI',
        tags: ['usage quotidien', 'multimodal', 'polyvalent'] },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini',
        desc: 'GPT-4o mini — rapide et économique pour les tâches simples ou en volume',
        tags: ['rapide', 'économique'] },
      // ── GPT-4.1 ──
      { id: 'gpt-4.1', label: 'GPT-4.1',
        desc: 'GPT-4.1 — excellent suivi d\'instructions, contexte 1M, polyvalent',
        tags: ['polyvalent', 'long contexte'] },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini',
        desc: 'GPT-4.1 mini — version légère de GPT-4.1',
        tags: ['rapide', 'économique'] },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano',
        desc: 'GPT-4.1 nano — ultra-léger pour les tâches simples à fort volume',
        tags: ['rapide', 'économique', 'volume'] },
      // ── O-series (raisonnement) ──
      { id: 'o3', label: 'o3',
        desc: 'o3 — modèle de raisonnement OpenAI, analyse approfondie et problèmes multi-étapes',
        tags: ['raisonnement', 'puissant'] },
      { id: 'o3-mini', label: 'o3 mini',
        desc: 'o3 mini — raisonnement économique, code et maths',
        tags: ['raisonnement', 'économique'] },
      { id: 'o4-mini', label: 'o4 mini',
        desc: 'o4 mini — raisonnement compact nouvelle génération',
        tags: ['raisonnement', 'code', 'économique'] },
    ],
  },
  {
    id: 'gemini', label: 'Gemini', color: '#2563EB',
    models: [
      // IDs vérifiés sur generativelanguage.googleapis.com/v1beta/models.
      // gemini-1.5-* est en cours de sunset Google ; gemini-2.5-pro est
      // le flagship courant, 2.0-flash reste très utilisé en production.
      { id: 'gemini-2.5-pro', label: '2.5 Pro', recommended: true,
        desc: 'Gemini 2.5 Pro — flagship Google, raisonnement et très long contexte',
        tags: ['puissant', 'raisonnement', 'long contexte'] },
      { id: 'gemini-2.5-flash', label: '2.5 Flash',
        desc: 'Gemini 2.5 Flash — rapide et équilibré, excellent pour l\'usage quotidien',
        tags: ['rapide', 'usage quotidien'] },
      { id: 'gemini-2.0-flash', label: '2.0 Flash',
        desc: 'Gemini 2.0 Flash — rapide, efficace, très bon pour l\'appel d\'outils',
        tags: ['rapide', 'outils', 'économique'] },
      { id: 'gemini-2.0-flash-lite', label: '2.0 Flash Lite',
        desc: 'Gemini 2.0 Flash Lite — ultra-économique pour les tâches en volume',
        tags: ['rapide', 'économique', 'volume'] },
    ],
  },
  {
    id: 'copilot', label: 'Copilot', color: '#6e40c9',
    // Liste statique = fallback quand /api/ai/copilot/models est inaccessible.
    // Depuis 0.98.1 la liste live override : limiter aux IDs réellement
    // proposés par api.githubcopilot.com/models pour éviter toute confusion
    // (cf. fix v0.99.1 — pas d'IDs hallucinés en fallback).
    models: [
      // ── OpenAI via Copilot ──
      { id: 'gpt-4o',                     label: 'GPT-4o',           recommended: true,
        desc: 'GPT-4o polyvalent via Copilot — choix par défaut le plus stable',
        tags: ['usage quotidien', 'polyvalent'] },
      { id: 'gpt-4o-mini',                label: 'GPT-4o mini',
        desc: 'Rapide et économique via Copilot',
        tags: ['rapide', 'économique'] },
      { id: 'gpt-5',                      label: 'GPT-5',
        desc: 'GPT-5 via Copilot — modèle phare OpenAI',
        tags: ['puissant', 'polyvalent'] },
      { id: 'gpt-5-mini',                 label: 'GPT-5 mini',
        desc: 'GPT-5 mini via Copilot',
        tags: ['rapide', 'économique'] },
      { id: 'o1',                         label: 'o1',
        desc: 'o1 via Copilot — raisonnement avancé',
        tags: ['raisonnement', 'puissant'] },
      { id: 'o1-mini',                    label: 'o1 mini',
        desc: 'o1 mini via Copilot — raisonnement économique',
        tags: ['raisonnement', 'économique'] },
      { id: 'o3-mini',                    label: 'o3 mini',
        desc: 'o3 mini via Copilot — raisonnement nouvelle génération',
        tags: ['raisonnement', 'économique'] },
      // ── Anthropic via Copilot ──
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet',
        desc: 'Claude 3.5 Sonnet (oct. 2024) via Copilot — référence stable',
        tags: ['développement', 'analyse'] },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet',
        desc: 'Claude 3.7 Sonnet — raisonnement approfondi et réponse rapide',
        tags: ['développement', 'raisonnement'] },
      { id: 'claude-sonnet-4-5',          label: 'Claude Sonnet 4.5',
        desc: 'Claude Sonnet 4.5 — quatrième génération Anthropic',
        tags: ['développement', 'analyse'] },
      { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6',
        desc: 'Claude Sonnet 4.6 — Sonnet d\'Anthropic disponible via Copilot',
        tags: ['usage quotidien', 'développement'] },
      { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7',
        desc: 'Claude Opus 4.7 — le plus puissant d\'Anthropic via Copilot',
        tags: ['analyse complexe', 'recherche'] },
      { id: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5',
        desc: 'Claude Haiku 4.5 — rapide et économique via Copilot',
        tags: ['rapide', 'économique'] },
      // ── Google via Copilot ──
      { id: 'gemini-2.5-pro',             label: 'Gemini 2.5 Pro',
        desc: 'Gemini 2.5 Pro via Copilot — flagship Google, grand contexte',
        tags: ['contexte long', 'analyse'] },
      // ── xAI via Copilot ──
      { id: 'grok-code-fast-1',           label: 'Grok Code Fast',
        desc: 'xAI Grok Code — spécialisé compréhension et génération de code',
        tags: ['développement', 'rapide'] },
    ],
  },
  {
    id: 'github', label: 'GitHub', color: '#24292f',
    models: [
      // ── OpenAI via GitHub Models ──
      { id: 'gpt-5',                         label: 'GPT-5', recommended: true,
        desc: 'GPT-5 via GitHub Models — modèle phare OpenAI, inclus dans GitHub Free/Pro',
        tags: ['puissant', 'polyvalent'] },
      { id: 'gpt-5-mini',                    label: 'GPT-5 mini',
        desc: 'GPT-5 mini — version rapide et économique de GPT-5 via GitHub',
        tags: ['rapide', 'économique'] },
      { id: 'gpt-5-nano',                    label: 'GPT-5 nano',
        desc: 'GPT-5 nano — ultra-léger, faible latence via GitHub Models',
        tags: ['rapide', 'économique'] },
      { id: 'gpt-4o',                        label: 'GPT-4o',
        desc: 'GPT-4o — modèle multimodal OpenAI de génération précédente via GitHub',
        tags: ['polyvalent'] },
      { id: 'gpt-4o-mini',                   label: 'GPT-4o mini',
        desc: 'GPT-4o mini — rapide et économique via GitHub Models',
        tags: ['rapide', 'économique'] },
      { id: 'o3',                            label: 'o3',
        desc: 'o3 — modèle de raisonnement OpenAI via GitHub (Copilot Pro requis)',
        tags: ['raisonnement', 'puissant'] },
      { id: 'o3-mini',                       label: 'o3 mini',
        desc: 'o3 mini — raisonnement OpenAI économique via GitHub',
        tags: ['raisonnement', 'économique'] },
      { id: 'o4-mini',                       label: 'o4 mini',
        desc: 'o4 mini — raisonnement compact nouvelle génération via GitHub (Copilot Pro requis)',
        tags: ['raisonnement', 'code'] },
      // ── Anthropic ──
      { id: 'claude-3-7-sonnet-20250219',    label: 'Claude 3.7 Sonnet',
        desc: 'Claude 3.7 Sonnet via GitHub Models — raisonnement approfondi',
        tags: ['développement', 'raisonnement'] },
      { id: 'claude-3-5-sonnet-20241022',    label: 'Claude 3.5 Sonnet',
        desc: 'Claude 3.5 Sonnet via GitHub Models — développement et analyse',
        tags: ['développement'] },
      // ── Meta Llama ──
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', label: 'Llama 4 Scout',
        desc: 'Llama 4 Scout — dernière génération Meta, multimodal, contexte 10M tokens',
        tags: ['open source', 'multimodal', 'contexte long'] },
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick',
        desc: 'Llama 4 Maverick — très performant, contexte 1M, meilleur Llama open source',
        tags: ['open source', 'puissant'] },
      { id: 'Llama-3.1-405B-Instruct',       label: 'Llama 3.1 405B',
        desc: 'Llama 3.1 405B — grand modèle open source Meta, très performant',
        tags: ['open source'] },
      // ── xAI Grok ──
      { id: 'grok-3',                        label: 'Grok-3',
        desc: 'Grok-3 de xAI — très performant pour le raisonnement et l\'analyse via GitHub',
        tags: ['raisonnement', 'analyse'] },
      { id: 'grok-3-mini',                   label: 'Grok-3 mini',
        desc: 'Grok-3 mini — version économique de Grok-3 via GitHub Models',
        tags: ['rapide', 'économique'] },
      // ── DeepSeek ──
      { id: 'DeepSeek-R1',                   label: 'DeepSeek R1',
        desc: 'DeepSeek R1 — modèle de raisonnement open source très performant, alternatif à o3',
        tags: ['raisonnement', 'open source'] },
      { id: 'DeepSeek-R1-0528',              label: 'DeepSeek R1 (05/28)',
        desc: 'DeepSeek R1 (version mai 2028) — améliorations raisonnement et instruction following',
        tags: ['raisonnement', 'open source'] },
      // ── Mistral ──
      { id: 'mistral-large-2407',             label: 'Mistral Large',
        desc: 'Mistral Large — modèle européen, efficace et polyvalent via GitHub Models',
        tags: ['polyvalent'] },
      // ── Microsoft Phi ──
      { id: 'Phi-4',                          label: 'Phi-4',
        desc: 'Phi-4 de Microsoft — petite taille mais très performant pour le raisonnement et le code',
        tags: ['compact', 'code', 'raisonnement'] },
      { id: 'Phi-3.5-mini-instruct',          label: 'Phi-3.5 mini',
        desc: 'Phi-3.5 mini — ultra-compact de Microsoft, rapide pour les tâches simples',
        tags: ['rapide', 'économique'] },
    ],
  },
]
