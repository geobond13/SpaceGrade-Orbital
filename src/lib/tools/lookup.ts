import { programData } from '@/data/program'
import type { Nonconformance, Part, Requirement, Supplier, TestOutcome } from '@/data/types'
import type { Citation } from './types'

export const db = programData

export type VerificationStatus = 'verified' | 'failed' | 'in_progress' | 'unverified'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const STOP = new Set(['the', 'and', 'for', 'of', 'on', 'our', 'a', 'an', 'assembly', 'part', 'parts'])

export function partById(id: string): Part | undefined {
  return db.parts.find((p) => p.id === id)
}

export function supplierById(id: string): Supplier | undefined {
  return db.suppliers.find((s) => s.id === id)
}

/** Resolve a part reference that may be an id, part number or name fragment. */
export function resolveParts(ref: string | undefined): Part[] {
  if (!ref) return []
  const lower = ref.toLowerCase()
  const exact = db.parts.filter((p) => p.id.toLowerCase() === lower || p.partNumber.toLowerCase() === lower)
  if (exact.length) return exact
  const q = norm(ref)
  const byName = db.parts.filter((p) => norm(p.name).includes(q))
  if (byName.length) return byName
  const words = q.split(' ').filter((w) => w.length > 1 && !STOP.has(w))
  if (words.length === 0) return []
  return db.parts.filter((p) => words.every((w) => norm(`${p.name} ${p.assembly}`).includes(w)))
}

export function resolveSuppliers(refs: unknown): Supplier[] {
  const list = typeof refs === 'string' ? refs.split(/,| and | vs\.? /i) : Array.isArray(refs) ? refs : []
  const wanted = list.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).map(norm)
  if (wanted.length === 0) return []
  return db.suppliers.filter((s) => {
    const name = norm(s.name)
    const first = name.split(' ')[0]
    return wanted.some((w) => s.id.toLowerCase() === w.replace(/ /g, '-') || name.includes(w) || w.includes(first))
  })
}

const ASSEMBLIES = ['Propulsion', 'ADCS', 'Power', 'Avionics', 'Comms', 'Structure'] as const
const ASSEMBLY_ALIASES: Record<string, (typeof ASSEMBLIES)[number]> = {
  attitude: 'ADCS', eps: 'Power', electrical: 'Power', battery: 'Power', communications: 'Comms', rf: 'Comms',
  thermal: 'Structure', structures: 'Structure', structural: 'Structure', prop: 'Propulsion',
}

export function matchAssembly(a: unknown): string | undefined {
  if (typeof a !== 'string' || !a.trim()) return undefined
  const q = norm(a)
  return ASSEMBLIES.find((n) => q.includes(n.toLowerCase())) ?? Object.entries(ASSEMBLY_ALIASES).find(([k]) => q.split(' ').includes(k))?.[1]
}

/** Hypothetical changes applied on top of the program data (what-if simulation). */
export interface Overrides {
  closedNcrs?: string[]
  testOutcomes?: Record<string, TestOutcome>
}

const outcomeOf = (t: { id: string; outcome: TestOutcome }, o?: Overrides) => o?.testOutcomes?.[t.id] ?? t.outcome

export function verificationStatus(r: Requirement, o?: Overrides): VerificationStatus {
  const tests = db.tests.filter((t) => t.requirementIds.includes(r.id))
  if (tests.length === 0) return 'unverified'
  const outcomes = tests.map((t) => outcomeOf(t, o))
  if (outcomes.some((x) => x === 'fail')) return 'failed'
  if (outcomes.every((x) => x === 'pass')) return 'verified'
  return 'in_progress'
}

export const isOpen = (n: Nonconformance, o?: Overrides) =>
  (n.status === 'open' || n.status === 'in_review') && !o?.closedNcrs?.includes(n.id)

export function openNcrsForPart(partId: string, o?: Overrides): Nonconformance[] {
  return db.nonconformances.filter((n) => n.partId === partId && isOpen(n, o))
}

export const cite = {
  part: (p: Part): Citation => ({ type: 'part', id: p.id, label: p.name }),
  req: (r: Requirement): Citation => ({ type: 'requirement', id: r.id, label: r.title }),
  ncr: (n: Nonconformance): Citation => ({ type: 'ncr', id: n.id, label: n.title }),
  supplier: (s: Supplier): Citation => ({ type: 'supplier', id: s.id, label: s.name }),
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Citation for any record id in the program, or undefined if it does not exist. */
export function citationFor(id: string): Citation | undefined {
  const part = db.parts.find((x) => x.id === id)
  if (part) return cite.part(part)
  const req = db.requirements.find((x) => x.id === id)
  if (req) return cite.req(req)
  const test = db.tests.find((x) => x.id === id)
  if (test) return { type: 'test', id, label: test.name }
  const ncr = db.nonconformances.find((x) => x.id === id)
  if (ncr) return cite.ncr(ncr)
  const sup = db.suppliers.find((x) => x.id === id)
  if (sup) return cite.supplier(sup)
  const quote = db.quotes.find((x) => x.id === id)
  if (quote) return { type: 'quote', id, label: `${supplierById(quote.supplierId)?.name} quote` }
  return undefined
}

/** Merge citations without duplicates, keeping first-seen order. */
export function uniqueCitations(list: Citation[]): Citation[] {
  const seen = new Set<string>()
  return list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
}
