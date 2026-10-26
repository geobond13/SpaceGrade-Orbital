import { describe, expect, it } from 'vitest'
import { runTool } from '../index'
import { FLIGHT_TOOLS } from './index'

const run = (name: string, args: Record<string, unknown>, scenario: 'valve-leak' | 'conjunction' | 'eclipse-power', t: number) =>
  runTool(name, args, { tools: FLIGHT_TOOLS, ctx: { scenario, t, actions: [] } })
const ids = (r: { citations: { id: string }[] }) => r.citations.map((c) => c.id)

describe('flight tools', () => {
  it('get_telemetry infers the NCR-001 leak rate and projects the delta-v loss', () => {
    const r = run('get_telemetry', { channel: 'TM-PROP-03' }, 'valve-leak', 10)
    const ch = (r.data as Record<string, unknown>[])[0]
    expect(ch.equivalentHeliumLeakSccs as number).toBeCloseTo(3.2e-4, 5)
    expect((ch.projection as { missionDayDeltaVLost: number }).missionDayDeltaVLost).toBe(710)
    expect(ids(r)).toContain('TM-PROP-03')
  })

  it('get_telemetry never returns samples from the future', () => {
    const r = run('get_telemetry', { channel: 'miss distance' }, 'conjunction', 5)
    const samples = (r.data as { samples: [number, number][] }[])[0].samples
    expect(Math.max(...samples.map((s) => s[0]))).toBeLessThanOrEqual(5)
  })

  it('get_part_history surfaces the valve NCR when asked about the tank', () => {
    const r = run('get_part_history', { part: 'P-PROP-02' }, 'valve-leak', 10)
    const data = r.data as { sameAssemblyNonconformances: { id: string }[] }
    expect(data.sameAssemblyNonconformances.map((n) => n.id)).toContain('NCR-001')
    expect(ids(r)).toContain('NCR-001')
  })

  it('get_part_history on the battery includes the cell lot NCR', () => {
    const r = run('get_part_history', { part: 'battery pack' }, 'eclipse-power', 5)
    expect(ids(r)).toContain('NCR-005')
  })

  it('get_contact_windows reports the next operator contact', () => {
    const r = run('get_contact_windows', {}, 'conjunction', 3)
    expect((r.data as { nextOperatorContact: { minutesFromNow: number } }).nextOperatorContact.minutesFromNow).toBe(35)
  })

  it('propose_action returns the policy decision, cites its sources and refuses unknown kinds', () => {
    const r = run('propose_action', { kind: 'COLLISION_AVOIDANCE_BURN' }, 'conjunction', 3)
    expect(r.decision?.tier).toBe('auto')
    expect(ids(r)).toEqual(expect.arrayContaining(['NCR-002', 'REQ-SYS-002']))
    expect(run('propose_action', { kind: 'SELF_DESTRUCT' }, 'conjunction', 3).summary).toBe('unknown action kind')
  })

  it('draft_flight_ncr links the build record and the telemetry', () => {
    const r = run('draft_flight_ncr', { part: 'P-PROP-03', symptom: 'pressure decay', evidence: ['TM-PROP-03'] }, 'valve-leak', 10)
    expect(r.document?.markdown).toContain('NCR-001')
    expect(r.document?.markdown).toContain('TM-PROP-03')
  })

  it('flight tools refuse to run without a flight context', () => {
    expect(runTool('get_telemetry', {}, { tools: FLIGHT_TOOLS }).summary).toBe('no flight context')
  })
})
