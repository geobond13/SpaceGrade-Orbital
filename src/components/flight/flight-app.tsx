'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractTag } from '@/lib/agent/citations'
import { deriveFocus, EMPTY_FOCUS, partsForRecord } from '@/lib/focus'
import { detect, type FlightEvent } from '@/lib/flight/fdir'
import { channelById, SCENARIO_IDS, SCENARIOS, type ExecutedAction, type ScenarioId } from '@/lib/flight/scenarios'
import { HEALTH, partHealth } from '@/lib/flight/health'
import type { Decision } from '@/lib/flight/autonomy'
import { db } from '@/lib/tools/lookup'
import { Markdown } from '../markdown'
import { CitationChip } from '../citation-chip'
import { TracePane } from '../trace-pane'
import { RecordDrawer } from '../record-drawer'
import { DocumentView } from '../document-view'
import { TwinPanel } from '../twin-panel'
import type { LegendItem, PartVisuals } from '../twin/visuals'
import { useAgentRuns } from '../use-agent-runs'
import { TelemetryStrips, fmtT } from './telemetry-strips'
import { OrbitTimeline } from './orbit-timeline'
import { DecisionCard, type Verdict } from './decision-card'

const LEGEND: LegendItem[] = (['cause', 'watch', 'commanded', 'shed'] as const).map((h) => ({ hex: HEALTH[h].hex, label: HEALTH[h].label }))

interface RunDecision extends Decision { callId: string; run: number; eventT: number }

