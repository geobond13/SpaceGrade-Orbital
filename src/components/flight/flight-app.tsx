'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractTag } from '@/lib/agent/citations'
import { deriveFocus, EMPTY_FOCUS, partsForRecord } from '@/lib/focus'
import { detect, type FlightEvent } from '@/lib/flight/fdir'
import { channelById, COMMAND_PATH, recordingName, SCENARIO_IDS, SCENARIOS, scenarioWith, type Conditions, type ExecutedAction, type ScenarioId } from '@/lib/flight/scenarios'
import { HEALTH, partHealth } from '@/lib/flight/health'
import { lifecycle, type Verdict } from '@/lib/flight/lifecycle'
import { asFlown } from '@/lib/flight/as-flown'
import type { Decision } from '@/lib/flight/autonomy'
import { db } from '@/lib/tools/lookup'
import { Markdown } from '../markdown'
import { CitationChip } from '../citation-chip'
import { TracePane } from '../trace-pane'
import { RecordDrawer } from '../record-drawer'
import { DocumentView } from '../document-view'
import { TwinPanel } from '../twin-panel'
import type { LegendItem, PartVisuals } from '../twin/visuals'
import { useAgentRuns, type Recording } from '../use-agent-runs'
import { TelemetryStrips, fmtT } from './telemetry-strips'
import { OrbitTimeline } from './orbit-timeline'
import { DecisionCard } from './decision-card'

/** Changed-condition runs that have a recording in public/recordings (as-built runs always do). */
const RECORDED_CONDITIONS = new Set(['conjunction--heaterConforming', 'conjunction--operatorOnCall'])
const LEGEND: LegendItem[] = (['cause', 'watch', 'commanded', 'shed'] as const).map((h) => ({ hex: HEALTH[h].hex, label: HEALTH[h].label }))

interface RunDecision extends Decision { callId: string; run: number; eventT: number }
type AgentSource = 'live' | 'recorded'

