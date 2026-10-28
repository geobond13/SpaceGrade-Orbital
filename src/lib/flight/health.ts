// What each part looks like in Flight Mode: quiet when nominal, orange where
// FDIR saw the symptom, red where the build record located the cause, cyan
// while an action is running. Pure, so the twin and tests agree.

import { burnPlan, OM_BURN, retimedBurnT, XBAND_SESSION, type Conditions, type ExecutedAction } from './scenarios'
import { preheatMinutes } from './physics'
import type { FlightEvent } from './fdir'
import { db } from '@/lib/tools/lookup'

export type Health = 'nominal' | 'watch' | 'cause' | 'commanded' | 'shed'

export const HEALTH: Record<Health, { hex: string; label: string; pulse: boolean; rest: number }> = {
  cause: { hex: '#ff4d6d', label: 'Cause (build record)', pulse: true, rest: 0.6 },
  watch: { hex: '#ff9a3d', label: 'FDIR symptom', pulse: false, rest: 0.55 },
  commanded: { hex: '#4cc9f0', label: 'Commanded', pulse: true, rest: 0.7 },
  shed: { hex: '#5f7189', label: 'Load shed', pulse: false, rest: 0.3 },
  nominal: { hex: '#2dd4bf', label: 'Nominal', pulse: false, rest: 0 },
}

const RANK: Health[] = ['commanded', 'cause', 'watch', 'shed', 'nominal']

export function partHealth(t: number, fired: FlightEvent[], causeNcrs: string[], actions: ExecutedAction[], cond: Conditions = {}): Record<string, Health> {
  const out: Record<string, Health> = {}
  const mark = (id: string, h: Health) => {
    const cur = out[id] ?? 'nominal'
    if (RANK.indexOf(h) < RANK.indexOf(cur)) out[id] = h
  }
  for (const e of fired) mark(e.partId, 'watch')
  for (const id of causeNcrs) {
    const ncr = db.nonconformances.find((n) => n.id === id)
    if (ncr) mark(ncr.partId, 'cause')
  }
  for (const a of actions) {
    if (a.kind === 'COLLISION_AVOIDANCE_BURN') {
      const plan = burnPlan(a.t, !cond.heaterConforming)
      // Heater on from the command; thrusters fire for a couple of minutes at the planned burn time.
      if (t >= a.t && t < plan.burnT + 2) mark('P-PROP-05', 'commanded')
      if (t >= plan.burnT && t < plan.burnT + 2) mark('P-PROP-04', 'commanded')
    }
    if (a.kind === 'BURN_RETIME') {
      // The held burn runs later: preheat, then ignition on a fresh star tracker solution.
      const burnT = retimedBurnT()
      if (t >= burnT - preheatMinutes(true) && t < burnT + OM_BURN.durationMin) mark('P-PROP-05', 'commanded')
      if (t >= burnT && t < burnT + OM_BURN.durationMin) mark('P-PROP-04', 'commanded')
    }
    if (a.kind === 'PAYLOAD_LOAD_SHED' && t < XBAND_SESSION.end) mark('P-COM-05', 'shed')
  }
  return out
}
