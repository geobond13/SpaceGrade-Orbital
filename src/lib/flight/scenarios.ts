// Three scripted flight situations for KESTREL-1. Each turns one record from
// the build pedigree into a flight problem. Times are minutes from "now" (t = 0).

import {
  BATTERY, bedTempC, batteryWh, CONJUNCTION, deltaVForLead, packVoltage, preheatMinutes, tankPressure20C,
} from './physics'

export type ScenarioId = 'valve-leak' | 'conjunction' | 'eclipse-power'

export type ActionKind = 'COLLISION_AVOIDANCE_BURN' | 'PAYLOAD_LOAD_SHED' | 'PROPULSION_PROCEDURE' | 'FLIGHT_NCR_DRAFT'

/** An action that has been executed (autonomously or after approval) at sim time `t`. */
export interface ExecutedAction { kind: ActionKind; t: number; params: Record<string, unknown> }

export interface Window { start: number; end: number }
export interface Pass extends Window { id: string; station: string; attended: boolean }

export interface Channel {
  id: string // TM-PROP-01
  label: string
  unit: string
  partId: string
  decimals: number
  /** What the vehicle reports. */
  value(t: number, actions: ExecutedAction[]): number
  /** What a model built from the spec sheet predicts. Drawn dashed. */
  specModel?(t: number, actions: ExecutedAction[]): number
}

export interface Scenario {
  id: ScenarioId
  title: string
  tagline: string
  missionDay: number // mission day at t = 0
  /** Visible history and run-out, minutes. */
  range: Window
  /** Default telemetry window around "now". */
  view: Window
  /** Playback speeds offered, sim minutes per real second. */
  speeds: number[]
  channels: Channel[]
  eclipses: Window[]
  passes: Pass[]
  /** Scheduled items shown on the timeline. */
  schedule: { id: string; label: string; start: number; end: number }[]
  /** Marks on the timeline, e.g. time of closest approach. */
  marks: { id: string; label: string; t: number }[]
  /** The records the scenario grows out of; the agent has to find these itself. */
  pedigree: string[]
}

