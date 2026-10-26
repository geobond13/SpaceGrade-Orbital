// SpaceGrade Agent loop: plan (Nemotron Super) → act (Nemotron Nano routes
// tool calls, Super as fallback) → answer (Super, streamed, cited).
// Every LLM call goes to Nebius Token Factory through src/lib/nebius.ts.

import type OpenAI from 'openai'
import { agentConfig, type ModelRole } from '../../../agent.config'
import { costUsd, modelFor, nebius } from '@/lib/nebius'
import { runTool, specsFor, TOOLS, type Citation, type ToolDef } from '@/lib/tools'
import type { AgentEvent, PlanStep, UsageInfo } from './events'
import { answerSystem, DOCUMENT_ADDENDUM, executorSystem, plannerSystem, PROGRAM_MODE, type AgentMode } from './prompts'
import { extractTag, validateCitations } from './citations'
import { planProgress } from './plan-progress'

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam
type Emit = (e: AgentEvent) => void

const TOOL_RESULT_CHARS = 12_000
const reasoningOf = (m: unknown) => {
  const r = m as { reasoning_content?: string | null; reasoning?: string | null }
  return r.reasoning_content ?? r.reasoning ?? ''
}
// Models like to typeset ids with Unicode hyphens (U+2010..U+2013); citations need ASCII.
export const normalizeIds = (s: string) => s.replace(/[‐-–]/g, '-')
/** Models sometimes "cite" a tool, e.g. [propose_action checks]; tools are not sources, so drop those brackets. */
export const stripToolCitations = (s: string, tools: ToolDef[]) =>
  tools.reduce((text, t) => text.replace(new RegExp(`\\s?\\[${t.name}[^\\]]*\\]`, 'g'), ''), s)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

interface ToolLog { name: string; args: Record<string, unknown>; data: unknown }

