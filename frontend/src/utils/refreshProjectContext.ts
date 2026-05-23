import { useQueryClient } from '@tanstack/react-query'
import { refreshProjectContext } from '../api/client'
import { useUiLanguage } from '../i18n'

type StepStatus = 'ok' | 'error' | 'skipped' | 'empty'
interface StepResult { status?: StepStatus; error?: string; companies?: number; level?: string; head?: string; action?: string; reason?: string; github_repo?: string; uid?: number; chars?: number }
interface RefreshResult {
  access?: StepResult | null
  repo?: StepResult | null
  localization?: StepResult | null
  complexity?: StepResult | null
  context?: StepResult | null
}

/** Returns an `onRefresh` callback for ConversationContextPanel that pulls the
 * custom repo + recomputes localization + complexity for the given profile.
 * Invalidates the `profiles` query on success so the panel re-renders with
 * fresh values. */
export function useRefreshProjectContext(profileId: number | null | undefined, envId?: string | null) {
  const qc = useQueryClient()
  const lang = useUiLanguage()
  if (!profileId) return undefined
  return async () => {
    const res = await refreshProjectContext(profileId, envId)
    const data = (res.data ?? {}) as RefreshResult
    qc.invalidateQueries({ queryKey: ['profiles'] })
    qc.invalidateQueries({ queryKey: ['profile'] })
    qc.invalidateQueries({ queryKey: ['context-files-meta'] })
    return summarize(data, lang === 'en' ? 'en' : 'fr')
  }
}

function summarize(data: RefreshResult, lang: 'fr' | 'en'): string {
  const parts: string[] = []
  const t = lang === 'en'
    ? {
      accessOk: 'access', accessErr: 'access failed',
      repoOk: 'repo pulled', repoSkip: 'repo not cloned', repoErr: 'repo failed',
      localOk: 'localization', localErr: 'localization failed',
      cxOk: 'complexity', cxErr: 'complexity failed',
      ctxOk: 'context', ctxSkip: 'context skipped (no AI key)', ctxErr: 'context failed',
    }
    : {
      accessOk: 'accès', accessErr: 'échec accès',
      repoOk: 'dépôt à jour', repoSkip: 'dépôt non cloné', repoErr: 'échec dépôt',
      localOk: 'localisation', localErr: 'échec localisation',
      cxOk: 'complexité', cxErr: 'échec complexité',
      ctxOk: 'contexte regénéré', ctxSkip: 'contexte ignoré (pas de clé IA)', ctxErr: 'échec contexte',
    }
  if (data.access) {
    if (data.access.status === 'ok') parts.push(t.accessOk)
    else if (data.access.status === 'error') parts.push(t.accessErr)
  }
  if (data.repo) {
    if (data.repo.status === 'ok') parts.push(`${t.repoOk}${data.repo.head ? ` @${data.repo.head}` : ''}`)
    else if (data.repo.status === 'skipped') parts.push(t.repoSkip)
    else if (data.repo.status === 'error') parts.push(t.repoErr)
  }
  if (data.localization) {
    if (data.localization.status === 'ok') {
      const n = data.localization.companies
      parts.push(`${t.localOk}${n ? ` (${n})` : ''}`)
    } else if (data.localization.status === 'error') parts.push(t.localErr)
  }
  if (data.complexity) {
    if (data.complexity.status === 'ok') {
      parts.push(`${t.cxOk}${data.complexity.level ? `: ${data.complexity.level}` : ''}`)
    } else if (data.complexity.status === 'error') parts.push(t.cxErr)
  }
  if (data.context) {
    if (data.context.status === 'ok') parts.push(t.ctxOk)
    else if (data.context.status === 'skipped') parts.push(t.ctxSkip)
    else if (data.context.status === 'error') parts.push(t.ctxErr)
  }
  return parts.length
    ? '✓ ' + parts.join(' · ')
    : (lang === 'en' ? 'Nothing to refresh' : 'Rien à rafraîchir')
}
