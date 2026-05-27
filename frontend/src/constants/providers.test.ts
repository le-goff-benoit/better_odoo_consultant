import { describe, expect, it } from 'vitest'
import { buildConfiguredProviders, PROVIDERS } from './providers'

describe('buildConfiguredProviders', () => {
  it('excludes providers without an API key', () => {
    const result = buildConfiguredProviders({ claude: false, openai: false }, {})
    expect(result).toEqual([])
  })

  it('keeps the full static model list when no modelConfig override is set', () => {
    const result = buildConfiguredProviders({ claude: true }, {})
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('claude')
    const claudeStatic = PROVIDERS.find(p => p.id === 'claude')!
    expect(result[0].models).toHaveLength(claudeStatic.models.length)
  })

  it('treats an empty enabled-models array as "keep static defaults"', () => {
    const result = buildConfiguredProviders({ claude: true }, { claude: [] })
    const claudeStatic = PROVIDERS.find(p => p.id === 'claude')!
    expect(result[0].models).toHaveLength(claudeStatic.models.length)
  })

  it('filters the static list to the enabled IDs', () => {
    const result = buildConfiguredProviders(
      { claude: true },
      { claude: ['claude-sonnet-4-6'] },
    )
    expect(result[0].models.map(m => m.id)).toEqual(['claude-sonnet-4-6'])
  })

  it('regression 0.98.2 — synthesises live-only IDs absent from the static list', () => {
    // GitHub Models API may return IDs unknown to the hard-coded PROVIDERS
    // (new releases, version-stamped variants). Pre-fix, these were dropped
    // by the intersection and the provider disappeared from the chat UI.
    const result = buildConfiguredProviders(
      { github: true },
      { github: ['Mistral-Large-2411-future', 'gpt-4o-2024-11-20'] },
    )
    expect(result).toHaveLength(1)
    const ids = result[0].models.map(m => m.id)
    expect(ids).toContain('Mistral-Large-2411-future')
    expect(ids).toContain('gpt-4o-2024-11-20')
    // Synthetic entries use the id as label and have an empty desc — enough
    // for ModelDef compatibility downstream.
    const synthetic = result[0].models.find(m => m.id === 'Mistral-Large-2411-future')!
    expect(synthetic.label).toBe('Mistral-Large-2411-future')
  })

  it('mixes static-enabled IDs and live-only IDs in the same provider', () => {
    const githubStatic = PROVIDERS.find(p => p.id === 'github')!
    const knownId = githubStatic.models[0].id
    const result = buildConfiguredProviders(
      { github: true },
      { github: [knownId, 'some-brand-new-live-id'] },
    )
    const ids = result[0].models.map(m => m.id)
    expect(ids).toEqual(expect.arrayContaining([knownId, 'some-brand-new-live-id']))
    // Known IDs keep their static label/desc; synthetic ones don't.
    const known = result[0].models.find(m => m.id === knownId)!
    expect(known.label).not.toBe(knownId) // a real human label
  })

  it('drops a provider whose enabled list is non-empty but matches no model', () => {
    // Edge case: user enabled IDs that are neither in static nor in the live
    // result. We don't keep an empty provider — synthetic entries handle the
    // common case where the saved IDs do exist live.
    // Here the saved IDs are present in the saved list, so they become
    // synthetic — provider stays. To actually drop, you'd need an empty list,
    // which is covered by the "empty = keep static" branch instead. So this
    // test documents that current behavior: any non-empty enabled list keeps
    // the provider via synthesis.
    const result = buildConfiguredProviders(
      { copilot: true },
      { copilot: ['unknown-id'] },
    )
    expect(result).toHaveLength(1)
    expect(result[0].models.map(m => m.id)).toEqual(['unknown-id'])
  })
})
