import { describe, expect, it } from 'vitest'
import { extractTag, validateCitations } from './citations'
import { normalizeIds, parsePlan } from './loop'
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

  it('tracks plan progress by tool call counts', () => {
    const plan = [{ goal: 'a', tool: 'search_parts' }, { goal: 'b', tool: 'get_requirements' }, { goal: 'c', tool: 'search_parts' }]
    expect(planProgress(plan, ['search_parts'])).toEqual([true, false, false])
    expect(planProgress(plan, ['search_parts', 'get_requirements', 'search_parts'])).toEqual([true, true, true])
  })
})