// Deterministic noise in [-1, 1].
function noise(seed: number, t: number): number {
  const x = Math.sin(seed * 12.9898 + t * 78.233) * 43_758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const ORBIT_MIN = 95
const ECLIPSE_MIN = 36

/** Eclipses for an orbit whose last eclipse ended at `lastEnd`. */
function eclipsesFrom(lastEnd: number, range: Window): Window[] {
  const out: Window[] = []
  for (let end = lastEnd - ORBIT_MIN * Math.ceil((lastEnd - range.start) / ORBIT_MIN); end - ECLIPSE_MIN < range.end; end += ORBIT_MIN) {
    out.push({ start: end - ECLIPSE_MIN, end })
  }
  return out
}

const inAny = (t: number, ws: Window[]) => ws.some((w) => t >= w.start && t < w.end)

// ── A. Valve seat leak ────────────────────────────────────────────────────────

const A_DAY = 41
const aEclipses = eclipsesFrom(30, { start: -7 * 1440, end: 1440 })
/** Tank temperature follows the orbit: warmer in sunlight, cooler in eclipse. */
const tankTempC = (t: number) => 20 + (inAny(t, aEclipses) ? -2.2 : 1.6) + 0.4 * Math.sin((2 * Math.PI * t) / (ORBIT_MIN * 15))
const day = (t: number) => A_DAY + t / 1440

const valveLeak: Scenario = {
  id: 'valve-leak',
  title: 'Slow pressure loss',
  tagline: 'Tank pressure is drifting down. Leak, sensor, or thermal?',
  missionDay: A_DAY,
  range: { start: -7 * 1440, end: 1440 },
  view: { start: -7 * 1440, end: 60 },
  speeds: [60, 600, 3600],
  eclipses: aEclipses,
  passes: [
    { id: 'PASS-A1', station: 'Svalbard', attended: true, start: 140, end: 151 },
    { id: 'PASS-A2', station: 'Fairbanks', attended: true, start: 236, end: 246 },
  ],
  schedule: [],
  marks: [],
  pedigree: ['NCR-001', 'P-PROP-03', 'REQ-PROP-020', 'REQ-SYS-002'],
  channels: [
    {
      id: 'TM-PROP-01', label: 'Tank pressure', unit: 'psia', partId: 'P-PROP-02', decimals: 2,
      value: (t) => tankPressure20C(day(t)) * ((tankTempC(t) + 273.15) / 293.15) + 0.03 * noise(1, t),
      specModel: (t) => tankPressure20C(day(t), 0) * ((tankTempC(t) + 273.15) / 293.15),
    },
    {
      id: 'TM-PROP-02', label: 'Tank temperature', unit: '°C', partId: 'P-PROP-02', decimals: 2,
      value: (t) => tankTempC(t) + 0.05 * noise(2, t),
    },
    {
      id: 'TM-PROP-03', label: 'Tank pressure at 20 °C', unit: 'psia', partId: 'P-PROP-02', decimals: 2,
      // Ground-computed: removes the orbital thermal swing so a slow trend becomes visible.
      value: (t) => tankPressure20C(day(t)) + 0.03 * noise(3, t),
      specModel: (t) => tankPressure20C(day(t), 0),
    },
  ],
}

// ── B. Conjunction with a slow catalyst heater ────────────────────────────────

const B_TCA = 120
const B_MISS_M = 180

/** Burn timing for a collision-avoidance command issued at `cmdT`, with as-built preheat. */
export function burnPlan(cmdT: number, asBuilt = true) {
  const burnT = cmdT + preheatMinutes(asBuilt)
  const leadMin = B_TCA - burnT
  return { cmdT, burnT, leadMin, deltaVMs: leadMin > 0 ? deltaVForLead(leadMin) : Infinity }
}

const burnOf = (actions: ExecutedAction[]) => actions.find((a) => a.kind === 'COLLISION_AVOIDANCE_BURN')

function missDistance(t: number, actions: ExecutedAction[]): number {
  const burn = burnOf(actions)
  if (!burn) return B_MISS_M
  const plan = burnPlan(burn.t)
  if (t < plan.burnT || plan.leadMin <= 0) return B_MISS_M
  const dv = Math.min(CONJUNCTION.maxDeltaVMs, plan.deltaVMs)
  return B_MISS_M + 3 * dv * plan.leadMin * 60
}

/** Probability of collision falls off steeply with miss distance (synthetic fit). */
const pcFor = (missM: number) => 2.1e-4 * Math.exp(-(missM - B_MISS_M) / 140)

const conjunction: Scenario = {
  id: 'conjunction',
  title: 'Conjunction, nobody on console',
  tagline: 'Debris pass in two hours. The next ground contact is too late, and the thruster heater is slow.',
  missionDay: 63,
  range: { start: -60, end: 180 },
  view: { start: -30, end: 150 },
  speeds: [6, 30, 60],
  eclipses: eclipsesFrom(-20, { start: -60, end: 180 }),
  passes: [
    { id: 'PASS-B1', station: 'Svalbard', attended: true, start: 38, end: 48 },
    { id: 'PASS-B2', station: 'McMurdo', attended: true, start: 133, end: 142 },
  ],
  schedule: [],
  marks: [{ id: 'TCA', label: 'Closest approach (CDM-0412)', t: B_TCA }],
  pedigree: ['NCR-002', 'P-PROP-05', 'REQ-PROP-028'],
  channels: [
    {
      id: 'TM-CONJ-01', label: 'Predicted miss distance', unit: 'm', partId: 'P-STR-01', decimals: 0,
      value: (t, a) => (t < 2 ? NaN : missDistance(t, a)),
    },
    {
      id: 'TM-CONJ-02', label: 'Collision probability', unit: '', partId: 'P-STR-01', decimals: 7,
      value: (t, a) => (t < 2 ? NaN : pcFor(missDistance(t, a))),
    },
    {
      id: 'TM-PROP-05', label: 'Catalyst bed temperature', unit: '°C', partId: 'P-PROP-05', decimals: 0,
      value: (t, a) => {
        const burn = burnOf(a)
        return bedTempC(burn ? t - burn.t : 0, true) + 0.6 * noise(5, t)
      },
      specModel: (t, a) => {
        const burn = burnOf(a)
        return bedTempC(burn ? t - burn.t : 0, false)
      },
    },
  ],
}

// ── C. Eclipse power with weak cells ──────────────────────────────────────────

const C_LAST_ECLIPSE_END = 4
const cRange = { start: -300, end: 240 }
const cEclipses = eclipsesFrom(C_LAST_ECLIPSE_END, cRange)
const XBAND = { id: 'XB-0412', start: 78, end: 86.5, watts: 60 }
const BUS_W = 70
const ECLIPSE_HEATERS_W = 10
const CHARGE_W = 120

const shed = (actions: ExecutedAction[]) => actions.some((a) => a.kind === 'PAYLOAD_LOAD_SHED')
export const busLoadW = (t: number, actions: ExecutedAction[]) =>
  BUS_W + (inAny(t, cEclipses) ? ECLIPSE_HEATERS_W : 0) + (t >= XBAND.start && t < XBAND.end && !shed(actions) ? XBAND.watts : 0)

/** State of charge over the range, integrated at 0.5 min steps for a given capacity. */
function socTrace(capacityWh: number, actions: ExecutedAction[]): Float64Array {
  const step = 0.5
  const n = Math.ceil((cRange.end - cRange.start) / step) + 1
  const out = new Float64Array(n)
  let soc = 1
  for (let i = 0; i < n; i++) {
    const t = cRange.start + i * step
    const load = busLoadW(t, actions)
    const net = inAny(t, cEclipses) ? -load : CHARGE_W
    soc = Math.min(1, soc + (net * step) / 60 / capacityWh)
    out[i] = soc
  }
  return out
}

const traceCache = new Map<string, Float64Array>()
function socAt(t: number, asBuilt: boolean, actions: ExecutedAction[]): number {
  const key = `${asBuilt}:${shed(actions)}`
  let trace = traceCache.get(key)
  if (!trace) traceCache.set(key, (trace = socTrace(batteryWh(asBuilt), actions)))
  const i = Math.round((Math.min(cRange.end, Math.max(cRange.start, t)) - cRange.start) / 0.5)
  return trace[i]
}

/** Deepest discharge of the eclipse that contains or follows `t`, in % of capacity. */
export function eclipseDodPct(t: number, asBuilt: boolean, actions: ExecutedAction[]): { eclipse: Window; dodPct: number } {
  const eclipse = cEclipses.find((e) => e.end > t) ?? cEclipses[cEclipses.length - 1]
  let usedWh = 0
  for (let x = eclipse.start; x < eclipse.end; x += 0.5) usedWh += (busLoadW(x, actions) * 0.5) / 60
  return { eclipse, dodPct: (usedWh / batteryWh(asBuilt)) * 100 }
}

const eclipsePower: Scenario = {
  id: 'eclipse-power',
  title: 'Eclipse power with weak cells',
  tagline: 'Battery voltage sags a little more each eclipse than the model expects.',
  missionDay: 88,
  range: cRange,
  view: { start: -220, end: 140 },
  speeds: [6, 30, 60],
  eclipses: cEclipses,
  passes: [
    { id: 'PASS-C1', station: 'Inuvik', attended: true, start: 110, end: 120 },
    { id: 'PASS-C0', station: 'Payload downlink (unattended)', attended: false, start: XBAND.start, end: XBAND.end },
  ],
  schedule: [{ id: XBAND.id, label: 'X-band payload downlink', start: XBAND.start, end: XBAND.end }],
  marks: [],
  pedigree: ['NCR-005', 'P-PWR-03', 'REQ-PWR-020', 'REQ-PWR-021'],
  channels: [
    {
      id: 'TM-PWR-01', label: 'Battery state of charge (onboard est.)', unit: '%', partId: 'P-PWR-02', decimals: 1,
      // The onboard coulomb counter divides by the spec capacity, so it under-reads how deep each eclipse goes.
      value: (t, a) => socAt(t, false, a) * 100,
    },
    {
      id: 'TM-PWR-02', label: 'Battery voltage', unit: 'V', partId: 'P-PWR-02', decimals: 3,
      value: (t, a) => packVoltage(socAt(t, true, a), busLoadW(t, a)) + 0.004 * noise(7, t),
      specModel: (t, a) => packVoltage(socAt(t, false, a), busLoadW(t, a)),
    },
    {
      id: 'TM-PWR-03', label: 'Bus load', unit: 'W', partId: 'P-PWR-06', decimals: 0,
      value: (t, a) => busLoadW(t, a) + 0.8 * noise(8, t),
    },
    {
      id: 'TM-COM-01', label: 'X-band transmitter power', unit: 'W', partId: 'P-COM-05', decimals: 0,
      value: (t, a) => (t >= XBAND.start && t < XBAND.end && !shed(a) ? XBAND.watts : 0),
    },
  ],
}

export const SCENARIOS: Record<ScenarioId, Scenario> = { 'valve-leak': valveLeak, conjunction, 'eclipse-power': eclipsePower }
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[]
export const isScenarioId = (x: unknown): x is ScenarioId => typeof x === 'string' && x in SCENARIOS

export const CONJUNCTION_EVENT = { cdm: 'CDM-0412', tca: B_TCA, missM: B_MISS_M, pc: pcFor(B_MISS_M), object: 'Object 58321 (fragmentation debris)' }
export const XBAND_SESSION = XBAND
export { BATTERY }

export function channelById(id: string): { scenario: Scenario; channel: Channel } | undefined {
  for (const scenario of Object.values(SCENARIOS)) {
    const channel = scenario.channels.find((c) => c.id === id)
    if (channel) return { scenario, channel }
  }
  return undefined
}

/** Evenly spaced samples of a channel, skipping gaps (NaN). */
export function sample(channel: Channel, from: number, to: number, points: number, actions: ExecutedAction[]) {
  const step = (to - from) / Math.max(1, points - 1)
  const out: { t: number; v: number; spec?: number }[] = []
  for (let i = 0; i < points; i++) {
    const t = from + i * step
    const v = channel.value(t, actions)
    if (Number.isNaN(v)) continue
    out.push({ t, v, ...(channel.specModel ? { spec: channel.specModel(t, actions) } : {}) })
  }
  return out
}

export function nextContact(s: Scenario, t: number): Pass | undefined {
  return s.passes.filter((p) => p.attended && p.end > t).sort((a, b) => a.start - b.start)[0]
}
