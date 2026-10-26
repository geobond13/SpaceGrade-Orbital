import type OpenAI from 'openai'
import type { ToolDef, ToolResult } from './types'
import { searchParts } from './search-parts'
import { getRequirements } from './get-requirements'
import { getTestResults } from './get-test-results'
import { listNonconformances } from './list-nonconformances'
import { compareSuppliers } from './compare-suppliers'
import { draftDocument } from './draft-document'
import { simulateChange } from './simulate-change'
import { citationFor, uniqueCitations } from './lookup'
import { RECORD_ID } from '@/lib/agent/citations'

export const TOOLS: ToolDef[] = [searchParts, getRequirements, getTestResults, listNonconformances, compareSuppliers, simulateChange, draftDocument]

export const TOOL_SPECS: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}))

export function runTool(name: string, rawArgs: string | Record<string, unknown>): ToolResult {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return { data: { error: `Unknown tool ${name}` }, citations: [], summary: `unknown tool ${name}` }
  let args: Record<string, unknown> = {}
  if (typeof rawArgs === 'string') {
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {}
    } catch {
      return { data: { error: 'Arguments were not valid JSON' }, citations: [], summary: 'invalid arguments' }
    }
  } else args = rawArgs
  const result = tool.run(args)
  // Any record id the model can read in the result is citable, not only the primary rows.
  const mentioned = (JSON.stringify(result.data).match(RECORD_ID) ?? []).flatMap((id) => citationFor(id) ?? [])
  return { ...result, citations: uniqueCitations([...result.citations, ...mentioned]) }
}

export type { Citation, ToolResult } from './types'
