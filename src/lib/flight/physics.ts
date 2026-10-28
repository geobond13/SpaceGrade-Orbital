// Engineering models behind Flight Mode. Each takes its parameters from a
// record in the program data, so the "as-built" curve is the pedigree speaking.
// Synthetic and simplified on purpose: enough physics to make the point, not flight software.

/** Catalyst bed preheat: first-order heating calibrated to REQ-PROP-028 and NCR-002. */
export const PREHEAT = {
  ambientC: 20,
  targetC: 315, // REQ-PROP-028
  tauMin: 15,
  // Spec heater reaches 315 °C in 30 min (REQ-PROP-028); steady-state rise follows from tau.
  specRiseC: (315 - 20) / (1 - Math.exp(-30 / 15)),
  // As-built: NCR-002 measured 290 °C at 30 min (heater 52 Ω vs 46 ± 2 Ω).
  asBuiltRiseC: (290 - 20) / (1 - Math.exp(-30 / 15)),
}

export function bedTempC(minutesHeating: number, asBuilt: boolean): number {
  if (minutesHeating <= 0) return PREHEAT.ambientC
  const rise = asBuilt ? PREHEAT.asBuiltRiseC : PREHEAT.specRiseC
  return PREHEAT.ambientC + rise * (1 - Math.exp(-minutesHeating / PREHEAT.tauMin))
}

/** Minutes of heating until the bed reaches the 315 °C start temperature. */
export function preheatMinutes(asBuilt: boolean): number {
  const rise = asBuilt ? PREHEAT.asBuiltRiseC : PREHEAT.specRiseC
  const need = (PREHEAT.targetC - PREHEAT.ambientC) / rise
  return -PREHEAT.tauMin * Math.log(1 - need)
}

/** Blowdown propellant tank (P-PROP-02, 12 L) with a helium leak through the isolation valve seat. */
export const TANK = {
  volumeL: 12,
  propellantL: 7.0,
  pressure0Psia: 290, // at 20 °C, launch
  minFeedPsia: 100, // thrusters need at least this to fire
  // NCR-001: qualification unit seat leak 3.2e-4 scc/s GHe. Assume the flight unit leaks at the same rate.
  leakSccs: 3.2e-4,
  deltaVBudgetMs: 131, // REQ-SYS-002 delta-v budget rev C
  requiredDeltaVMs: 120, // REQ-SYS-002
}

const SCC_PER_PSIA_L_AT_20C = (1 / 14.696) * 1000 * (273.15 / 293.15) // scc of gas per (psia · litre) at 20 °C

/** Pressurant amount at mission day `d`, in scc. */
export function pressurantScc(day: number, leakSccs = TANK.leakSccs): number {
  const ullageL = TANK.volumeL - TANK.propellantL
  const initial = TANK.pressure0Psia * ullageL * SCC_PER_PSIA_L_AT_20C
  return initial - leakSccs * day * 86_400
}

/** Tank pressure normalised to 20 °C at mission day `d`, before any propellant use. */
export function tankPressure20C(day: number, leakSccs = TANK.leakSccs): number {
  const ullageL = TANK.volumeL - TANK.propellantL
  return pressurantScc(day, leakSccs) / (ullageL * SCC_PER_PSIA_L_AT_20C)
}

/**
 * Delta-v still deliverable if the leak continues to end of life. Propellant can only be expelled
 * until the pressurant falls to the minimum feed pressure; less gas means less usable propellant.
 * Scaled to the REQ-SYS-002 budget so the result reads against the requirement.
 */
export function deltaVAtEndOfLife(missionDays: number, leakSccs = TANK.leakSccs): { usableL: number; deltaVMs: number } {
  const gasScc = pressurantScc(missionDays, leakSccs)
  const gasVolumeAtMinL = gasScc / (TANK.minFeedPsia * SCC_PER_PSIA_L_AT_20C)
  const ullageL = TANK.volumeL - TANK.propellantL
  const usableL = Math.max(0, Math.min(TANK.propellantL, gasVolumeAtMinL - ullageL))
  // Rocket equation on 180 kg wet mass, hydrazine 1.0 kg/L, Isp 220 s, then scaled to the budget.
  const dv = (l: number) => 220 * 9.80665 * Math.log(180 / (180 - l))
  return { usableL, deltaVMs: TANK.deltaVBudgetMs * (dv(usableL) / dv(TANK.propellantL)) }
}

/** Battery pack (P-PWR-02) energy model. */
export const BATTERY = {
  specAh: 10.0, // REQ-PWR-020
  asBuiltAh: 9.6, // NCR-005, lot L-2611 acceptance test
  nominalV: 28.8, // 8S Li-ion
  maxDodPct: 20, // REQ-PWR-021 cycle life analysed at 20 % depth of discharge
}

export const batteryWh = (asBuilt: boolean) => (asBuilt ? BATTERY.asBuiltAh : BATTERY.specAh) * BATTERY.nominalV

/** 8S pack voltage: open-circuit voltage from state of charge, minus a resistive drop. */
export function packVoltage(soc: number, loadW: number): number {
  const ocv = 8 * (3.4 + 0.75 * Math.min(1, Math.max(0, soc)))
  return ocv - (loadW / ocv) * 0.12
}

/** Collision avoidance: along-track separation grows about 3 · Δv · lead time. */
export const CONJUNCTION = {
  targetMissM: 1000,
  maxDeltaVMs: 0.5, // envelope for an autonomous burn
  plannedLeadMin: 45, // burn this long before closest approach
}

export const deltaVForLead = (leadMin: number) => CONJUNCTION.targetMissM / (3 * leadMin * 60)

/** Helium leak rate (scc/s) implied by a temperature-compensated pressure slope (psi/day). */
export function leakFromSlope(psiPerDay: number): number {
  const ullageL = TANK.volumeL - TANK.propellantL
  return (-psiPerDay * ullageL * SCC_PER_PSIA_L_AT_20C) / 86_400
}

/** First mission day on which end-of-life delta-v would fall below the requirement, at this leak rate. */
export function dayDeltaVBelowRequirement(leakSccs: number, maxDays = 5 * 365): number | undefined {
  for (let d = 0; d <= maxDays; d += 5) if (deltaVAtEndOfLife(d, leakSccs).deltaVMs < TANK.requiredDeltaVMs) return d
  return undefined
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
