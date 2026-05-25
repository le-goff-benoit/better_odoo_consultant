import { describe, expect, it } from 'vitest'
import { buildSecondOpinionPrompt } from './SecondOpinionChips'

describe('buildSecondOpinionPrompt', () => {
  it('frames the previous answer and asks for a complementary opinion (FR)', () => {
    const out = buildSecondOpinionPrompt({
      previousAgentLabel: 'developer',
      previousAnswer: 'Override _inherit avec compute=...',
      invitedAgentLabel: 'Architecte',
      lang: 'fr',
    })
    expect(out).toContain('[Réponse précédente — agent : developer]')
    expect(out).toContain('Override _inherit avec compute=...')
    expect(out).toContain("En tant qu'**Architecte**")
    expect(out).toContain('complète-la')
  })

  it('frames in English when lang=en', () => {
    const out = buildSecondOpinionPrompt({
      previousAgentLabel: 'developer',
      previousAnswer: 'Use ORM compute.',
      invitedAgentLabel: 'Architect',
      lang: 'en',
    })
    expect(out).toContain('[Previous answer — agent: developer]')
    expect(out).toContain('Use ORM compute.')
    expect(out).toContain('As **Architect**')
    expect(out).toContain('complete it')
  })

  it('caps very long previous answers to keep the turn within budget', () => {
    const huge = 'a'.repeat(5000)
    const out = buildSecondOpinionPrompt({
      previousAgentLabel: 'business_analyst',
      previousAnswer: huge,
      invitedAgentLabel: 'Architect',
      lang: 'fr',
    })
    expect(out).toContain('[...réponse tronquée pour rester dans le budget...]')
    expect(out.length).toBeLessThan(huge.length)
  })
})
