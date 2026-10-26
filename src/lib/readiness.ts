// Program readiness derived from test records and NCRs, optionally under
// hypothetical overrides (what-if). Pure: shared by the UI and simulate_change.

import type { Assembly, Nonconformance } from '@/data/types'
import { db, isOpen, openNcrsForPart, verificationStatus, type Overrides, type VerificationStatus } from '@/lib/tools/lookup'

export type { Overrides, VerificationStatus }

/** Display status of a part, worst first. */
export type PartStatus = 'blocked' | 'failed' | 'in_progress' | 'unverified' | 'verified' | 'none'

export const PART_STATUS_RANK: Record<PartStatus, number> = { blocked: 0, failed: 1, in_progress: 2, unverified: 3, verified: 4, none: 5 }

export const ASSEMBLY_ROWS = ['System', 'Propulsion', 'ADCS', 'Power', 'Avionics', 'Comms', 'Structure'] as const
export type AssemblyRow = (typeof ASSEMBLY_ROWS)[number]

export interface AssemblyReadiness {
  assembly: AssemblyRow
  total: number
  counts: Record<VerificationStatus, number>
  /** Share of requirements verified, 0–100. */
  pct: number
  openNcrs: string[]
  blockingNcrs: string[]
}

export interface Readiness {
  requirements: Record<string, VerificationStatus>
  parts: Record<string, PartStatus>
  assemblies: AssemblyReadiness[]
  /** Share of all requirements verified, 0–100. */
  pct: number
  blockingNcrs: string[]
}

const zero = (): Record<VerificationStatus, number> => ({ verified: 0, failed: 0, in_progress: 0, unverified: 0 })

const pct = (verified: number, total: number) => (total === 0 ? 100 : Math.round((verified / total) * 100))

function ownStatus(partId: string, reqStatus: Record<string, VerificationStatus>, o?: Overrides): PartStatus {
  if (openNcrsForPart(partId, o).some((n) => n.blocksQualification)) return 'blocked'
  const statuses = db.requirements.filter((r) => r.partIds.includes(partId)).map((r) => reqStatus[r.id])
  if (statuses.length === 0) return 'none'
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('in_progress')) return 'in_progress'
  if (statuses.includes('unverified')) return 'unverified'
  return 'verified'
}

const assemblyOf = (n: Nonconformance): Assembly | undefined => db.parts.find((p) => p.id === n.partId)?.assembly

export function computeReadiness(o?: Overrides): Readiness {
  const requirements: Record<string, VerificationStatus> = {}
  for (const r of db.requirements) requirements[r.id] = verificationStatus(r, o)

  // A part shows the worst status of itself and everything under it, so an
  // assembly with a blocked valve reads as blocked.
  const own: Record<string, PartStatus> = {}
  for (const p of db.parts) own[p.id] = ownStatus(p.id, requirements, o)
  const parts: Record<string, PartStatus> = {}
  const rollup = (id: string): PartStatus => {
    if (parts[id]) return parts[id]
    const children = db.parts.filter((p) => p.parentId === id).map((p) => rollup(p.id))
    return (parts[id] = [own[id], ...children].reduce((w, s) => (PART_STATUS_RANK[s] < PART_STATUS_RANK[w] ? s : w)))
  }
  for (const p of db.parts) rollup(p.id)

  const open = db.nonconformances.filter((n) => isOpen(n, o))
  const assemblies = ASSEMBLY_ROWS.map((assembly): AssemblyReadiness => {
    const reqs = db.requirements.filter((r) => r.assembly === assembly)
    const counts = zero()
    for (const r of reqs) counts[requirements[r.id]]++
    const ncrs = assembly === 'System' ? [] : open.filter((n) => assemblyOf(n) === assembly)
    return {
      assembly, total: reqs.length, counts, pct: pct(counts.verified, reqs.length),
      openNcrs: ncrs.map((n) => n.id),
      blockingNcrs: ncrs.filter((n) => n.blocksQualification).map((n) => n.id),
    }
  })

  const verified = Object.values(requirements).filter((s) => s === 'verified').length
  return {
    requirements, parts, assemblies,
    pct: pct(verified, db.requirements.length),
    blockingNcrs: open.filter((n) => n.blocksQualification).map((n) => n.id),
  }
}

export interface ReadinessDelta {
  requirements: { id: string; from: VerificationStatus; to: VerificationStatus }[]
  parts: { id: string; from: PartStatus; to: PartStatus }[]
  assemblies: { assembly: AssemblyRow; from: number; to: number; blockingFrom: number; blockingTo: number }[]
}

/** What changed between two readiness snapshots. Unchanged rows are left out. */
export function diffReadiness(a: Readiness, b: Readiness): ReadinessDelta {
  return {
    requirements: Object.keys(a.requirements).filter((id) => a.requirements[id] !== b.requirements[id])
      .map((id) => ({ id, from: a.requirements[id], to: b.requirements[id] })),
    parts: Object.keys(a.parts).filter((id) => a.parts[id] !== b.parts[id])
      .map((id) => ({ id, from: a.parts[id], to: b.parts[id] })),
    assemblies: a.assemblies.map((x, i) => ({ x, y: b.assemblies[i] }))
      .filter(({ x, y }) => x.pct !== y.pct || x.blockingNcrs.length !== y.blockingNcrs.length)
      .map(({ x, y }) => ({ assembly: x.assembly, from: x.pct, to: y.pct, blockingFrom: x.blockingNcrs.length, blockingTo: y.blockingNcrs.length })),
  }
}

/** Dates named in the milestone line, e.g. "... review 2026-11-20; system CDR 2026-12-08". */
export function parseMilestones(line: string): { label: string; date: string }[] {
  return line.split(';').flatMap((chunk) => {
    const m = chunk.match(/^(.*?)\s*(\d{4}-\d{2}-\d{2})/)
    return m ? [{ label: m[1].trim(), date: m[2] }] : []
  })
}
