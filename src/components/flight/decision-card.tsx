'use client'

import { ACTION_CLASSES, type Decision } from '@/lib/flight/autonomy'
import type { Step, Verdict } from '@/lib/flight/lifecycle'
import { CitationChip } from '../citation-chip'
import { fmtT } from './telemetry-strips'
import { TimingCompare } from './timing-compare'

export type { Verdict }

const TIER = {
  auto: { label: 'Authorised autonomously', cls: 'border-accent/60 bg-accent-soft text-accent' },
  gated: { label: 'Waiting for an operator', cls: 'border-warn/50 bg-warn-soft text-warn' },
  refused: { label: 'Refused by policy', cls: 'border-bad/50 bg-bad-soft text-bad' },
} as const

/**
 * The agent's free-text rationale sometimes argues the tier. The policy never reads it,
 * but when it disagrees with what the policy computed, say so instead of showing both silently.
 */
export function rationaleConflict(rationale: unknown, tier: Decision['tier']): boolean {
  if (typeof rationale !== 'string') return false
  if (tier === 'auto') return /approv|operator (?:is |can be )?(?:reachable|available)|before the deadline|gated|wait for/i.test(rationale)
  if (tier === 'gated') return /autonom|no operator|execute (?:it )?now/i.test(rationale)
  return false
}

function Lifecycle({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-2" aria-label="Action status">
      {steps.map((s, i) => (
        <li key={s.label} className="flex min-w-0 items-start gap-1">
          <div className="flex min-w-[5.5rem] max-w-[9rem] flex-col">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-full border ${s.state === 'done' ? 'border-ok bg-ok' : s.state === 'active' ? 'sg-pulse border-accent bg-accent' : 'border-line-strong'}`} />
              <span className={`text-xs ${s.state === 'pending' ? 'text-muted' : 'text-ink'}`}>{s.label}</span>
            </span>
            <span className="pl-4 font-mono text-[0.68rem] text-muted">
              {s.t !== undefined && fmtT(s.t)}{s.state === 'active' && <span className="text-accent"> · now</span>}
            </span>
            {s.detail && <span className="pl-4 text-[0.7rem] leading-snug text-muted">{s.detail}</span>}
          </div>
          {i < steps.length - 1 && <span aria-hidden className="mt-1 text-xs text-faint">→</span>}
        </li>
      ))}
    </ol>
  )
}

export function DecisionCard({ decision, steps, verdict, simT, onVerdict, onOpenRecord }: {
  decision: Decision
  steps: Step[]
  verdict?: Verdict
  simT: number
  onVerdict?: (v: Verdict['verdict']) => void
  onOpenRecord: (id: string) => void
}) {
  const tier = TIER[decision.tier]
  const status = verdict ? (verdict.verdict === 'approved' ? `Approved by operator at ${fmtT(verdict.t)}` : `Rejected by operator at ${fmtT(verdict.t)}`) : tier.label
  const rationale = typeof decision.params.rationale === 'string' ? decision.params.rationale : undefined
  const conflict = rationaleConflict(rationale, decision.tier)
  const contact = decision.nextContact
  const decideAt = contact && contact.start > simT ? contact.start : simT

  return (
    <article className="sg-rise rounded-md border border-line-strong bg-surface px-4 py-3" aria-label="Autonomy decision">
      <div className="flex flex-wrap items-center gap-2">
        <span className="panel-title">Decision</span>
        <span className="text-base font-semibold">{ACTION_CLASSES[decision.kind].label}</span>
        <span className={`ml-auto rounded border px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wider ${verdict ? 'border-line-strong text-ink' : tier.cls}`}>{status}</span>
      </div>
      <p className="mt-1.5 text-sm text-ink">{decision.reason}</p>

      {decision.timing && <TimingCompare timing={decision.timing} now={steps[0]?.t ?? 0} tier={decision.tier} />}

      {decision.counterfactual && (
        <dl className="mt-3 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[8.5rem_1fr]">
          <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">Spec-sheet model</dt>
          <dd className="text-muted">{decision.counterfactual.spec}</dd>
          <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-warn">Build record</dt>
          <dd className="text-ink">{decision.counterfactual.asBuilt}</dd>
        </dl>
      )}

      <Lifecycle steps={steps} />

      {decision.tier === 'gated' && !verdict && onVerdict && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn-soft/40 px-3 py-2">
          <button type="button" onClick={() => onVerdict('approved')} className="rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-canvas">
            Approve{contact ? ` at ${fmtT(decideAt)}` : ''}
          </button>
          <button type="button" onClick={() => onVerdict('rejected')} className="rounded-md border border-line-strong px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted hover:text-ink">Reject</button>
          <span className="text-xs text-muted">
            You are the operator{contact ? ` on the ${contact.station} pass` : ''}. Your decision takes effect at {fmtT(decideAt)}, when that operator is on console.
          </span>
        </div>
      )}

      <details className="group mt-3 border-t border-line pt-2">
        <summary className="cursor-pointer list-none font-mono text-[0.7rem] uppercase tracking-wider text-muted hover:text-ink">
          <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span> Policy checks ({decision.checks.length}) and the agent&apos;s rationale
          {conflict && <span className="ml-2 normal-case tracking-normal text-warn">· policy overrode the agent&apos;s assumption</span>}
        </summary>
        {decision.checks.length > 0 && (
          <ul className="mt-2 space-y-1">
            {decision.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 font-mono text-[0.72rem]">
                <span className={c.ok === null ? 'text-muted' : c.ok ? 'text-ok' : 'text-bad'} aria-label={c.ok === null ? 'context' : c.ok ? 'pass' : 'fail'}>{c.ok === null ? '•' : c.ok ? '✓' : '✗'}</span>
                <span className="shrink-0 text-ink">{c.label}</span>
                <span className="text-muted">{c.detail}</span>
                {c.source && <span className="ml-auto shrink-0"><CitationChip id={c.source} onClick={() => onOpenRecord(c.source!)} /></span>}
              </li>
            ))}
          </ul>
        )}
        {rationale && (
          <div className={`mt-2 rounded border px-2.5 py-1.5 text-xs ${conflict ? 'border-warn/40 bg-warn-soft/40' : 'border-line'}`}>
            <span className="font-mono text-[0.68rem] uppercase tracking-wider text-muted">Agent&apos;s rationale (not used by the policy)</span>
            <p className="mt-0.5 text-muted">{rationale}</p>
            {conflict && <p className="mt-1 text-warn">The agent assumed a different timing. The policy recomputed the deadline and operator reachability from its own models; the decision above is the policy&apos;s.</p>}
          </div>
        )}
        <p className="mt-2 font-mono text-[0.68rem] text-muted">Policy: {ACTION_CLASSES[decision.kind].policy}</p>
      </details>
    </article>
  )
}