export function FlightApp() {
  const { runs, selected, setSelected, busy, start, reset } = useAgentRuns()
  const [scenarioId, setScenarioId] = useState<ScenarioId>('conjunction')
  const scenario = SCENARIOS[scenarioId]
  const [simT, setSimT] = useState(scenario.startT)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  /** FDIR events that have fired, in order; run i was woken by fired[i]. */
  const [fired, setFired] = useState<FlightEvent[]>([])
  const [verdicts, setVerdicts] = useState<Record<string, { verdict: Verdict; t: number }>>({})
  const [record, setRecord] = useState<string | null>(null)
  const [doc, setDoc] = useState<{ title: string; markdown: string } | null>(null)
  const [pinned, setPinned] = useState<string[] | null>(null)

  const events = useMemo(() => detect(scenarioId), [scenarioId])
  const speed = scenario.speeds[speedIdx] ?? scenario.speeds[0]

  // Every policy decision across the runs, tagged with the sim time of the event that woke the agent.
  const decisions = useMemo<RunDecision[]>(() => runs.flatMap((r, i) => r.events.flatMap((e) =>
    e.type === 'decision' ? [{ ...e.decision, callId: e.callId, run: i, eventT: fired[i]?.t ?? 0 }] : [])), [runs, fired])
  // What the vehicle has actually done: autonomous actions at the event time, approved ones when approved.
  const actions = useMemo<ExecutedAction[]>(() => decisions.flatMap((d) => {
    if (d.tier === 'auto') return [{ kind: d.kind, t: d.eventT, params: d.params }]
    const v = verdicts[d.callId]
    return d.tier === 'gated' && v?.verdict === 'approved' ? [{ kind: d.kind, t: v.t, params: d.params }] : []
  }), [decisions, verdicts])

  const run = runs[selected]
  const focus = useMemo(() => (run ? deriveFocus(run.events) : EMPTY_FOCUS), [run])
  const causeNcrs = useMemo(() => runs.flatMap((r) => r.events.flatMap((e) => (e.type === 'answer' ? e.citations.filter((c) => c.type === 'ncr').map((c) => c.id) : []))), [runs])
  const visuals = useMemo<PartVisuals>(() => {
    const health = partHealth(simT, fired, causeNcrs, actions)
    return Object.fromEntries(db.parts.map((p) => {
      const h = health[p.id] ?? 'nominal'
      return [p.id, { key: h, ...HEALTH[h] }]
    }))
  }, [simT, fired, causeNcrs, actions])
  const framed = pinned ?? focus.activePartIds
  const activeChannels = useMemo(() => new Set(focus.touchedRecordIds.filter((id) => id.startsWith('TM-'))), [focus])

  // The sim clock. Refs carry the latest values into the animation frame loop.
  const tRef = useRef(simT)
  const busyRef = useRef(busy)
  const firedRef = useRef(fired)
  const actionsRef = useRef(actions)
  const fireRef = useRef<(e: FlightEvent) => void>(() => {})
  useEffect(() => {
    busyRef.current = busy
    firedRef.current = fired
    actionsRef.current = actions
    fireRef.current = (e: FlightEvent) => {
      busyRef.current = true
      setFired((f) => [...f, e])
      setPinned(null)
      void start({ flight: { scenario: scenarioId, eventId: e.id, actions: actionsRef.current } }, `${e.id} · ${e.summary}`)
    }
  })

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // Sim time holds while the agent reasons, so a 30 s model call doesn't eat 30 sim minutes.
      if (!busyRef.current) {
        const cur = tRef.current
        let next = Math.min(scenario.range.end, cur + dt * speed)
        const ev = events.find((e) => e.t > cur && e.t <= next && !firedRef.current.some((f) => f.id === e.id))
        if (ev) {
          next = ev.t
          fireRef.current(ev)
        }
        tRef.current = next
        setSimT(next)
        if (next >= scenario.range.end) { setPlaying(false); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, scenario, events])

  function chooseScenario(id: ScenarioId) {
    if (busy) return
    const s = SCENARIOS[id]
    setScenarioId(id)
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

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/80 px-4 py-2.5 backdrop-blur sm:px-5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tracking-[0.2em]">{db.program.name.toUpperCase()}</span>
          <span className="font-mono text-[0.68rem] tracking-widest text-accent">{'// FLIGHT MODE'}</span>
        </div>
        <span className="font-mono text-[0.7rem] text-muted">MISSION DAY <span className="text-ink">{missionDay}</span></span>
        <span className="font-mono text-[0.7rem] tabular-nums text-muted">SIM <span className="text-ink">{fmtT(simT)}</span></span>
        <nav className="flex gap-1" aria-label="Scenarios">
          {SCENARIO_IDS.map((id) => (
            <button key={id} type="button" disabled={busy} onClick={() => chooseScenario(id)}
              className={`rounded border px-2 py-1 font-mono text-[0.65rem] uppercase tracking-wider disabled:opacity-50 ${id === scenarioId ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink'}`}>
              {SCENARIOS[id].title}
            </button>
          ))}
        </nav>
        <Link href="/" className="ml-auto font-mono text-[0.68rem] uppercase tracking-wider text-muted hover:text-accent">← Mission Control</Link>
      </header>

      <div className={`border-b px-4 py-1.5 font-mono text-[0.7rem] sm:px-5 ${asleep ? 'border-bad/40 bg-bad-soft text-bad' : 'border-line bg-sunken/60 text-muted'}`}>
        {asleep
          ? <>● No operator on console. {fired.map((f) => f.id).join(', ')} woke the ground autonomy agent at {fmtT(fired[0].t)}.{busy && ' Agent reasoning; sim time held.'}</>
          : <>{scenario.tagline} The build pedigree is the extra sensor: watch what the agent finds in it.</>}
      </div>

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[340px_minmax(0,1fr)_380px]">
        <aside className="order-2 border-t border-line bg-surface/40 p-4 lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r">
          <TelemetryStrips scenario={scenario} t={simT} actions={actions} activeChannels={activeChannels} onOpen={openRecord} />
        </aside>

        <main className="order-1 flex flex-col lg:order-2 lg:min-h-0">
          <div className="relative h-[300px] shrink-0 border-b border-line sm:h-[360px] lg:h-auto lg:min-h-[240px] lg:flex-[1.1]">
            <TwinPanel visuals={visuals} legend={LEGEND} focus={focus} framed={framed} onSelectPart={openRecord} />
            <div className="absolute bottom-2 right-3 flex items-center gap-1 font-mono text-[0.65rem]">
              <button type="button" onClick={() => setPlaying((p) => !p)} disabled={simT >= scenario.range.end}
                className="rounded border border-accent bg-canvas/80 px-2.5 py-1 uppercase tracking-wider text-accent backdrop-blur disabled:opacity-40">
                {playing ? '❚❚ Pause' : simT <= scenario.startT ? '▶ Run scenario' : '▶ Resume'}
              </button>
              {scenario.speeds.map((s, i) => (
                <button key={s} type="button" onClick={() => setSpeedIdx(i)} aria-pressed={i === speedIdx}
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
            <OrbitTimeline scenario={scenario} t={simT} fired={fired} decisions={decisions} />
          </div>

          <div className="space-y-4 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto sm:px-5">
            {runs.length === 0 && (
              <div className="mx-auto max-w-2xl text-sm text-muted">
                <h2 className="panel-title mb-1.5">{scenario.title}</h2>
                <p>{scenario.tagline}</p>
                <p className="mt-2">Press <span className="text-accent">Run scenario</span>. Onboard fault detection is a fixed rule set. When a rule fires, the ground autonomy agent wakes up with no operator on console. It reads the telemetry, then the vehicle&apos;s build pedigree from SpaceGradeOS, and proposes an action. A deterministic policy decides whether that action runs on its own, waits for an operator, or is refused.</p>
                <p className="mt-2 font-mono text-[0.68rem] text-faint">Simulated telemetry and synthetic records. The agent never commands the vehicle directly.</p>
              </div>
            )}
            {runs.map((r, i) => {
              const answer = r.events.find((e) => e.type === 'answer')
              const document = r.events.filter((e) => e.type === 'document').at(-1)
              const partial = extractTag(r.answerRaw, 'answer')
              const runDecisions = decisions.filter((d) => d.run === i)
              return (
                <div key={i} className={`mx-auto max-w-3xl space-y-3 rounded-md ${selected === i ? '' : 'opacity-80'}`} onClick={() => setSelected(i)}>
                  <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 font-mono text-[0.7rem] text-warn">⚠ {r.question}</p>
                  {runDecisions.map((d) => (
                    <DecisionCard key={d.callId} decision={d} verdict={verdicts[d.callId]?.verdict} onOpenRecord={openRecord}
                      onVerdict={(v) => setVerdicts((x) => ({ ...x, [d.callId]: { verdict: v, t: tRef.current } }))} />
                  ))}
                  <div className="rounded-md border border-line bg-surface px-4 py-3">
                    {answer?.type === 'answer' ? (
                      <>
                        <Markdown text={answer.markdown} onOpenRecord={openRecord} unknownIds={answer.unknownIds} />
                        {document?.type === 'document' && (
                          <button type="button" onClick={() => setDoc(document)} className="mt-3 flex w-full items-center justify-between rounded-md border border-line bg-sunken px-4 py-3 text-left hover:border-accent">
                            <span>
                              <span className="block font-mono text-[0.68rem] uppercase tracking-wider text-muted">Back to the build record</span>
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
                      </>
                    ) : r.status === 'error' ? (
                      <p className="text-sm text-bad">{r.events.filter((e) => e.type === 'error').map((e) => (e.type === 'error' ? e.message : '')).join(' ')}</p>
                    ) : (
                      <>
                        <p className="flex items-center gap-2 font-mono text-xs text-accent"><span className="sg-pulse size-2 rounded-full bg-accent" /> {focus.currentTool ? `Calling ${focus.currentTool}…` : 'Ground autonomy agent reasoning…'}</p>
                        {partial && <div className="mt-2"><Markdown text={partial} onOpenRecord={openRecord} /></div>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </main>

        <aside className="order-3 border-t border-line bg-surface/40 lg:overflow-y-auto lg:border-t-0 lg:border-l" aria-label="Agent trace">
          <TracePane run={run} onOpenRecord={openRecord} />
        </aside>
      </div>

      {doc && <DocumentView title={doc.title} markdown={doc.markdown} onOpenRecord={openRecord} onClose={() => setDoc(null)} />}
      {record && <RecordDrawer id={record} onOpen={openRecord} onClose={() => setRecord(null)} />}
    </div>
  )
}
