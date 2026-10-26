'use client'

import type { ReactNode } from 'react'
import { db } from '@/lib/tools/lookup'
import type { Readiness } from '@/lib/readiness'
import type { Focus } from '@/lib/focus'
import { Schematic } from './twin/schematic'
import { STATUS } from './status'

const LEGEND = ['blocked', 'failed', 'in_progress', 'unverified', 'verified'] as const

export function TwinPanel({ readiness, focus, framed, onSelectPart, overlay }: {
  readiness: Readiness
  focus: Focus
  /** Parts the view should frame: a pinned record, else the agent's active parts. */
  framed: string[]
  onSelectPart: (id: string) => void
  overlay?: ReactNode
}) {
  const highlighted = new Set([...focus.touchedPartIds, ...framed])
  const label = framed.length === 1 ? db.parts.find((p) => p.id === framed[0])?.name : framed.length ? `${framed.length} parts` : undefined

  return (
    <div className="grid-backdrop relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 p-6 pt-10">
        <Schematic readiness={readiness} highlighted={highlighted} onSelectPart={onSelectPart} />
      </div>

      <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2">
        <h2 className="panel-title">Digital twin</h2>
        {focus.currentTool && <span className="sg-pulse font-mono text-[0.68rem] text-accent">▸ {focus.currentTool}</span>}
        {!focus.currentTool && label && <span className="font-mono text-[0.68rem] text-muted">◎ {label}</span>}
      </div>

      <ul className="pointer-events-none absolute bottom-2.5 left-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.62rem] text-muted">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: STATUS[s].color }} />{STATUS[s].label}</li>
        ))}
      </ul>
      {overlay}
    </div>
  )
}
