// Where an action is right now: proposed, authorised, preheating, burning, verified.
// "Authorised" is not "done": a burn authorised at T+2 still has 43 minutes of
// preheat ahead of it. Derived from sim time, so the card never says more than the sim has done.

import type { Decision } from './autonomy'
import { BATTERY, preheatMinutes } from './physics'
import { burnPlan, eclipseDodPct, falseSafeModeT, knowledgeErrorDeg, missDistance, OM_BURN, retimedBurnT, trackerHealthCount, XBAND_SESSION, type Conditions, type ExecutedAction } from './scenarios'

export type StepState = 'done' | 'active' | 'pending' | 'skipped'
export interface Step { label: string; t?: number; state: StepState; detail?: string }

export interface Verdict { verdict: 'approved' | 'rejected'; t: number }

const at = (simT: number, t: number, end = t): StepState => (simT >= end ? 'done' : simT >= t ? 'active' : 'pending')

/** Steps after the vehicle starts acting at `t0`, per action kind. */
function effectSteps(d: Decision, t0: number, simT: number, actions: ExecutedAction[], cond: Conditions): Step[] {
  if (d.kind === 'COLLISION_AVOIDANCE_BURN') {
    const plan = burnPlan(t0, !cond.heaterConforming)
    const end = plan.burnT + 2
    return [
      { label: 'Preheat commanded', t: t0, state: at(simT, t0, t0 + 0.01), detail: 'up the relay link' },
      { label: 'Bed at 315 °C', t: plan.burnT, state: at(simT, t0, plan.burnT), detail: `${(plan.burnT - t0).toFixed(1)} min of preheat` },
      { label: 'Burn', t: plan.burnT, state: at(simT, plan.burnT, end), detail: `${plan.deltaVMs.toFixed(2)} m/s` },
      { label: 'Miss distance checked', t: end, state: simT >= end ? 'done' : 'pending', detail: simT >= end ? `${Math.round(missDistance(0, []))} m → ${Math.round(missDistance(end, actions, !cond.heaterConforming))} m` : undefined },
    ]
  }
  if (d.kind === 'BURN_RETIME') {
    const toT = retimedBurnT()
    const heatT = toT - preheatMinutes(true)
    return [
      { label: `${OM_BURN.id} held`, t: OM_BURN.t, state: simT >= OM_BURN.t ? 'done' : 'active', detail: simT >= OM_BURN.t ? `did not fire at T+${OM_BURN.t}` : `would fire at T+${OM_BURN.t}` },
      { label: 'Preheat', t: heatT, state: at(simT, heatT, toT) },
      { label: 'Burn', t: toT, state: at(simT, toT, toT + OM_BURN.durationMin) },
      { label: 'Attitude checked', t: toT, state: simT >= toT ? 'done' : 'pending', detail: simT >= toT ? `${knowledgeErrorDeg(toT).toFixed(3)}° at ignition` : undefined },
    ]
  }
  if (d.kind === 'PAYLOAD_LOAD_SHED') {
    const ecl = eclipseDodPct(t0, true, actions)
    return [
      { label: `${XBAND_SESSION.id} cancelled`, t: XBAND_SESSION.start, state: simT >= XBAND_SESSION.start ? 'done' : 'active', detail: simT >= XBAND_SESSION.start ? 'transmitter stayed off' : `session at T+${XBAND_SESSION.start}` },
      { label: 'Eclipse depth checked', t: ecl.eclipse.end, state: at(simT, ecl.eclipse.start, ecl.eclipse.end), detail: simT >= ecl.eclipse.end ? `${ecl.dodPct.toFixed(1)} % (limit ${BATTERY.maxDodPct} %)` : undefined },
    ]
  }
  if (d.kind === 'ONBOARD_TABLE_UPDATE') {
    const trip = falseSafeModeT()
    return [
      { label: 'Table uploaded', t: t0, state: at(simT, t0, t0 + 0.01), detail: `${String(d.params.from)}° → ${String(d.params.to)}°` },
      ...(trip !== undefined ? [{ label: 'Counter held', t: trip, state: (simT >= trip ? 'done' : 'pending') as StepState, detail: simT >= trip ? `${trackerHealthCount(trip, actions)} of 5, no safe mode` : `would have tripped at T+${Math.round(trip)}` }] : []),
    ]
  }
  if (d.kind === 'PROPULSION_PROCEDURE') {
    return [{ label: 'Procedure handed to operations', t: t0, state: at(simT, t0, t0 + 0.01), detail: 'run by the flight team; not simulated' }]
  }
  return []
}

export function lifecycle(d: Decision, eventT: number, simT: number, actions: ExecutedAction[], cond: Conditions = {}, verdict?: Verdict): Step[] {
  const head: Step[] = [{ label: 'Proposed by agent', t: eventT, state: 'done' }]
  if (d.tier === 'refused') return [...head, { label: 'Refused by policy', t: eventT, state: 'done', detail: d.reason }]
  if (d.tier === 'auto') return [...head, { label: 'Authorised by policy', t: eventT, state: 'done', detail: 'no operator reachable in time' }, ...effectSteps(d, eventT, simT, actions, cond)]
  const contact = d.nextContact
  const decisionT = verdict?.t ?? contact?.start
  const waiting: Step = verdict
    ? { label: verdict.verdict === 'approved' ? 'Approved by operator' : 'Rejected by operator', t: verdict.t, state: simT >= verdict.t ? 'done' : 'active', detail: contact ? `${contact.station} pass` : undefined }
    : { label: 'Operator decides', t: decisionT, state: decisionT === undefined || simT >= decisionT ? 'active' : 'pending', detail: contact ? `${contact.station} pass` : 'next operator' }
  const rest = verdict?.verdict === 'approved' ? effectSteps(d, verdict.t, simT, actions, cond)
    : verdict?.verdict === 'rejected' ? [] : effectSteps(d, decisionT ?? eventT, -Infinity, actions, cond).map((s) => ({ ...s, state: 'pending' as const, detail: undefined }))
  return [...head, { label: 'Needs an operator', t: eventT, state: 'done', detail: contact && d.deadline !== undefined && contact.start < d.deadline ? 'a human is reachable in time' : 'policy class always asks' }, waiting, ...rest]
}
