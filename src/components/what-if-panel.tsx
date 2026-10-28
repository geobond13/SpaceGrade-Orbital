'use client'

import { useState } from 'react'
import { db, isOpen } from '@/lib/tools/lookup'
import type { Readiness } from '@/lib/readiness'

const OPEN_NCRS = db.nonconformances.filter((n) => isOpen(n))

export function WhatIfPanel({ closed, fromAgent, readiness, baseline, onToggle, onReset }: {
  closed: Set<string>
  /** NCRs the agent's simulate_change closed in the selected run. */
  fromAgent: Set<string>
  readiness: Readiness
  baseline: Readiness
  onToggle: (id: string) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  // The agent opens the panel when it simulates; closing it stays closed until the agent simulates something else.
  const agentKey = [...fromAgent].sort().join(',')
  const [dismissed, setDismissed] = useState<string | null>(null)
  const active = closed.size > 0
  const expanded = open || (fromAgent.size > 0 && dismissed !== agentKey)
  const delta = readiness.pct - baseline.pct

  return (
    <div className="absolute bottom-2 right-3 w-64 max-w-[calc(100%-1.5rem)] font-mono text-[0.68rem]">
      {expanded ? (
        <div className={`rounded-md border bg-canvas/85 p-2.5 backdrop-blur ${active ? 'border-accent/60' : 'border-line-strong'}`}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="panel-title !text-accent">What-if</span>
            {fromAgent.size > 0 && <span className="rounded bg-super-soft px-1 text-[0.6rem] text-super">from agent</span>}
            <button type="button" onClick={() => { setOpen(false); setDismissed(agentKey); if (active || fromAgent.size > 0) onReset() }} className="ml-auto text-faint hover:text-ink" aria-label="Close what-if">✕</button>
          </div>
          <p className="mb-2 text-muted">Assume an NCR is dispositioned and its failed tests re-run clean.</p>
          <ul className="space-y-1">
            {OPEN_NCRS.map((n) => (
              <li key={n.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-sunken">
                  <input type="checkbox" checked={closed.has(n.id)} onChange={() => onToggle(n.id)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="min-w-0">
                    <span className={n.blocksQualification ? 'text-bad' : 'text-warn'}>{n.id}</span>{' '}
                    <span className="text-muted">{n.title.split(' ').slice(0, 5).join(' ')}…</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="text-muted">
              Readiness <span className="text-ink">{baseline.pct}%</span>
              {active && <> → <span className={delta > 0 ? 'text-ok' : 'text-ink'}>{readiness.pct}%</span></>}
              <span className="block text-faint">Blocking NCRs {baseline.blockingNcrs.length}{active && ` → ${readiness.blockingNcrs.length}`}</span>
            </span>
            {active && <button type="button" onClick={onReset} className="rounded border border-line px-1.5 py-0.5 uppercase text-muted hover:text-ink">Reset</button>}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="ml-auto block rounded border border-line-strong bg-canvas/80 px-2 py-1 uppercase tracking-wider text-muted backdrop-blur hover:border-accent hover:text-accent">
          ⟲ What-if
        </button>
      )}
    </div>
  )
}
