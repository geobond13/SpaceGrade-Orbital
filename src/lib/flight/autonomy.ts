// Who is allowed to act, and when. The agent only proposes; this policy is
// deterministic and decides whether a proposal executes, waits for a human,
// or is refused. Authority depends on one question: can a human be reached
// before the decision deadline?

import { burnPlan, COMMAND_PATH, CONJUNCTION_EVENT, eclipseDodPct, falseSafeModeT, knowledgeErrorDeg, leakFit, nextContact, OM_BURN, retimedBurnT, scenarioWith, sunAngleDeg, TRACKER, TRACKER_OUTAGES, XBAND_SESSION, type ActionKind, type Conditions, type ExecutedAction, type ScenarioId } from './scenarios'
import { BATTERY, CONJUNCTION, preheatMinutes, TANK } from './physics'

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
  /** What a model built from the spec sheet would conclude, against the as-built answer. */
  counterfactual?: { spec: string; asBuilt: string }
  /** Times for the deadline comparison; specDeadline only where the build record moves it. */
  timing?: { label: string; deadline: number; specDeadline?: number; contact?: number; contactLabel?: string }
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

/** Every autonomous action goes up the relay; the check keeps the link apart from staffing. */
const commandPathCheck: Check = { label: 'Command path', ok: true, detail: `${COMMAND_PATH.label}: ${COMMAND_PATH.detail}` }

const reachable = (contact: { station: string; start: number } | undefined, deadline: number | undefined) =>
  `${contact && deadline !== undefined && contact.start < deadline ? 'yes' : 'no'}: ${contact ? `next operator ${contact.station} at ${fmt(contact.start)}` : 'no operator scheduled'}`

