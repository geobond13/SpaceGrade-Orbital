'use client'

import type { AgentEvent, PlanStep, UsageInfo } from '@/lib/agent/events'
import { planProgress } from '@/lib/agent/plan-progress'
import type { Run } from './use-agent-runs'

const shortModel = (m: string) => m.split('/').pop() ?? m

/** Seconds of model runtime since the run started; mission time lives elsewhere and uses T+. */
function Stamp({ run, i }: { run: Run; i: number }) {
  const t = ((run.stamps[i] ?? run.startedAt) - run.startedAt) / 1000
  return <span className="w-12 shrink-0 font-mono text-[0.68rem] tabular-nums text-muted" title="Model runtime since the run started">{t.toFixed(1)} s</span>
}

function ModelTag({ model }: { model: string }) {
  if (model === 'server') return <span className="rounded bg-sunken px-1.5 py-px font-mono text-[0.68rem] text-muted">Server</span>
  const nano = /nano/i.test(model)
  return (
    <span className={`rounded px-1.5 py-px font-mono text-[0.68rem] ${nano ? 'bg-nano-soft text-nano' : 'bg-super-soft text-super'}`}>
      {nano ? 'Nano' : /ultra/i.test(model) ? 'Ultra' : 'Super'}
    </span>
  )
}

function UsageLine({ u }: { u: UsageInfo }) {
  return (
    <span className="font-mono text-[0.68rem] text-faint">
      {u.promptTokens.toLocaleString()}+{u.completionTokens.toLocaleString()} tok · {(u.ms / 1000).toFixed(1)} s · ${u.costUsd.toFixed(4)}
    </span>
  )
}

function Plan({ steps, called, answered }: { steps: PlanStep[]; called: string[]; answered: boolean }) {
  const done = planProgress(steps, called)
  const next = done.indexOf(false)
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${done[i] ? 'border-ok bg-ok text-surface' : i === next ? 'border-accent text-accent' : 'border-line text-faint'}`}>
            {done[i] ? '✓' : i + 1}
          </span>
          <span className={done[i] ? 'text-muted' : ''}>
            {s.goal} <code className="font-mono text-[0.72rem] text-faint">{s.tool}</code>
          </span>
        </li>
      ))}
      <li className="flex gap-2 text-sm">
        <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[0.6rem] ${answered ? 'border-ok bg-ok text-surface' : 'border-line text-faint'}`}>{answered ? '✓' : steps.length + 1}</span>
        <span className={answered ? 'text-muted' : ''}>Write a cited answer</span>
      </li>
    </ol>
  )
}

function Thinking({ e }: { e: Extract<AgentEvent, { type: 'thinking' }> }) {
  return (
    <details className="group rounded-md border border-line bg-surface px-2.5 py-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted">
        <ModelTag model={e.model} /> reasoning · {e.label}
        <span className="ml-auto text-faint group-open:hidden">show</span>
      </summary>
      <p className="mt-2 whitespace-pre-wrap font-mono text-[0.7rem] leading-relaxed text-muted">{e.text}</p>
    </details>
  )
}

