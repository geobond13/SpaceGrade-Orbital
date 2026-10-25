import type { ToolDef } from './types'
import { db, partById, resolveParts, str } from './lookup'

export const getTestResults: ToolDef = {
  name: 'get_test_results',
  description: 'Get test, analysis and inspection records with outcome (pass, fail, in_progress), measured values and notes. Filter by part (id or name), requirement id, outcome or stage (development, qualification, acceptance).',
  parameters: {
    type: 'object',
    properties: {
      part: { type: 'string' },
      requirementId: { type: 'string' },
      outcome: { type: 'string', enum: ['pass', 'fail', 'in_progress'] },
      stage: { type: 'string', enum: ['development', 'qualification', 'acceptance'] },
    },
  },
  run(args) {
    let tests = db.tests
    const partRef = str(args.part)
    if (partRef) {
      const ids = new Set(resolveParts(partRef).map((p) => p.id))
      tests = tests.filter((t) => ids.has(t.partId))
    }
    const reqId = str(args.requirementId)
    if (reqId) tests = tests.filter((t) => t.requirementIds.includes(reqId))
    const outcome = str(args.outcome)
    if (outcome) tests = tests.filter((t) => t.outcome === outcome)
    const stage = str(args.stage)
    if (stage) tests = tests.filter((t) => t.stage === stage)
    const fails = tests.filter((t) => t.outcome === 'fail').length
    return {
      data: tests.map((t) => ({ ...t, partName: partById(t.partId)?.name })),
      citations: tests.map((t) => ({ type: 'test' as const, id: t.id, label: t.name })),
      summary: `${tests.length} test records${fails ? `, ${fails} failed` : ''}`,
    }
  },
}