export function FlightApp() {
  const { runs, selected, setSelected, busy, start, replay, reset } = useAgentRuns()
  const [scenarioId, setScenarioId] = useState<ScenarioId>('conjunction')
  const [cond, setCond] = useState<Conditions>({})
  const scenario = useMemo(() => scenarioWith(scenarioId, cond), [scenarioId, cond])
  const [source, setSource] = useState<AgentSource>('live')
  const [simT, setSimT] = useState(scenario.startT)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  /** FDIR events that have fired, in order; run i was woken by fired[i]. */
  const [fired, setFired] = useState<FlightEvent[]>([])
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [record, setRecord] = useState<string | null>(null)
  const [doc, setDoc] = useState<{ title: string; markdown: string } | null>(null)
  const [pinned, setPinned] = useState<string[] | null>(null)

  const events = useMemo(() => detect(scenarioId), [scenarioId])
  const speed = scenario.speeds[speedIdx] ?? scenario.speeds[0]
  const asBuiltDefaults = !Object.values(cond).some(Boolean)
  // A condition without a recording falls back to a live run, which is labelled as live.
  const replaying = source === 'recorded'

  // Every policy decision across the runs, tagged with the sim time of the event that woke the agent.
  const decisions = useMemo<RunDecision[]>(() => runs.flatMap((r, i) => r.events.flatMap((e) =>
    e.type === 'decision' ? [{ ...e.decision, callId: e.callId, run: i, eventT: fired[i]?.t ?? 0 }] : [])), [runs, fired])
  // What the vehicle does: autonomous actions from the event time, approved ones from the operator pass.
  const actions = useMemo<ExecutedAction[]>(() => decisions.flatMap((d) => {
    if (d.tier === 'auto') return [{ kind: d.kind, t: d.eventT, params: d.params }]
    const v = verdicts[d.callId]
    return d.tier === 'gated' && v?.verdict === 'approved' ? [{ kind: d.kind, t: v.t, params: d.params }] : []
  }), [decisions, verdicts])

  const run = runs[selected]
  const focus = useMemo(() => (run ? deriveFocus(run.events) : EMPTY_FOCUS), [run])
  const causeNcrs = useMemo(() => runs.flatMap((r) => r.events.flatMap((e) => (e.type === 'answer' ? e.citations.filter((c) => c.type === 'ncr').map((c) => c.id) : []))), [runs])
  const visuals = useMemo<PartVisuals>(() => {
    const health = partHealth(simT, fired, causeNcrs, actions, cond)
    return Object.fromEntries(db.parts.map((p) => {
      const h = health[p.id] ?? 'nominal'
      return [p.id, { key: h, ...HEALTH[h] }]
    }))
  }, [simT, fired, causeNcrs, actions, cond])
  const framed = pinned ?? focus.activePartIds
  const activeChannels = useMemo(() => new Set(focus.touchedRecordIds.filter((id) => id.startsWith('TM-'))), [focus])
  const cause = scenario.cause && causeNcrs.includes(scenario.cause.ncr) ? scenario.cause : undefined
  // Gated decisions nobody has ruled on yet: playback stops at their operator pass so the viewer decides in time.
  const pendingPasses = useMemo(() => decisions.filter((d) => d.tier === 'gated' && !verdicts[d.callId] && d.nextContact).map((d) => d.nextContact!.start), [decisions, verdicts])
  const atPass = pendingPasses.some((p) => Math.abs(p - simT) < 0.01)

  // The sim clock. Refs carry the latest values into the animation frame loop.
  const tRef = useRef(simT)
  const busyRef = useRef(busy)
  const firedRef = useRef(fired)
  const actionsRef = useRef(actions)
  const passesRef = useRef(pendingPasses)
  const fireRef = useRef<(e: FlightEvent) => void>(() => {})
  useEffect(() => {
    passesRef.current = pendingPasses
    busyRef.current = busy
    firedRef.current = fired
    actionsRef.current = actions
    fireRef.current = (e: FlightEvent) => {
      busyRef.current = true
      setFired((f) => [...f, e])
      setPinned(null)
      const label = `${e.id} · ${e.summary}`
      if (replaying) {
        void fetch(`/recordings/${recordingName(scenarioId, cond)}.json`).then((r) => (r.ok ? (r.json() as Promise<Recording>) : Promise.reject(new Error('no recording'))))
          .then((rec) => replay(rec, label))
          .catch(() => start({ flight: { scenario: scenarioId, eventId: e.id, actions: actionsRef.current, conditions: cond } }, label))
      } else {
        void start({ flight: { scenario: scenarioId, eventId: e.id, actions: actionsRef.current, conditions: cond } }, label)
      }
    }
  })

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Mission time holds while the agent reasons, so a 40 s model call doesn't eat 40 mission minutes.
      if (!busyRef.current) {
        const cur = tRef.current
        let next = Math.min(scenario.range.end, cur + dt * speed)
        const ev = events.find((e) => e.t > cur && e.t <= next && !firedRef.current.some((f) => f.id === e.id))
        if (ev) {
          next = ev.t
          fireRef.current(ev)
        }
        const pass = passesRef.current.find((p) => p > cur && p <= next)
        if (pass !== undefined) next = pass
        tRef.current = next
        setSimT(next)
        if (pass !== undefined || next >= scenario.range.end) { setPlaying(false); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, scenario, events])

  function restart(id: ScenarioId, nextCond: Conditions) {
    if (busy) return
    const s = scenarioWith(id, nextCond)
    setScenarioId(id)
    setCond(nextCond)
    setPlaying(false)
    setSpeedIdx(0)
    tRef.current = s.startT
    setSimT(s.startT)
    setFired([])
    setVerdicts({})
    setPinned(null)
    setDoc(null)
    reset()
  }

  function openRecord(id: string) {
    setRecord(id)
    const ch = channelById(id)
    const parts = ch ? [ch.channel.partId] : partsForRecord(id)
    if (parts.length) setPinned(parts)
  }

  const nextEvent = events.find((e) => !fired.some((f) => f.id === e.id))
  const missionDay = Math.floor(scenario.missionDay + simT / 1440)
  const asleep = fired.length > 0
  const conditionsLocked = fired.length > 0

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/80 px-4 py-2.5 backdrop-blur sm:px-5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tracking-[0.2em]">SPACEGRADE</span>
          <span className="font-mono text-[0.7rem] tracking-widest text-accent">{`// ${db.program.name.toUpperCase()} FLIGHT OPS`}</span>
        </div>
        <span className="font-mono text-[0.72rem] text-muted">MISSION DAY <span className="text-ink">{missionDay}</span></span>
        <span className="font-mono text-[0.72rem] tabular-nums text-muted" title="Simulated mission time, minutes from the scenario start">MISSION TIME <span className="text-ink">{fmtT(simT)}</span></span>
        <nav className="flex flex-wrap gap-1" aria-label="Scenarios">
          {SCENARIO_IDS.map((id) => (
            <button key={id} type="button" disabled={busy} onClick={() => restart(id, {})}
              className={`rounded border px-2 py-1 font-mono text-[0.68rem] uppercase tracking-wider disabled:opacity-50 ${id === scenarioId ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink'}`}>
              {SCENARIOS[id].title}
            </button>
          ))}
        </nav>
        <Link href="/mission" className="ml-auto font-mono text-[0.7rem] uppercase tracking-wider text-muted hover:text-accent" title="The same build record, before launch">Build phase: Mission Control →</Link>
      </header>

      <div className={`border-b px-4 py-1.5 font-mono text-[0.72rem] sm:px-5 ${asleep ? 'border-bad/40 bg-bad-soft text-bad' : 'border-line bg-sunken/60 text-muted'}`}>
        {asleep
          ? atPass
            ? <>● Operator pass at {fmtT(simT)}. You are the operator: approve or reject the waiting decision below. Playback resumes after you decide.</>
            : <>● No operator on console. {fired.map((f) => f.id).join(', ')} woke the ground autonomy agent at {fmtT(fired[0].t)}. Command link: {COMMAND_PATH.label} (up).{busy && ' Agent reasoning; mission time held.'}</>
          : <>A spacecraft&apos;s build record changes what it can safely do in orbit. {scenario.tagline}</>}
      </div>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="order-3 border-t border-line bg-surface/40 p-4 lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r">
          <TelemetryStrips scenario={scenario} t={simT} actions={actions} activeChannels={activeChannels} onOpen={openRecord} />
        </aside>

        <main className="order-1 flex flex-col lg:order-2 lg:min-h-0">
          <div className={`relative h-[280px] shrink-0 border-b border-line sm:h-[340px] lg:h-auto lg:min-h-[220px] ${runs.length ? 'lg:flex-[0.7]' : 'lg:flex-[1.1]'}`}>
            <TwinPanel visuals={visuals} legend={LEGEND} focus={focus} framed={framed} onSelectPart={openRecord}
              overlay={cause && (
                <button type="button" onClick={() => openRecord(cause.ncr)}
                  className="sg-rise absolute bottom-9 left-3 max-w-[min(20rem,calc(100%-1.5rem))] rounded-md border border-bad/50 bg-canvas/85 px-2.5 py-1.5 text-left backdrop-blur hover:border-bad">
                  <span className="block font-mono text-[0.68rem] uppercase tracking-wider text-bad">Cause in the build record · {cause.ncr}</span>
                  <span className="block text-xs text-ink">{db.parts.find((p) => p.id === cause.partId)?.name}: {cause.line}</span>
                </button>
              )} />
            <div className="absolute bottom-2 right-3 flex items-center gap-1 font-mono text-[0.68rem]">
              <button type="button" onClick={() => setPlaying((p) => !p)} disabled={simT >= scenario.range.end}
                className="rounded border border-accent bg-canvas/80 px-2.5 py-1 uppercase tracking-wider text-accent backdrop-blur disabled:opacity-40">
                {playing ? '❚❚ Pause' : simT <= scenario.startT ? '▶ Run scenario' : '▶ Resume'}
              </button>
              {scenario.speeds.map((s, i) => (
                <button key={s} type="button" onClick={() => setSpeedIdx(i)} aria-pressed={i === speedIdx} title="Mission time per real second"
                  className={`rounded border bg-canvas/80 px-1.5 py-1 backdrop-blur ${i === speedIdx ? 'border-accent text-accent' : 'border-line text-muted'}`}>
                  {s >= 60 ? `${s / 60} h/s` : `${s} min/s`}
                </button>
              ))}
              {nextEvent && !busy && (
                <button type="button" onClick={() => { tRef.current = Math.max(tRef.current, nextEvent.t - 0.05); setSimT(tRef.current); setPlaying(true) }}
                  className="rounded border border-line bg-canvas/80 px-2 py-1 uppercase tracking-wider text-muted backdrop-blur hover:text-ink">
                  ⏭ Next event
                </button>
              )}
            </div>
          </div>

          <div className="shrink-0 border-b border-line">
            <OrbitTimeline scenario={scenario} t={simT} fired={fired} decisions={decisions} actions={actions} />
          </div>

          <div className="space-y-4 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto sm:px-5">
            {runs.length === 0 && (
              <Intro scenarioTitle={scenario.title} tagline={scenario.tagline} defs={SCENARIOS[scenarioId].conditionDefs ?? []} cond={cond} locked={conditionsLocked || busy}
                onCond={(c) => restart(scenarioId, c)} source={source} onSource={setSource} replayable={asBuiltDefaults || RECORDED_CONDITIONS.has(recordingName(scenarioId, cond))}
                onRun={() => { if (simT < scenario.range.end) setPlaying(true) }} />
            )}
            {runs.map((r, i) => {
              const answer = r.events.find((e) => e.type === 'answer')
              const document = r.events.filter((e) => e.type === 'document').at(-1)
              const partial = extractTag(r.answerRaw, 'answer')
              const runDecisions = decisions.filter((d) => d.run === i)
              const eventT = fired[i]?.t ?? 0
              const decided = runDecisions.filter((d) => verdicts[d.callId])
              return (
                <div key={i} className={`mx-auto max-w-3xl space-y-3 rounded-md ${selected === i ? '' : 'opacity-80'}`} onClick={() => setSelected(i)}>
                  <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 font-mono text-[0.72rem] text-warn">
                    <span className="font-semibold">FDIR {fmtT(eventT)}</span> · {r.question}
                  </p>
                  {r.recorded && (
                    <p className="font-mono text-[0.7rem] text-super">
                      ⟲ Recorded run, replayed at {r.recorded.speedup.toFixed(1)}×. The live run took {(r.recorded.originalMs / 1000).toFixed(0)} s on Nemotron (recorded {r.recorded.recordedAt.slice(0, 10)}). Switch to Live to run it now.
                    </p>
                  )}
                  {runDecisions.length === 0 && r.status === 'running' && (
                    <p className="rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-muted">The decision appears here as soon as the agent proposes an action and the policy rules on it.</p>
                  )}
                  {runDecisions.length === 0 && r.status !== 'running' && (
                    <p className="rounded-md border border-warn/40 bg-warn-soft/40 px-3 py-2 text-sm text-warn">No valid proposal reached the policy in this run, so nothing was authorised. Run the scenario again.</p>
                  )}
                  {runDecisions.map((d) => (
                    <DecisionCard key={d.callId} decision={d} simT={simT} verdict={verdicts[d.callId]} onOpenRecord={openRecord}
                      steps={lifecycle(d, d.eventT, simT, actions, cond, verdicts[d.callId])}
                      onVerdict={(v) => {
                        setVerdicts((x) => ({ ...x, [d.callId]: { verdict: v, t: Math.max(tRef.current, d.nextContact?.start ?? tRef.current) } }))
                        if (atPass) setPlaying(true)
                      }} />
                  ))}
                  <div className="rounded-md border border-line bg-surface px-4 py-3">
                    <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                      Agent assessment · written at {fmtT(eventT)}{decided.length > 0 ? ', before your operator decision (the decision card above is current)' : ''}
                    </p>
                    {answer?.type === 'answer' ? (
                      <>
                        <Markdown text={answer.markdown} onOpenRecord={openRecord} unknownIds={answer.unknownIds} />
                        {document?.type === 'document' && (
                          <button type="button" onClick={() => setDoc(document)} className="mt-3 flex w-full items-center justify-between rounded-md border border-line bg-sunken px-4 py-3 text-left hover:border-accent">
                            <span>
                              <span className="block font-mono text-[0.7rem] uppercase tracking-wider text-muted">Back to the build record</span>
                              <span className="text-sm font-medium">{document.title}</span>
                            </span>
                            <span className="text-sm text-accent">Open</span>
                          </button>
                        )}
                        {answer.citations.length > 0 && (
                          <div className="mt-3 border-t border-line pt-2.5">
                            <p className="panel-title mb-1.5">Evidence ({answer.citations.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {answer.citations.map((c) => <CitationChip key={c.id} id={c.id} label={c.label} onClick={() => openRecord(c.id)} />)}
                            </div>
                          </div>
                        )}
                        <AnswerChecks citations={answer.citations.length} unknown={answer.unknownIds} quantities={answer.quantities} />
                      </>
                    ) : r.status === 'error' ? (
                      <p className="text-sm text-bad">{r.events.filter((e) => e.type === 'error').map((e) => (e.type === 'error' ? e.message : '')).join(' ')}</p>
                    ) : (
                      <>
                        <p className="flex items-center gap-2 font-mono text-xs text-accent"><span className="sg-pulse size-2 rounded-full bg-accent" /> {focus.currentTool ? `Reading ${focus.currentTool.replace(/_/g, ' ')}…` : 'Ground autonomy agent reasoning…'}</p>
                        {partial && <div className="mt-2"><Markdown text={partial} onOpenRecord={openRecord} /></div>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </main>

        <aside className="order-2 border-t border-line bg-surface/40 lg:order-3 lg:overflow-y-auto lg:border-t-0 lg:border-l" aria-label="Agent activity">
          <TracePane run={run} onOpenRecord={openRecord} emptyHint="Run a scenario. When onboard fault detection fires, the agent's plan, each tool call with its arguments, the model behind it, and the time and cost of every step appear here as they happen." />
        </aside>
      </div>

      {doc && <DocumentView title={doc.title} markdown={doc.markdown} onOpenRecord={openRecord} onClose={() => setDoc(null)} />}
      {record && <RecordDrawer id={record} onOpen={openRecord} onClose={() => setRecord(null)} asFlown={(id) => asFlown(id, cond)} />}
    </div>
  )
}

function AnswerChecks({ citations, unknown, quantities }: { citations: number; unknown: string[]; quantities?: { checked: number; unmatched: string[] } }) {
  return (
    <ul className="mt-3 space-y-0.5 border-t border-line pt-2 font-mono text-[0.7rem] text-muted">
      <li>
        <span className={unknown.length ? 'text-bad' : 'text-ok'}>{unknown.length ? '✗' : '✓'}</span> Sources: {citations} cited record{citations === 1 ? '' : 's'} came from tool output
        {unknown.length > 0 && <span className="text-bad"> · not from any tool: {unknown.join(', ')}</span>}
      </li>
      {quantities && quantities.checked > 0 && (
        <li>
          <span className={quantities.unmatched.length ? 'text-warn' : 'text-ok'}>{quantities.unmatched.length ? '!' : '✓'}</span> Quantities: {quantities.checked - quantities.unmatched.length} of {quantities.checked} match tool output
          {quantities.unmatched.length > 0 && <span className="text-warn"> · not found (derived or wrong): {quantities.unmatched.join(', ')}</span>}
        </li>
      )}
      <li className="text-muted">These check sources and numbers, not reasoning. The decision card is computed by the policy, not written by the model.</li>
    </ul>
  )
}

function Intro({ scenarioTitle, tagline, defs, cond, locked, onCond, source, onSource, replayable, onRun }: {
  scenarioTitle: string
  tagline: string
  defs: NonNullable<ReturnType<typeof scenarioWith>['conditionDefs']>
  cond: Conditions
  locked: boolean
  onCond: (c: Conditions) => void
  source: AgentSource
  onSource: (s: AgentSource) => void
  replayable: boolean
  onRun: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 text-sm">
      <div>
        <h2 className="text-lg font-semibold">{scenarioTitle}</h2>
        <p className="mt-0.5 text-muted">{tagline}</p>
      </div>
      <ol className="space-y-1 text-muted">
        <li><span className="font-mono text-accent">1</span> Onboard fault detection (fixed rules, no AI) flags the problem and wakes the ground agent. Nobody is on console.</li>
        <li><span className="font-mono text-accent">2</span> The agent (NVIDIA Nemotron on Nebius) reads the telemetry, then this vehicle&apos;s build record: tests, defects and how each was signed off for flight.</li>
        <li><span className="font-mono text-accent">3</span> It proposes an action. A deterministic policy, not the model, decides whether it runs now, waits for an operator, or is refused.</li>
      </ol>

      {defs.length > 0 && (
        <fieldset className="rounded-md border border-line-strong bg-surface px-3 py-2.5" disabled={locked}>
          <legend className="px-1 font-mono text-[0.7rem] uppercase tracking-wider text-accent">Change one condition, then run</legend>
          <p className="mb-1.5 text-xs text-muted">The default is the vehicle as built. Change the evidence or the staffing and the decision should change with it.</p>
          {defs.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-sunken">
              <input type="checkbox" checked={!!cond[d.key]} onChange={(e) => onCond({ ...cond, [d.key]: e.target.checked || undefined })} className="mt-1 accent-[var(--accent)]" />
              <span><span className="text-ink">{d.label}</span> <span className="text-muted">({d.effect})</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRun} className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-canvas">▶ Run scenario</button>
        <div className="flex overflow-hidden rounded-md border border-line-strong font-mono text-[0.7rem]" role="radiogroup" aria-label="Agent source">
          {(['live', 'recorded'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} disabled={s === 'recorded' && !replayable} onClick={() => onSource(s)}
              className={`px-2.5 py-1.5 uppercase tracking-wider disabled:opacity-40 ${source === s ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}>
              {s === 'live' ? 'Live agent (40–100 s)' : 'Recorded run (≈15 s)'}
            </button>
          ))}
        </div>
      </div>
      <p className="font-mono text-[0.7rem] text-muted">Simulated telemetry, synthetic build records. The agent never commands the vehicle directly.{!replayable && ' This combination of conditions has no recording, so it runs live.'}</p>
    </div>
  )
}
