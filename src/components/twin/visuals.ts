import type { Readiness } from '@/lib/readiness'
import { STATUS } from '../status'

/** How one part looks on the twin. Mission Control and Flight Mode each map their own state to this. */
export interface PartVisual {
  /** Changes in key make the part flash (e.g. a what-if or an executed action). */
  key: string
  hex: string
  label: string
  pulse?: boolean
  /** Glow when the agent is not looking at the part, 0..1. Zero keeps healthy parts quiet. */
  rest: number
}

export type PartVisuals = Record<string, PartVisual>

export interface LegendItem { hex: string; label: string }

export const NO_VISUAL: PartVisual = { key: 'none', hex: STATUS.none.hex, label: STATUS.none.label, rest: 0 }

export function readinessVisuals(readiness: Readiness): PartVisuals {
  const out: PartVisuals = {}
  for (const [id, s] of Object.entries(readiness.parts)) {
    out[id] = { key: s, hex: STATUS[s].hex, label: STATUS[s].label, pulse: s === 'blocked', rest: s === 'verified' || s === 'none' ? 0 : 0.35 }
  }
  return out
}

export const READINESS_LEGEND: LegendItem[] = (['blocked', 'failed', 'in_progress', 'unverified', 'verified'] as const)
  .map((s) => ({ hex: STATUS[s].hex, label: STATUS[s].label }))
