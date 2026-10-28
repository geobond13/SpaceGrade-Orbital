import type { Citation } from '@/lib/tools'
import type { ModelRole } from '../../../agent.config'
import type { Decision } from '@/lib/flight/autonomy'
import type { QuantityCheck } from './quantities'

export interface PlanStep { goal: string; tool: string }

export interface UsageInfo {
  label: string // "plan", "route 2", "answer"
  role: ModelRole
  model: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  ms: number
}

/** Everything the UI trace renders. Streamed as NDJSON, one event per line. */
export type AgentEvent =
  | { type: 'run_start'; runId: string; question: string; models: Record<ModelRole, string> }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'thinking'; label: string; model: string; text: string }
  | { type: 'tool_call'; callId: string; name: string; args: Record<string, unknown>; model: string; round: number }
  | { type: 'tool_result'; callId: string; name: string; summary: string; citations: Citation[]; ms: number }
  | { type: 'document'; title: string; markdown: string }
  | { type: 'answer_delta'; text: string }
  | { type: 'answer'; markdown: string; citations: Citation[]; unknownIds: string[]; quantities?: QuantityCheck }
  | { type: 'usage'; usage: UsageInfo }
  | { type: 'notice'; message: string }
  | { type: 'decision'; callId: string; decision: Decision }
  | { type: 'done'; totals: { promptTokens: number; completionTokens: number; costUsd: number; ms: number; toolCalls: number } }
  | { type: 'error'; message: string }