export function decide(scenario: ScenarioId, t: number, kind: ActionKind, params: Record<string, unknown>, actions: ExecutedAction[], cond: Conditions = {}): Decision {
  const s = scenarioWith(scenario, cond)
  const pass = nextContact(s, t)
  const contact = pass && { station: pass.station, start: pass.start }

  if (kind === 'COLLISION_AVOIDANCE_BURN') {
    if (scenario !== 'conjunction') return { kind, tier: 'refused', reason: 'No conjunction is active.', checks: [], params }
    if (actions.some((a) => a.kind === kind)) return { kind, tier: 'refused', reason: 'A burn is already commanded.', checks: [], params }
    const slow = !cond.heaterConforming
    const asBuilt = preheatMinutes(slow)
    const spec = preheatMinutes(false)
    // Preheat must start by TCA − planned lead − preheat time.
    const deadline = CONJUNCTION_EVENT.tca - CONJUNCTION.plannedLeadMin - asBuilt
    const specDeadline = CONJUNCTION_EVENT.tca - CONJUNCTION.plannedLeadMin - spec
    const plan = burnPlan(t, slow)
    const dvOk = plan.deltaVMs <= CONJUNCTION.maxDeltaVMs
    const budgetAfter = TANK.deltaVBudgetMs - plan.deltaVMs
    const checks: Check[] = [
      { label: 'Preheat time (as-built)', ok: null, source: 'NCR-002',
        detail: slow ? `${asBuilt.toFixed(1)} min to 315 °C; spec heater would take ${spec.toFixed(0)} min` : `${asBuilt.toFixed(0)} min to 315 °C: heater reworked before launch` },
      { label: 'Decision deadline', ok: t <= deadline, detail: `start preheat by ${fmt(deadline)}${slow ? ` (spec model says ${fmt(specDeadline)})` : ''}` },
      { label: 'Operator reachable before deadline', ok: null, detail: reachable(contact, deadline) },
      { label: 'Δv within envelope', ok: dvOk, detail: `${plan.deltaVMs.toFixed(3)} m/s for a ${plan.leadMin.toFixed(0)} min lead (limit ${CONJUNCTION.maxDeltaVMs} m/s)` },
      { label: 'Delta-v budget kept', ok: budgetAfter >= TANK.requiredDeltaVMs, detail: `${budgetAfter.toFixed(2)} m/s left vs ${TANK.requiredDeltaVMs} m/s required`, source: 'REQ-SYS-002' },
      commandPathCheck,
    ]
    const tier = tierByDeadline(t, deadline, contact, dvOk && budgetAfter >= TANK.requiredDeltaVMs)
    const who = contact ? `the operator at ${fmt(contact.start)}` : 'any operator'
    const reason = tier === 'auto'
      ? `Preheat must start by ${fmt(deadline)}; the next operator is ${contact ? `at ${fmt(contact.start)}` : 'not scheduled'}, so nobody can decide in time. The burn is inside the envelope.`
      : tier === 'gated' ? `An operator (${contact?.station}, ${fmt(contact!.start)}) is reachable before the ${fmt(deadline)} deadline, so a human decides.`
        : t > deadline ? 'Deadline passed.' : 'Outside the autonomous envelope.'
    return {
      kind, tier, deadline, nextContact: contact, reason, checks,
      params: { cmdT: t, burnT: plan.burnT, deltaVMs: plan.deltaVMs, leadMin: plan.leadMin },
      counterfactual: slow
        ? {
          spec: `Spec heater (30 min preheat): deadline ${fmt(specDeadline)}${contact && contact.start < specDeadline ? `, after ${who}: the burn would wait for a human` : ''}.`,
          asBuilt: `As built (NCR-002, ${asBuilt.toFixed(1)} min): deadline ${fmt(deadline)}${contact && contact.start < deadline ? `, still after ${who}` : `, before ${who}`}.`,
        }
        : { spec: `Spec heater (30 min preheat): deadline ${fmt(specDeadline)}.`, asBuilt: `Reworked heater meets the spec: the same deadline, ${fmt(deadline)}.` },
      timing: { label: 'Latest time to start preheat', deadline, specDeadline: slow ? specDeadline : undefined, contact: contact?.start, contactLabel: contact?.station },
    }
  }

  if (kind === 'PAYLOAD_LOAD_SHED') {
    if (scenario !== 'eclipse-power') return { kind, tier: 'refused', reason: 'No payload session to shed.', checks: [], params }
    const session = String(params.session ?? XBAND_SESSION.id)
    const target = session === XBAND_SESSION.id
    const deadline = XBAND_SESSION.start
    const before = eclipseDodPct(t, true, actions)
    const after = eclipseDodPct(t, true, [...actions, { kind, t, params: { session } }])
    const spec = eclipseDodPct(t, false, actions)
    const checks: Check[] = [
      { label: 'Payload load only', ok: target, detail: target ? `${XBAND_SESSION.id} X-band downlink, ${XBAND_SESSION.watts} W` : `unknown session ${session}` },
      { label: 'Depth of discharge (as-built)', ok: after.dodPct <= BATTERY.maxDodPct, detail: `${before.dodPct.toFixed(1)} % → ${after.dodPct.toFixed(1)} % (limit ${BATTERY.maxDodPct} %)`, source: 'NCR-005' },
      { label: 'Decision deadline', ok: t <= deadline, detail: `session starts ${fmt(deadline)}` },
      { label: 'Operator reachable before deadline', ok: null, detail: reachable(contact, deadline) },
      commandPathCheck,
    ]
    const tier = tierByDeadline(t, deadline, contact, target)
    return {
      kind, tier, deadline, nextContact: contact, checks, params: { session },
      reason: tier === 'auto' ? `Session starts ${fmt(deadline)}, before the next operator; payload-only shed is pre-approved.` : tier === 'gated' ? 'An operator is reachable before the session.' : 'Not a payload load.',
      counterfactual: {
        spec: `Spec battery (10.0 Ah): next eclipse ${spec.dodPct.toFixed(1)} % depth of discharge, under the ${BATTERY.maxDodPct} % limit, so the downlink would run.`,
        asBuilt: `As built (NCR-005, 9.6 Ah): ${before.dodPct.toFixed(1)} %, over the limit unless the ${XBAND_SESSION.watts} W session is shed (then ${after.dodPct.toFixed(1)} %).`,
      },
      timing: { label: `${XBAND_SESSION.id} starts`, deadline, contact: contact?.start, contactLabel: contact?.station },
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
      { label: 'Operator reachable before deadline', ok: null, detail: reachable(contact, deadline) },
      commandPathCheck,
    ]
    const tier = tierByDeadline(t, deadline, contact, newValid && delay <= 95 && outage !== undefined)
    return {
      kind, tier, deadline, nextContact: contact, checks, params: { burn: OM_BURN.id, fromT: OM_BURN.t, toT },
      reason: tier === 'auto' ? `${OM_BURN.id} would fire at ${fmt(deadline)} with the tracker blinded, before the next operator; held to ${fmt(toT)}.`
        : tier === 'gated' ? 'An operator is reachable before the burn.' : outage ? 'Outside the autonomous envelope.' : 'The tracker is valid at the scheduled burn; nothing to hold.',
      counterfactual: {
        spec: `Spec exclusion angle (${TRACKER.specExclusionDeg}°): the tracker is valid at ${fmt(OM_BURN.t)}, so ${OM_BURN.id} fires as scheduled.`,
        asBuilt: `As flown (NCR-004, about ${TRACKER.asBuiltExclusionDeg}°): blinded at ${fmt(OM_BURN.t)}, so the burn would fire with ${knowledgeErrorDeg(OM_BURN.t).toFixed(2)}° attitude error (limit 0.02°).`,
      },
      timing: { label: `${OM_BURN.id} fires`, deadline, contact: contact?.start, contactLabel: contact?.station },
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
      { label: 'Operator reachable before then', ok: null, detail: reachable(contact, deadline) },
    ]
    return {
      kind, tier: deadline !== undefined && t > deadline ? 'refused' : 'gated', deadline, nextContact: contact, checks,
      params: { table: 'ST_SUN_EXCLUSION_DEG', from: TRACKER.specExclusionDeg, to: tableDeg },
      reason: `Changes onboard fault detection, so an operator decides; ${contact ? `${contact.station} at ${fmt(contact.start)}` : 'the next contact'} is before the counter trips.`,
      counterfactual: {
        spec: `Table left at ${TRACKER.specExclusionDeg}°: every expected outage counts as a fault; the counter reaches ${TRACKER.safeModeCount} at ${deadline !== undefined ? fmt(deadline) : 'a later orbit'} and the vehicle safes itself.`,
        asBuilt: `Table at ${tableDeg}° (as flown): outages inside it are expected and stop counting; the tracker stays in use.`,
      },
      timing: deadline !== undefined ? { label: `Counter reaches ${TRACKER.safeModeCount}`, deadline, contact: contact?.start, contactLabel: contact?.station } : undefined,
    }
  }

  if (kind === 'PROPULSION_PROCEDURE') {
    const leak = leakFit(t)
    const today = Math.floor(s.missionDay + t / 1440)
    return {
      kind, tier: 'gated', nextContact: contact, params,
      reason: 'Propulsion procedures always need operator approval.',
      checks: [
        { label: 'Procedure', ok: null, detail: String(params.procedure ?? 'unspecified') },
        { label: 'Delta-v remaining at end of life if the leak continues', ok: leak.remainingAtEndOfLifeMs >= TANK.requiredDeltaVMs,
          detail: `${leak.remainingAtEndOfLifeMs.toFixed(0)} m/s remaining vs ${TANK.requiredDeltaVMs} m/s required (${leak.shortfallMs.toFixed(0)} m/s short)`, source: 'REQ-SYS-002' },
        ...(leak.dayLost !== undefined ? [{ label: 'Requirement lost', ok: null, detail: `mission day ${leak.dayLost}, ${leak.dayLost - today} days from now` }] : []),
      ],
      counterfactual: {
        spec: 'Without the build record: a pressure decline of unknown cause (tank, valve seat, sensor or thermal), with no basis for a leak rate or a delta-v projection.',
        asBuilt: `With NCR-001: the slope matches the qualification valve's 3.2e-4 scc/s seat leak, leaving ${leak.remainingAtEndOfLifeMs.toFixed(0)} m/s at end of life against ${TANK.requiredDeltaVMs} m/s required.`,
      },
    }
  }

  return { kind, tier: 'auto', reason: 'Documentation only; no vehicle effect.', checks: [], params }
}
