'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { extractTag } from '@/lib/agent/citations'
import { DEMO_QUERIES } from '@/lib/demo-queries'
import { computeReadiness, type Overrides } from '@/lib/readiness'
import { deriveFocus, EMPTY_FOCUS, partsForRecord } from '@/lib/focus'
import { db } from '@/lib/tools/lookup'
import { Markdown } from './markdown'
import { CitationChip } from './citation-chip'
import { TracePane } from './trace-pane'
import { RecordDrawer } from './record-drawer'
import { DocumentView } from './document-view'
import { HeaderBar } from './header-bar'
import { AssemblyBoard } from './assembly-board'
import { TwinPanel } from './twin-panel'
import { ReadinessHeatmap } from './readiness-heatmap'
import { useAgentRuns, type Run } from './use-agent-runs'

function statusLine(run: Run): string {
  const last = [...run.events].reverse().find((e) => e.type !== 'usage' && e.type !== 'thinking')
  if (!last || last.type === 'run_start') return 'Nemotron Super is planning…'
  if (last.type === 'plan') return 'Plan ready, calling tools…'
  if (last.type === 'tool_call') return `Calling ${last.name}…`
  if (last.type === 'tool_result' || last.type === 'document') return run.answerRaw ? 'Writing the answer…' : 'Reading results…'
  if (last.type === 'notice') return last.message
  return 'Working…'
}

export function AgentApp() {
  const { runs, selected, setSelected, busy, ask } = useAgentRuns()
  const [input, setInput] = useState('')
  const [record, setRecord] = useState<string | null>(null)
  const [doc, setDoc] = useState<{ title: string; markdown: string } | null>(null)
  /** Parts the user pinned by opening a record or an assembly; overrides the agent's focus. */
  const [pinned, setPinned] = useState<string[] | null>(null)
  const [overrides] = useState<Overrides>({})
  const chatEnd = useRef<HTMLDivElement>(null)

  const baseline = useMemo(() => computeReadiness(), [])
  const readiness = useMemo(() => computeReadiness(overrides), [overrides])
  const run = runs[selected]
  const focus = useMemo(() => (run ? deriveFocus(run.events) : EMPTY_FOCUS), [run])
  const framed = pinned ?? focus.activePartIds

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [runs])

  function submit(question: string) {
    if (!question.trim() || busy) return
    setInput('')
    setPinned(null)
    void ask(question)
  }

  function openRecord(id: string) {
    setRecord(id)
    const parts = partsForRecord(id)
    if (parts.length) setPinned(parts)
  }

  function selectAssembly(assembly: string) {
    const roots = db.parts.filter((p) => p.assembly === assembly && !p.parentId).map((p) => p.id)
    setPinned(roots.length ? roots : null)
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <HeaderBar runs={runs} focus={focus} />

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_400px]">
        <aside className="order-2 space-y-5 border-t border-line bg-surface/40 p-4 lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r" aria-label="Program status">
          <AssemblyBoard readiness={readiness} baseline={baseline} focus={focus} onSelectAssembly={selectAssembly} onOpenRecord={openRecord} />
          <ReadinessHeatmap readiness={readiness} baseline={baseline} focus={focus} onOpenRecord={openRecord} />
        </aside>

        <main className="order-1 flex flex-col lg:order-2 lg:min-h-0">
          <div className="h-[300px] shrink-0 border-b border-line sm:h-[380px] lg:h-auto lg:min-h-[280px] lg:flex-[1.25]">
            <TwinPanel readiness={readiness} focus={focus} framed={framed} onSelectPart={openRecord} />
          </div>

          <div className="px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto sm:px-5">
            {runs.length === 0 && (
              <div className="mx-auto max-w-2xl">
                <h2 className="panel-title">Ask the program</h2>
                <p className="mt-1.5 text-sm text-muted">
                  Nemotron Super plans, Nemotron Nano routes tool calls across parts, requirements, test records, NCRs and supplier quotes.
                  Watch the twin follow the agent. Every claim cites a record.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {DEMO_QUERIES.map((q) => (
                    <button key={q.label} type="button" onClick={() => submit(q.question)}
                      className="rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent">
                      <span className="block font-mono text-[0.68rem] uppercase tracking-wider text-accent">{q.label}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{q.question}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-5">
              {runs.map((r, i) => {
                const answer = r.events.find((e) => e.type === 'answer')
                const document = r.events.filter((e) => e.type === 'document').at(-1)
                const partial = extractTag(r.answerRaw, 'answer')
                return (
                  <div key={i} className="space-y-2.5">
                    <div className="flex justify-end">
                      <p className="max-w-[85%] rounded-md border border-line-strong bg-sunken px-3.5 py-2 text-sm">{r.question}</p>
                    </div>
                    <div
                      className={`rounded-md border bg-surface px-4 py-3 ${selected === i ? 'border-accent/50' : 'border-line'}`}
                      onClick={() => setSelected(i)}
                    >
                      {answer?.type === 'answer' ? (
                        <>
                          <Markdown text={answer.markdown} onOpenRecord={openRecord} unknownIds={answer.unknownIds} />
                          {document?.type === 'document' && (
                            <button type="button" onClick={() => setDoc(document)} className="mt-3 flex w-full items-center justify-between rounded-md border border-line bg-sunken px-4 py-3 text-left hover:border-accent">
                              <span>
                                <span className="block font-mono text-[0.68rem] uppercase tracking-wider text-muted">Generated document</span>
                                <span className="text-sm font-medium">{document.title}</span>
                              </span>
                              <span className="text-sm text-accent">Open</span>
                            </button>
                          )}
                          {answer.citations.length > 0 && (
                            <div className="mt-3 border-t border-line pt-2.5">
                              <p className="panel-title mb-1.5">Sources ({answer.citations.length})</p>
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
                          <p className="flex items-center gap-2 font-mono text-xs text-accent">
                            <span className="sg-pulse size-2 rounded-full bg-accent" /> {statusLine(r)}
                          </p>
                          {partial && <div className="mt-2"><Markdown text={partial} onOpenRecord={openRecord} /></div>}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={chatEnd} />
            </div>
          </div>

          <form className="border-t border-line bg-surface px-4 py-3 sm:px-5" onSubmit={(e) => { e.preventDefault(); submit(input) }}>
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about parts, requirements, tests, NCRs or suppliers…"
                maxLength={1000}
                className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-canvas disabled:opacity-40">
                {busy ? 'Running' : 'Transmit'}
              </button>
            </div>
          </form>
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
