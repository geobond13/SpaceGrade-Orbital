import type { Quote, Supplier } from '@/data/types'
import type { Citation, ToolDef } from './types'
import { cite, db, isOpen, partById, resolveParts, resolveSuppliers, str, supplierById } from './lookup'

export interface RequirementCheck { requirementId: string; title: string; limit: string; offered: number | null; meets: boolean | null }

export interface SupplierComparisonRow {
  quoteId: string
  supplier: Pick<Supplier, 'id' | 'name' | 'certifications' | 'onTimeDeliveryPct' | 'escapesLast12mo'>
  unitPriceUsd: number
  nreUsd: number
  leadTimeWeeks: number
  heritage: string
  exceptions: string[]
  checks: RequirementCheck[]
  requirementsMet: string
  openNcrsOnSupplierParts: string[]
}

/** Deterministic comparison of quotes against the part's measurable requirements. */
export function compareQuotes(partId: string, quotes: Quote[]): SupplierComparisonRow[] {
  const reqs = db.requirements.filter((r) => r.metric && r.partIds.includes(partId))
  return quotes.map((q) => {
    const s = supplierById(q.supplierId)!
    const checks: RequirementCheck[] = reqs.map((r) => {
      const m = r.metric!
      const offered = q.specs[m.key] ?? null
      const meets = offered === null ? null : m.op === '<=' ? offered <= m.value : offered >= m.value
      return { requirementId: r.id, title: r.title, limit: `${m.op} ${m.value} ${m.unit}`, offered, meets }
    })
    const supplierPartIds = new Set(db.parts.filter((p) => p.supplierId === s.id).map((p) => p.id))
    return {
      quoteId: q.id,
      supplier: { id: s.id, name: s.name, certifications: s.certifications, onTimeDeliveryPct: s.onTimeDeliveryPct, escapesLast12mo: s.escapesLast12mo },
      unitPriceUsd: q.unitPriceUsd, nreUsd: q.nreUsd, leadTimeWeeks: q.leadTimeWeeks, heritage: q.heritage, exceptions: q.exceptions,
      checks,
      requirementsMet: `${checks.filter((c) => c.meets).length}/${checks.length}`,
      openNcrsOnSupplierParts: db.nonconformances.filter((n) => supplierPartIds.has(n.partId) && isOpen(n)).map((n) => n.id),
    }
  })
}

export function resolveComparison(args: Record<string, unknown>) {
  const parts = resolveParts(str(args.part) ?? '')
  const part = parts.find((p) => db.quotes.some((q) => q.partId === p.id)) ?? parts[0]
  if (!part) return null
  const wanted = resolveSuppliers(args.suppliers)
  let quotes = db.quotes.filter((q) => q.partId === part.id)
  if (wanted.length) quotes = quotes.filter((q) => wanted.some((s) => s.id === q.supplierId))
  return { part, rows: compareQuotes(part.id, quotes) }
}

export function comparisonCitations(partId: string, rows: SupplierComparisonRow[]): Citation[] {
  const part = partById(partId)!
  const reqIds = new Set(rows.flatMap((r) => r.checks.map((c) => c.requirementId)))
  const ncrIds = new Set(rows.flatMap((r) => r.openNcrsOnSupplierParts))
  return [
    cite.part(part),
    ...rows.map((r) => ({ type: 'quote' as const, id: r.quoteId, label: `${r.supplier.name} quote` })),
    ...rows.map((r) => cite.supplier(supplierById(r.supplier.id)!)),
    ...db.requirements.filter((r) => reqIds.has(r.id)).map(cite.req),
    ...db.nonconformances.filter((n) => ncrIds.has(n.id)).map(cite.ncr),
  ]
}

export const compareSuppliers: ToolDef = {
  name: 'compare_suppliers',
  description: "Compare supplier quotes for a part against that part's measurable requirements (pass/fail per requirement), plus price, NRE, lead time, heritage, quality history and stated exceptions. Optionally restrict to named suppliers.",
  parameters: {
    type: 'object',
    properties: {
      part: { type: 'string', description: 'Part id or name, e.g. "main isolation valve"' },
      suppliers: { type: 'array', items: { type: 'string' }, description: 'Supplier names or ids to include (default: all quotes)' },
    },
    required: ['part'],
  },
  run(args) {
    const res = resolveComparison(args)
    if (!res) return { data: { error: 'No matching part' }, citations: [], summary: 'no matching part' }
    if (res.rows.length === 0) {
      return { data: { part: res.part.id, error: 'No quotes on file for that part and supplier set' }, citations: [cite.part(res.part)], summary: 'no quotes found' }
    }
    return {
      data: { part: { id: res.part.id, name: res.part.name, currentSupplier: supplierById(res.part.supplierId)?.name }, comparison: res.rows },
      citations: comparisonCitations(res.part.id, res.rows),
      summary: `${res.rows.length} quotes compared on ${res.rows[0].checks.length} requirements`,
    }
  },
}
