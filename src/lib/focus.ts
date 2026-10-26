// Where the agent is looking, derived from its event stream. Drives the 3D
// twin and the heatmap without any extra model calls.

import type { AgentEvent } from '@/lib/agent/events'
import { db, matchAssembly, resolveParts, str } from '@/lib/tools/lookup'

export type AgentPhase = 'idle' | 'planning' | 'acting' | 'answering' | 'done' | 'error'

export interface Focus {
  phase: AgentPhase
  /** Tool currently running, if any. */
  currentTool?: string
  /** Parts the latest step is about. The camera frames these. */
  activePartIds: string[]
  /** Every part any tool result has touched this run. */
  touchedPartIds: string[]
  /** Every record id any tool result has touched this run. */
  touchedRecordIds: string[]
  /** Parts behind the final answer's citations. */
  citedPartIds: string[]
  /** Arguments of the run's latest simulate_change call, so the UI can show the same what-if. */
  simulation?: Record<string, unknown>
}

export const EMPTY_FOCUS: Focus = { phase: 'idle', activePartIds: [], touchedPartIds: [], touchedRecordIds: [], citedPartIds: [] }

/** Parts a record id is about. Suppliers map to nothing: they span the spacecraft. */
export function partsForRecord(id: string): string[] {
  if (db.parts.some((p) => p.id === id)) return [id]
  const req = db.requirements.find((r) => r.id === id)
  if (req) return req.partIds
  const test = db.tests.find((t) => t.id === id)
  if (test) return [test.partId]
  const ncr = db.nonconformances.find((n) => n.id === id)
  if (ncr) return [ncr.partId]
  const quote = db.quotes.find((q) => q.id === id)
  if (quote) return [quote.partId]
  return []
}

const unique = (ids: string[]) => [...new Set(ids)]

/** Best guess at the parts a tool call targets, before its result arrives. */
export function partsForArgs(args: Record<string, unknown>): string[] {
  const part = str(args.part)
  if (part) return resolveParts(part).map((p) => p.id)
  const assembly = matchAssembly(args.assembly)
  if (assembly) return db.parts.filter((p) => p.assembly === assembly && !p.parentId).map((p) => p.id)
  return []
}

export function deriveFocus(events: AgentEvent[]): Focus {
  if (events.length === 0) return EMPTY_FOCUS
  let phase: AgentPhase = 'planning'
  let currentTool: string | undefined
  let active: string[] = []
  const touchedRecords: string[] = []
  let cited: string[] = []
  let simulation: Record<string, unknown> | undefined

  for (const e of events) {
    switch (e.type) {
      case 'plan':
        phase = 'acting'
        break
      case 'tool_call': {
        phase = 'acting'
        currentTool = e.name
        if (e.name === 'simulate_change') simulation = e.args
        const guess = partsForArgs(e.args)
        if (guess.length) active = guess
        break
      }
      case 'tool_result': {
        currentTool = undefined
        const ids = e.citations.map((c) => c.id)
        touchedRecords.push(...ids)
        const parts = unique(ids.flatMap(partsForRecord))
        if (parts.length) active = parts
        break
      }
      case 'answer_delta':
        phase = 'answering'
        break
      case 'answer':
        phase = 'answering'
        cited = unique(e.citations.flatMap((c) => partsForRecord(c.id)))
        break
      case 'done':
        phase = 'done'
        currentTool = undefined
        break
      case 'error':
        phase = 'error'
        currentTool = undefined
        break
    }
  }

  // Once the answer is in, the camera frames what the answer cites.
  if ((phase === 'answering' || phase === 'done') && cited.length) active = cited
  const touchedRecordIds = unique(touchedRecords)
  return {
    phase, currentTool, activePartIds: active,
    touchedPartIds: unique(touchedRecordIds.flatMap(partsForRecord)),
    touchedRecordIds,
    citedPartIds: cited,
    simulation,
  }
}
