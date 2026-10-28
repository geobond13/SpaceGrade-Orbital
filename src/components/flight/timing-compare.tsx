'use client'

import type { Decision } from '@/lib/flight/autonomy'
import { useWidth } from './use-width'
import { fmtT } from './telemetry-strips'

type Timing = NonNullable<Decision['timing']>

const LANE = 22
const LABEL_W = 132

/**
 * The decision in one picture: how long until the deadline on the spec sheet, how long
 * until the deadline on this vehicle, and how long until a human is on console. Whichever
 * of the last two comes first decides who acts.
 */
export function TimingCompare({ timing, now, tier }: { timing: Timing; now: number; tier: Decision['tier'] }) {
  const [ref, width] = useWidth<HTMLDivElement>(480)
  const lanes = [
    ...(timing.specDeadline !== undefined ? [{ key: 'spec', label: 'Spec-sheet deadline', t: timing.specDeadline, color: 'var(--muted)', dashed: true }] : []),
    { key: 'built', label: timing.specDeadline !== undefined ? 'As-built deadline' : 'Deadline', t: timing.deadline, color: 'var(--warn)', dashed: false },
    ...(timing.contact !== undefined ? [{ key: 'op', label: 'Operator on console', t: timing.contact, color: 'var(--ok)', dashed: false }] : []),
  ]
  const end = Math.max(...lanes.map((l) => l.t)) + 6
  const plotW = Math.max(120, width - LABEL_W - 64)
  const x = (m: number) => LABEL_W + ((m - now) / (end - now)) * plotW
  const h = lanes.length * LANE + 18
  const gap = timing.contact !== undefined ? timing.contact - timing.deadline : undefined

  const headline = gap === undefined
    ? `Due ${fmtT(timing.deadline)}; no operator is scheduled.`
    : gap > 0
      ? `Due ${Math.round(gap)} min before anyone is on console.`
      : `An operator is on console ${Math.round(-gap)} min before it is due.`

  return (
    <figure className="mt-3 rounded-md border border-line bg-sunken/60 px-3 py-2.5">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">{timing.label}</span>
        <span className={tier === 'auto' ? 'font-semibold text-warn' : 'font-semibold text-ok'}>{headline}</span>
      </figcaption>
      <div ref={ref}>
        <svg width={width} height={h} className="block font-mono" role="img"
          aria-label={lanes.map((l) => `${l.label} ${fmtT(l.t)}`).join(', ')}>
          {gap !== undefined && gap > 0 && (
            <rect x={x(timing.deadline)} y={2} width={x(timing.contact!) - x(timing.deadline)} height={h - 18} fill="var(--bad)" opacity={0.12} />
          )}
          {lanes.map((l, i) => {
            const y = 4 + i * LANE
            return (
              <g key={l.key}>
                <text x={0} y={y + 11} fontSize={11} fill={l.key === 'spec' ? 'var(--muted)' : 'var(--ink)'}>{l.label}</text>
                <rect x={x(now)} y={y + 3} width={Math.max(2, x(l.t) - x(now))} height={10} rx={2}
                  fill={l.dashed ? 'none' : l.color} fillOpacity={0.85} stroke={l.color} strokeDasharray={l.dashed ? '4 3' : undefined} strokeWidth={l.dashed ? 1.5 : 0} />
                <text x={x(l.t) + 5} y={y + 12} fontSize={11} fontWeight={600} fill={l.color}>{fmtT(l.t)}</text>
              </g>
            )
          })}
          <line x1={x(now)} x2={x(now)} y1={0} y2={h - 14} stroke="var(--accent)" strokeWidth={1.5} />
          <text x={x(now)} y={h - 3} fontSize={10} fill="var(--accent)" textAnchor="middle">now {fmtT(now)}</text>
          {gap !== undefined && gap > 0 && (
            <text x={(x(timing.deadline) + x(timing.contact!)) / 2} y={h - 3} fontSize={10} fill="var(--bad)" textAnchor="middle">no human in time</text>
          )}
        </svg>
      </div>
    </figure>
  )
}
