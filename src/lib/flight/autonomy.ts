// Who is allowed to act, and when. The agent only proposes; this policy is
// deterministic and decides whether a proposal executes, waits for a human,
// or is refused. Authority depends on one question: can a human be reached
// before the decision deadline?

import { burnPlan, CONJUNCTION_EVENT, eclipseDodPct, nextContact, SCENARIOS, XBAND_SESSION, type ActionKind, type ExecutedAction, type ScenarioId } from './scenarios'
import { BATTERY, CONJUNCTION, deltaVAtEndOfLife, preheatMinutes, TANK } from './physics'

export type Tier = 'auto' | 'gated' | 'refused'

export interface Check { label: string; ok: boolean; detail: string; source?: string }

export interface Decision {
  kind: ActionKind
  tier: Tier
  /** Latest sim time at which the action still achieves its purpose. */
  deadline?: number
  nextContact?: { station: string; start: number }
  reason: string
  checks: Check[]
  /** Parameters actually used if executed. */
  params: Record<string, unknown>
}

export const ACTION_CLASSES: Record<ActionKind, { label: string; policy: string }> = {
  COLLISION_AVOIDANCE_BURN: { label: 'Collision avoidance burn', policy: 'Auto only if no operator can be reached before the deadline and the burn is inside the envelope (Δv ≤ 0.5 m/s, delta-v budget kept).' },
  PAYLOAD_LOAD_SHED: { label: 'Shed payload load', policy: 'Auto if the deadline is before the next contact. Payload loads only; bus and survival heaters are never shed.' },
  PROPULSION_PROCEDURE: { label: 'Propulsion procedure', policy: 'Always needs operator approval.' },
  FLIGHT_NCR_DRAFT: { label: 'Draft flight NCR', policy: 'Auto: documentation only, no vehicle effect.' },
}

/** Time-critical classes act alone when nobody can be reached in time; otherwise they wait. */
function tierByDeadline(t: number, deadline: number, contact: { start: number } | undefined, envelopeOk: boolean): Tier {
  if (!envelopeOk) return 'refused'
  if (deadline < t) return 'refused'
  const humanInTime = contact !== undefined && contact.start < deadline
  return humanInTime ? 'gated' : 'auto'
}

const fmt = (m: number) => `T${m >= 0 ? '+' : ''}${m.toFixed(0)} min`

