import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { ArrowRightLeft, ArrowUp, Check, CheckCheck, Code, Copy, FileText, Image as ImageIcon, Loader2, Maximize2, Paperclip, Square, Timer, TriangleAlert, X } from 'lucide-react'
import { listProfiles, checkAllSources, getAiProviders, getModelConfig, getModules, getToolConfig } from '../api/client'
import { t } from '../theme'
import PageHeader from '../components/PageHeader'
import AiProviderRequiredModal, { useAiProvidersConfigured } from '../components/AiProviderRequiredModal'
import { Perspective, PerspectiveMode, loadPerspective, savePerspective } from '../components/PerspectiveToggle'
import ConversationContextPanel from '../components/ConversationContextPanel'
import ConversationHistoryPanel from '../components/ConversationHistoryPanel'
import WorkspaceShell from '../components/WorkspaceShell'
import ResponseModal from '../components/ResponseModal'
import SelectionAskMore from '../components/SelectionAskMore'
import ToolCallGroup from '../components/ToolCallGroup'
import Markdown from '../components/Markdown'
import AiSelector from '../components/AiSelector'
import { useWorkspaceContext } from '../components/Layout'
import { PROVIDERS } from '../constants/providers'
import { useUiLanguage } from '../i18n'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MAX_MB,
  ATTACHMENT_MAX_TOTAL_CHARS,
  attachmentMeta,
  attachmentNeedsBase64,
  attachmentPayload,
  defaultMimeType,
  fileKind,
  fileToBase64,
  formatFileSize,
  type AttachmentDraft,
  type AttachmentMeta,
} from '../utils/attachments'
import { extractUsedSkillNames, routedContextFilesWithSource, useResolvedPerspective, type ComplexityMode } from '../utils/aiContext'
import { streamingSignals } from '../utils/streamingSignals'
import { useRefreshProjectContext } from '../utils/refreshProjectContext'
import { copyRichText, copyMarkdown } from '../utils/clipboard'
import { History } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────

interface Profile {
  id: number
  name: string
  odoo_version: string | null
  environments: string | null
  active_env_id: string | null
  company_ids?: string | null
  selected_company_id?: number | null
  technical_complexity?: string | null
}

interface EnvEntry {
  id: string
  name: string
  odoo_version?: string | null
  github_repo?: string | null
}

interface CompanyOption {
  id: number
  name: string
  country_code?: string
  country_name?: string
  currency?: string
}

type SelectorMode = 'version' | 'environment'

interface SideConfig {
  mode: SelectorMode
  version: string
  profileId: number | null
  envId: string | null
}

function parseCompanies(raw?: string | null): CompanyOption[] {
  try { return JSON.parse(raw ?? '[]') as CompanyOption[] } catch { return [] }
}

function activeCompany(profile?: Profile | null): CompanyOption | null {
  if (!profile) return null
  const companies = parseCompanies(profile.company_ids)
  if (companies.length === 0) return null
  const activeId = profile.selected_company_id ?? companies[0]?.id
  return companies.find(c => c.id === activeId) ?? companies[0] ?? null
}

