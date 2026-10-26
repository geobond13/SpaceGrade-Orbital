'use client'

import { db } from '@/lib/tools/lookup'
import type { Readiness } from '@/lib/readiness'
import type { Focus } from '@/lib/focus'
import { ASSEMBLY_CODE, STATUS } from './status'

const SEGMENTS = ['verified', 'in_progress', 'failed', 'unverified'] as const

export function AssemblyBoard({ readiness, baseline, focus, onSelectAssembly, onOpenRecord }: {
  readiness: Readiness
  /** Readiness before what-if overrides; shown as a delta when it differs. */
  baseline: Readiness
  focus: Focus
  onSelectAssembly: (assembly: string) => void
  onOpenRecord: (id: string) => void
}) {
  const touched = new Set<string | undefined>(focus.touchedPartIds.map((id) => db.parts.find((p) => p.id === id)?.assembly))
  const active = new Set<string | undefined>(focus.activePartIds.map((id) => db.parts.find((p) => p.id === id)?.assembly))
  const delta = readiness.pct - baseline.pct

  return (
    <section aria-label="Assembly readiness">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="panel-title">Readiness</h2>
        <span className="font-mono text-[0.7rem] text-muted">
          <span className="text-base font-semibold tabular-nums text-ink">{readiness.pct}%</span> verified
          {delta !== 0 && <span className={`ml-1 ${delta > 0 ? 'text-ok' : 'text-bad'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
        </span>
      </div>
      <ul className="space-y-1">
        {readiness.assemblies.map((a, i) => {
          const before = baseline.assemblies[i]
          const changed = before.pct !== a.pct || before.blockingNcrs.length !== a.blockingNcrs.length
          return (
            <li key={a.assembly}>
              <button
                type="button"
                onClick={() => onSelectAssembly(a.assembly)}
                className={`group relative w-full rounded-md border px-2.5 py-1.5 text-left transition-colors hover:border-line-strong ${
                  active.has(a.assembly) ? 'border-accent/60 bg-accent-soft/40' : 'border-transparent bg-sunken/60'
                } ${changed ? 'sg-ripple' : ''}`}
              >
                {touched.has(a.assembly) && <span className="absolute inset-y-1 left-0 w-0.5 rounded bg-accent" aria-hidden />}
                <div className="flex items-center gap-2 font-mono text-[0.72rem]">
                  <span className="w-10 font-semibold tracking-wider">{ASSEMBLY_CODE[a.assembly]}</span>
                  <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="img"
                    aria-label={SEGMENTS.map((s) => `${a.counts[s]} ${STATUS[s].label.toLowerCase()}`).join(', ')}>
                    {SEGMENTS.map((s) => a.counts[s] > 0 && (
                      <span key={s} className="h-full transition-[width] duration-700" style={{ width: `${(a.counts[s] / a.total) * 100}%`, background: STATUS[s].color }} />
                    ))}
                  </span>
                  <span className="w-14 text-right tabular-nums">
                    {changed && before.pct !== a.pct && <span className="text-faint line-through">{before.pct}</span>} {a.pct}%
                  </span>
                </div>
                {a.blockingNcrs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-12">
                    {a.blockingNcrs.map((id) => (
                      <span
                        key={id}
                        role="link"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); onOpenRecord(id) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpenRecord(id) } }}
                        className="flex items-center gap-1 rounded border border-bad/40 bg-bad-soft px-1 font-mono text-[0.62rem] text-bad hover:border-bad"
                      >
                        <span className="sg-pulse size-1.5 rounded-full bg-bad" />{id}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
