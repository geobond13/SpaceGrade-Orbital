'use client'

import { useMemo, useState } from 'react'
import { sample, type Channel, type ExecutedAction, type Scenario } from '@/lib/flight/scenarios'
import { useWidth } from './use-width'

const H = 64
const PAD = { l: 4, r: 4, t: 6, b: 6 }
const POINTS = 160

export function fmtT(m: number): string {
  const sign = m < 0 ? '-' : '+'
  const a = Math.abs(m)
  if (a >= 1440) return `T${sign}${(a / 1440).toFixed(1)} d`
  if (a >= 120) return `T${sign}${(a / 60).toFixed(1)} h`
  return `T${sign}${a.toFixed(0)} min`
}

function fmtV(c: Channel, v: number): string {
  if (c.log) return v.toExponential(1)
  return v.toFixed(Math.min(c.decimals, 3))
}

function Strip({ channel, scenario, t, actions, active, onOpen }: {
  channel: Channel
  scenario: Scenario
  t: number
  actions: ExecutedAction[]
  active: boolean
  onOpen: (id: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { start, end } = scenario.view
  const pts = useMemo(() => sample(channel, start, Math.min(t, end), POINTS, actions), [channel, start, end, t, actions])
  const tf = (v: number) => (channel.log ? Math.log10(Math.max(v, 1e-12)) : v)
  const ys = [...pts.flatMap((p) => (p.spec !== undefined ? [tf(p.v), tf(p.spec)] : [tf(p.v)])), ...(channel.span ?? []).map(tf)]
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  if (!Number.isFinite(lo)) { lo = 0; hi = 1 }
  if (hi - lo < 1e-9) { lo -= 1; hi += 1 }
  const padY = (hi - lo) * 0.12
  lo -= padY
  hi += padY
  // Physical floors (0 m, 0 W) stay the floor; padding must not invent negative values.
  if (channel.span && !channel.log) lo = Math.max(lo, channel.span[0])
  const x = (m: number) => PAD.l + ((m - start) / (end - start)) * (width - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (tf(v) - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const path = (key: 'v' | 'spec') => pts.filter((p) => p[key] !== undefined).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]!).toFixed(1)}`).join('')
  const last = pts[pts.length - 1]
  const hoverPt = hover === null ? undefined : pts.reduce((best, p) => (Math.abs(p.t - hover) < Math.abs(best.t - hover) ? p : best), pts[0])

  return (
    <div className={`rounded-md border px-2.5 py-2 transition-colors ${active ? 'border-accent/60 bg-accent-soft/30' : 'border-line bg-surface/60'}`}>
      <div className="mb-1 flex items-baseline gap-2 font-mono text-[0.7rem]">
        <button type="button" onClick={() => onOpen(channel.id)} className="shrink-0 whitespace-nowrap text-accent hover:underline">{channel.id}</button>
        <span className="truncate text-muted">{channel.label}</span>
        <span className="ml-auto whitespace-nowrap tabular-nums text-ink">
          {hoverPt ? fmtV(channel, hoverPt.v) : last ? fmtV(channel, last.v) : '–'} <span className="text-faint">{channel.unit}</span>
        </span>
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} className="block"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const m = start + ((e.clientX - r.left - PAD.l) / (width - PAD.l - PAD.r)) * (end - start)
            setHover(m <= t ? m : null)
          }}
        >
          {scenario.eclipses.filter((w) => w.end > start && w.start < end).map((w) => (
            <rect key={w.start} x={x(Math.max(start, w.start))} y={0} width={Math.max(0, x(Math.min(end, w.end)) - x(Math.max(start, w.start)))} height={H} fill="var(--line)" opacity={0.45} />
          ))}
          {t < end && <rect x={x(t)} y={0} width={x(end) - x(t)} height={H} fill="var(--canvas)" opacity={0.55} />}
          {pts.some((p) => p.spec !== undefined) && <path d={path('spec')} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" />}
          <path d={path('v')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--ink)" strokeOpacity={0.5} strokeWidth={1} />
          {/* Axis extent, so a slow trend can be read as a number. */}
          <text x={width - PAD.r} y={9} fontSize={8} textAnchor="end" fill="var(--faint)" fontFamily="var(--font-geist-mono)">{fmtV(channel, channel.log ? 10 ** hi : hi)}</text>
          <text x={width - PAD.r} y={H - 2} fontSize={8} textAnchor="end" fill="var(--faint)" fontFamily="var(--font-geist-mono)">{fmtV(channel, channel.log ? 10 ** lo : lo)}</text>
          {hoverPt && (
            <g>
              <line x1={x(hoverPt.t)} x2={x(hoverPt.t)} y1={0} y2={H} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="2 2" />
              <circle cx={x(hoverPt.t)} cy={y(hoverPt.v)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hoverPt && (
          <div className="pointer-events-none absolute -top-1 rounded border border-line-strong bg-canvas/95 px-1.5 py-0.5 font-mono text-[0.68rem] text-muted"
            style={{ left: Math.min(width - 150, Math.max(0, x(hoverPt.t) + 6)) }}>
            {fmtT(hoverPt.t)} · <span className="text-ink">{fmtV(channel, hoverPt.v)}</span>
            {hoverPt.spec !== undefined && <> · spec {fmtV(channel, hoverPt.spec)}</>}
          </div>
        )}
      </div>
    </div>
  )
}

export function TelemetryStrips({ scenario, t, actions, activeChannels, onOpen }: {
  scenario: Scenario
  t: number
  actions: ExecutedAction[]
  /** Channels the agent has read this run. */
  activeChannels: Set<string>
  onOpen: (id: string) => void
}) {
  return (
    <section aria-label="Telemetry">
      <div className="mb-2">
        <h2 className="panel-title">Spacecraft telemetry</h2>
        <span className="mt-1 flex items-center gap-3 font-mono text-[0.68rem] text-muted">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-accent" />measured</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 border-t-[1.5px] border-dashed border-muted" />spec-sheet model</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2 bg-line" />eclipse</span>
        </span>
      </div>
      <div className="space-y-2">
        {scenario.channels.map((c) => (
          <Strip key={c.id} channel={c} scenario={scenario} t={t} actions={actions} active={activeChannels.has(c.id)} onOpen={onOpen} />
        ))}
      </div>
      <p className="mt-2 font-mono text-[0.68rem] text-muted">Mission time {fmtT(scenario.view.start)} to {fmtT(scenario.view.end)}. Shaded right of the cursor: not yet happened.</p>
    </section>
  )
}
