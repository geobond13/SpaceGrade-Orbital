// Onboard-style fault detection: fixed rules, no model in the loop. A rule
// firing is what wakes the agent; deciding what it means is the agent's job.

import { CONJUNCTION_EVENT, eclipseDodPct, knowledgeErrorDeg, OM_BURN, SCENARIOS, sample, sunAngleDeg, TRACKER, TRACKER_OUTAGES, type ScenarioId } from './scenarios'
import { BATTERY } from './physics'

export interface FlightEvent {
  id: string // FE-101
  scenario: ScenarioId
  t: number
  severity: 'watch' | 'warning' | 'critical'
  rule: string
  channel: string
  partId: string
  summary: string
}

/** Least-squares slope and its standard error. */
export function linearFit(points: { t: number; v: number }[]) {
  const n = points.length
  const mt = points.reduce((s, p) => s + p.t, 0) / n
  const mv = points.reduce((s, p) => s + p.v, 0) / n
  const sxx = points.reduce((s, p) => s + (p.t - mt) ** 2, 0)
  const slope = points.reduce((s, p) => s + (p.t - mt) * (p.v - mv), 0) / sxx
  const resid = points.reduce((s, p) => s + (p.v - (mv + slope * (p.t - mt))) ** 2, 0)
  const se = Math.sqrt(resid / Math.max(1, n - 2) / sxx)
  return { slope, intercept: mv - slope * mt, se, n }
}

function valveLeakEvents(): FlightEvent[] {
  const s = SCENARIOS['valve-leak']
  const t = 10 // weekly propulsion trending job
  const ch = s.channels.find((c) => c.id === 'TM-PROP-03')!
  const fit = linearFit(sample(ch, t - 7 * 1440, t, 337, []))
  const perDay = fit.slope * 1440
  if (perDay > -0.03 || Math.abs(fit.slope / fit.se) < 5) return []
  return [{
    id: 'FE-101', scenario: s.id, t, severity: 'watch', rule: 'PROP-TREND-7D', channel: ch.id, partId: ch.partId,
    summary: `Temperature-compensated tank pressure trending ${perDay.toFixed(3)} psi/day over 7 days (limit -0.030). No propulsion activity in the window.`,
  }]
}

function conjunctionEvents(): FlightEvent[] {
  const c = CONJUNCTION_EVENT
  if (c.pc < 1e-4) return []
  return [{
    id: 'FE-201', scenario: 'conjunction', t: 2, severity: 'critical', rule: 'CONJ-SCREEN-PC', channel: 'TM-CONJ-02', partId: 'P-STR-01',
    summary: `${c.cdm}: ${c.object}, closest approach in ${c.tca - 2} min, predicted miss ${c.missM} m, Pc ${c.pc.toExponential(1)} (action threshold 1e-4).`,
  }]
}

function eclipsePowerEvents(): FlightEvent[] {
  const s = SCENARIOS['eclipse-power']
  const v = s.channels.find((c) => c.id === 'TM-PWR-02')!
  // Voltage residual at the end of each of the last three eclipses.
  const ends = s.eclipses.filter((e) => e.end <= 4).slice(-3).map((e) => e.end - 0.5)
  const residuals = ends.map((t) => v.value(t, []) - v.specModel!(t, []))
  const forecast = eclipseDodPct(5, false, []) // onboard forecast uses the spec capacity
  const marginal = BATTERY.maxDodPct - forecast.dodPct < 1
  if (!(residuals.length === 3 && residuals.every((r) => r < -0.03) && marginal)) return []
  return [{
    id: 'FE-301', scenario: s.id, t: 4, severity: 'watch', rule: 'PWR-VRESID-3E', channel: v.id, partId: v.partId,
    summary: `End-of-eclipse battery voltage ${residuals.map((r) => r.toFixed(3)).join(', ')} V below model for 3 eclipses. Next eclipse forecast ${forecast.dodPct.toFixed(1)} % depth of discharge (limit ${BATTERY.maxDodPct} %).`,
  }]
}

function trackerEvents(): FlightEvent[] {
  const t = 4
  const recent = TRACKER_OUTAGES.filter((o) => o.end <= t).slice(-3)
  if (recent.length < 3 || recent.some((o) => o.end - o.start < 15)) return []
  const peak = Math.max(...recent.map((o) => knowledgeErrorDeg(o.end - 0.01)))
  const minSun = Math.min(...recent.map((o) => sunAngleDeg((o.start + o.end) / 2)))
  return [{
    id: 'FE-401', scenario: 'tracker-dropout', t, severity: 'warning', rule: 'ST-INVALID-3O', channel: 'TM-ADCS-02', partId: 'P-ADCS-02',
    summary: `Star tracker invalid in each of the last 3 orbits (${recent.map((o) => Math.round(o.end - o.start)).join(', ')} min). Attitude propagated on the IMU alone; peak knowledge error ${peak.toFixed(2)}° (limit 0.02°). Sun angle never went below ${minSun.toFixed(0)}° (exclusion limit ${TRACKER.specExclusionDeg}°). Tracker health counter 3 of 5: at 5 the vehicle declares the tracker failed and enters safe mode. ${OM_BURN.id} burn scheduled at T+${OM_BURN.t} min.`,
  }]
}

export function detect(scenario: ScenarioId): FlightEvent[] {
  if (scenario === 'valve-leak') return valveLeakEvents()
  if (scenario === 'conjunction') return conjunctionEvents()
  if (scenario === 'tracker-dropout') return trackerEvents()
  return eclipsePowerEvents()
}

export function eventById(id: string): FlightEvent | undefined {
  for (const s of Object.keys(SCENARIOS) as ScenarioId[]) {
    const e = detect(s).find((x) => x.id === id)
    if (e) return e
  }
  return undefined
}
