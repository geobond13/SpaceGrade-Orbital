import type { Conditions, ExecutedAction, ScenarioId } from '@/lib/flight/scenarios'
import type { Decision } from '@/lib/flight/autonomy'

export type CitationType = 'part' | 'requirement' | 'test' | 'ncr' | 'supplier' | 'quote' | 'telemetry' | 'event' | 'conjunction' | 'session'

export interface Citation {
  type: CitationType
  id: string
  label: string
}

export interface ToolResult {
  /** Compact JSON the model reads. */
  data: unknown
  /** Every record the result was built from. */
  citations: Citation[]
  /** One line for the trace, e.g. "4 parts matched". */
  summary: string
  /** Set by draft_document and draft_flight_ncr only. */
  document?: { title: string; markdown: string }
  /** Set by propose_action only: what the autonomy policy decided. */
  decision?: Decision
}

/** Flight Mode state a tool reads: which scenario, the sim time, and what has been executed. */
export interface ToolCtx {
  scenario: ScenarioId
  t: number
  actions: ExecutedAction[]
  /** Viewer-set conditions (e.g. a reworked heater); empty for the as-built vehicle. */
  cond?: Conditions
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  run(args: Record<string, unknown>, ctx?: ToolCtx): ToolResult
}