function companyLocalizationLabel(company?: CompanyOption | null) {
  if (!company) return undefined
  const parts = [company.country_code, company.currency].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

function technicalComplexityLabel(raw?: string | null) {
  try {
    const value = JSON.parse(raw ?? '{}')
    return value.label || undefined
  } catch {
    return undefined
  }
}

interface AiEvent {
  type: 'tool_call' | 'tool_result' | 'text' | 'error' | 'warning' | 'done' | 'end'
  name?: string
  args?: Record<string, unknown>
  count?: number
  records?: Record<string, unknown>[]
  content?: string
  msg?: string
  ok?: boolean
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text?: string
  attachments?: AttachmentMeta[]
  events?: AiEvent[]
  loading?: boolean
  timestamp?: number
  startTime?: number
  inputTokens?: number
  outputTokens?: number
}

interface MigSavedConv {
  id: string; title: string
  messages: Message[]
  srcVersion?: string; tgtVersion?: string
  createdAt: number; updatedAt: number
}

// ── Migration history (localStorage) ──────────────────────────────
const LS_MIG_ACTIVE  = 'odoo-migration-active'
const LS_MIG_HISTORY = 'odoo-migration-history'
const LS_MIG_SOURCE  = 'odoo-migration-source'
const LS_MIG_TARGET  = 'odoo-migration-target'

const _EMPTY_SIDE: SideConfig = { mode: 'version', version: '', profileId: null, envId: null }

function migAutoTitle(msgs: Message[]): string {
  const first = msgs.find(m => m.role === 'user')?.text ?? ''
  return first.length > 60 ? first.slice(0, 57) + '…' : first || 'Migration'
}
function _finalizeOrphaned(msgs: Message[]): Message[] {
  return msgs.map(m => {
    if (!m.loading) return m
    const events = m.events ?? []
    const calls   = events.filter(e => e.type === 'tool_call')
    const results = events.filter(e => e.type === 'tool_result')
    // Inject a synthetic tool_result for every tool_call that has no matching result
    const extraResults: AiEvent[] = calls
      .filter(c => !results.find(r => r.name === c.name))
      .map(c => ({ type: 'tool_result' as const, name: c.name, ok: false }))
    return {
      ...m,
      loading: false,
      events: [...events, ...extraResults, { type: 'error' as const, msg: 'Session interrompue — relancez la question.' }],
    }
  })
}
function loadMigActive(): Record<string, Message[]> {
  try {
    const raw: Record<string, Message[]> = JSON.parse(localStorage.getItem(LS_MIG_ACTIVE) ?? '{}')
    const activeKeys = new Set(streamingSignals.getAll().map(([k]) => k))
    const data: Record<string, Message[]> = {}
    let dirty = false
    for (const [k, msgs] of Object.entries(raw)) {
      // Only finalize orphaned loaders when there is no live stream for this key.
      // If a stream is still running (navigated away but not restarted), leave it alone.
      const isLive = activeKeys.has(k)
      const cleaned = isLive ? msgs : _finalizeOrphaned(msgs)
      data[k] = cleaned
      if (!isLive && cleaned !== msgs) dirty = true
    }
    if (dirty) try { localStorage.setItem(LS_MIG_ACTIVE, JSON.stringify(data)) } catch { /* quota */ }
    // Seed the module buffer from localStorage so setMessages can read it even after unmount
    for (const [k, msgs] of Object.entries(data)) {
      if (!_migBuffer.has(k)) _migBuffer.set(k, msgs)
    }
    return data
  } catch { return {} }
}
function persistMigActive(c: Record<string, Message[]>) {
  try { localStorage.setItem(LS_MIG_ACTIVE, JSON.stringify(c)) } catch { /* quota */ }
}
function loadMigHistory(): MigSavedConv[] {
  try { return JSON.parse(localStorage.getItem(LS_MIG_HISTORY) ?? '[]') } catch { return [] }
}
function persistMigHistory(h: MigSavedConv[]) {
  try { localStorage.setItem(LS_MIG_HISTORY, JSON.stringify(h)) } catch { /* quota */ }
}
function loadMigSource(): SideConfig {
  try { return JSON.parse(localStorage.getItem(LS_MIG_SOURCE) ?? 'null') ?? _EMPTY_SIDE } catch { return _EMPTY_SIDE }
}
function loadMigTarget(): SideConfig {
  try { return JSON.parse(localStorage.getItem(LS_MIG_TARGET) ?? 'null') ?? _EMPTY_SIDE } catch { return _EMPTY_SIDE }
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Module-level buffer: survives component unmount during streaming
const _migBuffer = new Map<string, Message[]>()

interface InstalledModule { name?: string; shortdesc?: string; application?: boolean }

// Labels lisibles pour les modules « notables » qu'on aime nommer dans les suggestions.
// Tu peux étoffer cette liste — toute correspondance exacte ou par préfixe est utilisée.
const NOTABLE_MODULE_LABELS: Array<{ match: RegExp; fr: string; en: string }> = [
  { match: /^sale_subscription$/, fr: 'les abonnements (sale_subscription)', en: 'subscriptions (sale_subscription)' },
  { match: /^sale_renting$/, fr: 'la location (sale_renting)', en: 'rentals (sale_renting)' },
  { match: /^sale_loyalty$/, fr: 'la fidélité / promotions (sale_loyalty)', en: 'loyalty / promotions (sale_loyalty)' },
  { match: /^helpdesk(_|$)/, fr: 'le helpdesk', en: 'helpdesk' },
  { match: /^pos(_|$)/, fr: 'le point de vente (PoS)', en: 'point of sale (PoS)' },
  { match: /^website_sale$/, fr: 'l\'e-commerce (website_sale)', en: 'eCommerce (website_sale)' },
  { match: /^mrp_workorder$/, fr: 'les ordres de travail MRP (mrp_workorder)', en: 'MRP work orders (mrp_workorder)' },
  { match: /^mrp(_|$)/, fr: 'la production (MRP)', en: 'manufacturing (MRP)' },
  { match: /^hr_payroll(_|$)/, fr: 'la paie (hr_payroll)', en: 'payroll (hr_payroll)' },
  { match: /^hr_appraisal$/, fr: 'les évaluations RH (hr_appraisal)', en: 'HR appraisals (hr_appraisal)' },
  { match: /^hr_timesheet$/, fr: 'les feuilles de temps (hr_timesheet)', en: 'timesheets (hr_timesheet)' },
  { match: /^hr_expense$/, fr: 'les notes de frais (hr_expense)', en: 'expenses (hr_expense)' },
  { match: /^account_accountant$/, fr: 'la comptabilité complète (account_accountant)', en: 'full accounting (account_accountant)' },
  { match: /^account_followup$/, fr: 'la relance client (account_followup)', en: 'customer follow-ups (account_followup)' },
  { match: /^stock_landed_costs$/, fr: 'les coûts logistiques (stock_landed_costs)', en: 'landed costs (stock_landed_costs)' },
  { match: /^purchase_requisition$/, fr: 'les appels d\'offres achat (purchase_requisition)', en: 'purchase tenders (purchase_requisition)' },
  { match: /^marketing_automation$/, fr: 'le marketing automation', en: 'marketing automation' },
  { match: /^mass_mailing$/, fr: 'les emailings (mass_mailing)', en: 'mass mailings (mass_mailing)' },
  { match: /^project_forecast$/, fr: 'la planification projet (project_forecast)', en: 'project forecast' },
  { match: /^project(_|$)/, fr: 'la gestion de projet', en: 'project management' },
  { match: /^website(_|$)/, fr: 'le site web', en: 'website' },
  { match: /^documents(_|$)/, fr: 'la GED Documents', en: 'Documents module' },
  { match: /^sign$/, fr: 'la signature électronique (sign)', en: 'eSign (sign)' },
  { match: /^iot(_|$)/, fr: 'la box IoT', en: 'IoT box' },
  { match: /^fleet$/, fr: 'la flotte (fleet)', en: 'fleet (fleet)' },
]

const LOCALIZATION_LABELS: Record<string, string> = {
  CH: 'Suisse', FR: 'France', BE: 'Belgique', LU: 'Luxembourg', CA: 'Canada',
  DE: 'Allemagne', ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas', PT: 'Portugal',
  US: 'États-Unis', UK: 'Royaume-Uni', GB: 'Royaume-Uni',
}

const SUGGESTIONS_MIGRATION_TECHNICAL_GENERIC = (src: string, tgt: string) => [
  `Quels champs ont changé sur sale.order entre ${src} et ${tgt} ?`,
  'Comment migrer les vues XML avec attrs= ?',
  'Quelles API Python ont été supprimées ou renommées ?',
  `Analyse les différences de stock.move entre ${src} et ${tgt}`,
]

const SUGGESTIONS_MIGRATION_FUNCTIONAL_GENERIC = (src: string, tgt: string) => [
  `Quelles nouvelles fonctionnalités standard apparaissent en ${tgt} ?`,
  'Quels modules nouveaux pourraient remplacer nos modules custom ?',
  'Quels changements UX/menus impactent les key users ?',
  `Y a-t-il des modules dépréciés ou remplacés entre ${src} et ${tgt} ?`,
]

const SUGGESTIONS_MIGRATION_TECHNICAL_GENERIC_EN = (src: string, tgt: string) => [
  `Which fields changed on sale.order between ${src} and ${tgt}?`,
  'How should we migrate XML views using attrs= ?',
  'Which Python APIs were removed or renamed?',
  `Analyze stock.move differences between ${src} and ${tgt}`,
]

const SUGGESTIONS_MIGRATION_FUNCTIONAL_GENERIC_EN = (src: string, tgt: string) => [
  `Which new standard features appear in ${tgt}?`,
  'Which new modules could replace our custom modules?',
  'Which UX or menu changes will impact key users?',
  `Are there deprecated or replaced modules between ${src} and ${tgt}?`,
]

function buildMigrationSuggestions({
  lang, isFunctional, sourceVersion, targetVersion, projectName, envName,
  modules, complexityMode, repoName, countryCode,
}: {
  lang: 'fr' | 'en'
  isFunctional: boolean
  sourceVersion: string | null
  targetVersion: string | null
  projectName: string | null
  envName: string | null
  modules: InstalledModule[]
  complexityMode: ComplexityMode | null
  repoName: string | null
  countryCode: string | null
}): string[] {
  const src = sourceVersion ?? '?'
  const tgt = targetVersion ?? '?'

  // Étiquette projet : "AlaMaison (Production) 17.0 → 18.0" ou juste version
  const where = projectName
    ? `${projectName}${envName ? ` (${envName})` : ''}`
    : null
  const projectClause = where
    ? (lang === 'fr' ? `sur ${where}` : `on ${where}`)
    : (lang === 'fr' ? 'sur ce projet' : 'on this project')

  // 1) Suggestions ancrées sur les modules « notables » réellement installés.
  const moduleNames = modules.map(m => (m.name ?? '').toLowerCase()).filter(Boolean)
  const installedSet = new Set(moduleNames)
  const notableHits: string[] = []
  for (const rule of NOTABLE_MODULE_LABELS) {
    if (moduleNames.some(n => rule.match.test(n))) {
      const lbl = lang === 'fr' ? rule.fr : rule.en
      notableHits.push(
        lang === 'fr'
          ? `Qu'est-ce qui change pour ${lbl} entre ${src} et ${tgt} ${projectClause} ?`
          : `What changes for ${lbl} between ${src} and ${tgt} ${projectClause}?`
      )
      if (notableHits.length >= 3) break
    }
  }

  // 2) Localisation comptable : repérée via country_code OU module l10n_*
  const l10nMatch = moduleNames.find(n => n.startsWith('l10n_'))
  const countryLabel = countryCode ? (LOCALIZATION_LABELS[countryCode.toUpperCase()] ?? countryCode.toUpperCase()) : null
  const localizationLine = (countryLabel || l10nMatch)
    ? (lang === 'fr'
        ? `Quels impacts sur la localisation comptable${countryLabel ? ` ${countryLabel}` : ''}${l10nMatch ? ` (${l10nMatch})` : ''} entre ${src} et ${tgt} ?`
        : `Which accounting localization impacts${countryLabel ? ` for ${countryLabel}` : ''}${l10nMatch ? ` (${l10nMatch})` : ''} between ${src} and ${tgt}?`)
    : null

  // 3) Studio / dépôt custom — utilise le nom de dépôt s'il existe
  const isStudio = complexityMode === 'studio' || complexityMode === 'studio_dev'
  const isDev = complexityMode === 'dev' || complexityMode === 'studio_dev' || !!repoName
  const repoShort = repoName ? repoName.split('/').slice(-2).join('/').replace(/\.git$/, '') : null
  const studioLine = isStudio
    ? (lang === 'fr'
        ? `Quelles personnalisations Studio ${projectClause} risquent d'être à refaire en ${tgt} ?`
        : `Which Studio customizations ${projectClause} risk breaking on ${tgt}?`)
    : null
  const devLine = isDev
    ? (lang === 'fr'
        ? `Quels modules custom${repoShort ? ` du dépôt ${repoShort}` : ` ${projectClause}`} risquent d'être incompatibles avec ${tgt} ?`
        : `Which custom modules${repoShort ? ` in repo ${repoShort}` : ` ${projectClause}`} are likely incompatible with ${tgt}?`)
    : null

  // 4) Volume installé : signal de couverture (combien d'apps actives)
  const appsCount = modules.filter(m => m.application).length
  const coverageLine = appsCount > 0
    ? (lang === 'fr'
        ? `Établis une checklist de migration ${src} → ${tgt} adaptée aux ${appsCount} apps installées${where ? ` sur ${where}` : ''}`
        : `Build a ${src} → ${tgt} migration checklist tailored to the ${appsCount} apps installed${where ? ` on ${where}` : ''}`)
    : null

  // 5) Profil métier vs technique — orient questions
  const businessTilt = isFunctional
    ? (lang === 'fr'
        ? `Quels changements UX et menus entre ${src} et ${tgt} demandent une formation key-user ${projectClause} ?`
        : `Which UX/menu changes between ${src} and ${tgt} need key-user training ${projectClause}?`)
    : (lang === 'fr'
        ? `Quels modèles ORM (champs renommés, supprimés) ont changé entre ${src} et ${tgt} parmi les apps installées ${projectClause} ?`
        : `Which ORM models (renamed/removed fields) changed between ${src} and ${tgt} among installed apps ${projectClause}?`)

  // 6) Fallback générique uniquement si la liste contextuelle est mince
  const generic = lang === 'en'
    ? (isFunctional ? SUGGESTIONS_MIGRATION_FUNCTIONAL_GENERIC_EN(src, tgt) : SUGGESTIONS_MIGRATION_TECHNICAL_GENERIC_EN(src, tgt))
    : (isFunctional ? SUGGESTIONS_MIGRATION_FUNCTIONAL_GENERIC(src, tgt) : SUGGESTIONS_MIGRATION_TECHNICAL_GENERIC(src, tgt))

  // Note: installedSet was computed for future filters; reference here so TS doesn't whine.
  void installedSet

  return [
    ...notableHits,
    localizationLine,
    studioLine,
    devLine,
    businessTilt,
    coverageLine,
    ...generic,
  ]
    .filter((v, i, arr): v is string => typeof v === 'string' && v.trim().length > 0 && arr.indexOf(v) === i)
    .slice(0, 5)
}

const migrationCopy = {
  fr: {
    title: 'Migration',
    description: 'Analysez et planifiez vos migrations Odoo en comparant deux versions ou environnements.',
    clearConversation: 'Effacer la conversation',
    newAnalysis: 'Nouvelle analyse',
    noProvider: 'Aucun fournisseur IA configuré — configurez une clé API dans les Paramètres',
    repoActive: 'Dépôt projet source actif',
    source: 'Source (version actuelle)',
    sourceShort: 'Source',
    target: 'Cible (version de destination)',
    targetShort: 'Cible',
    editSelection: 'Modifier',
    emptyTitle: 'Assistant Migration Odoo',
    emptyText: 'Sélectionnez une version source et une version cible ci-dessus, puis posez votre question sur la migration.',
    configureProvider: 'Configurez un fournisseur IA dans les Paramètres',
    selectVersions: 'Sélectionnez une version source et une version cible ci-dessus',
    placeholder: (source?: string | null, target?: string | null) => `Posez une question sur la migration ${source ?? '?'} → ${target ?? '?'}… (Entrée pour envoyer)`,
    removeAttachment: (name: string) => `Retirer ${name}`,
    analyzeAttachments: 'Analyse les pièces jointes pour préparer la migration.',
    attach: 'Joindre un fichier',
    stop: 'Arrêter la génération',
    send: 'Envoyer (Entrée)',
    meta: 'Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne',
    files: 'fichier(s)',
    truncated: 'texte tronqué côté serveur',
    recommended: 'Recommandé',
  },
  en: {
    title: 'Migration',
    description: 'Analyze and plan Odoo migrations by comparing two versions or environments.',
    clearConversation: 'Clear conversation',
    newAnalysis: 'New analysis',
    noProvider: 'No AI provider configured. Configure an API key in Settings',
    repoActive: 'Source project repository active',
    source: 'Source (current version)',
    sourceShort: 'Source',
    target: 'Target (destination version)',
    targetShort: 'Target',
    editSelection: 'Edit',
    emptyTitle: 'Odoo Migration Assistant',
    emptyText: 'Select a source version and target version above, then ask your migration question.',
    configureProvider: 'Configure an AI provider in Settings',
    selectVersions: 'Select a source version and target version above',
    placeholder: (source?: string | null, target?: string | null) => `Ask a question about the ${source ?? '?'} → ${target ?? '?'} migration… (Enter to send)`,
    removeAttachment: (name: string) => `Remove ${name}`,
    analyzeAttachments: 'Analyze the attachments to prepare the migration.',
    attach: 'Attach a file',
    stop: 'Stop generation',
    send: 'Send (Enter)',
    meta: 'Enter to send · Shift+Enter for a new line',
    files: 'file(s)',
    truncated: 'text truncated server-side',
    recommended: 'Recommended',
  },
}

// ── Helpers ───────────────────────────────────────────────────────

function installedVersions(sourcesData: Record<string, { installed: boolean }> | undefined): string[] {
  if (!sourcesData) return []
  return Object.keys(sourcesData)
    .filter(k => !k.endsWith('-enterprise') && sourcesData[k]?.installed)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
}

function sourcesInstalled(version: string | null, sourcesData: Record<string, { installed: boolean }> | undefined): boolean {
  if (!version || !sourcesData) return false
  return !!(sourcesData[version]?.installed || sourcesData[`${version}-enterprise`]?.installed)
}

function profileEnvs(profile: Profile | null): EnvEntry[] {
  if (!profile) return []
  try { return JSON.parse(profile.environments ?? '[]') as EnvEntry[] } catch { return [] }
}

function resolveVersion(cfg: SideConfig, profiles: Profile[]): string | null {
  if (cfg.mode === 'version') return cfg.version || null
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return null
  if (cfg.envId) {
    const env = profileEnvs(p).find(e => e.id === cfg.envId)
    return env?.odoo_version ?? p.odoo_version
  }
  return p.odoo_version
}

function resolveLabel(cfg: SideConfig, profiles: Profile[]): string {
  if (cfg.mode === 'version') return cfg.version ? `Odoo ${cfg.version}` : '—'
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return '—'
  const envs = profileEnvs(p)
  const env = envs.find(e => e.id === cfg.envId)
  const ver = env?.odoo_version ?? p.odoo_version ?? '?'
  return `${p.name}${env ? ` · ${env.name}` : ''} (${ver})`
}

function resolveRepoPath(cfg: SideConfig, profiles: Profile[]): { profileId: number | null; envId: string | null } {
  if (cfg.mode !== 'environment') return { profileId: null, envId: null }
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return { profileId: null, envId: null }
  const envs = profileEnvs(p)
  const envId = cfg.envId ?? (envs[0]?.id ?? null)
  const env = envs.find(e => e.id === envId)
  if (!env?.github_repo) return { profileId: null, envId: null }
  return { profileId: p.id, envId }
}

function resolveRepoName(cfg: SideConfig, profiles: Profile[]): string | null {
  if (cfg.mode !== 'environment') return null
  const p = profiles.find(p => p.id === cfg.profileId)
  if (!p) return null
  const envs = profileEnvs(p)
  const envId = cfg.envId ?? (envs[0]?.id ?? null)
  return envs.find(e => e.id === envId)?.github_repo ?? null
}

function cmpVersion(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  return parseFloat(a) - parseFloat(b)
}

function fmtTime(ts?: number) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
}

function fmtTokens(input?: number, output?: number) {
  if (!input && !output) return null
  const total = (input ?? 0) + (output ?? 0)
  const parts = []
  if (input)  parts.push(`↑${input.toLocaleString()}`)
  if (output) parts.push(`↓${output.toLocaleString()}`)
  return `${total.toLocaleString()} tokens (${parts.join(' · ')})`
}

// ── SideSelector ──────────────────────────────────────────────────

function SideSelector({
  label, cfg, onChange, versions, profiles, sourcesData, minVersion,
}: {
  label: string
  cfg: SideConfig
  onChange: (c: SideConfig) => void
  versions: string[]
  profiles: Profile[]
  sourcesData: Record<string, { installed: boolean }> | undefined
  minVersion?: string | null
}) {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? {
      modeVersion: 'Odoo version',
      modeProject: 'Project',
      version: 'Version',
      choose: '— Choose —',
      noHigher: 'No higher version available. Download a newer version in Sources.',
      noSources: 'No sources downloaded. Go to Sources to download a version.',
      hiddenVersion: (n: number) => `${n} version${n > 1 ? 's' : ''} hidden — target must be higher than source.`,
      project: 'Project',
      env: 'Environment',
      defaultEnv: '— Default (project version) —',
      hiddenEnv: (n: number) => `${n} environment${n > 1 ? 's' : ''} hidden — version ≤ source.`,
      noHigherEnv: 'No higher-version environment in this project.',
      sourcesInstalled: (v: string) => `Sources v${v} installed`,
      sourcesMissing: (v: string) => `Sources v${v} not installed`,
    }
    : {
      modeVersion: 'Version Odoo',
      modeProject: 'Projet',
      version: 'Version',
      choose: '— Choisir —',
      noHigher: 'Aucune version supérieure disponible — téléchargez une version plus récente dans Sources.',
      noSources: 'Aucune source téléchargée. Allez dans Sources pour télécharger une version.',
      hiddenVersion: (n: number) => `${n} version${n > 1 ? 's' : ''} masquée${n > 1 ? 's' : ''} — la cible doit être supérieure à la source.`,
      project: 'Projet',
      env: 'Environnement',
      defaultEnv: '— Défaut (version projet) —',
      hiddenEnv: (n: number) => `${n} environnement${n > 1 ? 's' : ''} masqué${n > 1 ? 's' : ''} — version ≤ source.`,
      noHigherEnv: 'Aucun environnement de version supérieure dans ce projet.',
      sourcesInstalled: (v: string) => `Sources v${v} installées`,
      sourcesMissing: (v: string) => `Sources v${v} non installées`,
    }
  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: `1px solid ${t.border}`, borderRadius: t.radius,
    background: t.bgCard, color: t.text, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: t.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
  }

  const selectedProfile = profiles.find(p => p.id === cfg.profileId) ?? null
  const allEnvs = profileEnvs(selectedProfile)
  // Filter: if minVersion is set, only show strictly higher versions/envs
  const allowedVersions = minVersion
    ? versions.filter(v => cmpVersion(v, minVersion) > 0)
    : versions
  const allowedEnvs = minVersion
    ? allEnvs.filter(e => !e.odoo_version || cmpVersion(e.odoo_version, minVersion) > 0)
    : allEnvs
  const hiddenVersions = versions.length - allowedVersions.length
  const hiddenEnvs     = allEnvs.length - allowedEnvs.length

  const version = resolveVersion(cfg, profiles)
  const installed = sourcesInstalled(version, sourcesData)
  const hasCommunity  = version ? (sourcesData?.[version]?.installed === true) : false
  const hasEnterprise = version ? (sourcesData?.[`${version}-enterprise`]?.installed === true) : false
  const editionLabel  = hasCommunity && hasEnterprise ? 'C+E' : hasCommunity ? 'C' : hasEnterprise ? 'E' : ''

  return (
    <div style={{
      flex: 1, padding: '16px 18px', background: t.bgCard,
      border: `1px solid ${t.border}`, borderRadius: t.radiusLg,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: t.text, marginBottom: 14 }}>{label}</div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['version', 'environment'] as SelectorMode[]).map(m => (
          <button key={m} onClick={() => onChange({ ...cfg, mode: m })} style={{
            flex: 1, padding: '6px 10px', fontSize: 12, fontWeight: 600,
            background: cfg.mode === m ? `var(--brand, ${t.brand})` : t.bgMuted,
            color: cfg.mode === m ? t.brandContrast : t.muted,
            border: `1px solid ${cfg.mode === m ? `var(--brand, ${t.brand})` : t.border}`,
            borderRadius: t.radius, cursor: 'pointer', transition: 'all .15s',
          }}>
            {m === 'version' ? c.modeVersion : c.modeProject}
          </button>
        ))}
      </div>

      {cfg.mode === 'version' ? (
        <div>
          <div style={labelStyle}>{c.version}</div>
          <select value={cfg.version} onChange={e => onChange({ ...cfg, version: e.target.value })} style={selectStyle}>
            <option value="">{c.choose}</option>
            {allowedVersions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {allowedVersions.length === 0 && versions.length > 0 ? (
            <div style={{ fontSize: 11, color: t.danger ?? '#dc2626', marginTop: 6 }}>
              {c.noHigher}
            </div>
          ) : versions.length === 0 ? (
            <div style={{ fontSize: 11, color: t.muted, marginTop: 6 }}>
              {c.noSources}
            </div>
          ) : hiddenVersions > 0 ? (
            <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
              {c.hiddenVersion(hiddenVersions)}
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={labelStyle}>{c.project}</div>
            <select
              value={cfg.profileId ?? ''}
              onChange={e => onChange({ ...cfg, profileId: e.target.value ? Number(e.target.value) : null, envId: null })}
              style={selectStyle}
            >
              <option value="">{c.choose}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {allEnvs.length > 0 && (
            <div>
              <div style={labelStyle}>{c.env}</div>
              <select value={cfg.envId ?? ''} onChange={e => onChange({ ...cfg, envId: e.target.value || null })} style={selectStyle}>
                <option value="">{c.defaultEnv}</option>
                {allowedEnvs.map(e => <option key={e.id} value={e.id}>{e.name}{e.odoo_version ? ` (${e.odoo_version})` : ''}</option>)}
              </select>
              {hiddenEnvs > 0 && (
                <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>
                  {c.hiddenEnv(hiddenEnvs)}
                </div>
              )}
              {allowedEnvs.length === 0 && allEnvs.length > 0 && (
                <div style={{ fontSize: 11, color: t.danger ?? '#dc2626', marginTop: 4 }}>
                  {c.noHigherEnv}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Version + sources badge */}
      {version && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: `var(--brand, ${t.brand})`, fontWeight: 600 }}>
            Odoo {version}
          </span>
          <span title={installed ? c.sourcesInstalled(version) : c.sourcesMissing(version)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: t.radiusFull,
              background: installed ? `${t.success}15` : '#fef3c7',
              color: installed ? t.success : '#b45309',
              border: `1px solid ${installed ? `${t.success}40` : '#f59e0b'}`,
            }}>
            {installed ? <Check size={10} /> : <TriangleAlert size={10} />}
            {installed ? `Sources${editionLabel ? ` ${editionLabel}` : ''} ✓` : 'Sources ⚠'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Message rendering ─────────────────────────────────────────────

function UserBubble({ text, attachments, timestamp }: { text: string; attachments?: AttachmentMeta[]; timestamp?: number }) {
  const time = fmtTime(timestamp)
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--brand)', color: 'var(--brand-contrast)',
          borderRadius: `${t.radiusLg} ${t.radiusLg} 4px ${t.radiusLg}`,
          fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {text}
          {attachments && attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {attachments.map(att => (
                <span key={`${att.name}-${att.size}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 7px', borderRadius: 999,
                  background: 'color-mix(in srgb, var(--brand-contrast) 14%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--brand-contrast) 22%, transparent)',
                  color: 'var(--brand-contrast)', fontSize: 11, fontWeight: 650, maxWidth: 260,
                }}>
                  {att.kind === 'pdf' || att.kind === 'office' ? <FileText size={12} /> : att.kind === 'image' ? <ImageIcon size={12} /> : <Paperclip size={12} />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                  <span style={{ opacity: .72, flexShrink: 0 }}>{formatFileSize(att.size)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {time && (
          <div style={{ textAlign: 'right', fontSize: 10, color: t.muted, marginTop: 3, paddingRight: 2 }}>
            {time}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantBubble({ events, loading, provider, timestamp, startTime, inputTokens, outputTokens, onAskMore }: {
  events: AiEvent[]; loading?: boolean; provider: string
  timestamp?: number; startTime?: number; inputTokens?: number; outputTokens?: number
  onAskMore?: (selectedText: string) => void
}) {
  const lang = useUiLanguage()
  const c = lang === 'en'
    ? { copyTitle: 'Copy the formatted answer (paste keeps styling)', copyMd: 'Copy MD', copyMdTitle: 'Copy the raw Markdown text', analyzing: 'Analyzing results and drafting the answer…', thinking: 'Analyzing…', tokens: 'Tokens used (input ↑ + output ↓)', copied: 'Copied!', copy: 'Copy', responseTime: 'Response time', expand: 'Expand', expandTitle: 'Expand the answer to fullscreen' }
    : { copyTitle: 'Copier la réponse mise en forme (collage avec styles)', copyMd: 'Copier MD', copyMdTitle: 'Copier le texte Markdown brut', analyzing: 'Analyse des résultats et rédaction de la réponse…', thinking: 'Analyse en cours…', tokens: 'Tokens utilisés (entrée ↑ + sortie ↓)', copied: 'Copié !', copy: 'Copier', responseTime: 'Temps de réponse', expand: 'Agrandir', expandTitle: 'Agrandir la réponse en plein écran' }
  const prov = PROVIDERS.find(p => p.id === provider)
  const textEvt    = events.find(e => e.type === 'text')
  const toolEvents = events.filter(e => e.type === 'tool_call' || e.type === 'tool_result')
  const errorEvt   = events.find(e => e.type === 'error')
  const time   = fmtTime(timestamp)
  const tokens = fmtTokens(inputTokens, outputTokens)
  const elapsed = (timestamp && startTime && timestamp > startTime)
    ? (() => { const s = (timestamp - startTime) / 1000; return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` })()
    : null
  const [copied, setCopied] = useState<'' | 'rich' | 'md'>('')
  const [expanded, setExpanded] = useState(false)
  const markdownRef = useRef<HTMLDivElement>(null)

  function copyStyled() {
    if (!textEvt?.content) return
    copyRichText(markdownRef.current, textEvt.content).then(() => {
      setCopied('rich')
      setTimeout(() => setCopied(''), 2000)
    })
  }

  function copyMd() {
    if (!textEvt?.content) return
    copyMarkdown(textEvt.content).then(() => {
      setCopied('md')
      setTimeout(() => setCopied(''), 2000)
    })
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: prov ? `${prov.color}20` : t.bgMuted,
        color: prov?.color ?? t.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
        marginTop: 4,
      }}>
        {prov?.label[0] ?? 'AI'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {toolEvents.length > 0 && <ToolCallGroup events={toolEvents} />}

        {textEvt?.content && (
          <div style={{
            position: 'relative',
            background: t.bgCard, border: `1px solid ${t.border}`,
            borderRadius: `4px ${t.radiusLg} ${t.radiusLg} ${t.radiusLg}`,
            padding: '12px 16px', fontSize: 14, lineHeight: 1.7, color: t.text,
          }}>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                title={c.expandTitle}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, border: `1px solid ${t.border}`,
                  borderRadius: t.radius, background: t.bg, cursor: 'pointer',
                  color: t.muted, opacity: 0.8, transition: 'opacity .15s, color .15s',
                }}
              >
                <Maximize2 size={13} />
              </button>
              <button
                type="button"
                onClick={copyStyled}
                title={c.copyTitle}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, border: `1px solid ${t.border}`,
                  borderRadius: t.radius, background: t.bg, cursor: 'pointer',
                  color: copied === 'rich' ? t.success : t.muted, opacity: 0.8,
                  transition: 'opacity .15s, color .15s',
                }}
              >
                {copied === 'rich' ? <CheckCheck size={13} /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                onClick={copyMd}
                title={c.copyMdTitle}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, border: `1px solid ${t.border}`,
                  borderRadius: t.radius, background: t.bg, cursor: 'pointer',
                  color: copied === 'md' ? t.success : t.muted, opacity: 0.8,
                  transition: 'opacity .15s, color .15s',
                }}
              >
                {copied === 'md' ? <CheckCheck size={13} /> : <Code size={13} />}
              </button>
            </div>
            <div ref={markdownRef}><Markdown text={textEvt.content} /></div>
          </div>
        )}

        {expanded && textEvt?.content && (
          <ResponseModal
            onClose={() => setExpanded(false)}
            onAskMore={selected => {
              setExpanded(false)
              onAskMore?.(selected)
            }}
            askMoreLabel={lang === 'fr' ? 'Plus de détail' : 'More detail'}
            askMoreDisabled={loading}
          >
            <Markdown text={textEvt.content} />
          </ResponseModal>
        )}

        {errorEvt && (
          <div style={{
            background: t.dangerBg, border: `1px solid ${t.danger}40`,
            borderRadius: t.radius, padding: '10px 14px', fontSize: 13, color: t.danger,
          }}>
            ⚠ {errorEvt.msg}
          </div>
        )}

        {loading && !textEvt && !errorEvt && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginTop: toolEvents.length > 0 ? 10 : 0,
            padding: '8px 14px', background: t.bgMuted,
            border: `1px solid ${t.border}`, borderRadius: 0,
            fontSize: 13, color: t.textSub,
          }}>
            <Loader2 size={15} className="creator-spin" style={{ color: 'var(--brand-fg)' }} />
            <span style={{ fontWeight: 500 }}>
              {toolEvents.length > 0 ? c.analyzing : c.thinking}
            </span>
          </div>
        )}

        {(time || elapsed || tokens || textEvt?.content) && !loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 10, color: t.muted, paddingLeft: 2 }}>
            {time && <span>{time}</span>}
            {elapsed && <span title={c.responseTime} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Timer size={10} />{elapsed}</span>}
            {tokens && <span title={c.tokens}>{tokens}</span>}
            {textEvt?.content && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  title={c.expandTitle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    border: `1px solid ${t.border}`, borderRadius: t.radius,
                    background: 'transparent', cursor: 'pointer', padding: '2px 7px',
                    color: t.muted, fontSize: 10, fontWeight: 600, transition: 'color .15s',
                  }}
                >
                  <Maximize2 size={11} /> {c.expand}
                </button>
                <button
                  type="button"
                  onClick={copyStyled}
                  title={c.copyTitle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    border: `1px solid ${t.border}`, borderRadius: t.radius,
                    background: 'transparent', cursor: 'pointer', padding: '2px 7px',
                    color: copied === 'rich' ? t.success : t.muted, fontSize: 10, fontWeight: 600,
                    transition: 'color .15s',
                  }}
                >
                  {copied === 'rich' ? <CheckCheck size={11} /> : <Copy size={11} />}
                  {copied === 'rich' ? c.copied : c.copy}
                </button>
                <button
                  type="button"
                  onClick={copyMd}
                  title={c.copyMdTitle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    border: `1px solid ${t.border}`, borderRadius: t.radius,
                    background: 'transparent', cursor: 'pointer', padding: '2px 7px',
                    color: copied === 'md' ? t.success : t.muted, fontSize: 10, fontWeight: 600,
                    transition: 'color .15s',
                  }}
                >
                  {copied === 'md' ? <CheckCheck size={11} /> : <Code size={11} />}
                  {copied === 'md' ? c.copied : c.copyMd}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Migration() {
  const lang = useUiLanguage()
  const { contextOpen } = useWorkspaceContext()
  const location = useLocation()
  const c = migrationCopy[lang]
  const { data: profilesData } = useQuery({ queryKey: ['profiles'],     queryFn: listProfiles })
  const { data: sourcesData }  = useQuery({ queryKey: ['sources-all'],  queryFn: checkAllSources, staleTime: 30_000 })
  const { data: provData }     = useQuery({ queryKey: ['ai-providers'], queryFn: getAiProviders })
  const { data: modelCfg }     = useQuery({ queryKey: ['model-config'], queryFn: getModelConfig })
  const profiles: Profile[] = profilesData?.data ?? []
  const allProviders: Record<string, boolean> = provData?.data ?? {}
  const modelConfig: Record<string, string[]> = modelCfg?.data ?? {}
  const srcStatus: Record<string, { installed: boolean }> = sourcesData?.data ?? {}

  const configuredProviders = PROVIDERS
    .filter(p => allProviders[p.id])
    .map(p => {
      const enabled = modelConfig[p.id]
      if (!enabled || enabled.length === 0) return p
      return { ...p, models: p.models.filter(m => enabled.includes(m.id)) }
    })
    .filter(p => p.models.length > 0)

  const versions = installedVersions(sourcesData?.data)

  const [provider,  setProvider]  = useState('')
  const [modelId,   setModelId]   = useState('')

  const activeProvider  = provider  || configuredProviders[0]?.id  || ''
  const activeProvDef   = configuredProviders.find(p => p.id === activeProvider)
  const activeModelId   = modelId   || activeProvDef?.models[0]?.id || ''

  const switchProvider = (id: string) => {
    const p = configuredProviders.find(pv => pv.id === id)!
    setProvider(id)
    setModelId(p.models.find(m => m.recommended)?.id ?? p.models[0].id)
  }

  const [source, setSourceState] = useState<SideConfig>(() => loadMigSource())
  const [target, setTargetState] = useState<SideConfig>(() => loadMigTarget())
  const setSource = (cfg: SideConfig) => {
    setSourceState(cfg)
    try { localStorage.setItem(LS_MIG_SOURCE, JSON.stringify(cfg)) } catch { /* quota */ }
  }
  const setTarget = (cfg: SideConfig) => {
    setTargetState(cfg)
    try { localStorage.setItem(LS_MIG_TARGET, JSON.stringify(cfg)) } catch { /* quota */ }
  }

  useEffect(() => {
    const state = location.state as { profileId?: number; envId?: string } | null
    if (!state?.profileId || profiles.length === 0) return
    const profile = profiles.find(p => p.id === state.profileId)
    if (!profile) return
    const envs = profileEnvs(profile)
    const envId = state.envId ?? profile.active_env_id ?? envs[0]?.id ?? null
    setSource({ mode: 'environment', version: '', profileId: profile.id, envId })
    window.history.replaceState({}, '')
  }, [location.state, profiles])

  const [perspectiveMode, setPerspectiveState] = useState<PerspectiveMode>(() => loadPerspective('migration', 'auto'))
  const setPerspective = (p: PerspectiveMode) => { setPerspectiveState(p); savePerspective('migration', p) }

  const [migConvs, setMigConvs] = useState<Record<string, Message[]>>(() => loadMigActive())
  const [migHistory, setMigHistory] = useState<MigSavedConv[]>(() => loadMigHistory())
  const [showHistory, setShowHistory] = useState(false)

  // Session key: derived from source+target config once versions are known
  // Updated lazily — kept in ref so stream callbacks always see current value
  const migKeyRef = useRef<string>('')

  const [input,     setInput]   = useState('')
  const [streaming, setStreaming] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [disabledTools, setDisabledTools] = useState<string[]>([])
  useEffect(() => { getToolConfig().then(r => setDisabledTools(r.data?.disabled_tools ?? [])).catch(() => {}) }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef  = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const assistantRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())
  const [isScrolled, setIsScrolled] = useState(false)
  const streamingRef = useRef(false)

  // Keep streamingRef in sync so the scroll handler never reads stale state
  useEffect(() => { streamingRef.current = streaming }, [streaming])

  // Collapse top bar on scroll. During streaming, allow collapsing when the user
  // moves down, but avoid auto-expanding back up while new tokens arrive.
  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const onScroll = () => {
      const top = el.scrollTop
      setIsScrolled(prev => {
        if (streamingRef.current && top <= 80) return prev
        if (!prev && top > 80) return true
        if (prev && top < 20) return false
        return prev
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  const sourceVersion = resolveVersion(source, profiles)
  const targetVersion = resolveVersion(target, profiles)

  // Session key — regenerated when source/target change
  const migKey = [
    source.mode === 'environment' ? `p${source.profileId}-e${source.envId}` : (sourceVersion || 'src'),
    target.mode === 'environment' ? `p${target.profileId}-e${target.envId}` : (targetVersion || 'tgt'),
  ].join('__')
  migKeyRef.current = migKey

  // On migKey change: merge buffer into React state + restore streaming indicator if still in progress
  useEffect(() => {
    const buffered = _migBuffer.get(migKey)
    if (buffered && buffered.length > 0) {
      setMigConvs(prev => {
        const existing = prev[migKey] ?? []
        if (buffered.length > existing.length) return { ...prev, [migKey]: buffered }
        return prev
      })
    }
    // Restore streaming state if a stream is still running for this key
    const sig = streamingSignals.getAll().find(([k]) => k === migKey)?.[1]
    if (sig?.status === 'streaming') setStreaming(true)
  }, [migKey])

  const messages: Message[] = migConvs[migKey] ?? []

  const setMessages = (fn: (prev: Message[]) => Message[]) => {
    const key = migKeyRef.current
    // Read from module buffer — works even when component is unmounted
    const cur = _migBuffer.get(key) ?? []
    const next = fn(cur)
    // Update buffer synchronously (survives unmount — React drops setState after unmount but not this)
    _migBuffer.set(key, next)
    // Persist to localStorage synchronously (also survives unmount)
    try {
      const all = JSON.parse(localStorage.getItem(LS_MIG_ACTIVE) ?? '{}')
      all[key] = next
      localStorage.setItem(LS_MIG_ACTIVE, JSON.stringify(all))
    } catch { /* quota */ }
    // Update React state — no-op after unmount, but that's fine: buffer + LS are already updated
    setMigConvs(prev => ({ ...prev, [key]: next }))
  }

  const perspectivePrompt = input.trim() || [...messages].reverse().find(m => m.role === 'user')?.text || ''
  const perspective = useResolvedPerspective(perspectiveMode, perspectivePrompt, 'business_analyst')

  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id ?? null
  useEffect(() => {
    if (!lastAssistantId) return
    const el = assistantRefs.current.get(lastAssistantId)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [lastAssistantId])

  // During streaming, keep scrolling to bottom unless the user has scrolled up
  useEffect(() => {
    if (!streaming) return
    const el = messageListRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 120) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  // Subscribe to streaming signals so stream-dot indicators re-render
  const [, _rerenderSig] = useState(0)
  useEffect(() => streamingSignals.subscribe(() => _rerenderSig(n => n + 1)), [])

  // Track mount state so we know if the user is watching when a stream ends
  const isMountedRef = useRef(true)
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false } }, [])

  // Clear done signal as soon as user opens this page / switches to this key
  useEffect(() => {
    const sig = streamingSignals.getAll().find(([k]) => k === migKey)?.[1]
    if (sig?.status === 'done') streamingSignals.clear(migKey)
  }, [migKey])

  const sourceLabel   = resolveLabel(source, profiles)
  const targetLabel   = resolveLabel(target, profiles)
  const sourceRepo    = resolveRepoPath(source, profiles)
  const sourceRepoName = resolveRepoName(source, profiles)
  const sourceProfile = source.mode === 'environment' ? profiles.find(p => p.id === source.profileId) : undefined
  const sourceEnv = sourceProfile ? profileEnvs(sourceProfile).find(e => e.id === source.envId) : undefined
  const handleRefreshContext = useRefreshProjectContext(sourceProfile?.id ?? null, sourceEnv?.id ?? null)
  const sourceCompany = activeCompany(sourceProfile)
  const sourceLocalization = companyLocalizationLabel(sourceCompany)
  const sourceComplexity = technicalComplexityLabel(sourceProfile?.technical_complexity)
  const sourceComplexityParsed = (() => { try { return JSON.parse(sourceProfile?.technical_complexity ?? '{}') } catch { return {} } })()
  const sourceComplexityMode = (sourceComplexityParsed?.mode as ComplexityMode | undefined) ?? null
  const sourceRepoIsCloned = ((sourceComplexityParsed?.dev?.repositories ?? []) as Array<{ cloned: boolean }>).some(r => r.cloned)
  const contextFilesWithSource = routedContextFilesWithSource({
    prompt: perspectivePrompt,
    perspective,
    version: sourceVersion,
    targetVersion,
    migration: true,
    complexityMode: sourceComplexityMode,
  })
  const contextFiles = contextFilesWithSource.map(f => f.name)
  const contextFileSources = new Map(contextFilesWithSource.map(f => [f.name, f.source]))
  const skillsUsed = extractUsedSkillNames(messages.flatMap(m => m.events ?? []))
  const srcComm   = sourceVersion ? (srcStatus[sourceVersion]?.installed === true) : false
  const srcEnt    = sourceVersion ? (srcStatus[`${sourceVersion}-enterprise`]?.installed === true) : false
  const tgtComm   = targetVersion ? (srcStatus[targetVersion]?.installed === true) : false
  const tgtEnt    = targetVersion ? (srcStatus[`${targetVersion}-enterprise`]?.installed === true) : false
  const srcEdition = srcComm && srcEnt ? 'C+E' : srcComm ? 'C' : srcEnt ? 'E' : ''
  const tgtEdition = tgtComm && tgtEnt ? 'C+E' : tgtComm ? 'C' : tgtEnt ? 'E' : ''

  const conversationSources = [
    sourceVersion && (srcComm || srcEnt) ? `Sources Odoo ${sourceVersion}${srcEdition ? ` ${srcEdition}` : ''}` : null,
    targetVersion && (tgtComm || tgtEnt) ? `Sources cible ${targetVersion}${tgtEdition ? ` ${tgtEdition}` : ''}` : null,
    sourceRepoName && sourceRepoIsCloned ? sourceRepoName.split('/').slice(-2).join('/').replace(/\.git$/, '') : null,
  ].filter(Boolean) as string[]

  // Auto-reset target when it becomes invalid (version ≤ new source)
  useEffect(() => {
    if (!sourceVersion || !targetVersion) return
    if (cmpVersion(targetVersion, sourceVersion) <= 0) {
      setTarget({ ...target, version: '', envId: null })
    }
  }, [sourceVersion])

  const ready = configuredProviders.length > 0 && !!(sourceVersion || targetVersion)

  const saveToMigHistory = () => {
    if (messages.filter(m => !m.loading).length === 0) return
    const conv: MigSavedConv = {
      id: Date.now().toString(),
      title: migAutoTitle(messages),
      messages: messages.filter(m => !m.loading),
      srcVersion: sourceVersion ?? undefined,
      tgtVersion: targetVersion ?? undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setMigHistory(prev => {
      const updated = [conv, ...prev].slice(0, 50)
      persistMigHistory(updated)
      return updated
    })
  }

  const resumeConv = (conv: MigSavedConv) => {
    if (messages.length > 0) saveToMigHistory()
    setMessages(() => conv.messages)
    if (conv.srcVersion) setSource({ mode: 'version', version: conv.srcVersion, profileId: null, envId: null })
    if (conv.tgtVersion) setTarget({ mode: 'version', version: conv.tgtVersion, profileId: null, envId: null })
    setShowHistory(false)
    setStreaming(false)
  }

  const deleteConv = (id: string) => {
    setMigHistory(prev => {
      const updated = prev.filter(c => c.id !== id)
      persistMigHistory(updated)
      return updated
    })
  }

  const resetConversation = () => {
    abortRef.current?.abort()
    if (messages.length > 0) saveToMigHistory()
    setMessages(() => [])
    _migBuffer.delete(migKey)
    streamingSignals.clear(migKey)
    setAttachments([])
    setStreaming(false)
  }

  const appendEvent = (msgId: string, evt: AiEvent) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, events: [...(m.events ?? []), evt] } : m
    ))
  }

  const addAttachmentError = (file: File, error: string) => {
    const kind = fileKind(file) ?? 'text'
    setAttachments(prev => [
      ...prev,
      {
        id: `${Date.now()}-${file.name}-error`,
        name: file.name,
        mime_type: file.type,
        size: file.size,
        kind,
        status: 'error',
        error,
      },
    ])
  }

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length || streaming) return

    const currentReady = attachments.filter(a => a.status === 'ready').length
    const slots = ATTACHMENT_MAX_FILES - currentReady
    if (slots <= 0) {
      addAttachmentError(files[0], `Maximum ${ATTACHMENT_MAX_FILES} fichiers par message`)
      return
    }

    for (const file of files.slice(0, slots)) {
      const kind = fileKind(file)
      if (!kind) {
        addAttachmentError(file, 'Format non supporté')
        continue
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        addAttachmentError(file, `Fichier supérieur à ${ATTACHMENT_MAX_MB} MB`)
        continue
      }

      try {
        const base = {
          id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          mime_type: defaultMimeType(file, kind),
          size: file.size,
          kind,
          status: 'ready' as const,
        }
        const draft: AttachmentDraft = attachmentNeedsBase64(kind)
          ? { ...base, content_base64: await fileToBase64(file) }
          : { ...base, text: await file.text() }
        setAttachments(prev => [...prev.filter(a => a.status === 'ready'), draft].slice(0, ATTACHMENT_MAX_FILES))
      } catch (err) {
        addAttachmentError(file, err instanceof Error ? err.message : 'Lecture impossible')
      }
    }

    if (files.length > slots) {
      addAttachmentError(files[slots], `Maximum ${ATTACHMENT_MAX_FILES} fichiers par message`)
    }
  }

  const readyAttachments = attachments.filter(a => a.status === 'ready')
  const attachmentChars = readyAttachments.reduce((sum, a) => sum + (a.text?.length ?? 0), 0)

  const sendWithText = async (text: string, attached: AttachmentDraft[] = []) => {
    if ((!text.trim() && attached.length === 0) || streaming || !ready) return

    const now = Date.now()
    const attachedMeta = attached.map(attachmentMeta)
    const userMsg: Message      = { id: String(now),     role: 'user',      text, attachments: attachedMeta, timestamp: now }
    const assistantMsg: Message = { id: String(now + 1), role: 'assistant', events: [], loading: true, startTime: now }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    streamingSignals.set(migKeyRef.current, {
      status: 'streaming',
      label: `Migration ${sourceVersion ?? '?'} → ${targetVersion ?? '?'}`,
      pageKey: 'migration',
    })

    const history = messages
      .filter(m => !m.loading)
      .map(m => ({
        role: m.role,
        content: m.role === 'user'
          ? (m.text ?? '')
          : (m.events?.find(e => e.type === 'text')?.content ?? ''),
      }))
      .filter(m => m.content)
    history.push({ role: 'user', content: text })

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const body: Record<string, unknown> = {
      provider: activeProvider,
      model: activeModelId || undefined,
      messages: history,
      migration_mode: true,
      version: sourceVersion || undefined,
      perspective,
      disabled_tools: disabledTools,
    }

    if (source.mode === 'environment' && source.profileId) {
      body.profile_id = source.profileId
      body.active_env_id = source.envId || undefined
    }
    if (target.mode === 'environment' && target.profileId) {
      body.target_profile_id = target.profileId
      body.target_env_id = target.envId || undefined
    } else if (targetVersion) {
      body.target_version = targetVersion
    }
    const cleanAttachments = attached.map(attachmentPayload)
    if (cleanAttachments.length > 0) {
      body.attachments = cleanAttachments
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
        appendEvent(assistantMsg.id, { type: 'error', msg: err.detail ?? `HTTP ${res.status}` })
        return
      }
      if (attached.length > 0) setAttachments([])

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let evt: AiEvent
          try { evt = JSON.parse(line.slice(6)) } catch { continue }
          if (evt.type === 'done') {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id
              ? { ...m, timestamp: Date.now(), inputTokens: evt.input_tokens, outputTokens: evt.output_tokens }
              : m
            ))
          }
          if (evt.type !== 'end') appendEvent(assistantMsg.id, evt)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        streamingSignals.clear(migKeyRef.current)
        return
      }
      appendEvent(assistantMsg.id, { type: 'error', msg: String(err) })
    } finally {
      setStreaming(false)
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id ? { ...m, loading: false } : m
      ))
      // If user is watching right now, no need for the "done" indicator — clear directly
      if (isMountedRef.current) streamingSignals.clear(migKeyRef.current)
      else streamingSignals.done(migKeyRef.current)
    }
  }

  const send = () => {
    const text = input.trim() || (readyAttachments.length > 0 ? c.analyzeAttachments : '')
    if (text || readyAttachments.length > 0) sendWithText(text, readyAttachments)
  }

  // Selection → "more detail": follow-up prompt on the selected excerpt.
  const askMoreOnSelection = (selected: string) => {
    if (streaming) return
    const prompt = lang === 'fr'
      ? `Donne-moi plus de détail sur ce point précis de ta réponse précédente :\n\n« ${selected} »`
      : `Give me more detail on this specific point from your previous answer:\n\n"${selected}"`
    sendWithText(prompt)
  }

  const showSuggestions = messages.length === 0 && ready && !input.trim()
  const isFunctionalProfile = perspective === 'support' || perspective === 'business_analyst'

  const { data: modulesData } = useQuery({
    queryKey: ['project-modules', sourceProfile?.id],
    queryFn: () => getModules(sourceProfile!.id),
    enabled: !!sourceProfile && messages.length === 0,
    staleTime: 5 * 60_000,
  })
  const installedModules: InstalledModule[] = useMemo(
    () => (modulesData?.data?.modules ?? []) as InstalledModule[],
    [modulesData],
  )
  const suggestionList = useMemo(
    () => buildMigrationSuggestions({
      lang,
      isFunctional: isFunctionalProfile,
      sourceVersion,
      targetVersion,
      projectName: sourceProfile?.name ?? null,
      envName: sourceEnv?.name ?? null,
      modules: installedModules,
      complexityMode: sourceComplexityMode,
      repoName: sourceRepoIsCloned ? sourceRepoName : null,
      countryCode: sourceCompany?.country_code ?? null,
    }),
    [lang, isFunctionalProfile, sourceVersion, targetVersion, sourceProfile?.name, sourceEnv?.name, installedModules, sourceComplexityMode, sourceRepoName, sourceRepoIsCloned, sourceCompany?.country_code],
  )

  const { configured: aiConfigured, loading: aiProvLoading } = useAiProvidersConfigured()
  const [aiGuardDismissed, setAiGuardDismissed] = useState(false)

  // Slots passed to WorkspaceShell. Defining them here keeps the return JSX
  // readable and the locals close to the state/handlers they capture.
  const migrationComposer = (
    <div className="assistant-composer">
      <div
        className={`assistant-composer-inner${draggingFiles ? ' is-dragging' : ''}`}
        onDragOver={e => {
          e.preventDefault()
          if (!streaming) setDraggingFiles(true)
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraggingFiles(false)
        }}
        onDrop={e => {
          e.preventDefault()
          setDraggingFiles(false)
          addFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files) addFiles(e.target.files)
            e.currentTarget.value = ''
          }}
        />
        {showSuggestions && (
          <div className="assistant-composer-suggestions">
            {suggestionList.map(s => (
              <button key={s} type="button" onClick={() => setInput(s)} className="assistant-composer-suggestion">
                {s}
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="assistant-attachments">
            {attachments.map(att => (
              <div key={att.id} className={`assistant-attachment-chip${att.status === 'error' ? ' is-error' : ''}`} title={att.error ?? att.name}>
                {att.kind === 'pdf' || att.kind === 'office' ? <FileText size={13} /> : att.kind === 'image' ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                <span className="assistant-attachment-name">{att.name}</span>
                <span className="assistant-attachment-size">{formatFileSize(att.size)}</span>
                {att.status === 'error' && <span className="assistant-attachment-error">{att.error}</span>}
                <button type="button" onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} aria-label={c.removeAttachment(att.name)}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={
            configuredProviders.length === 0
              ? c.configureProvider
              : !sourceVersion && !targetVersion
              ? c.selectVersions
              : c.placeholder(sourceVersion, targetVersion)
          }
          disabled={!ready || streaming}
          rows={3}
          className="assistant-textarea"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={streaming || readyAttachments.length >= ATTACHMENT_MAX_FILES}
          title={c.attach}
          className="assistant-attach-button"
        >
          <Paperclip size={16} />
        </button>
        <button
          onClick={streaming ? () => abortRef.current?.abort() : send}
          disabled={!streaming && ((!input.trim() && readyAttachments.length === 0) || !ready)}
          title={streaming ? c.stop : c.send}
          className={`assistant-send-button${streaming ? ' is-streaming' : ''}`}
        >
          {streaming ? <Square size={15} /> : <ArrowUp size={18} />}
        </button>
      </div>
      <div className="assistant-composer-meta">
        <span>
          {c.meta}
          {readyAttachments.length > 0 && ` · ${readyAttachments.length}/${ATTACHMENT_MAX_FILES} ${c.files}`}
          {attachmentChars > ATTACHMENT_MAX_TOTAL_CHARS && ` · ${c.truncated}`}
        </span>
        {(sourceVersion || targetVersion) && (
          <span>{sourceLabel} → {targetLabel}</span>
        )}
      </div>
    </div>
  )

  const migrationContextPanel = contextOpen ? (
    <ConversationContextPanel
      mode={perspectiveMode}
      effectivePerspective={perspective}
      onModeChange={setPerspective}
      disabled={streaming}
      provider={activeProvDef?.label}
      model={activeProvDef?.models.find(m => m.id === activeModelId)?.label}
      project={sourceProfile?.name}
      environment={sourceEnv?.name}
      company={sourceCompany?.name}
      countryCode={sourceCompany?.country_code}
      localization={sourceLocalization}
      complexity={sourceComplexity}
      version={sourceVersion}
      targetVersion={targetVersion}
      repo={sourceRepoName}
	      contextFiles={contextFiles}
	      contextFileSources={contextFileSources}
	      skillsUsed={skillsUsed}
	      sources={conversationSources}
      attachments={readyAttachments.map(a => a.name)}
      onRefresh={handleRefreshContext}
    />
  ) : null

  const migrationHistoryPanel = showHistory ? (
    <ConversationHistoryPanel
      rows={migHistory.map(conv => ({
        id: conv.id,
        title: conv.title,
        updatedAt: conv.updatedAt,
        messageCount: conv.messages.filter(m => m.role === 'user').length,
        badge: (conv.srcVersion || conv.tgtVersion)
          ? `${conv.srcVersion ?? '?'} → ${conv.tgtVersion ?? '?'}`
          : null,
        _raw: conv,
      }))}
      onClose={() => setShowHistory(false)}
      onResume={(item) => resumeConv((item as unknown as { _raw: MigSavedConv })._raw)}
      onDelete={(item) => deleteConv(String(item.id))}
      formatDate={(v) => fmtDate(Number(v))}
    />
  ) : null

  return (
    <WorkspaceShell
      className={`migration-shell${isScrolled ? ' is-scrolled' : ''}`}
      mainClassName="migration-content-row"
      chatClassName="migration-main-column"
      header={<>
        <AiProviderRequiredModal
          open={!aiProvLoading && !aiConfigured && !aiGuardDismissed}
          onClose={() => setAiGuardDismissed(true)}
        />
        <PageHeader title={c.title} description={c.description} />
        <SelectionAskMore
          containerRef={messageListRef}
          onAsk={askMoreOnSelection}
          label={lang === 'fr' ? 'Plus de détail' : 'More detail'}
          disabled={streaming}
        />
      </>}
      composer={migrationComposer}
      contextPanel={migrationContextPanel}
      historyPanel={migrationHistoryPanel}
    >
      {/* Control bar — framed in the same context card as the Assistant page */}
      <div className="assistant-context">
      <div className="assistant-control-row">
        {configuredProviders.length === 0 ? (
          <span style={{ fontSize: 13, color: t.muted }}>
            {c.noProvider}
          </span>
        ) : (
          <>
            <AiSelector
              providers={configuredProviders}
              provider={activeProvider}
              modelId={activeModelId}
              switchProvider={switchProvider}
              setModelId={setModelId}
            />

            <div className="assistant-control-spacer" />

            <div className="assistant-control-group">
              <button
                onClick={resetConversation}
                title={c.clearConversation}
                className="assistant-soft-action"
              >
                <ArrowRightLeft size={13} />
                <span>{c.newAnalysis}</span>
              </button>

              {(messages.length > 0 || migHistory.length > 0) && (
                <button
                  onClick={() => setShowHistory(h => !h)}
                  title={lang === 'fr' ? `Historique (${migHistory.length})` : `History (${migHistory.length})`}
                  className={`assistant-soft-action${showHistory ? ' is-active' : ''}`}
                >
                  <History size={13} />
                  <span>{lang === 'fr' ? 'Historique' : 'History'} ({migHistory.length})</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
      </div>

      {/* Side selectors */}
      {(() => {
        const sig = streamingSignals.getAll().find(([k]) => k === migKey)?.[1]
        if (!sig) return null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, color: sig.status === 'streaming' ? 'var(--th-streaming-fg)' : 'var(--th-success-fg, #6dcf85)', fontWeight: 600 }}>
            <span className={`stream-dot stream-dot--${sig.status}`} />
            {sig.status === 'streaming'
              ? (lang === 'fr' ? 'Réponse en cours…' : 'Generating response…')
              : (lang === 'fr' ? 'Réponse disponible' : 'Response ready')}
          </div>
        )
      })()}
      <div className="migration-side-compact">
        <span className="migration-side-compact-label">{c.sourceShort}</span>
        <strong title={sourceLabel}>{sourceLabel}</strong>
        <span className="migration-side-compact-version">{sourceVersion ?? '?'}</span>
        <span className="migration-side-compact-arrow">→</span>
        <span className="migration-side-compact-label">{c.targetShort}</span>
        <strong title={targetLabel}>{targetLabel}</strong>
        <span className="migration-side-compact-version">{targetVersion ?? '?'}</span>
        <button
          type="button"
          className="migration-side-compact-edit"
          onClick={() => {
            setIsScrolled(false)
            messageListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          {c.editSelection}
        </button>
      </div>
      <div className="migration-side-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexShrink: 0 }}>
        <SideSelector
          label={c.source}
          cfg={source} onChange={setSource}
          versions={versions} profiles={profiles} sourcesData={srcStatus}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '18px 4px', color: t.muted, fontSize: 20, flexShrink: 0,
        }}>
          →
        </div>
        <SideSelector
          label={c.target}
          cfg={target} onChange={setTarget}
          versions={versions} profiles={profiles} sourcesData={srcStatus}
          minVersion={sourceVersion}
        />
      </div>

      {/* Messages */}
      <div ref={messageListRef} className="assistant-message-list">
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center', color: t.muted, maxWidth: 520 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⇄</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: t.text, marginBottom: 8 }}>
                {c.emptyTitle}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                {c.emptyText}
              </div>
            </div>
          </div>
        )}

        {messages.map(m =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text ?? ''} attachments={m.attachments} timestamp={m.timestamp} />
          ) : (
            <div
              key={m.id}
              ref={el => { assistantRefs.current.set(m.id, el) }}
              style={{ scrollMarginTop: 8 }}
            >
              <AssistantBubble
                events={m.events ?? []}
                loading={m.loading}
                provider={activeProvider}
                timestamp={m.timestamp}
                startTime={m.startTime}
                inputTokens={m.inputTokens}
                outputTokens={m.outputTokens}
                onAskMore={askMoreOnSelection}
              />
            </div>
          )
        )}

        <div ref={bottomRef} />
      </div>

    </WorkspaceShell>
  )
}