export async function runAgent(question: string, emit: Emit, signal?: AbortSignal, mode: AgentMode = PROGRAM_MODE): Promise<void> {
  const ai = nebius()
  const specs = specsFor(mode.tools)
  // Actions the autonomy policy executes during the run are visible to later tool calls.
  const ctx = mode.ctx && { ...mode.ctx, actions: [...mode.ctx.actions] }
  const t0 = Date.now()
  const totals = { promptTokens: 0, completionTokens: 0, costUsd: 0, toolCalls: 0 }
  const seen = new Map<string, Citation>((mode.seed ?? []).map((c) => [c.id, c]))
  const toolLog: ToolLog[] = []
  let document: { title: string; markdown: string } | undefined

  const record = (label: string, role: ModelRole, usage: OpenAI.CompletionUsage | null | undefined, ms: number) => {
    const u: UsageInfo = {
      label, role, model: modelFor(role), ms,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      costUsd: costUsd(role, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
    }
    totals.promptTokens += u.promptTokens
    totals.completionTokens += u.completionTokens
    totals.costUsd += u.costUsd
    emit({ type: 'usage', usage: u })
  }
  const overBudget = () => totals.promptTokens + totals.completionTokens > agentConfig.caps.maxTokensPerRun

  emit({ type: 'run_start', runId: crypto.randomUUID(), question, models: { ...agentConfig.models } })

  // 1. Plan
  let plan: PlanStep[] = []
  {
    const start = Date.now()
    const res = await ai.chat.completions.create({
      model: modelFor('planner'), max_tokens: 2000, temperature: 0.2,
      messages: [{ role: 'system', content: plannerSystem(mode) }, { role: 'user', content: question }],
    }, { signal })
    record('plan', 'planner', res.usage, Date.now() - start)
    const msg = res.choices[0]?.message
    const thought = reasoningOf(msg)
    if (thought) emit({ type: 'thinking', label: 'plan', model: modelFor('planner'), text: clip(thought, 1200) })
    plan = parsePlan(msg?.content ?? '', mode.tools, mode.fallbackTool)
    emit({ type: 'plan', steps: plan })
  }

  // 2. Act
  const messages: Msg[] = [{ role: 'system', content: '' }, { role: 'user', content: question }]
  const cache = new Map<string, string>()
  const called: string[] = []
  for (let round = 1; round <= agentConfig.caps.maxRounds; round++) {
    const done = planProgress(plan, called)
    // Stop as soon as the plan is covered; a separate "I'm done" round costs Nano 5-25 s of reasoning.
    if (done.every(Boolean)) break
    if (overBudget()) { emit({ type: 'notice', message: 'Token budget reached; answering with the data gathered so far.' }); break }
    messages[0] = { role: 'system', content: executorSystem(plan, done, mode) }
    let role: ModelRole = 'router'
    let msg = await routeOnce(ai, role, specs, messages, round, record, emit, signal).catch((e: unknown) => {
      emit({ type: 'notice', message: `Router error (${e instanceof Error ? e.message : 'unknown'}); falling back to the planner model.` })
      return null
    })
    // Nano sometimes answers in prose while plan steps remain; give that turn to Super.
    if (!msg || !msg.tool_calls?.length) {
      if (msg) emit({ type: 'notice', message: `Nano returned no tool call; ${modelFor('planner').split('/')[1]} takes step ${done.indexOf(false) + 1}.` })
      role = 'planner'
      // Force the next planned tool so a planned step is never silently skipped.
      msg = await routeOnce(ai, role, specs, messages, round, record, emit, signal, plan[done.indexOf(false)]?.tool)
    }
    const calls = (msg.tool_calls ?? []).filter((c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => c.type === 'function')
    if (calls.length === 0) break
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls })
    for (const call of calls) {
      const key = `${call.function.name}:${call.function.arguments}`
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(call.function.arguments || '{}') } catch { /* runTool reports it */ }
      emit({ type: 'tool_call', callId: call.id, name: call.function.name, args, model: modelFor(role), round })
      const started = Date.now()
      if (cache.has(key)) {
        emit({ type: 'tool_result', callId: call.id, name: call.function.name, summary: 'repeat call, reused earlier result', citations: [], ms: 0 })
        messages.push({ role: 'tool', tool_call_id: call.id, content: cache.get(key)! })
        continue
      }
      const blocked = guardDocument(call.function.name, plan, called)
      if (blocked) {
        emit({ type: 'tool_result', callId: call.id, name: call.function.name, summary: `guardrail: ${blocked}`, citations: [], ms: 0 })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: blocked }) })
        continue
      }
      const result = runTool(call.function.name, call.function.arguments, { tools: mode.tools, ctx })
      totals.toolCalls++
      called.push(call.function.name)
      for (const c of result.citations) if (!seen.has(c.id)) seen.set(c.id, c)
      if (result.document) {
        document = result.document
        emit({ type: 'document', ...result.document })
      }
      if (result.decision) {
        emit({ type: 'decision', callId: call.id, decision: result.decision })
        if (result.decision.tier === 'auto' && ctx) ctx.actions.push({ kind: result.decision.kind, t: ctx.t, params: result.decision.params })
      }
      toolLog.push({ name: call.function.name, args, data: result.data })
      const content = clip(JSON.stringify(result.data), TOOL_RESULT_CHARS)
      cache.set(key, content)
      messages.push({ role: 'tool', tool_call_id: call.id, content })
      emit({ type: 'tool_result', callId: call.id, name: call.function.name, summary: result.summary, citations: result.citations, ms: Date.now() - started })
    }
  }

  // 3. Answer (streamed)
  const start = Date.now()
  const stream = await ai.chat.completions.create({
    model: modelFor('planner'), max_tokens: 8000, temperature: 0.2, stream: true, stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: answerSystem(mode) + (document ? DOCUMENT_ADDENDUM : '') },
      { role: 'user', content: answerInput(question, toolLog, document) },
    ],
  }, { signal })
  let raw = ''
  let thought = ''
  let usage: OpenAI.CompletionUsage | undefined
  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage
    const delta = chunk.choices[0]?.delta
    if (!delta) continue
    thought += reasoningOf(delta)
    if (delta.content) {
      raw += delta.content
      emit({ type: 'answer_delta', text: delta.content })
    }
  }
  record('answer', 'planner', usage, Date.now() - start)
  if (thought) emit({ type: 'thinking', label: 'answer', model: modelFor('planner'), text: clip(thought, 1200) })

  raw = stripToolCitations(normalizeIds(raw), mode.tools)
  const answer = extractTag(raw, 'answer') ?? raw.replace(/<\/?[a-z_]+>/g, '').trim()
  let fullText = answer
  if (document) {
    const summary = extractTag(raw, 'executive_summary') ?? '_Not written._'
    const recommendation = extractTag(raw, 'recommendation') ?? '_Not written._'
    document = {
      title: document.title,
      markdown: document.markdown.replace('{{executive_summary}}', summary).replace('{{recommendation}}', recommendation),
    }
    fullText += `\n${summary}\n${recommendation}`
    emit({ type: 'document', ...document })
  }
  const { cited, unknownIds } = validateCitations(fullText, seen)
  emit({ type: 'answer', markdown: answer, citations: cited, unknownIds })
  emit({ type: 'done', totals: { ...totals, ms: Date.now() - t0 } })
}

