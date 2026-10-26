'use client'

import type { Scenario } from '@/lib/flight/scenarios'
import { nextContact } from '@/lib/flight/scenarios'
import type { FlightEvent } from '@/lib/flight/fdir'
import type { Decision } from '@/lib/flight/autonomy'
import { useWidth } from './use-width'
import { fmtT } from './telemetry-strips'

const ROW = { axis: 14, passes: 34, sched: 56, h: 92 }

/** Operations timeline: eclipses, ground passes, payload sessions, FDIR events, decision deadlines, and the gap with no operator. */
export function OrbitTimeline({ scenario, t, fired, decisions }: {
  scenario: Scenario
  t: number
  fired: FlightEvent[]
  decisions: Decision[]
}) {
  const [ref, width] = useWidth<HTMLDivElement>(600)
  const { start, end } = scenario.timeline
  const x = (m: number) => 8 + ((Math.min(end, Math.max(start, m)) - start) / (end - start)) * (width - 16)
  const firstEvent = fired[0]
  const contact = nextContact(scenario, firstEvent?.t ?? t)
  const deadline = decisions.find((d) => d.deadline !== undefined && d.kind !== 'PROPULSION_PROCEDURE')?.deadline
  const ticks: number[] = []
  const step = (end - start) > 200 ? 30 : 15
  for (let m = Math.ceil(start / step) * step; m <= end; m += step) ticks.push(m)

  return (
    <section aria-label="Operations timeline" className="px-3 py-2">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="panel-title">Operations timeline</h2>
        <span className="flex flex-wrap gap-x-3 font-mono text-[0.6rem] text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-ok/70" />operator pass</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-super/70" />payload session</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-bad/25 ring-1 ring-bad/50" />no operator reachable</span>
        </span>
      </div>
      <div ref={ref}>
        <svg width={width} height={ROW.h} className="block font-mono" role="img" aria-label="Timeline of passes, eclipses and deadlines">
          <defs>
            <pattern id="noop" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--bad)" opacity={0.08} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bad)" strokeOpacity={0.35} strokeWidth={2} />
            </pattern>
          </defs>
          {scenario.eclipses.filter((e) => e.end > start && e.start < end).map((e) => (
            <g key={e.start}>
              <rect x={x(e.start)} y={ROW.axis} width={x(e.end) - x(e.start)} height={ROW.h - ROW.axis - 4} fill="var(--line)" opacity={0.5} />
              <text x={x(e.start) + 3} y={ROW.h - 7} fontSize={8} fill="var(--faint)">eclipse</text>
            </g>
          ))}
          {firstEvent && contact && contact.start > firstEvent.t && (
            <g>
              <rect x={x(firstEvent.t)} y={ROW.axis} width={x(contact.start) - x(firstEvent.t)} height={ROW.h - ROW.axis - 4} fill="url(#noop)" />
              <text x={x(firstEvent.t) + 3} y={ROW.axis + 9} fontSize={8} fill="var(--bad)">no operator reachable · {Math.round(contact.start - firstEvent.t)} min</text>
            </g>
          )}
          {ticks.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={ROW.axis - 3} y2={ROW.axis} stroke="var(--line-strong)" />
              <text x={x(m)} y={9} fontSize={8} textAnchor="middle" fill="var(--faint)">{m === 0 ? 'T0' : `${m > 0 ? '+' : ''}${m}`}</text>
            </g>
          ))}
          {scenario.passes.filter((p) => p.end > start && p.start < end).map((p) => (
            <g key={p.id}>
              <rect x={x(p.start)} y={ROW.passes - 9} width={Math.max(3, x(p.end) - x(p.start))} height={12} rx={2}
                fill={p.attended ? 'var(--ok)' : 'none'} fillOpacity={0.7} stroke={p.attended ? 'none' : 'var(--super)'} strokeDasharray="2 2" />
              <text x={x(p.end) + 3} y={ROW.passes} fontSize={8} fill="var(--muted)">{p.attended ? p.station : 'downlink (no operator)'}</text>
            </g>
          ))}
          {scenario.schedule.filter((s) => s.end > start && s.start < end).map((s) => (
            <g key={s.id}>
              <rect x={x(s.start)} y={ROW.sched - 9} width={Math.max(3, x(s.end) - x(s.start))} height={12} rx={2} fill="var(--super)" fillOpacity={0.7} />
              <text x={x(s.end) + 3} y={ROW.sched} fontSize={8} fill="var(--muted)">{s.id}</text>
            </g>
          ))}
          {scenario.marks.map((m) => (
            <g key={m.id}>
              <line x1={x(m.t)} x2={x(m.t)} y1={ROW.axis} y2={ROW.h - 4} stroke="var(--bad)" strokeWidth={2} />
              <text x={x(m.t) - 3} y={ROW.sched + 14} fontSize={8} textAnchor="end" fill="var(--bad)">{m.label}</text>
            </g>
          ))}
          {deadline !== undefined && (
            <g>
              <line x1={x(deadline)} x2={x(deadline)} y1={ROW.axis} y2={ROW.h - 4} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="4 2" />
              <text x={x(deadline) + 3} y={ROW.sched + 14} fontSize={8} fill="var(--warn)">decision deadline {fmtT(deadline)}</text>
            </g>
          )}
          {fired.map((e) => (
            <g key={e.id}>
              <path d={`M${x(e.t)},${ROW.passes + 6} l5,5 l-5,5 l-5,-5 z`} fill="var(--warn)" />
              <text x={x(e.t) + 7} y={ROW.passes + 15} fontSize={8} fill="var(--warn)">{e.id}</text>
            </g>
          ))}
          <line x1={x(t)} x2={x(t)} y1={ROW.axis - 4} y2={ROW.h} stroke="var(--accent)" strokeWidth={2} />
          <text x={x(t) + 3} y={ROW.h - 1} fontSize={8} fill="var(--accent)">now {fmtT(t)}</text>
        </svg>
      </div>
    </section>
  )
}
