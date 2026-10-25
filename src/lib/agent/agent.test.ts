import { describe, expect, it } from 'vitest'
import { extractTag, validateCitations } from './citations'
import { guardDocument, normalizeIds, parsePlan } from './loop'
import { planProgress } from './plan-progress'
import { runTool } from '@/lib/tools'

describe('agent helpers', () => {
  it('normalizes unicode hyphens in ids without touching digits', () => {
    expect(normalizeIds('P‑PROP‑03 and NCR‐001, 2013')).toBe('P-PROP-03 and NCR-001, 2013')
  })

  it('splits mentioned ids into cited and unknown', () => {
    const seen = new Map(runTool('list_nonconformances', { assembly: 'Propulsion' }).citations.map((c) => [c.id, c]))
    const { cited, unknownIds } = validateCitations('Blocked by [NCR-001] and NCR-002; see NCR-099.', seen)
    expect(cited.map((c) => c.id)).toEqual(['NCR-001', 'NCR-002'])
    expect(unknownIds).toEqual(['NCR-099'])
  })

  it('makes ids mentioned inside tool data citable', () => {
    const ids = runTool('get_requirements', { part: 'star tracker' }).citations.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['NCR-004', 'P-ADCS-03']))
  })

  it('extracts tagged sections, tolerating an unclosed tag', () => {
    expect(extractTag('<answer>\nhi\n</answer><recommendation>go', 'answer')).toBe('hi')
    expect(extractTag('<answer>partial', 'answer')).toBe('partial')
    expect(extractTag('nothing', 'answer')).toBeUndefined()
  })

  it('parses plans and drops unknown tools', () => {
    expect(parsePlan('ok {"steps":[{"goal":"a","tool":"search_parts"},{"goal":"b","tool":"hack"}]}')).toEqual([{ goal: 'a', tool: 'search_parts' }])
    expect(parsePlan('garbage')[0].tool).toBe('search_parts')
  })

  it('guards draft_document: only when planned, only after evidence steps', () => {
    const plan = [{ goal: 'a', tool: 'search_parts' }, { goal: 'b', tool: 'compare_suppliers' }, { goal: 'c', tool: 'draft_document' }]
    expect(guardDocument('draft_document', plan, ['search_parts'])).toContain('compare_suppliers')
    expect(guardDocument('draft_document', plan, ['search_parts', 'compare_suppliers'])).toBeUndefined()
    expect(guardDocument('draft_document', plan.slice(0, 2), [])).toContain('no document')
    expect(guardDocument('search_parts', [], [])).toBeUndefined()
  })

  it('collapses consecutive duplicate plan steps', () => {
    expect(parsePlan('{"steps":[{"goal":"a","tool":"list_nonconformances"},{"goal":"b","tool":"list_nonconformances"}]}')).toHaveLength(1)
  })

  it('tracks plan progress by tool call counts', () => {
    const plan = [{ goal: 'a', tool: 'search_parts' }, { goal: 'b', tool: 'get_requirements' }, { goal: 'c', tool: 'search_parts' }]
    expect(planProgress(plan, ['search_parts'])).toEqual([true, false, false])
    expect(planProgress(plan, ['search_parts', 'get_requirements', 'search_parts'])).toEqual([true, true, true])
  })
})
