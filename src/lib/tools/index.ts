import type OpenAI from 'openai'
import type { ToolCtx, ToolDef, ToolResult } from './types'
import { searchParts } from './search-parts'
import { getRequirements } from './get-requirements'
import { getTestResults } from './get-test-results'
import { listNonconformances } from './list-nonconformances'
import { compareSuppliers } from './compare-suppliers'
import { draftDocument } from './draft-document'
import { simulateChange } from './simulate-change'
import { citationFor, uniqueCitations } from './lookup'
import { flightCitationFor } from './flight/cite'
import { RECORD_ID } from '@/lib/agent/citations'

export const TOOLS: ToolDef[] = [searchParts, getRequirements, getTestResults, listNonconformances, compareSuppliers, simulateChange, draftDocument]

export const specsFor = (tools: ToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] => tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

export const TOOL_SPECS = specsFor(TOOLS)

type RunOpts = { tools?: ToolDef[]; ctx?: ToolCtx }

function prepare(name: string, rawArgs: string | Record<string, unknown>, opts: RunOpts): { tool: ToolDef; args: Record<string, unknown> } | ToolResult {
  const tool = (opts.tools ?? TOOLS).find((t) => t.name === name)
  if (!tool) return { data: { error: `Unknown tool ${name}` }, citations: [], summary: `unknown tool ${name}` }
  if (typeof rawArgs !== 'string') return { tool, args: rawArgs }
  try {
    return { tool, args: rawArgs.trim() ? JSON.parse(rawArgs) : {} }
  } catch {
    return { data: { error: 'Arguments were not valid JSON' }, citations: [], summary: 'invalid arguments' }
  }
}

// Any record id the model can read in the result is citable, not only the primary rows.
function withMentions(result: ToolResult): ToolResult {
  const mentioned = (JSON.stringify(result.data).match(RECORD_ID) ?? []).flatMap((id) => citationFor(id) ?? flightCitationFor(id) ?? [])
  return { ...result, citations: uniqueCitations([...result.citations, ...mentioned]) }
}

/** Runs a synchronous tool (every record tool). Use runToolAsync where a tool may call out (search_precedents). */
export function runTool(name: string, rawArgs: string | Record<string, unknown>, opts: RunOpts = {}): ToolResult {
  const p = prepare(name, rawArgs, opts)
  if (!('tool' in p)) return p
  const result = p.tool.run(p.args, opts.ctx)
  if (result instanceof Promise) throw new Error(`${name} is asynchronous; use runToolAsync`)
  return withMentions(result)
}

export async function runToolAsync(name: string, rawArgs: string | Record<string, unknown>, opts: RunOpts = {}): Promise<ToolResult> {
  const p = prepare(name, rawArgs, opts)
  if (!('tool' in p)) return p
  return withMentions(await p.tool.run(p.args, opts.ctx))
}

export type { Citation, ToolCtx, ToolDef, ToolResult } from './types'
