export type CitationType = 'part' | 'requirement' | 'test' | 'ncr' | 'supplier' | 'quote'

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
  /** Set by draft_document only. */
  document?: { title: string; markdown: string }
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  run(args: Record<string, unknown>): ToolResult
}
