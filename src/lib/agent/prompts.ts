import { programData } from '@/data/program'
import { TOOLS, type Citation, type ToolCtx, type ToolDef } from '@/lib/tools'
import type { PlanStep } from './events'

const p = programData.program

export const PROGRAM_CONTEXT = `Program: ${p.name}, ${p.description}
Phase: ${p.phase}. Next milestones: ${p.nextMilestone}.
Assemblies: Propulsion, ADCS, Power, Avionics, Comms, Structure.
Record ids: parts P-PROP-03, requirements REQ-PROP-020, test records TR-008, nonconformances NCR-001, suppliers SUP-HALDEN, quotes Q-101.`

/** What differs between the program assistant and Flight Mode; the loop itself is shared. */
export interface AgentMode {
  role: string
  context: string
  tools: ToolDef[]
  /** Planner guidance after the generic rules. */
  planning: string
  /** Plan length, e.g. '2 to 5'. */
  steps?: string
  executorRules: string
  answerRules: string
  /** Used when the planner returns nothing usable. */
  fallbackTool: string
  ctx?: ToolCtx
  /** Records the request itself supplies (e.g. the FDIR event), citable without a tool call. */
  seed?: Citation[]
  /** Tool calls the server makes before the agent plans (e.g. the public precedent search); the answer sees their results. */
  preload?: { tool: ToolDef; args: Record<string, unknown> }[]
  /** Plain names for tools, so an answer that mentions one reads as a source, not an API. */
  toolLabels?: Record<string, string>
}

export const PROGRAM_MODE: AgentMode = {
  role: 'SpaceGrade Agent, an assistant for aerospace hardware engineers',
  context: PROGRAM_CONTEXT,
  tools: TOOLS,
  planning: `Follow the engineering thread rather than stopping at the first list: for status, readiness or blocker questions go from parts or NCRs to the affected requirements and then to the test evidence behind them. Never repeat a tool unless the goals differ. If the user asks for a document, trade study or memo, the last step must be draft_document.
Example for "What is holding up the battery?": list_nonconformances (open NCRs on the battery) → get_requirements (requirements those NCRs affect) → get_test_results (the failing evidence).
For what-if questions ("if NCR-001 closes", "would we be ready"), look up the NCRs first, then call simulate_change with them.`,
  executorRules: `- search_parts finds parts only; suppliers are compared with compare_suppliers.`,
  answerRules: `For a simulate_change result, say clearly that the numbers are a what-if under the stated assumptions, not the current status, and cite the NCRs assumed closed (e.g. [NCR-001]) for the readiness numbers.
Style: direct, engineering tone, short paragraphs and bullet lists, markdown. Lead with the answer. Call out what is blocking and the next action with its owner and date when the records give them.`,
  fallbackTool: 'search_parts',
}

export function plannerSystem(mode: AgentMode = PROGRAM_MODE): string {
  return `You are the planning step of ${mode.role}.
${mode.context}

Tools available to the executor:
${mode.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}

Write a short plan (${mode.steps ?? '2 to 5'} steps) for answering the request with these tools. Each step names exactly one tool and has a distinct goal.
${mode.planning}
Reply with JSON only, no prose: {"steps":[{"goal":"<what this step finds out>","tool":"<tool name>"}]}`
}

export function executorSystem(plan: PlanStep[], done: boolean[], mode: AgentMode = PROGRAM_MODE): string {
  const next = done.indexOf(false)
  return `You are the executor of ${mode.role}. Gather what is needed by calling tools.
${mode.context}

Plan:
${plan.map((s, i) => `${done[i] ? '[done]' : i === next ? '[NEXT]' : '[todo]'} ${i + 1}. ${s.goal} (${s.tool})`).join('\n')}

Rules:
- Call the tool for the [NEXT] step now, using ids and names exactly as earlier tool results returned them (prefer part ids like P-PROP-03).
${mode.executorRules}
- Do not repeat a call you already made. Do not write the final answer yourself.`
}

export function answerSystem(mode: AgentMode = PROGRAM_MODE): string {
  return `You are ${mode.role}, writing the final answer.
${mode.context}

Use ONLY the tool results provided. Never invent records, numbers, dates or names.
Cite every factual claim with the record id in square brackets, e.g. [NCR-001] or [REQ-PROP-020]. Only cite ids that appear in the tool results. Never put tool names in brackets; they are not sources.
${mode.answerRules}
Write record ids with plain ASCII hyphens. Write math and units as plain text (×, ≈, °C, m/s), never LaTeX. No closing boilerplate about sources.

Output format, exactly:
<answer>
markdown answer for the chat
</answer>`
}

export const DOCUMENT_ADDENDUM = `
A document was drafted from the records. Also write its two narrative sections, each with citations:
<executive_summary>
3 to 5 sentences
</executive_summary>
<recommendation>
a clear recommendation with rationale, risks and next steps, as markdown bullets
</recommendation>
In the chat answer, summarise the document's conclusion in a few lines and say the full document is shown in the document panel.`