async function routeOnce(
  ai: OpenAI, role: ModelRole, specs: OpenAI.Chat.Completions.ChatCompletionTool[], messages: Msg[], round: number,
  record: (label: string, role: ModelRole, usage: OpenAI.CompletionUsage | undefined, ms: number) => void,
  emit: Emit, signal?: AbortSignal, forceTool?: string,
) {
  const start = Date.now()
  // Nemotron Nano only calls tools reliably with reasoning on, so give it room to think.
  const res = await ai.chat.completions.create({
    model: modelFor(role), max_tokens: 2500, temperature: 0.2, tools: specs, messages,
    tool_choice: forceTool ? { type: 'function', function: { name: forceTool } } : 'auto',
  }, { signal })
  record(`route ${round}`, role, res.usage, Date.now() - start)
  const msg = res.choices[0]?.message
  if (!msg) throw new Error('empty response')
  // A turn cut off mid-reasoning can carry a tool call with truncated or empty arguments.
  if (role === 'router' && res.choices[0].finish_reason === 'length') throw new Error('router ran out of reasoning tokens')
  const thought = reasoningOf(msg)
  if (thought) emit({ type: 'thinking', label: `route ${round}`, model: modelFor(role), text: clip(thought, 800) })
  return msg
}

/** Documents are drafted only when planned, and only once the evidence steps before them have run. */
export function guardDocument(tool: string, plan: PlanStep[], called: string[]): string | undefined {
  if (tool !== 'draft_document') return undefined
  const at = plan.findIndex((s) => s.tool === 'draft_document')
  if (at === -1) return 'no document was requested; answer from the records instead'
  const done = planProgress(plan, called)
  const pending = plan.slice(0, at).filter((_, i) => !done[i])
  return pending.length ? `finish earlier plan steps first (next: ${pending[0].tool})` : undefined
}

export function parsePlan(content: string, tools: ToolDef[] = TOOLS, fallbackTool = 'search_parts'): PlanStep[] {
  const names = new Set(tools.map((t) => t.name))
  const json = content.match(/\{[\s\S]*\}/)?.[0]
  try {
    const parsed = JSON.parse(json ?? '') as { steps?: { goal?: unknown; tool?: unknown }[] }
    const steps = (parsed.steps ?? [])
      .filter((s) => typeof s.goal === 'string' && typeof s.tool === 'string' && names.has(s.tool))
      .map((s) => ({ goal: s.goal as string, tool: s.tool as string }))
      .filter((s, i, all) => i === 0 || all[i - 1].tool !== s.tool)
    if (steps.length) return steps.slice(0, 6)
  } catch { /* fall through */ }
  return [{ goal: 'Find the relevant records', tool: fallbackTool }]
}

function answerInput(question: string, log: ToolLog[], document?: { title: string; markdown: string }): string {
  const results = log.map((l, i) => `### ${i + 1}. ${l.name} ${JSON.stringify(l.args)}\n${clip(JSON.stringify(l.data), TOOL_RESULT_CHARS)}`).join('\n\n')
  return [
    `Engineer's request: ${question}`,
    '',
    `Tool results:\n${results || '(no tools were called)'}`,
    ...(document ? ['', `Drafted document (tables already filled; you write the two narrative slots):\n${document.markdown}`] : []),
  ].join('\n')
}
