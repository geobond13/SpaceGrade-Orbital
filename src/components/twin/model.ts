// Procedural KESTREL-1 model: every mesh belongs to a part id, so readiness
// and agent focus map straight onto geometry. Units are arbitrary (bus ≈ 1).
// +Y is zenith, -Y holds the propulsion bay, +Z faces the payload.

import { db } from '@/lib/tools/lookup'

export type Shape =
  | { kind: 'box'; size: [number, number, number] }
  | { kind: 'cyl'; rTop: number; rBottom: number; h: number }
  | { kind: 'sphere'; r: number }
  | { kind: 'torus'; r: number; tube: number }

export type Finish = 'metal' | 'dark' | 'solar' | 'gold' | 'white' | 'shell' | 'frame'

export interface MeshSpec {
  partId: string
  shape: Shape
  pos: [number, number, number]
  rot?: [number, number, number]
  finish?: Finish
}

const H = Math.PI / 2

// Bus: 1.0 (x) × 1.2 (y) × 1.0 (z), centred on the origin.
export const MESHES: MeshSpec[] = [
  // Structure
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): MeshSpec => ({ partId: 'P-STR-01', shape: { kind: 'box', size: [0.04, 1.2, 0.04] }, pos: [sx * 0.48, 0, sz * 0.48], finish: 'metal' }))),
  { partId: 'P-STR-01', shape: { kind: 'box', size: [1, 0.03, 1] }, pos: [0, 0.6, 0], finish: 'dark' },
  { partId: 'P-STR-01', shape: { kind: 'box', size: [1, 0.03, 1] }, pos: [0, -0.6, 0], finish: 'dark' },
  { partId: 'P-STR-03', shape: { kind: 'box', size: [0.015, 1.14, 0.92] }, pos: [0.5, 0, 0], finish: 'shell' },
  { partId: 'P-STR-03', shape: { kind: 'box', size: [0.015, 1.14, 0.92] }, pos: [-0.5, 0, 0], finish: 'shell' },
  { partId: 'P-STR-05', shape: { kind: 'box', size: [0.92, 1.14, 0.015] }, pos: [0, 0, 0.5], finish: 'gold' },
  { partId: 'P-STR-04', shape: { kind: 'box', size: [0.92, 1.14, 0.015] }, pos: [0, 0, -0.5], finish: 'white' },
  { partId: 'P-STR-02', shape: { kind: 'torus', r: 0.3, tube: 0.035 }, pos: [0, 0, -0.55], finish: 'metal' },
  { partId: 'P-STR-08', shape: { kind: 'box', size: [0.36, 0.3, 0.12] }, pos: [0, 0.2, 0.42], finish: 'metal' },
  { partId: 'P-STR-08', shape: { kind: 'cyl', rTop: 0.13, rBottom: 0.15, h: 0.32 }, pos: [0, 0.2, 0.66], rot: [H, 0, 0], finish: 'dark' },

  // Propulsion bay under the bus
  { partId: 'P-PROP-01', shape: { kind: 'box', size: [0.84, 0.38, 0.84] }, pos: [0, -0.8, 0], finish: 'frame' },
  { partId: 'P-PROP-02', shape: { kind: 'sphere', r: 0.17 }, pos: [0, -0.8, 0], finish: 'metal' },
  { partId: 'P-PROP-09', shape: { kind: 'torus', r: 0.24, tube: 0.008 }, pos: [0, -0.68, 0], rot: [H, 0, 0], finish: 'metal' },
  { partId: 'P-PROP-03', shape: { kind: 'cyl', rTop: 0.065, rBottom: 0.065, h: 0.16 }, pos: [0.27, -0.76, 0.14], finish: 'metal' },
  { partId: 'P-PROP-06', shape: { kind: 'cyl', rTop: 0.02, rBottom: 0.02, h: 0.08 }, pos: [-0.27, -0.7, 0.16], finish: 'metal' },
  { partId: 'P-PROP-07', shape: { kind: 'box', size: [0.06, 0.06, 0.06] }, pos: [-0.27, -0.74, -0.2], finish: 'metal' },
  { partId: 'P-PROP-08', shape: { kind: 'cyl', rTop: 0.025, rBottom: 0.025, h: 0.12 }, pos: [0.16, -0.7, -0.24], rot: [0, 0, H], finish: 'metal' },
  ...[-1, 1].flatMap((sx) => [-1, 1].flatMap((sz): MeshSpec[] => [
    { partId: 'P-PROP-04', shape: { kind: 'cyl', rTop: 0.025, rBottom: 0.06, h: 0.13 }, pos: [sx * 0.3, -1.05, sz * 0.3], finish: 'dark' },
    { partId: 'P-PROP-05', shape: { kind: 'torus', r: 0.035, tube: 0.012 }, pos: [sx * 0.3, -0.98, sz * 0.3], rot: [H, 0, 0], finish: 'metal' },
  ])),

  // Power: deployable wings on ±X, battery and PCDU inside
  ...[-1, 1].flatMap((sx): MeshSpec[] => [
    { partId: 'P-PWR-04', shape: { kind: 'box', size: [1.5, 0.025, 0.8] }, pos: [sx * 1.35, 0.1, 0], finish: 'dark' },
    { partId: 'P-PWR-05', shape: { kind: 'box', size: [1.42, 0.01, 0.72] }, pos: [sx * 1.35, 0.118, 0], finish: 'solar' },
    { partId: 'P-PWR-07', shape: { kind: 'box', size: [0.1, 0.08, 0.14] }, pos: [sx * 0.56, 0.1, 0], finish: 'metal' },
  ]),
  { partId: 'P-PWR-02', shape: { kind: 'box', size: [0.3, 0.2, 0.3] }, pos: [-0.24, -0.38, -0.05], finish: 'metal' },
  { partId: 'P-PWR-06', shape: { kind: 'box', size: [0.26, 0.16, 0.2] }, pos: [-0.24, -0.12, -0.24], finish: 'metal' },

  // ADCS: star tracker + baffle on the top deck, wheels and torquers inside
  { partId: 'P-ADCS-02', shape: { kind: 'box', size: [0.13, 0.12, 0.13] }, pos: [0.3, 0.68, -0.3], finish: 'metal' },
  { partId: 'P-ADCS-03', shape: { kind: 'cyl', rTop: 0.1, rBottom: 0.06, h: 0.22 }, pos: [0.33, 0.84, -0.33], rot: [-0.25, 0, -0.25], finish: 'dark' },
  { partId: 'P-ADCS-04', shape: { kind: 'cyl', rTop: 0.09, rBottom: 0.09, h: 0.05 }, pos: [0.24, 0.3, 0.05], finish: 'metal' },
  { partId: 'P-ADCS-04', shape: { kind: 'cyl', rTop: 0.09, rBottom: 0.09, h: 0.05 }, pos: [0.24, 0.3, -0.2], rot: [H, 0, 0], finish: 'metal' },
  { partId: 'P-ADCS-04', shape: { kind: 'cyl', rTop: 0.09, rBottom: 0.09, h: 0.05 }, pos: [0.12, 0.3, -0.07], rot: [0, 0, H], finish: 'metal' },
  ...[0, 1, 2].map((i): MeshSpec => ({ partId: 'P-ADCS-05', shape: { kind: 'cyl', rTop: 0.014, rBottom: 0.014, h: 0.5 }, pos: [-0.1 + i * 0.08, 0.5, -0.38], rot: [0, 0, H], finish: 'metal' })),
  { partId: 'P-ADCS-06', shape: { kind: 'box', size: [0.05, 0.05, 0.015] }, pos: [0.3, 0.45, 0.51], finish: 'dark' },
  { partId: 'P-ADCS-06', shape: { kind: 'box', size: [0.05, 0.05, 0.015] }, pos: [-0.3, 0.45, -0.51], finish: 'dark' },
  { partId: 'P-ADCS-07', shape: { kind: 'box', size: [0.07, 0.05, 0.07] }, pos: [0.05, 0.38, -0.27], finish: 'metal' },
  { partId: 'P-ADCS-08', shape: { kind: 'cyl', rTop: 0.008, rBottom: 0.008, h: 0.35 }, pos: [-0.4, 0.78, -0.4], finish: 'metal' },
  { partId: 'P-ADCS-08', shape: { kind: 'box', size: [0.05, 0.05, 0.05] }, pos: [-0.4, 0.97, -0.4], finish: 'metal' },
  { partId: 'P-ADCS-09', shape: { kind: 'box', size: [0.22, 0.12, 0.18] }, pos: [0.24, 0.08, -0.26], finish: 'metal' },

  // Avionics: board stack in a chassis, GNSS patch on the top deck
  { partId: 'P-AV-07', shape: { kind: 'box', size: [0.34, 0.44, 0.3] }, pos: [-0.2, 0.26, 0.12], finish: 'frame' },
  { partId: 'P-AV-01', shape: { kind: 'box', size: [0.3, 0.04, 0.26] }, pos: [-0.2, 0.1, 0.12], finish: 'dark' },
  { partId: 'P-AV-03', shape: { kind: 'box', size: [0.3, 0.04, 0.26] }, pos: [-0.2, 0.2, 0.12], finish: 'dark' },
  { partId: 'P-AV-04', shape: { kind: 'box', size: [0.3, 0.04, 0.26] }, pos: [-0.2, 0.3, 0.12], finish: 'dark' },
  { partId: 'P-AV-06', shape: { kind: 'box', size: [0.3, 0.04, 0.26] }, pos: [-0.2, 0.4, 0.12], finish: 'dark' },
  { partId: 'P-AV-05', shape: { kind: 'cyl', rTop: 0.06, rBottom: 0.06, h: 0.02 }, pos: [-0.25, 0.63, 0.3], finish: 'white' },

  // Comms: transceivers inside, antennas outside
  { partId: 'P-COM-01', shape: { kind: 'box', size: [0.2, 0.1, 0.16] }, pos: [0.24, -0.32, 0.26], finish: 'metal' },
  { partId: 'P-COM-03', shape: { kind: 'box', size: [0.18, 0.08, 0.14] }, pos: [0.24, -0.16, 0.3], finish: 'metal' },
  { partId: 'P-COM-05', shape: { kind: 'box', size: [0.2, 0.1, 0.16] }, pos: [0.24, -0.48, 0.22], finish: 'metal' },
  { partId: 'P-COM-05', shape: { kind: 'cyl', rTop: 0.08, rBottom: 0.03, h: 0.12 }, pos: [0.28, -0.42, 0.58], rot: [H, 0, 0], finish: 'metal' },
  { partId: 'P-COM-02', shape: { kind: 'box', size: [0.14, 0.14, 0.02] }, pos: [-0.28, -0.36, 0.52], finish: 'white' },
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): MeshSpec => ({
    partId: 'P-COM-04', shape: { kind: 'cyl', rTop: 0.005, rBottom: 0.005, h: 0.6 }, pos: [sx * 0.55, 0.85, sz * 0.55], rot: [sz * 0.6, 0, -sx * 0.6], finish: 'metal',
  }))),
]

