// Who is allowed to act, and when. The agent only proposes; this policy is
// deterministic and decides whether a proposal executes, waits for a human,
// or is refused. Authority depends on one question: can a human be reached
// before the decision deadline?

import { burnPlan, CONJUNCTION_EVENT, eclipseDodPct, falseSafeModeT, knowledgeErrorDeg, nextContact, OM_BURN, retimedBurnT, SCENARIOS, sunAngleDeg, TRACKER, TRACKER_OUTAGES, XBAND_SESSION, type ActionKind, type ExecutedAction, type ScenarioId } from './scenarios'
import { BATTERY, CONJUNCTION, deltaVAtEndOfLife, preheatMinutes, TANK } from './physics'

export type Tier = 'auto' | 'gated' | 'refused'

/** ok: null marks context, not a pass/fail envelope check. */
export interface Check { label: string; ok: boolean | null; detail: string; source?: string }

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
  BURN_RETIME: { label: 'Hold and retime burn', policy: 'Auto if the burn would fire before the next contact, the new time is tracker-valid on the as-built model, and the delay is at most one orbit. Holding a burn never adds a burn.' },
  ONBOARD_TABLE_UPDATE: { label: 'Onboard table update', policy: 'Always needs operator approval: it changes what the vehicle decides on its own. Use when flight data and the build record show a spec value in an onboard table is wrong for this vehicle.' },
  PROPULSION_PROCEDURE: { label: 'Propulsion procedure', policy: 'Always needs operator approval.' },
  FLIGHT_NCR_DRAFT: { label: 'Draft flight NCR', policy: 'Auto: documentation only, no vehicle effect. Use the draft_flight_ncr tool.' },
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
      { label: 'Preheat time (as-built)', ok: null, detail: `${asBuilt.toFixed(1)} min to 315 °C; spec heater would take ${spec.toFixed(0)} min`, source: 'NCR-002' },
      { label: 'Decision deadline', ok: t <= deadline, detail: `command preheat by ${fmt(deadline)} (spec model says ${fmt(specDeadline)})` },
      { label: 'Operator reachable before deadline', ok: null, detail: `${contact && contact.start < deadline ? 'yes' : 'no'}: ${contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled'}` },
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
      { label: 'Operator reachable before deadline', ok: null, detail: `${contact && contact.start < deadline ? 'yes' : 'no'}: ${contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled'}` },
    ]
    const tier = tierByDeadline(t, deadline, contact, target)
    return {
      kind, tier, deadline, nextContact: contact, checks, params: { session },
      reason: tier === 'auto' ? `Session starts ${fmt(deadline)}, before the next contact; payload-only shed is pre-approved.` : tier === 'gated' ? 'An operator is reachable before the session.' : 'Not a payload load.',
    }
  }

  if (kind === 'BURN_RETIME') {
    if (scenario !== 'tracker-dropout') return { kind, tier: 'refused', reason: 'No scheduled burn to hold.', checks: [], params }
    if (actions.some((a) => a.kind === kind)) return { kind, tier: 'refused', reason: 'The burn is already held.', checks: [], params }
    const deadline = OM_BURN.t
    const outage = TRACKER_OUTAGES.find((o) => OM_BURN.t >= o.start && OM_BURN.t < o.end)
    const toT = retimedBurnT()
    const delay = toT - OM_BURN.t
    const newValid = !TRACKER_OUTAGES.some((o) => toT >= o.start - 5 && toT < o.end + TRACKER.recalMin)
    const checks: Check[] = [
      { label: 'Tracker at the scheduled burn (as-built)', ok: null, source: 'NCR-004',
        detail: outage ? `blinded ${fmt(outage.start)} to ${fmt(outage.end)} (sun below ${TRACKER.asBuiltExclusionDeg}° as flown; spec model says valid down to ${TRACKER.specExclusionDeg}°)` : 'valid' },
      { label: 'Attitude knowledge at the burn', ok: null, source: 'REQ-ADCS-010',
        detail: `${knowledgeErrorDeg(OM_BURN.t).toFixed(2)}° on the IMU alone at ${fmt(OM_BURN.t)} vs 0.02° required` },
      { label: 'New time tracker-valid', ok: newValid, detail: `${fmt(toT)}: ${TRACKER.recalMin} min after reacquisition, sun ${sunAngleDeg(toT).toFixed(0)}°` },
      { label: 'Delay within one orbit', ok: delay <= 95, detail: `${delay.toFixed(0)} min` },
      { label: 'Decision deadline', ok: t <= deadline, detail: `the sequencer fires ${OM_BURN.id} at ${fmt(deadline)} unless held` },
      { label: 'Operator reachable before deadline', ok: null, detail: `${contact && contact.start < deadline ? 'yes' : 'no'}: ${contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled'}` },
    ]
    const tier = tierByDeadline(t, deadline, contact, newValid && delay <= 95 && outage !== undefined)
    return {
      kind, tier, deadline, nextContact: contact, checks, params: { burn: OM_BURN.id, fromT: OM_BURN.t, toT },
      reason: tier === 'auto' ? `${OM_BURN.id} would fire at ${fmt(deadline)} with the tracker blinded, before the next contact; held to ${fmt(toT)}.`
        : tier === 'gated' ? 'An operator is reachable before the burn.' : outage ? 'Outside the autonomous envelope.' : 'The tracker is valid at the scheduled burn; nothing to hold.',
    }
  }

  if (kind === 'ONBOARD_TABLE_UPDATE') {
    if (scenario !== 'tracker-dropout') {
      return { kind, tier: 'gated', nextContact: contact, params, reason: 'Onboard table changes always need operator approval.', checks: [{ label: 'Table', ok: null, detail: String(params.table ?? 'unspecified') }] }
    }
    if (actions.some((a) => a.kind === kind)) return { kind, tier: 'refused', reason: 'The table is already updated.', checks: [], params }
    const seen = TRACKER_OUTAGES.filter((o) => o.start < t)
    const lossDeg = Math.max(...seen.map((o) => sunAngleDeg(o.start)))
    const tableDeg = Math.ceil(lossDeg)
    const deadline = falseSafeModeT()
    const checks: Check[] = [
      { label: 'Exclusion angle as flown', ok: null, source: 'NCR-004', detail: `tracker lost at ${lossDeg.toFixed(1)}° sun angle in ${seen.length} outages; table uses the ${TRACKER.specExclusionDeg}° spec value (REQ-ADCS-021 never tested)` },
      { label: 'Proposed table value', ok: tableDeg > TRACKER.specExclusionDeg && tableDeg <= 60, detail: `${tableDeg}°: outages inside it are expected, so they no longer count toward a tracker failure` },
      { label: 'Without it', ok: null, detail: deadline !== undefined ? `counter reaches ${TRACKER.safeModeCount} at ${fmt(deadline)}: tracker declared failed, false safe mode` : 'no counter trip in view' },
      { label: 'Operator reachable before then', ok: null, detail: `${contact && deadline !== undefined && contact.start < deadline ? 'yes' : 'no'}: ${contact ? `next contact ${contact.station} at ${fmt(contact.start)}` : 'no contact scheduled'}` },
    ]
    return {
      kind, tier: deadline !== undefined && t > deadline ? 'refused' : 'gated', deadline, nextContact: contact, checks,
      params: { table: 'ST_SUN_EXCLUSION_DEG', from: TRACKER.specExclusionDeg, to: tableDeg },
      reason: `Changes onboard fault detection, so an operator decides; ${contact ? `${contact.station} at ${fmt(contact.start)}` : 'the next contact'} is before the counter trips.`,
    }
  }

  if (kind === 'PROPULSION_PROCEDURE') {
    const eol = deltaVAtEndOfLife(5 * 365)
    return {
      kind, tier: 'gated', nextContact: contact, params,
      reason: 'Propulsion procedures always need operator approval.',
      checks: [
        { label: 'Procedure', ok: null, detail: String(params.procedure ?? 'unspecified') },
        { label: 'End-of-life delta-v if the leak continues', ok: eol.deltaVMs >= TANK.requiredDeltaVMs, detail: `${eol.deltaVMs.toFixed(0)} m/s vs ${TANK.requiredDeltaVMs} m/s required`, source: 'REQ-SYS-002' },
      ],
    }
  }

  return { kind, tier: 'auto', reason: 'Documentation only; no vehicle effect.', checks: [], params }
}