export function TracePane({ run, onOpenRecord, emptyHint }: { run?: Run; onOpenRecord: (id: string) => void; emptyHint?: string }) {
  if (!run) {
    return (
      <div className="p-4 text-sm text-muted">
        <h2 className="panel-title mb-2">Agent activity</h2>
        <p className="font-mono text-xs leading-relaxed">{emptyHint ?? 'Ask a question. The plan, every tool call with its arguments, the model that made it, and the tokens and cost of each step will appear here as they happen.'}</p>
      </div>
    )
  }
  const ev = run.events
  const start = ev.find((e) => e.type === 'run_start')
  const plan = ev.find((e) => e.type === 'plan')
  const results = ev.filter((e): e is Extract<AgentEvent, { type: 'tool_result' }> => e.type === 'tool_result')
  const called = results.filter((r) => !r.summary.startsWith('guardrail') && !r.summary.startsWith('repeat')).map((r) => r.name)
  const done = ev.find((e) => e.type === 'done')
  const answered = ev.some((e) => e.type === 'answer')
  const usageByLabel = new Map<string, UsageInfo[]>()
  for (const e of ev) if (e.type === 'usage') usageByLabel.set(e.usage.label, [...(usageByLabel.get(e.usage.label) ?? []), e.usage])

  return (
    <div className="space-y-4 p-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="panel-title">Agent plan</h2>
          {start?.type === 'run_start' && (
            <span className="flex gap-1"><ModelTag model={start.models.planner} /><ModelTag model={start.models.router} /></span>
          )}
        </div>
        {plan?.type === 'plan' ? <Plan steps={plan.steps} called={called} answered={answered} /> : <p className="text-sm text-muted">Nemotron Super is planning…</p>}
      </section>

      <section>
        <h2 className="panel-title mb-2">Agent activity <span className="normal-case tracking-normal text-muted">· seconds of model runtime</span></h2>
        <ol className="space-y-2">
          {ev.map((e, i) => {
            if (e.type === 'thinking') return <li key={i} className="sg-rise flex gap-2"><Stamp run={run} i={i} /><div className="min-w-0 flex-1"><Thinking e={e} /></div></li>
            if (e.type === 'notice') return <li key={i} className="sg-rise flex gap-2"><Stamp run={run} i={i} /><p className="flex-1 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5 font-mono text-[0.7rem] text-warn">{e.message}</p></li>
            if (e.type === 'error') return <li key={i} className="sg-rise flex gap-2"><Stamp run={run} i={i} /><p className="flex-1 rounded-md border border-bad/30 bg-bad-soft px-2.5 py-1.5 font-mono text-[0.7rem] text-bad">{e.message}</p></li>
            if (e.type === 'usage') {
              return (
                <li key={i} className="sg-rise flex items-center gap-2 font-mono text-[0.7rem] text-muted">
                  <Stamp run={run} i={i} /><ModelTag model={e.usage.model} /> {e.usage.label} <span className="ml-auto"><UsageLine u={e.usage} /></span>
                </li>
              )
            }
            if (e.type === 'tool_call') {
              const result = results.find((r) => r.callId === e.callId)
              const guarded = result?.summary.startsWith('guardrail')
              return (
                <li key={i} className="sg-rise flex gap-2">
                  <Stamp run={run} i={i} />
                  <div className={`min-w-0 flex-1 rounded-md border bg-surface px-2.5 py-2 ${result ? 'border-line' : 'border-accent/60 shadow-[0_0_12px_-4px_var(--accent)]'}`}>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-[0.78rem] font-semibold text-accent">{e.name}</code>
                    <span className="text-[0.68rem] text-faint">{e.round === 0 ? 'before planning · run by' : `round ${e.round} · chosen by`}</span>
                    <ModelTag model={e.model} />
                    {result && <span className="ml-auto font-mono text-[0.68rem] text-faint">{result.ms} ms</span>}
                  </div>
                  <pre className="mt-1.5 overflow-x-auto rounded bg-sunken px-2 py-1 font-mono text-[0.7rem] text-muted">{JSON.stringify(e.args)}</pre>
                  {result ? (
                    <div className="mt-1.5">
                      <p className={`font-mono text-[0.7rem] ${guarded ? 'text-warn' : 'text-ink'}`}>→ {result.summary}</p>
                      {result.citations.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {result.citations.slice(0, 12).map((c) => (
                            <button key={c.id} type="button" onClick={() => onOpenRecord(c.id)} className="rounded border border-line px-1 font-mono text-[0.65rem] text-muted hover:border-accent hover:text-accent">{c.id}</button>
                          ))}
                          {result.citations.length > 12 && <span className="text-[0.65rem] text-faint">+{result.citations.length - 12} more</span>}
                        </p>
                      )}
                    </div>
                  ) : <p className="sg-pulse mt-1.5 font-mono text-[0.7rem] text-accent">▸ acquiring…</p>}
                  </div>
                </li>
              )
            }
            if (e.type === 'document') return <li key={i} className="sg-rise flex gap-2 font-mono text-[0.7rem] text-muted"><Stamp run={run} i={i} />Document drafted: <span className="text-ink">{e.title}</span></li>
            if (e.type === 'answer') {
              return (
                <li key={i} className="sg-rise flex gap-2 font-mono text-[0.7rem] text-muted">
                  <Stamp run={run} i={i} /><span>Answer cites {e.citations.length} record{e.citations.length === 1 ? '' : 's'}
                  {e.unknownIds.length > 0 ? <span className="text-bad"> · {e.unknownIds.length} id(s) not returned by any tool: {e.unknownIds.join(', ')}</span> : <span className="text-ok"> · every cited id came from tool output</span>}
                  {e.quantities && e.quantities.checked > 0 && (e.quantities.unmatched.length
                    ? <span className="text-warn"> · {e.quantities.unmatched.length} of {e.quantities.checked} quantities not in tool output</span>
                    : <span className="text-ok"> · {e.quantities.checked} quantities match tool output</span>)}</span>
                </li>
              )
            }
            return null
          })}
          {run.status === 'running' && <li className="sg-pulse pl-14 font-mono text-[0.7rem] text-accent">▮</li>}
        </ol>
      </section>

      {done?.type === 'done' && (
        <section className="rounded-md border border-line bg-surface px-3 py-2.5 text-xs">
          <h2 className="panel-title mb-1.5">Run totals</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
            <dt className="text-muted">Tokens</dt><dd>{(done.totals.promptTokens + done.totals.completionTokens).toLocaleString()}</dd>
            <dt className="text-muted">Tool calls</dt><dd>{done.totals.toolCalls}</dd>
            <dt className="text-muted">Model calls</dt><dd>{[...usageByLabel.values()].flat().length}</dd>
            <dt className="text-muted">Wall time</dt><dd>{(done.totals.ms / 1000).toFixed(1)} s</dd>
            <dt className="text-muted">Est. cost</dt><dd>${done.totals.costUsd.toFixed(4)}</dd>
          </dl>
          <p className="mt-2 text-faint">All model calls: NVIDIA Nemotron via Nebius Token Factory.</p>
        </section>
      )}
      {start?.type === 'run_start' && <p className="px-1 font-mono text-[0.65rem] text-faint">{shortModel(start.models.planner)} · {shortModel(start.models.router)}</p>}
    </div>
  )
}