/** Offset of each assembly in the exploded view, at factor 1. */
export function explodeOffset(spec: MeshSpec): [number, number, number] {
  const assembly = db.parts.find((p) => p.id === spec.partId)?.assembly
  switch (assembly) {
    case 'Propulsion': return [0, -0.55, 0]
    case 'ADCS': return [0.15, 0.55, -0.15]
    case 'Power': return [Math.sign(spec.pos[0]) * 0.45, 0, 0]
    case 'Avionics': return [-0.25, 0.2, 0.75]
    case 'Comms': return [0.35, -0.1, 0.75]
    default: return [0, 0, 0]
  }
}

export function meshPosition(spec: MeshSpec, explode: number): [number, number, number] {
  const o = explodeOffset(spec)
  return [spec.pos[0] + o[0] * explode, spec.pos[1] + o[1] * explode, spec.pos[2] + o[2] * explode]
}

const byPart = new Map<string, MeshSpec[]>()
for (const m of MESHES) byPart.set(m.partId, [...(byPart.get(m.partId) ?? []), m])

const descendants = (id: string): string[] =>
  db.parts.filter((p) => p.parentId === id).flatMap((p) => [p.id, ...descendants(p.id)])

/**
 * Meshes that stand for a part: its own, else its descendants' (an assembly),
 * else its nearest ancestor's (a cell lot inside a battery), else its assembly's.
 */
