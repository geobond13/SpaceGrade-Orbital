import type { Citation, ToolDef } from './types'
import { cite, db, isOpen, matchAssembly, partById, resolveParts, str, supplierById, uniqueCitations, verificationStatus } from './lookup'
import { comparisonCitations, resolveComparison } from './compare-suppliers'

// Narrative slots the planner model fills after the tool loop. Everything
// else in the document is rendered deterministically from records.
export const NARRATIVE_SLOTS = ['executive_summary', 'recommendation'] as const
export type NarrativeSlot = (typeof NARRATIVE_SLOTS)[number]
const slot = (s: NarrativeSlot) => `{{${s}}}`

const fmtUsd = (n: number) => `$${n.toLocaleString('en-US')}`
const fmtNum = (n: number | null) => (n === null ? 'n/a' : Math.abs(n) < 0.01 && n !== 0 ? n.toExponential(1) : String(n))
const mark = (m: boolean | null) => (m === null ? 'no data' : m ? 'meets' : '**does not meet**')

function tradeStudy(args: Record<string, unknown>) {
  const res = resolveComparison(args)
  if (!res || res.rows.length === 0) return null
  const { part, rows } = res
  const checks = rows[0].checks
  const title = str(args.title) ?? `Trade study: ${part.name} (${part.id}) supplier selection`
  const lines = [
    `# ${title}`,
    `Program: ${db.program.name} · ${db.program.phase} · Prepared by SpaceGrade Agent (draft for engineering review)`,
    '',
    '## Executive summary',
    slot('executive_summary'),
    '',
    '## Scope',
    `Compare ${rows.map((r) => `${r.supplier.name} (${r.quoteId})`).join(', ')} for ${part.name} (${part.partNumber}, ${part.id}). Current supplier: ${supplierById(part.supplierId)?.name}.`,
    '',
    '## Requirements compliance',
    `| Requirement | Limit | ${rows.map((r) => r.supplier.name).join(' | ')} |`,
    `|---|---|${rows.map(() => '---').join('|')}|`,
    ...checks.map((c, i) => `| ${c.requirementId} ${c.title} | ${c.limit} | ${rows.map((r) => `${fmtNum(r.checks[i].offered)} (${mark(r.checks[i].meets)})`).join(' | ')} |`),
    `| **Requirements met** | | ${rows.map((r) => `**${r.requirementsMet}**`).join(' | ')} |`,
    '',
    '## Cost, schedule and supplier quality',
    `| | ${rows.map((r) => r.supplier.name).join(' | ')} |`,
    `|---|${rows.map(() => '---').join('|')}|`,
    `| Unit price | ${rows.map((r) => fmtUsd(r.unitPriceUsd)).join(' | ')} |`,
    `| NRE | ${rows.map((r) => fmtUsd(r.nreUsd)).join(' | ')} |`,
    `| Lead time | ${rows.map((r) => `${r.leadTimeWeeks} wk`).join(' | ')} |`,
    `| On-time delivery | ${rows.map((r) => `${r.supplier.onTimeDeliveryPct}%`).join(' | ')} |`,
    `| Escapes (12 mo) | ${rows.map((r) => r.supplier.escapesLast12mo).join(' | ')} |`,
    `| Certifications | ${rows.map((r) => r.supplier.certifications.join(', ')).join(' | ')} |`,
    `| Heritage | ${rows.map((r) => r.heritage).join(' | ')} |`,
    '',
    '## Exceptions and open quality issues',
    ...rows.flatMap((r) => [
      `**${r.supplier.name}**`,
      ...r.exceptions.map((e) => `- ${e}`),
      ...r.openNcrsOnSupplierParts.map((id) => {
        const n = db.nonconformances.find((x) => x.id === id)!
        return `- Open ${id} (${n.severity}) on ${partById(n.partId)?.name}: ${n.title}`
      }),
      '',
    ]),
    '## Recommendation',
    slot('recommendation'),
  ]
  return { title, markdown: lines.join('\n'), citations: comparisonCitations(part.id, rows) }
}

function qualificationStatus(args: Record<string, unknown>) {
  const assembly = matchAssembly(args.assembly)
  const partRef = str(args.part)
  const parts = partRef ? resolveParts(partRef) : assembly ? db.parts.filter((p) => p.assembly === assembly) : []
  if (parts.length === 0) return null
  const ids = new Set(parts.map((p) => p.id))
  const reqs = db.requirements.filter((r) => r.partIds.some((id) => ids.has(id)))
  const ncrs = db.nonconformances.filter((n) => ids.has(n.partId) && isOpen(n))
  const scope = partRef ? parts.map((p) => p.name).join(', ') : `${assembly} assembly`
  const title = str(args.title) ?? `Qualification status memo: ${scope}`
  const lines = [
    `# ${title}`,
    `Program: ${db.program.name} · Next milestone: ${db.program.nextMilestone} · Prepared by SpaceGrade Agent (draft)`,
    '',
    '## Executive summary',
    slot('executive_summary'),
    '',
    '## Parts',
    '| Part | Name | Supplier | Qualification | Open NCRs |',
    '|---|---|---|---|---|',
    ...parts.map((p) => `| ${p.id} | ${p.name} | ${supplierById(p.supplierId)?.name} | ${p.qualStatus.replace('_', ' ')} | ${ncrs.filter((n) => n.partId === p.id).map((n) => n.id).join(', ') || 'none'} |`),
    '',
    '## Requirement verification',
    '| Requirement | Title | Method | Status |',
    '|---|---|---|---|',
    ...reqs.map((r) => `| ${r.id} | ${r.title} | ${r.method} | ${verificationStatus(r).replace('_', ' ')} |`),
    '',
    '## Open nonconformances',
    ...(ncrs.length ? ncrs.map((n) => `- **${n.id}** (${n.severity}${n.blocksQualification ? ', blocks qualification' : ''}): ${n.title}. Next: ${n.nextAction}`) : ['None.']),
    '',
    '## Recommendation',
    slot('recommendation'),
  ]
  const citations: Citation[] = [...parts.map(cite.part), ...reqs.map(cite.req), ...ncrs.map(cite.ncr)]
  return { title, markdown: lines.join('\n'), citations }
}

export const draftDocument: ToolDef = {
  name: 'draft_document',
  description: 'Generate a structured engineering document from program records. kind "trade_study" compares supplier quotes for a part against its requirements (needs part, optional suppliers). kind "qualification_status" summarises parts, requirement verification and open NCRs for a part or assembly. Tables are filled from data; you will be asked to write the executive summary and recommendation afterwards.',
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['trade_study', 'qualification_status'] },
      part: { type: 'string' },
      assembly: { type: 'string' },
      suppliers: { type: 'array', items: { type: 'string' } },
      title: { type: 'string' },
    },
    required: ['kind'],
  },
  run(args) {
    const doc = args.kind === 'trade_study' ? tradeStudy(args) : qualificationStatus(args)
    if (!doc) return { data: { error: 'Not enough data: name a part with quotes (trade_study) or a part/assembly (qualification_status).' }, citations: [], summary: 'document not generated' }
    const citations = uniqueCitations(doc.citations)
    return {
      data: { title: doc.title, sections: doc.markdown.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3)), narrativeSlots: NARRATIVE_SLOTS, recordsUsed: citations.map((c) => c.id) },
      citations,
      summary: `drafted "${doc.title}" from ${citations.length} records`,
      document: { title: doc.title, markdown: doc.markdown },
    }
  },
}
