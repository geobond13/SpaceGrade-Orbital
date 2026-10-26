'use client'

import { ACTION_CLASSES, type Decision } from '@/lib/flight/autonomy'
import { CitationChip } from '../citation-chip'
import { fmtT } from './telemetry-strips'

export type Verdict = 'approved' | 'rejected'

const TIER = {
  auto: { label: 'Executed autonomously', cls: 'border-accent/60 bg-accent-soft text-accent' },
  gated: { label: 'Awaiting operator approval', cls: 'border-warn/50 bg-warn-soft text-warn' },
  refused: { label: 'Refused by policy', cls: 'border-bad/50 bg-bad-soft text-bad' },
} as const

export function DecisionCard({ decision, verdict, onVerdict, onOpenRecord }: {
  decision: Decision
  verdict?: Verdict
  onVerdict?: (v: Verdict) => void
  onOpenRecord: (id: string) => void
}) {
  const tier = TIER[decision.tier]
  const status = verdict === 'approved' ? 'Approved by operator' : verdict === 'rejected' ? 'Rejected by operator' : tier.label
  return (
    <article className="sg-rise rounded-md border border-line-strong bg-surface px-4 py-3" aria-label="Autonomy decision">
      <div className="flex flex-wrap items-center gap-2">
        <span className="panel-title">Autonomy decision</span>
        <span className="font-mono text-sm font-semibold">{ACTION_CLASSES[decision.kind].label}</span>
        <span className={`ml-auto rounded border px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${verdict ? 'border-line text-muted' : tier.cls}`}>{status}</span>
      </div>
      <p className="mt-1.5 text-sm text-muted">{decision.reason}</p>
      {(decision.deadline !== undefined || decision.nextContact) && (
        <p className="mt-1 font-mono text-[0.68rem] text-faint">
          {decision.deadline !== undefined && <>deadline <span className="text-warn">{fmtT(decision.deadline)}</span></>}
          {decision.deadline !== undefined && decision.nextContact && ' · '}
          {decision.nextContact && <>next operator {decision.nextContact.station} <span className="text-ok">{fmtT(decision.nextContact.start)}</span></>}
        </p>
      )}
      {decision.checks.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-line pt-2">
          {decision.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 font-mono text-[0.7rem]">
              <span className={c.ok === null ? 'text-faint' : c.ok ? 'text-ok' : 'text-bad'} aria-label={c.ok === null ? 'context' : c.ok ? 'pass' : 'fail'}>{c.ok === null ? '•' : c.ok ? '✓' : '✗'}</span>
              <span className="text-ink">{c.label}</span>
              <span className="text-muted">{c.detail}</span>
              {c.source && <span className="ml-auto shrink-0"><CitationChip id={c.source} onClick={() => onOpenRecord(c.source!)} /></span>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 font-mono text-[0.62rem] text-faint">Policy: {ACTION_CLASSES[decision.kind].policy}</p>
      {decision.tier === 'gated' && !verdict && onVerdict && (
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={() => onVerdict('approved')} className="rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-canvas">Approve</button>
          <button type="button" onClick={() => onVerdict('rejected')} className="rounded-md border border-line px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted hover:text-ink">Reject</button>
          <span className="self-center font-mono text-[0.62rem] text-faint">as the operator at the next pass</span>
        </div>
      )}
    </article>
  )
}
