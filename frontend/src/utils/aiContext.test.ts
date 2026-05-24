import { describe, expect, it } from 'vitest'
import { extractLatestContextTrace, extractLatestSkillRouting, extractUsedSkillNames } from './aiContext'

describe('extractUsedSkillNames', () => {
  it('keeps every selected and called skill without a 12-item cap', () => {
    const selected = Array.from({ length: 15 }, (_, i) => `skill_${i}`)
    const names = extractUsedSkillNames([
      { type: 'skills_selected', skills: selected },
      { type: 'tool_call', name: 'odoo_query_records' },
      { type: 'tool_call', name: 'skill_1' },
    ])

    expect(names).toHaveLength(16)
    expect(names.slice(0, 15)).toEqual(selected)
    expect(names).toContain('odoo_query_records')
  })
})

describe('extractLatestContextTrace', () => {
  it('summarizes the most recent skills_selected context trace', () => {
    const summary = extractLatestContextTrace([
      { type: 'skills_selected', run_id: 'old', skills: [], context_trace: [{ type: 'context_cache_hit', run_id: 'old' }] },
      {
        type: 'skills_selected',
        run_id: 'run-1',
        skills: ['odoo_inspect_report'],
        context_trace: [
          { type: 'reference_auto_loaded', run_id: 'run-1', skill: 'odoo_inspect_report', filename: 'qweb.md' },
          { type: 'priority_block_truncated', run_id: 'run-1', original_chars: 9000, capped_chars: 6000 },
        ],
      },
    ])

    expect(summary?.runId).toBe('run-1')
    expect(summary?.total).toBe(2)
    expect(summary?.references).toHaveLength(1)
    expect(summary?.truncations).toHaveLength(1)
    expect(summary?.cacheHits).toHaveLength(0)
  })
})

describe('extractLatestSkillRouting', () => {
  it('summarizes selected and pruned candidates from the latest skills_selected event', () => {
    const summary = extractLatestSkillRouting([
      { type: 'skills_selected', candidates: [{ name: 'old', selected: true }] },
      {
        type: 'skills_selected',
        candidates: [
          { name: 'odoo_inspect_report', score: 100, reason: 'skill-keywords', selected: true },
          { name: 'odoo_query_records', score: 40, reason: 'intent:record_analysis, pruned:report-focus', selected: false },
          { name: 'repo_read_file', score: 20, reason: 'implicit-invocation-disabled', selected: false },
        ],
      },
    ])

    expect(summary?.selected.map(candidate => candidate.name)).toEqual(['odoo_inspect_report'])
    expect(summary?.pruned.map(candidate => candidate.name)).toEqual(['odoo_query_records'])
    expect(summary?.top).toHaveLength(3)
  })
})
