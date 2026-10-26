import type { ToolDef } from './types'
import { db, isOpen, str, type Overrides } from './lookup'
import { computeReadiness, diffReadiness } from '@/lib/readiness'

const ids = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().toUpperCase())

/**
 * Hypothetical changes from simulate_change arguments. Closing an NCR assumes it is
 * dispositioned and, unless retest is false, that the failed tests on its requirements
 * re-run and pass. Tests merely on hold stay in progress: closing an NCR does not finish them.
 * Shared with the UI so the twin shows exactly what the tool computed.
 */
export function overridesFromArgs(args: Record<string, unknown>): Overrides {
  const closedNcrs = ids(args.closeNcrs).filter((id) => db.nonconformances.some((n) => n.id === id))
  const retest = args.retest !== false
  const testOutcomes: Overrides['testOutcomes'] = {}
  for (const id of ids(args.passTests)) if (db.tests.some((t) => t.id === id)) testOutcomes[id] = 'pass'
  if (retest) {
    for (const ncr of db.nonconformances.filter((n) => closedNcrs.includes(n.id))) {
      for (const t of db.tests.filter((t) => t.outcome === 'fail' && t.requirementIds.some((r) => ncr.requirementIds.includes(r)))) testOutcomes[t.id] = 'pass'
    }
  }
  return { closedNcrs, testOutcomes }
}

export const simulateChange: ToolDef = {
  name: 'simulate_change',
  description: 'What-if simulation. Assume NCRs are closed (and, by default, that their failed tests are re-run and pass) and/or that specific tests pass, then recompute requirement verification and qualification readiness. Returns readiness before and after per assembly, which requirements change status, and which blocking NCRs remain. Use for "what if", "if we fix", "would we be ready" questions.',
  parameters: {
    type: 'object',
    properties: {
      closeNcrs: { type: 'array', items: { type: 'string' }, description: 'NCR ids assumed closed, e.g. ["NCR-001"]' },
      passTests: { type: 'array', items: { type: 'string' }, description: 'Test record ids assumed to pass, e.g. ["TR-008"]' },
      retest: { type: 'boolean', description: 'Also assume the failed tests behind each closed NCR re-run and pass (default true)' },
    },
  },
  run(args) {
    const o = overridesFromArgs(args)
    const changedTests = Object.keys(o.testOutcomes ?? {})
    if (!o.closedNcrs?.length && changedTests.length === 0) {
      const asked = [str(args.closeNcrs), str(args.passTests)].filter(Boolean).join(', ')
      return { data: { error: `No known NCR or test ids in the request${asked ? ` (${asked})` : ''}. Open NCRs: ${db.nonconformances.filter((n) => isOpen(n)).map((n) => n.id).join(', ')}` }, citations: [], summary: 'nothing to simulate' }
    }
    const before = computeReadiness()
    const after = computeReadiness(o)
    const delta = diffReadiness(before, after)
    const reqTitle = (id: string) => db.requirements.find((r) => r.id === id)?.title
    const affected = new Set<string>([
      ...(o.closedNcrs ?? []).flatMap((id) => db.parts.find((p) => p.id === db.nonconformances.find((n) => n.id === id)?.partId)?.assembly ?? []),
      ...changedTests.flatMap((id) => db.parts.find((p) => p.id === db.tests.find((t) => t.id === id)?.partId)?.assembly ?? []),
    ])
    const data = {
      assumptions: {
        closedNcrs: o.closedNcrs,
        testsAssumedPassing: changedTests.map((id) => ({ id, name: db.tests.find((t) => t.id === id)?.name })),
      },
      overall: { verifiedPctBefore: before.pct, verifiedPctAfter: after.pct },
      assemblies: delta.assemblies.map((a) => ({
        assembly: a.assembly, verifiedPctBefore: a.from, verifiedPctAfter: a.to, blockingNcrsBefore: a.blockingFrom, blockingNcrsAfter: a.blockingTo,
      })),
      requirementChanges: delta.requirements.map((r) => ({ id: r.id, title: reqTitle(r.id), from: r.from, to: r.to })),
      remainingBlockingNcrs: after.blockingNcrs,
      // Only the assemblies the simulated NCRs sit in, so the answer stays on the question.
      stillNotVerified: db.requirements
        .filter((r) => affected.has(r.assembly) && after.requirements[r.id] !== 'verified')
        .map((r) => ({ id: r.id, title: r.title, status: after.requirements[r.id] })),
    }
    return {
      data,
      citations: [], // filled by runTool from every id in the data
      summary: `readiness ${before.pct}% → ${after.pct}%, ${delta.requirements.length} requirement${delta.requirements.length === 1 ? '' : 's'} change, ${after.blockingNcrs.length} blocking NCR${after.blockingNcrs.length === 1 ? '' : 's'} left`,
    }
  },
}
