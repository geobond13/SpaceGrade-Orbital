import { describe, expect, it } from 'vitest'
import { decide } from './autonomy'
import { lifecycle } from './lifecycle'
import { asFlown } from './as-flown'
import { leakFit, nextContact, parseConditions, scenarioWith, type ExecutedAction } from './scenarios'
import { runTool } from '@/lib/tools'
import { FLIGHT_TOOLS } from '@/lib/tools/flight'
import { checkQuantities } from '@/lib/agent/quantities'
import { cleanAnswer } from '@/lib/agent/loop'

describe('adjustable conditions change the decision', () => {
  it('as built, the deadline moves ahead of the operator and the policy acts', () => {
    const d = decide('conjunction', 2, 'COLLISION_AVOIDANCE_BURN', {}, [])
    expect(d.tier).toBe('auto')
    expect(d.timing).toMatchObject({ contact: 38 })
    expect(d.timing!.deadline).toBeCloseTo(31.6, 1)
    expect(d.timing!.specDeadline).toBeCloseTo(45, 5)
  })

  it('with a reworked heater the deadline is T+45, after the T+38 operator: a human decides', () => {
    const d = decide('conjunction', 2, 'COLLISION_AVOIDANCE_BURN', {}, [], { heaterConforming: true })
    expect(d.tier).toBe('gated')
    expect(d.deadline).toBeCloseTo(45, 5)
    expect(d.timing!.specDeadline).toBeUndefined()
  })

  it('with an on-call operator at T+20 the as-built burn also waits for a human', () => {
    const d = decide('conjunction', 2, 'COLLISION_AVOIDANCE_BURN', {}, [], { operatorOnCall: true })
    expect(d.tier).toBe('gated')
    expect(d.nextContact?.start).toBe(20)
    expect(nextContact(scenarioWith('conjunction', { operatorOnCall: true }), 2)?.station).toBe('On-call operator')
  })

  it('clients can only set conditions a scenario offers', () => {
    expect(parseConditions('conjunction', { heaterConforming: true, selfDestruct: true })).toEqual({ heaterConforming: true })
    expect(parseConditions('valve-leak', { heaterConforming: true })).toEqual({})
  })

  it('every autonomous action names how its command reaches the vehicle', () => {
    for (const [s, k] of [['conjunction', 'COLLISION_AVOIDANCE_BURN'], ['eclipse-power', 'PAYLOAD_LOAD_SHED'], ['tracker-dropout', 'BURN_RETIME']] as const) {
      const d = decide(s, 4, k, {}, [])
      expect(d.tier).toBe('auto')
      expect(d.checks.find((c) => c.label === 'Command path')?.detail).toMatch(/relay/)
    }
  })
})

describe('lifecycle: authorised is not done', () => {
  const d = decide('conjunction', 2, 'COLLISION_AVOIDANCE_BURN', {}, [])
  const actions: ExecutedAction[] = [{ kind: d.kind, t: 2, params: d.params }]

  it('right after authorisation the bed is still heating and nothing has burned', () => {
    const steps = lifecycle(d, 2, 10, actions)
    expect(steps.map((s) => s.label)).toEqual(['Proposed by agent', 'Authorised by policy', 'Preheat commanded', 'Bed at 315 °C', 'Burn', 'Miss distance checked'])
    expect(steps.find((s) => s.label === 'Bed at 315 °C')?.state).toBe('active')
    expect(steps.find((s) => s.label === 'Burn')?.state).toBe('pending')
  })

  it('after the burn the miss distance check reports the new distance', () => {
    const check = lifecycle(d, 2, 60, actions).at(-1)!
    expect(check.state).toBe('done')
    expect(check.detail).toMatch(/^180 m → \d{3,4} m$/)
  })

  it('a gated action waits for the operator pass and takes effect from the approval time', () => {
    const g = decide('tracker-dropout', 4, 'ONBOARD_TABLE_UPDATE', {}, [])
    const waiting = lifecycle(g, 4, 10, [])
    expect(waiting.find((s) => s.label === 'Operator decides')).toMatchObject({ t: 70, state: 'pending' })
    expect(lifecycle(g, 4, 70, []).find((s) => s.label === 'Operator decides')?.state).toBe('active')
    const approved = lifecycle(g, 4, 75, [{ kind: g.kind, t: 70, params: g.params }], {}, { verdict: 'approved', t: 70 })
    expect(approved.find((s) => s.label === 'Approved by operator')?.state).toBe('done')
    expect(approved.find((s) => s.label === 'Table uploaded')?.state).toBe('done')
    const rejected = lifecycle(g, 4, 75, [], {}, { verdict: 'rejected', t: 70 })
    expect(rejected.at(-1)?.label).toBe('Rejected by operator')
  })
})

describe('one source for every number', () => {
  it('telemetry, policy and the leak fit agree on the delta-v left at end of life', () => {
    const fit = leakFit(10)
    const tel = runTool('get_telemetry', { channel: 'TM-PROP-03' }, { tools: FLIGHT_TOOLS, ctx: { scenario: 'valve-leak', t: 10, actions: [] } })
    const proj = (tel.data as { projectionIfLeakContinues: { deltaVRemainingAtEndOfLifeMs: number; statement: string } }[])[0].projectionIfLeakContinues
    const policy = decide('valve-leak', 10, 'PROPULSION_PROCEDURE', { procedure: 'close latch valve' }, [])
    expect(proj.deltaVRemainingAtEndOfLifeMs).toBe(Math.round(fit.remainingAtEndOfLifeMs))
    expect(policy.checks[1].detail).toContain(`${Math.round(fit.remainingAtEndOfLifeMs)} m/s remaining`)
    expect(proj.statement).toMatch(/REMAINS.*SHORT/)
  })

  it('conjunction telemetry has data when the CDM arrives', () => {
    const r = runTool('get_telemetry', { part: 'P-STR-01' }, { tools: FLIGHT_TOOLS, ctx: { scenario: 'conjunction', t: 2, actions: [] } })
    for (const ch of r.data as { latest?: number; note?: string }[]) expect(ch.note).toBeUndefined()
  })

  it('the build record says how each NCR flew, and the reworked heater changes that', () => {
    const r = runTool('get_part_history', { part: 'P-PROP-05' }, { tools: FLIGHT_TOOLS, ctx: { scenario: 'conjunction', t: 2, actions: [] } })
    const ncr = (r.data as { nonconformances: { id: string; asFlown: { disposition: string } }[] }).nonconformances.find((n) => n.id === 'NCR-002')!
    expect(ncr.asFlown.disposition).toMatch(/Use-as-is/)
    expect(asFlown('NCR-002', { heaterConforming: true })?.disposition).toMatch(/reworked/)
  })
})

describe('answer checks', () => {
  it('flags a quantity no tool returned and passes ones that round from tool data', () => {
    const q = checkQuantities('Only 29 m/s remains against 120 m/s; preheat 43.4 min; deadline T+32 [NCR-002]. Loss of 77 m/s.', [{ remaining: 28.6, required: 120, preheat: 43.37, deadline: 'T+32 min' }])
    expect(q.checked).toBe(5)
    expect(q.unmatched).toEqual(['77 m/s'])
  })

  it('strips LaTeX, dangling markers and raw tool names', () => {
    expect(cleanAnswer('Δv $\\approx 0.24$ m/s \\times 3 [1] per `propose_action` result', { propose_action: 'the autonomy policy' }))
      .toBe('Δv ≈ 0.24 m/s × 3  per the autonomy policy')
    expect(cleanAnswer('as Web-2 notes')).toBe('as WEB-2 notes')
  })
})
