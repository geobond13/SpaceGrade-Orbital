import { afterEach, describe, expect, it, vi } from 'vitest'
import { precedentResult, searchPrecedents, tavilySearch } from './precedents'
import { runToolAsync } from '@/lib/tools'
import { flightMode, PRECEDENT_QUERIES } from '@/lib/agent/flight-mode'
import { detect } from '@/lib/flight/fdir'
import { SCENARIO_IDS } from '@/lib/flight/scenarios'
import { validateCitations } from '@/lib/agent/citations'

describe('search_precedents (Tavily)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('numbers public sources WEB-1… and cites them with their URL', () => {
    const r = precedentResult('catalyst bed heater slow preheat', [
      { title: 'Thruster heater anomaly', url: 'https://example.org/a', content: 'Bed  reached\n temperature late.' },
      { title: 'No url' },
      { title: 'Second', url: 'https://example.org/b', content: 'x' },
    ])
    expect(r.citations).toEqual([
      { type: 'web', id: 'WEB-1', label: 'Thruster heater anomaly', url: 'https://example.org/a' },
      { type: 'web', id: 'WEB-2', label: 'Second', url: 'https://example.org/b' },
    ])
    expect((r.data as { sources: { snippet: string }[] }).sources[0].snippet).toBe('Bed reached temperature late.')
  })

  it('sends the query to Tavily with the key as a bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ results: [{ title: 't', url: 'https://u' }] })))
    expect(await tavilySearch('star tracker stray light', 'tvly-test', fetchImpl as unknown as typeof fetch)).toHaveLength(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.tavily.com/search')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tvly-test')
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'star tracker stray light', max_results: 4 })
  })

  it('without a key or on failure it reports unavailable without an error, so the loop moves on', async () => {
    vi.stubEnv('TAVILY_API_KEY', '')
    const none = await searchPrecedents.run({ query: 'x y z' })
    expect(none.data).toMatchObject({ sources: [] })
    expect(none.data).not.toHaveProperty('error')
    vi.stubEnv('TAVILY_API_KEY', 'tvly-test')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const failed = await runToolAsync('search_precedents', { query: 'x y z' }, { tools: [searchPrecedents] })
    expect(failed.summary).toBe('public search unavailable')
    expect(failed.data).not.toHaveProperty('error')
  })

  it('every flight run starts with a server-side precedent search for its scenario', () => {
    for (const id of SCENARIO_IDS) {
      const mode = flightMode(detect(id)[0], [])
      expect(mode.preload).toEqual([{ tool: searchPrecedents, args: { query: PRECEDENT_QUERIES[id] } }])
      expect(mode.tools.map((t) => t.name)).not.toContain('search_precedents')
      expect(PRECEDENT_QUERIES[id]).not.toMatch(/(?:P|NCR|TR|REQ|TM)-/)
    }
  })

  it('web ids count as cited only when a search returned them', () => {
    const seen = new Map([['WEB-1', { type: 'web' as const, id: 'WEB-1', label: 't', url: 'https://u' }]])
    expect(validateCitations('see WEB-1 and WEB-3', seen)).toMatchObject({ unknownIds: ['WEB-3'] })
  })
})
