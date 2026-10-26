'use client'

import { useState } from 'react'
import { db } from '@/lib/tools/lookup'
import { ASSEMBLY_ROWS, type Readiness, type VerificationStatus } from '@/lib/readiness'
import type { Focus } from '@/lib/focus'
import { ASSEMBLY_CODE, STATUS } from './status'

const ORDER: VerificationStatus[] = ['verified', 'in_progress', 'failed', 'unverified']

function Cell({ status, touched, changed, hovered }: { status: VerificationStatus; touched: boolean; changed: boolean; hovered: boolean }) {
  const color = STATUS[status].color
  return (
    <span
      className={`block size-3.5 rounded-[3px] transition-colors duration-500 ${changed ? 'sg-ripple' : ''}`}
      style={{
        // Unverified is hollow so it never relies on gray-vs-red alone.
        background: status === 'unverified' ? 'transparent' : color,
        boxShadow: [
          status === 'unverified' ? `inset 0 0 0 1.5px ${color}` : '',
          touched ? '0 0 0 1.5px var(--canvas), 0 0 0 3px var(--accent)' : '',
          hovered ? '0 0 0 1.5px var(--canvas), 0 0 0 3px var(--ink)' : '',
        ].filter(Boolean).join(', ') || undefined,
      }}
    />
  )
}

/** Assemblies × requirements, one cell per requirement, colored by derived verification status. */
export function ReadinessHeatmap({ readiness, baseline, focus, onOpenRecord }: {
  readiness: Readiness
  baseline: Readiness
  focus: Focus
  onOpenRecord: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const touched = new Set(focus.touchedRecordIds)
  const hoveredReq = hover ? db.requirements.find((r) => r.id === hover) : undefined

  return (
    <section aria-label="Requirement verification heatmap">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="panel-title">Verification matrix</h2>
        <span className="font-mono text-[0.62rem] text-faint">{db.requirements.length} requirements</span>
      </div>

      <ul className="mb-2 flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-[0.6rem] text-muted">
        {ORDER.map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="size-2 rounded-[2px]" style={s === 'unverified' ? { boxShadow: `inset 0 0 0 1.5px ${STATUS[s].color}` } : { background: STATUS[s].color }} />
            {STATUS[s].label}
          </li>
        ))}
        <li className="flex items-center gap-1"><span className="size-2 rounded-[2px] ring-[1.5px] ring-accent" />Read by agent</li>
      </ul>

      <div className="space-y-1.5" onMouseLeave={() => setHover(null)}>
        {ASSEMBLY_ROWS.map((assembly) => {
          const reqs = db.requirements.filter((r) => r.assembly === assembly)
          return (
            <div key={assembly} className="flex items-center gap-2">
              <span className="w-10 shrink-0 font-mono text-[0.62rem] tracking-wider text-muted">{ASSEMBLY_CODE[assembly]}</span>
              <div className="flex flex-wrap gap-[3px]">
                {reqs.map((r) => {
                  const status = readiness.requirements[r.id]
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onOpenRecord(r.id)}
                      onMouseEnter={() => setHover(r.id)}
                      onFocus={() => setHover(r.id)}
                      aria-label={`${r.id} ${r.title}: ${STATUS[status].label}`}
                      // Hit target larger than the mark.
                      className="-m-[2px] p-[2px] outline-none"
                    >
                      <Cell status={status} touched={touched.has(r.id)} changed={baseline.requirements[r.id] !== status} hovered={hover === r.id} />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-2 min-h-8 font-mono text-[0.65rem] leading-snug text-muted" aria-live="polite">
        {hoveredReq ? (
          <>
            <span className="text-accent">{hoveredReq.id}</span> {hoveredReq.title}
            <span className="block" style={{ color: STATUS[readiness.requirements[hoveredReq.id]].color }}>
              {STATUS[readiness.requirements[hoveredReq.id]].label}
              {baseline.requirements[hoveredReq.id] !== readiness.requirements[hoveredReq.id] && (
                <span className="text-faint"> (was {STATUS[baseline.requirements[hoveredReq.id]].label.toLowerCase()})</span>
              )}
              <span className="text-faint"> · {hoveredReq.method}</span>
            </span>
          </>
        ) : <span className="text-faint">Hover a cell for the requirement; click to open it.</span>}
      </p>

      <details className="mt-1 font-mono text-[0.65rem]">
        <summary className="cursor-pointer text-faint hover:text-muted">View as table</summary>
        <table className="mt-1.5 w-full border-collapse">
          <thead><tr className="text-left text-faint"><th className="py-0.5 font-normal">Id</th><th className="font-normal">Title</th><th className="font-normal">Status</th></tr></thead>
          <tbody>
            {db.requirements.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-0.5 pr-1.5"><button type="button" className="text-accent hover:underline" onClick={() => onOpenRecord(r.id)}>{r.id}</button></td>
                <td className="pr-1.5 text-muted">{r.title}</td>
                <td className="whitespace-nowrap text-ink">{STATUS[readiness.requirements[r.id]].label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
