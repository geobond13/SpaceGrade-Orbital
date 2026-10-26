import { describe, expect, it } from 'vitest'
import { computeReadiness, diffReadiness, parseMilestones } from './readiness'
import { db } from '@/lib/tools/lookup'

const seatLeakTest = db.tests.find((t) => t.requirementIds.includes('REQ-PROP-020') && t.outcome === 'fail')!

describe('readiness', () => {
  const base = computeReadiness()

  it('derives requirement, part and assembly status from records', () => {
    expect(base.requirements['REQ-PROP-020']).toBe('failed')
    expect(base.requirements['REQ-ADCS-021']).toBe('unverified')
    expect(base.parts['P-PROP-03']).toBe('blocked')
    // The module rolls up its blocked valve.
    expect(base.parts['P-PROP-01']).toBe('blocked')
    const prop = base.assemblies.find((a) => a.assembly === 'Propulsion')!
    expect(prop.blockingNcrs).toEqual(expect.arrayContaining(['NCR-001', 'NCR-002']))
    expect(prop.total).toBe(Object.values(prop.counts).reduce((a, b) => a + b, 0))
  })

  it('closing NCR-001 and passing the seat leak retest unblocks the valve', () => {
    const next = computeReadiness({ closedNcrs: ['NCR-001'], testOutcomes: { [seatLeakTest.id]: 'pass' } })
    expect(next.requirements['REQ-PROP-020']).toBe('verified')
    expect(next.blockingNcrs).not.toContain('NCR-001')
    expect(next.parts['P-PROP-03']).not.toBe('blocked')
    const delta = diffReadiness(base, next)
    expect(delta.requirements).toContainEqual({ id: 'REQ-PROP-020', from: 'failed', to: 'verified' })
    const prop = delta.assemblies.find((a) => a.assembly === 'Propulsion')!
    expect(prop.to).toBeGreaterThan(prop.from)
  })

  it('leaves the baseline untouched without overrides', () => {
    expect(diffReadiness(base, computeReadiness({}))).toEqual({ requirements: [], parts: [], assemblies: [] })
  })

  it('parses milestone dates', () => {
    expect(parseMilestones('Propulsion qualification review 2026-11-20; system CDR 2026-12-08')).toEqual([
      { label: 'Propulsion qualification review', date: '2026-11-20' },
      { label: 'system CDR', date: '2026-12-08' },
    ])
  })
})