export function meshesForPart(id: string): MeshSpec[] {
  const own = byPart.get(id)
  if (own) return own
  const down = descendants(id).flatMap((d) => byPart.get(d) ?? [])
  if (down.length) return down
  let part = db.parts.find((p) => p.id === id)
  while (part?.parentId) {
    const up = byPart.get(part.parentId)
    if (up) return up
    part = db.parts.find((p) => p.id === part!.parentId)
  }
  return part ? MESHES.filter((m) => db.parts.find((p) => p.id === m.partId)?.assembly === part!.assembly) : []
}

function halfExtent(shape: Shape): number {
  switch (shape.kind) {
    case 'box': return Math.max(...shape.size) / 2
    case 'cyl': return Math.max(shape.rTop, shape.rBottom, shape.h / 2)
    case 'sphere': return shape.r
    case 'torus': return shape.r + shape.tube
  }
}

/** Bounding sphere (centre, radius) around the meshes standing for these parts and everything under them. */
export function frameFor(partIds: string[], explode: number): { center: [number, number, number]; radius: number } | undefined {
  const ids = new Set(partIds.flatMap((id) => [id, ...descendants(id)]))
  const meshes = [...new Set([...ids].flatMap((id) => byPart.get(id) ?? (partIds.includes(id) ? meshesForPart(id) : [])))]
  if (meshes.length === 0) return undefined
  const boxes = meshes.map((m) => ({ p: meshPosition(m, explode), r: halfExtent(m.shape) }))
  const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.p[k] - b.r)))
  const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.p[k] + b.r)))
  const center = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as [number, number, number]
  const radius = Math.max(0.3, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2)
  return { center, radius }
}
