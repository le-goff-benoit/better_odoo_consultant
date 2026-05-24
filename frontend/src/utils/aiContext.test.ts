import { describe, expect, it } from 'vitest'
import { extractUsedSkillNames } from './aiContext'

describe('extractUsedSkillNames', () => {
  it('keeps every selected and called skill without a 12-item cap', () => {
    const selected = Array.from({ length: 15 }, (_, i) => `skill_${i}`)
    const names = extractUsedSkillNames([
      { type: 'skills_selected', skills: selected },
      { type: 'tool_call', name: 'query_odoo' },
      { type: 'tool_call', name: 'skill_1' },
    ])

    expect(names).toHaveLength(16)
    expect(names.slice(0, 15)).toEqual(selected)
    expect(names).toContain('query_odoo')
  })
})