export function decide(scenario: ScenarioId, t: number, kind: ActionKind, params: Record<string, unknown>, actions: ExecutedAction[]): Decision {
  const s = SCENARIOS[scenario]
  const pass = nextContact(s, t)
  const contact = pass && { station: pass.station, start: pass.start }

  if (kind === 'COLLISION_AVOIDANCE_BURN') {
    if (scenario !== 'conjunction') return { kind, tier: 'refused', reason: 'No conjunction is active.', checks: [], params }
    if (actions.some((a) => a.kind === kind)) return { kind, tier: 'refused', reason: 'A burn is already commanded.', checks: [], params }
    const asBuilt = preheatMinutes(true)
    const spec = preheatMinutes(false)
    // Preheat must start by TCA − planned lead − preheat time.
    const deadline = CONJUNCTION_EVENT.tca - CONJUNCTION.plannedLeadMin - asBuilt
    const specDeadline = CONJUNCTION_EVENT.tca - CONJUNCTION.plannedLeadMin - spec
    const plan = burnPlan(t)
    const dvOk = plan.deltaVMs <= CONJUNCTION.maxDeltaVMs
    const budgetAfter = TANK.deltaVBudgetMs - plan.deltaVMs
    const checks: Check[] = [
      { label: 'Preheat time (as-built)', ok: true, detail: `${asBuilt.toFixed(1)} min to 315 °C; spec heater would take ${spec.toFixed(0)} min`, source: 'NCR-002' },
      { label: 'Decision deadline', ok: t <= deadline, detail: `command preheat by ${fmt(deadline)} (spec model says ${fmt(specDeadline)})` },
      { label: 'Operator reachable before deadline', ok: !!contact && contact.start < deadline, detail: contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled' },
      { label: 'Δv within envelope', ok: dvOk, detail: `${plan.deltaVMs.toFixed(3)} m/s for a ${plan.leadMin.toFixed(0)} min lead (limit ${CONJUNCTION.maxDeltaVMs} m/s)` },
      { label: 'Delta-v budget kept', ok: budgetAfter >= TANK.requiredDeltaVMs, detail: `${budgetAfter.toFixed(2)} m/s left vs ${TANK.requiredDeltaVMs} m/s required`, source: 'REQ-SYS-002' },
    ]
    const tier = tierByDeadline(t, deadline, contact, dvOk && budgetAfter >= TANK.requiredDeltaVMs)
    const reason = tier === 'auto'
      ? `No operator can be reached before the ${fmt(deadline)} deadline (next contact ${contact ? fmt(contact.start) : 'none'}); burn is inside the envelope.`
      : tier === 'gated' ? `An operator is reachable at ${contact?.station} (${fmt(contact!.start)}) before the deadline.`
        : t > deadline ? 'Deadline passed.' : 'Outside the autonomous envelope.'
    return { kind, tier, deadline, nextContact: contact, reason, checks, params: { cmdT: t, burnT: plan.burnT, deltaVMs: plan.deltaVMs, leadMin: plan.leadMin } }
  }

  if (kind === 'PAYLOAD_LOAD_SHED') {
    if (scenario !== 'eclipse-power') return { kind, tier: 'refused', reason: 'No payload session to shed.', checks: [], params }
    const session = String(params.session ?? XBAND_SESSION.id)
    const target = session === XBAND_SESSION.id
    const deadline = XBAND_SESSION.start
    const before = eclipseDodPct(t, true, actions)
    const after = eclipseDodPct(t, true, [...actions, { kind, t, params: { session } }])
    const checks: Check[] = [
      { label: 'Payload load only', ok: target, detail: target ? `${XBAND_SESSION.id} X-band downlink, ${XBAND_SESSION.watts} W` : `unknown session ${session}` },
      { label: 'Depth of discharge (as-built)', ok: after.dodPct <= BATTERY.maxDodPct, detail: `${before.dodPct.toFixed(1)} % → ${after.dodPct.toFixed(1)} % (limit ${BATTERY.maxDodPct} %)`, source: 'NCR-005' },
      { label: 'Decision deadline', ok: t <= deadline, detail: `session starts ${fmt(deadline)}` },
      { label: 'Operator reachable before deadline', ok: !!contact && contact.start < deadline, detail: contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled' },
    ]
    const tier = tierByDeadline(t, deadline, contact, target)
    return {
      kind, tier, deadline, nextContact: contact, checks, params: { session },
      reason: tier === 'auto' ? `Session starts ${fmt(deadline)}, before the next contact; payload-only shed is pre-approved.` : tier === 'gated' ? 'An operator is reachable before the session.' : 'Not a payload load.',
    }
  }

  if (kind === 'PROPULSION_PROCEDURE') {
    const eol = deltaVAtEndOfLife(5 * 365)
    return {
      kind, tier: 'gated', nextContact: contact, params,
      reason: 'Propulsion procedures always need operator approval.',
      checks: [
        { label: 'Procedure', ok: true, detail: String(params.procedure ?? 'unspecified') },
        { label: 'End-of-life delta-v if the leak continues', ok: eol.deltaVMs >= TANK.requiredDeltaVMs, detail: `${eol.deltaVMs.toFixed(0)} m/s vs ${TANK.requiredDeltaVMs} m/s required`, source: 'REQ-SYS-002' },
      ],
    }
  }

  return { kind, tier: 'auto', reason: 'Documentation only; no vehicle effect.', checks: [], params }
}
