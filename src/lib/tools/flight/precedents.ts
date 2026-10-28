// Public precedent search (Tavily). The build record says how THIS vehicle differs from its spec;
// public sources say whether the same failure mode has been seen on other spacecraft and what
// operators did. Results inform the operator section only: the policy never reads them.

import type { Citation, ToolDef, ToolResult } from '../types'
import { str } from '../lookup'

const TAVILY_URL = 'https://api.tavily.com/search'
const MAX_RESULTS = 4
const SNIPPET_CHARS = 420
const TIMEOUT_MS = 10_000

interface TavilyResult { title?: string; url?: string; content?: string; score?: number }

/** Web citations are numbered per call: WEB-1 … WEB-4. */
export const webId = (i: number) => `WEB-${i + 1}`

export async function tavilySearch(query: string, key: string, fetchImpl: typeof fetch = fetch): Promise<TavilyResult[]> {
  const res = await fetchImpl(TAVILY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: 'basic', topic: 'general', max_results: MAX_RESULTS, include_answer: false }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Tavily ${res.status}`)
  const body = (await res.json()) as { results?: TavilyResult[] }
  return body.results ?? []
}

export function precedentResult(query: string, results: TavilyResult[]): ToolResult {
  const rows = results.filter((r) => r.url && r.title).slice(0, MAX_RESULTS)
  const citations: Citation[] = rows.map((r, i) => ({ type: 'web', id: webId(i), label: r.title!.slice(0, 90), url: r.url }))
  return {
    data: {
      query,
      note: 'Public web sources (Tavily search), not this vehicle\'s records. Use them only as precedent in the operator section; they never change deadlines, tiers or the vehicle\'s own numbers.',
      sources: rows.map((r, i) => ({ id: webId(i), title: r.title, url: r.url, snippet: (r.content ?? '').replace(/\s+/g, ' ').slice(0, SNIPPET_CHARS) })),
    },
    citations,
    summary: rows.length ? `${rows.length} public source${rows.length === 1 ? '' : 's'} for "${query}"` : `no public sources for "${query}"`,
  }
}

export const searchPrecedents: ToolDef = {
  name: 'search_precedents',
  description:
    'Search public sources on the web (Tavily) for on-orbit precedent of a failure mode on similar hardware: has it happened on other spacecraft, and what did operators do? Use ONE short query naming the component type and the symptom, without this vehicle\'s record ids, e.g. "monopropellant thruster catalyst bed heater slow preheat on orbit". Returns up to 4 sources with ids WEB-1 to WEB-4.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Component type and failure mode, 4 to 12 words' } },
    required: ['query'],
  },
  async run(args) {
    const query = str(args.query)?.trim().slice(0, 200)
    if (!query) return { data: { error: 'query is required' }, citations: [], summary: 'no query' }
    const key = process.env.TAVILY_API_KEY
    // Not an "error": a missing key or an outage should not make the loop retry the step.
    if (!key) return { data: { query, sources: [], unavailable: 'Public search is not configured on this deployment.' }, citations: [], summary: 'public search not configured' }
    try {
      return precedentResult(query, await tavilySearch(query, key))
    } catch (e) {
      return { data: { query, sources: [], unavailable: `Public search failed (${e instanceof Error ? e.message : 'unknown'}).` }, citations: [], summary: 'public search unavailable' }
    }
  },
}
