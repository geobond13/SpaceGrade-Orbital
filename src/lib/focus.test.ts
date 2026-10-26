import { describe, expect, it } from 'vitest'
import { deriveFocus, partsForRecord } from './focus'
import type { AgentEvent } from '@/lib/agent/events'
import { runTool } from '@/lib/tools'

describe('focus', () => {
  it('maps records to the parts they are about', () => {
    expect(partsForRecord('NCR-001')).toEqual(['P-PROP-03'])
    expect(partsForRecord('REQ-ADCS-021')).toEqual(['P-ADCS-02', 'P-ADCS-03'])
    expect(partsForRecord('P-PWR-02')).toEqual(['P-PWR-02'])
    expect(partsForRecord('SUP-HALDEN')).toEqual([])
  })

  it('follows the agent through a run', () => {
    const result = runTool('list_nonconformances', { assembly: 'Propulsion' })
    const events: AgentEvent[] = [
      { type: 'run_start', runId: 'r', question: 'q', models: { planner: 'S', router: 'N' } },
      { type: 'plan', steps: [{ goal: 'ncrs', tool: 'list_nonconformances' }] },
      { type: 'tool_call', callId: 'c1', name: 'list_nonconformances', args: { assembly: 'Propulsion' }, model: 'N', round: 1 },
    ]
    const calling = deriveFocus(events)
    expect(calling.phase).toBe('acting')
    expect(calling.currentTool).toBe('list_nonconformances')
    expect(calling.activePartIds).toEqual(['P-PROP-01'])

    events.push({ type: 'tool_result', callId: 'c1', name: 'list_nonconformances', summary: '', citations: result.citations, ms: 1 })
    const after = deriveFocus(events)
    expect(after.currentTool).toBeUndefined()
    expect(after.activePartIds).toEqual(expect.arrayContaining(['P-PROP-03', 'P-PROP-05']))
    expect(after.touchedRecordIds).toContain('NCR-001')

    events.push({ type: 'answer', markdown: '', citations: [{ type: 'ncr', id: 'NCR-001', label: '' }], unknownIds: [] })
    events.push({ type: 'done', totals: { promptTokens: 0, completionTokens: 0, costUsd: 0, ms: 0, toolCalls: 1 } })
    const done = deriveFocus(events)
    expect(done.phase).toBe('done')
    expect(done.activePartIds).toEqual(['P-PROP-03'])
  })
})
