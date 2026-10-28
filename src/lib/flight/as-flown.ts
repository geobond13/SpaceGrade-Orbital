// How each qualification-era NCR was closed out before launch. The program data is
// the build record as it stood at qualification; these are the as-flown dispositions
// the MRB signed before ship. The point of Flight Mode: a disposition can be correct
// and still never reach the operations side (flight rules, onboard tables, timelines).

import type { Conditions } from './scenarios'

export interface AsFlown {
  ncr: string
  /** Disposition as flown, e.g. "Use-as-is under deviation". */
  disposition: string
  /** What the MRB accepted and why. */
  basis: string
  /** What the condition means in orbit. */
  flightImpact: string
  /** Whether that impact reached the operations side before launch. */
  carriedIntoOps: string
}

const RECORDS: Record<string, AsFlown> = {
  'NCR-001': {
    ncr: 'NCR-001',
    disposition: 'Closed for flight: flight valve accepted',
    basis: 'Root cause on the qualification unit traced to particulate at the seat. Flight valve S/N 007 cleaned and re-tested at 0.9e-4 scc/s (limit 1.0e-4).',
    flightImpact: 'If particulate returns after thermal cycling, the seat leak can reappear at the qualification-unit rate, 3.2e-4 scc/s.',
    carriedIntoOps: 'Partly: a weekly tank-pressure trend check was added. No leak-rate model or delta-v projection was handed to operations.',
  },
  'NCR-002': {
    ncr: 'NCR-002',
    disposition: 'Use-as-is under deviation',
    basis: 'Heater replacement would have cost 6 weeks against the launch slot. MRB accepted the 52 Ω element: thrusters still reach 315 °C, only slower (about 43 min instead of 30).',
    flightImpact: 'Every burn needs about 13 min more preheat than the spec allows for.',
    carriedIntoOps: 'No. Flight procedures and the collision-avoidance timeline still assume the 30 min preheat in REQ-PROP-028.',
  },
  'NCR-004': {
    ncr: 'NCR-004',
    disposition: 'Use-as-is (minor)',
    basis: 'Anodize not reworked. The sun exclusion test (REQ-ADCS-021) was deferred to on-orbit checkout, which was cut short.',
    flightImpact: 'More stray light near the sun: the tracker may lose lock above its 35° specified exclusion angle.',
    carriedIntoOps: 'No. The onboard sun exclusion table is still the 35° spec value.',
  },
  'NCR-005': {
    ncr: 'NCR-005',
    disposition: 'Use-as-is under requirement deviation',
    basis: 'Replacement lot was 8 weeks out. MRB accepted 9.6 Ah against 10.0 Ah, backed by orbit-average power margin in the power budget.',
    flightImpact: 'Each eclipse discharges the pack about 4 % deeper than the spec capacity predicts; payload passes in eclipse need checking against the 20 % depth-of-discharge limit.',
    carriedIntoOps: 'No. The onboard state-of-charge estimator still divides by 10.0 Ah.',
  },
}

const REWORKED_HEATER: AsFlown = {
  ncr: 'NCR-002',
  disposition: 'Closed: reworked',
  basis: 'Heater element replaced from the conforming lot; preheat re-test reached 318 °C at 30 min, 12 W.',
  flightImpact: 'None: preheat meets REQ-PROP-028.',
  carriedIntoOps: 'Not needed.',
}

export function asFlown(ncr: string, cond: Conditions = {}): AsFlown | undefined {
  if (ncr === 'NCR-002' && cond.heaterConforming) return REWORKED_HEATER
  return RECORDS[ncr]
}
