import { describe, expect, it } from 'vitest'
import { buildConfiguredProviders, inferFamily, PROVIDERS } from './providers'

describe('inferFamily', () => {
  it.each([
    ['gpt-4o-2024-11-20', 'OpenAI'],
    ['gpt-5-mini', 'OpenAI'],
    ['o1-preview', 'OpenAI'],
    ['o3-mini', 'OpenAI'],
    ['o4-mini', 'OpenAI'],
    ['claude-sonnet-4-6', 'Anthropic'],
    ['Claude-Opus-4-7', 'Anthropic'],
    ['gemini-2.5-pro', 'Google'],
    ['Mistral-Large-2411', 'Mistral'],
    ['mistral-small', 'Mistral'],
    ['Mixtral-8x22B', 'Mistral'],
    ['Codestral-22B', 'Mistral'],
    ['Llama-3-70b', 'Meta Llama'],
    ['meta-llama-3.1', 'Meta Llama'],
    ['Phi-4', 'Microsoft Phi'],
    ['Phi-3.5-mini-instruct', 'Microsoft Phi'],
    ['DeepSeek-R1', 'DeepSeek'],
    ['DeepSeek-R1-0528', 'DeepSeek'],
    ['grok-code-fast-1', 'xAI Grok'],
    ['command-r-plus', 'Cohere'],
    ['Cohere-Embed', 'Cohere'],
    ['AI21-Jamba-Instruct', 'AI21'],
    ['jamba-1.5-large', 'AI21'],
    ['unknown-vendor-x42', 'Autres'],
  ])('classifies %s as %s', (id, expected) => {
    expect(inferFamily(id)).toBe(expected)
  })
})

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

  it('synthesises unknown IDs for live-fetch providers (copilot)', () => {
    // Edge case kept for live-fetch providers: any non-empty enabled list
    // keeps the provider via synthesis, because the user may legitimately
    // have cocked an ID that exists live but not in the static fallback.
    const result = buildConfiguredProviders(
      { copilot: true },
      { copilot: ['unknown-live-id'] },
    )
    expect(result).toHaveLength(1)
    expect(result[0].models.map(m => m.id)).toEqual(['unknown-live-id'])
  })

  it('regression 0.99.1 — drops stale IDs for static-only providers (openai)', () => {
    // OpenAI/Anthropic/Gemini have no live fetch: the static list IS the
    // source of truth. An enabled ID that no longer exists in the static
    // list (e.g. `gpt-5.5` removed in 0.99.1 as hallucinated) must be
    // silently dropped, never synthesised — otherwise the user would still
    // be able to pick it and the API would 400.
    const result = buildConfiguredProviders(
      { openai: true },
      { openai: ['gpt-4o', 'gpt-5.5-which-never-existed'] },
    )
    expect(result).toHaveLength(1)
    const ids = result[0].models.map(m => m.id)
    expect(ids).toContain('gpt-4o')
    expect(ids).not.toContain('gpt-5.5-which-never-existed')
  })

  it('regression 0.99.1 — drops a static-only provider if all its enabled IDs are stale', () => {
    // If the user's only saved OpenAI IDs are all hallucinated/removed,
    // the provider must disappear from the selector (better than offering
    // models that all 400). User has to re-pick valid IDs in Settings.
    const result = buildConfiguredProviders(
      { openai: true },
      { openai: ['gpt-5.5', 'gpt-5.4'] },
    )
    expect(result).toEqual([])
  })
})
