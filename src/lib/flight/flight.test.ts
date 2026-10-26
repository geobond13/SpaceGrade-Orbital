import { describe, expect, it } from 'vitest'
import { bedTempC, deltaVAtEndOfLife, preheatMinutes, TANK } from './physics'
import { eclipseDodPct, SCENARIOS, sample } from './scenarios'
import { detect, linearFit } from './fdir'
import { decide } from './autonomy'

describe('physics from the pedigree', () => {
  it('as-built heater matches NCR-002 and needs ~43 min to reach 315 °C', () => {
    expect(bedTempC(30, true)).toBeCloseTo(290, 0)
    expect(bedTempC(30, false)).toBeCloseTo(315, 0)
    expect(preheatMinutes(false)).toBeCloseTo(30, 1)
    expect(preheatMinutes(true)).toBeGreaterThan(42)
    expect(preheatMinutes(true)).toBeLessThan(45)
  })

  it('NCR-001 leak rate strands propellant before end of life', () => {
    expect(deltaVAtEndOfLife(0).deltaVMs).toBeCloseTo(TANK.deltaVBudgetMs, 5)
    expect(deltaVAtEndOfLife(5 * 365, 0).deltaVMs).toBeCloseTo(TANK.deltaVBudgetMs, 5)
    expect(deltaVAtEndOfLife(5 * 365).deltaVMs).toBeLessThan(TANK.requiredDeltaVMs)
  })
})

describe('scenarios', () => {
  it('telemetry is deterministic', () => {
    const ch = SCENARIOS['valve-leak'].channels[0]
    expect(sample(ch, -100, 0, 20, [])).toEqual(sample(ch, -100, 0, 20, []))
  })

  it('valve leak: compensated pressure slope recovers the NCR-001 leak rate', () => {
    const ch = SCENARIOS['valve-leak'].channels.find((c) => c.id === 'TM-PROP-03')!
    const fit = linearFit(sample(ch, -7 * 1440, 0, 337, []))
    expect(fit.slope * 1440).toBeCloseTo(-0.087, 2)
  })

  it('eclipse power: the X-band session breaks the DoD limit only with as-built cells', () => {
    expect(eclipseDodPct(5, false, []).dodPct).toBeLessThan(20)
    expect(eclipseDodPct(5, true, []).dodPct).toBeGreaterThan(20)
    expect(eclipseDodPct(5, true, [{ kind: 'PAYLOAD_LOAD_SHED', t: 5, params: {} }]).dodPct).toBeLessThan(20)
  })

  it('conjunction: a burn opens the miss distance', () => {
    const miss = SCENARIOS.conjunction.channels.find((c) => c.id === 'TM-CONJ-01')!
    const burn = [{ kind: 'COLLISION_AVOIDANCE_BURN' as const, t: 3, params: {} }]
    expect(miss.value(110, [])).toBe(180)
    expect(miss.value(110, burn)).toBeGreaterThan(1000)
  })
})

describe('FDIR', () => {
  it('fires exactly one event per scenario at the scripted time', () => {
    expect(detect('valve-leak').map((e) => [e.id, e.t])).toEqual([['FE-101', 10]])
    expect(detect('conjunction').map((e) => [e.id, e.t])).toEqual([['FE-201', 2]])
    expect(detect('eclipse-power').map((e) => [e.id, e.t])).toEqual([['FE-301', 4]])
  })
})

describe('autonomy policy', () => {
  it('burns autonomously because the as-built deadline falls before the next contact', () => {
    const d = decide('conjunction', 3, 'COLLISION_AVOIDANCE_BURN', {}, [])
    expect(d.tier).toBe('auto')
    expect(d.deadline!).toBeLessThan(38)
    // With the spec heater the deadline would be after the 38-min contact: a human could decide.
    expect(d.checks.find((c) => c.label === 'Decision deadline')!.detail).toContain('T+45')
  })

  it('refuses a burn after the deadline and outside the envelope', () => {
    expect(decide('conjunction', 40, 'COLLISION_AVOIDANCE_BURN', {}, []).tier).toBe('refused')
  })

  it('sheds the payload session autonomously; propulsion procedures always wait', () => {
    expect(decide('eclipse-power', 5, 'PAYLOAD_LOAD_SHED', { session: 'XB-0412' }, []).tier).toBe('auto')
    expect(decide('eclipse-power', 5, 'PAYLOAD_LOAD_SHED', { session: 'BUS' }, []).tier).toBe('refused')
    expect(decide('valve-leak', 12, 'PROPULSION_PROCEDURE', { procedure: 'latch valve exercise' }, []).tier).toBe('gated')
  })
})

describe('flight health on the twin', () => {
  it('symptom, cause, commanded and shed parts', async () => {
    const { partHealth } = await import('./health')
    const fe = detect('valve-leak')
    expect(partHealth(12, fe, ['NCR-001'], [])).toMatchObject({ 'P-PROP-02': 'watch', 'P-PROP-03': 'cause' })
    const burn = [{ kind: 'COLLISION_AVOIDANCE_BURN' as const, t: 2, params: {} }]
    expect(partHealth(20, [], [], burn)['P-PROP-05']).toBe('commanded')
    expect(partHealth(200, [], [], burn)['P-PROP-05']).toBeUndefined()
    expect(partHealth(50, [], [], [{ kind: 'PAYLOAD_LOAD_SHED', t: 4, params: {} }])['P-COM-05']).toBe('shed')
  })
})
