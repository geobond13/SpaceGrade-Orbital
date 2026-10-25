import type { ToolDef } from './types'
import { cite, db, isOpen, matchAssembly, openNcrsForPart, resolveParts, str, verificationStatus } from './lookup'

export const getRequirements: ToolDef = {
  name: 'get_requirements',
  description: 'Get requirements (L1 system, L2 subsystem, L3 component) with verification status derived from test records: verified, failed, in_progress or unverified (no test yet). Filter by part (id or name), assembly, explicit ids, or status. Use status "not_verified" for everything that is not yet verified.',
  parameters: {
    type: 'object',
    properties: {
      part: { type: 'string', description: 'Part id or name, e.g. "star tracker"' },
      assembly: { type: 'string' },
      ids: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['verified', 'failed', 'in_progress', 'unverified', 'not_verified'] },
    },
  },
  run(args) {
    let reqs = db.requirements
    const partRef = str(args.part)
    if (partRef) {
      const ids = new Set(resolveParts(partRef).map((p) => p.id))
      reqs = reqs.filter((r) => r.partIds.some((id) => ids.has(id)))
    }
    const assembly = matchAssembly(args.assembly)
    if (assembly) reqs = reqs.filter((r) => r.assembly === assembly)
    const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : []
    if (ids.length) reqs = reqs.filter((r) => ids.includes(r.id))
    const status = str(args.status)
    const rows = reqs
      .map((r) => ({ r, status: verificationStatus(r) }))
      .filter(({ status: s }) => !status || (status === 'not_verified' ? s !== 'verified' : s === status))
    const data = rows.map(({ r, status: s }) => ({
      id: r.id, level: r.level, parentId: r.parentId ?? null, title: r.title, text: r.text, method: r.method,
      partIds: r.partIds, verificationStatus: s,
      tests: db.tests.filter((t) => t.requirementIds.includes(r.id)).map((t) => `${t.id} (${t.outcome})`),
      linkedOpenNcrs: db.nonconformances.filter((n) => n.requirementIds.includes(r.id) && isOpen(n)).map((n) => n.id),
      partOpenNcrs: [...new Set(r.partIds.flatMap((p) => openNcrsForPart(p).map((n) => n.id)))],
    }))
    const counts: Record<string, number> = {}
    for (const { status: s } of rows) counts[s] = (counts[s] ?? 0) + 1
    return {
      data: { counts, requirements: data },
      citations: rows.map(({ r }) => cite.req(r)),
      summary: `${rows.length} requirements (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`,
    }
  },
}
