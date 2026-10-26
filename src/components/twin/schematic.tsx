'use client'

import { db } from '@/lib/tools/lookup'
import { ASSEMBLY_CODE } from '../status'
import { NO_VISUAL, type PartVisuals } from './visuals'

// Flat schematic of the spacecraft: one block per top-level part, grouped by
// assembly. Shown while the 3D twin loads, without WebGL, and on small screens.

const LAYOUT: Record<string, { x: number; y: number; w: number; h: number }> = {
  Power: { x: 10, y: 70, w: 70, h: 60 },
  Comms: { x: 90, y: 20, w: 100, h: 40 },
  ADCS: { x: 90, y: 70, w: 100, h: 60 },
  Avionics: { x: 200, y: 20, w: 100, h: 110 },
  Propulsion: { x: 90, y: 140, w: 210, h: 50 },
  Structure: { x: 310, y: 20, w: 70, h: 170 },
}

export function Schematic({ visuals, highlighted, onSelectPart }: {
  visuals: PartVisuals
  highlighted: Set<string>
  onSelectPart: (id: string) => void
}) {
  return (
    <svg viewBox="0 0 390 200" className="h-full w-full" role="img" aria-label="Spacecraft schematic colored by part state">
      {Object.entries(LAYOUT).map(([assembly, box]) => {
        const parts = db.parts.filter((p) => p.assembly === assembly)
        const cols = Math.ceil(Math.sqrt(parts.length * (box.w / box.h)))
        const rows = Math.ceil(parts.length / cols)
        const cw = (box.w - 8) / cols
        const ch = (box.h - 18) / rows
        return (
          <g key={assembly}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={3} fill="none" stroke="var(--line-strong)" />
            <text x={box.x + 4} y={box.y + 10} fontSize={7} fontFamily="var(--font-geist-mono)" fill="var(--muted)" letterSpacing={1}>{ASSEMBLY_CODE[assembly]}</text>
            {parts.map((p, i) => {
              const visual = visuals[p.id] ?? NO_VISUAL
              const lit = highlighted.has(p.id)
              return (
                <rect
                  key={p.id}
                  x={box.x + 4 + (i % cols) * cw}
                  y={box.y + 14 + Math.floor(i / cols) * ch}
                  width={cw - 2}
                  height={ch - 2}
                  rx={1.5}
                  fill={visual.hex}
                  fillOpacity={lit ? 0.95 : 0.35}
                  stroke={lit ? 'var(--accent)' : 'none'}
                  strokeWidth={1.2}
                  className={visual.pulse ? 'sg-pulse cursor-pointer' : 'cursor-pointer'}
                  onClick={() => onSelectPart(p.id)}
                >
                  <title>{`${p.id} ${p.name}: ${visual.label}`}</title>
                </rect>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}
