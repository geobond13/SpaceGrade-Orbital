import { describe, expect, it } from 'vitest'
import { runTool, TOOLS } from './index'
import { db } from './lookup'

const ids = (r: { citations: { id: string }[] }) => r.citations.map((c) => c.id)
const ofType = (r: { citations: { id: string; type: string }[] }, type: string) => r.citations.filter((c) => c.type === type).map((c) => c.id)

describe('tools', () => {
  it('registers six tools with JSON-schema parameters', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['search_parts', 'get_requirements', 'get_test_results', 'list_nonconformances', 'compare_suppliers', 'draft_document'])
  })

  it('search_parts filters by assembly and resolves names', () => {
    expect(ofType(runTool('search_parts', { assembly: 'propulsion' }), 'part')).toHaveLength(10)
    expect(ofType(runTool('search_parts', { query: 'star tracker' }), 'part')).toEqual(['P-ADCS-02', 'P-ADCS-03'])
    expect(ofType(runTool('search_parts', { query: 'propulsion' }), 'part')).toHaveLength(10)
  })

  it('list_nonconformances returns the two open propulsion NCRs, both blocking', () => {
    const r = runTool('list_nonconformances', { assembly: 'Propulsion' })
    const ncrIds = r.citations.filter((c) => c.type === 'ncr').map((c) => c.id)
    expect(ncrIds).toEqual(['NCR-001', 'NCR-002'])
    expect(r.summary).toContain('2 blocking')
    expect(runTool('list_nonconformances', { status: 'any' }).citations.filter((c) => c.type === 'ncr')).toHaveLength(5)
  })

  it('get_requirements derives verification status from tests', () => {
    const r = runTool('get_requirements', { part: 'star tracker', status: 'not_verified' })
    expect(ofType(r, 'requirement')).toEqual(expect.arrayContaining(['REQ-ADCS-021', 'REQ-ADCS-023', 'REQ-ADCS-024', 'REQ-ADCS-025']))
    expect(ofType(r, 'requirement')).not.toContain('REQ-ADCS-020')
    const failed = runTool('get_requirements', { status: 'failed' })
    expect(ofType(failed, 'requirement').sort()).toEqual(['REQ-PROP-020', 'REQ-PROP-028', 'REQ-PWR-020'])
  })

  it('get_test_results filters by requirement and outcome', () => {
    const r = runTool('get_test_results', { requirementId: 'REQ-PROP-020' }) as { data: { outcome: string; measured: string }[] }
    expect(r.data[0]).toMatchObject({ outcome: 'fail', measured: '3.2e-4 scc/s GHe' })
    expect(ofType(runTool('get_test_results', { outcome: 'fail' }), 'test')).toHaveLength(4)
  })

  it('compare_suppliers checks each quote against measurable requirements', () => {
    const r = runTool('compare_suppliers', { part: 'main isolation valve', suppliers: ['Halden', 'Corvid Flow Systems'] })
    const data = r.data as { comparison: { supplier: { name: string }; requirementsMet: string; checks: { requirementId: string; meets: boolean }[] }[] }
    expect(data.comparison.map((c) => c.supplier.name)).toEqual(['Halden Valve Works', 'Corvid Flow Systems'])
    expect(data.comparison.map((c) => c.requirementsMet)).toEqual(['6/6', '5/6'])
    const corvidPower = data.comparison[1].checks.find((c) => c.requirementId === 'REQ-PROP-022')
    expect(corvidPower?.meets).toBe(false)
    expect(ids(r)).toEqual(expect.arrayContaining(['P-PROP-03', 'Q-101', 'Q-102', 'NCR-001']))
  })

  it('draft_document renders a cited trade study with narrative slots', () => {
    const r = runTool('draft_document', { kind: 'trade_study', part: 'P-PROP-03', suppliers: 'Halden and Corvid' })
    expect(r.document?.markdown).toContain('{{executive_summary}}')
    expect(r.document?.markdown).toContain('| **Requirements met** | | **6/6** | **5/6** |')
    expect(r.document?.markdown).toContain('Open NCR-001')
    const q = runTool('draft_document', { kind: 'qualification_status', assembly: 'Propulsion' })
    expect(q.document?.markdown).toContain('NCR-002')
  })

  it('every citation resolves to a real record', () => {
    const all = new Set([...db.parts, ...db.requirements, ...db.tests, ...db.nonconformances, ...db.suppliers, ...db.quotes].map((x) => x.id))
    for (const t of TOOLS) {
      const args = t.name === 'compare_suppliers' ? { part: 'P-PROP-03' } : t.name === 'draft_document' ? { kind: 'trade_study', part: 'P-PROP-03' } : {}
      for (const c of t.run(args).citations) expect(all.has(c.id)).toBe(true)
    }
  })

  it('rejects malformed arguments and unknown tools without throwing', () => {
    expect(runTool('search_parts', '{bad').summary).toBe('invalid arguments')
    expect(runTool('nope', {}).summary).toContain('unknown tool')
  })
})
