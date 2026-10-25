'use client'

import { useEffect, useRef, useState } from 'react'
import type { AgentEvent } from '@/lib/agent/events'
import { extractTag } from '@/lib/agent/citations'
import { DEMO_QUERIES } from '@/lib/demo-queries'
import { programData } from '@/data/program'
import { Markdown } from './markdown'
import { CitationChip } from './citation-chip'
import { TracePane } from './trace-pane'
import { RecordDrawer } from './record-drawer'
import { DocumentView } from './document-view'

export interface Run {
  question: string
  events: AgentEvent[]
  answerRaw: string
  status: 'running' | 'done' | 'error'
}

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
  const [runs, setRuns] = useState<Run[]>([])
  const [selected, setSelected] = useState(0)
  const [input, setInput] = useState('')
  const [record, setRecord] = useState<string | null>(null)
  const [doc, setDoc] = useState<{ title: string; markdown: string } | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  const busy = runs.some((r) => r.status === 'running')

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [runs])

  async function ask(question: string) {
    if (!question.trim() || busy) return
    setInput('')
    const index = runs.length
    setSelected(index)
    setRuns((rs) => [...rs, { question, events: [], answerRaw: '', status: 'running' }])
    const update = (fn: (r: Run) => Run) => setRuns((rs) => rs.map((r, i) => (i === index ? fn(r) : r)))
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        update((r) => ({ ...r, status: 'error', events: [...r.events, { type: 'error', message: err.error ?? `Request failed (${res.status})` }] }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        const parsed = lines.filter(Boolean).map((l) => JSON.parse(l) as AgentEvent)
        if (parsed.length === 0) continue
        update((r) => {
          let { answerRaw, status } = r
          const events = [...r.events]
          for (const e of parsed) {
            if (e.type === 'answer_delta') { answerRaw += e.text; continue }
            if (e.type === 'done') status = 'done'
            if (e.type === 'error') status = 'error'
            events.push(e)
          }
          return { ...r, events, answerRaw, status }
        })
      }
      update((r) => (r.status === 'running' ? { ...r, status: 'done' } : r))
    } catch (err) {
      update((r) => ({ ...r, status: 'error', events: [...r.events, { type: 'error', message: err instanceof Error ? err.message : 'Network error' }] }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <h1 className="text-base font-semibold">SpaceGrade Agent</h1>
        <p className="text-sm text-muted">{programData.program.name} · {programData.program.phase}</p>
        <p className="ml-auto text-xs text-faint">Synthetic demo data · NVIDIA Nemotron on Nebius Token Factory</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,42%)] lg:grid-rows-1 lg:grid-cols-[minmax(0,1fr)_440px]">
        <main className="flex min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {runs.length === 0 && (
              <div className="mx-auto max-w-2xl py-6">
                <h2 className="text-xl font-semibold">Ask about your hardware program</h2>
                <p className="mt-2 text-sm text-muted">
                  The agent plans with Nemotron Super, routes tool calls with Nemotron Nano across parts, requirements, test records,
                  nonconformances and supplier quotes for the {programData.program.name} smallsat, and answers with every claim cited to a record.
                </p>
                <div className="mt-5 grid gap-2">
                  {DEMO_QUERIES.map((q) => (
                    <button key={q.label} type="button" onClick={() => ask(q.question)} className="rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent">
                      <span className="block text-xs text-muted">{q.label}</span>
                      <span className="text-sm">{q.question}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-auto max-w-3xl space-y-6">
              {runs.map((run, i) => {
                const answer = run.events.find((e) => e.type === 'answer')
                const document = run.events.filter((e) => e.type === 'document').at(-1)
                const partial = extractTag(run.answerRaw, 'answer')
                return (
                  <div key={i} className="space-y-3">
                    <div className="flex justify-end">
                      <p className="max-w-[85%] rounded-xl bg-ink px-4 py-2.5 text-sm text-surface">{run.question}</p>
                    </div>
                    <div
                      className={`rounded-xl border bg-surface px-4 py-3 sm:px-5 ${selected === i ? 'border-accent/50' : 'border-line'}`}
                      onClick={() => setSelected(i)}
                    >
                      {answer?.type === 'answer' ? (
                        <>
                          <Markdown text={answer.markdown} onOpenRecord={setRecord} unknownIds={answer.unknownIds} />
                          {document?.type === 'document' && (
                            <button type="button" onClick={() => setDoc(document)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-line bg-sunken px-4 py-3 text-left hover:border-accent">
                              <span>
                                <span className="block text-xs text-muted">Generated document</span>
                                <span className="text-sm font-medium">{document.title}</span>
                              </span>
                              <span className="text-sm text-accent">Open</span>
                            </button>
                          )}
                          {answer.citations.length > 0 && (
                            <div className="mt-3 border-t border-line pt-2.5">
                              <p className="mb-1.5 text-xs text-muted">Sources ({answer.citations.length})</p>
                              <div className="flex flex-wrap gap-1">
                                {answer.citations.map((c) => <CitationChip key={c.id} id={c.id} label={c.label} onClick={() => setRecord(c.id)} />)}
                              </div>
                            </div>
                          )}
                        </>
                      ) : run.status === 'error' ? (
                        <p className="text-sm text-bad">{run.events.filter((e) => e.type === 'error').map((e) => (e.type === 'error' ? e.message : '')).join(' ')}</p>
                      ) : (
                        <>
                          <p className="flex items-center gap-2 text-sm text-muted">
                            <span className="size-2 animate-pulse rounded-full bg-accent" /> {statusLine(run)}
                          </p>
                          {partial && <div className="mt-2"><Markdown text={partial} onOpenRecord={setRecord} /></div>}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={chatEnd} />
            </div>
          </div>

          <form
            className="border-t border-line bg-surface px-4 py-3 sm:px-6"
            onSubmit={(e) => { e.preventDefault(); void ask(input) }}
          >
            <div className="mx-auto flex max-w-3xl gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about parts, requirements, tests, NCRs or suppliers…"
                maxLength={1000}
                className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                {busy ? 'Running…' : 'Ask'}
              </button>
            </div>
          </form>
        </main>

        <aside className="min-h-0 overflow-y-auto border-t border-line bg-canvas lg:border-t-0 lg:border-l" aria-label="Agent trace">
          <TracePane run={runs[selected]} onOpenRecord={setRecord} />
        </aside>
      </div>

      {doc && <DocumentView title={doc.title} markdown={doc.markdown} onOpenRecord={setRecord} onClose={() => setDoc(null)} />}
      {record && <RecordDrawer id={record} onOpen={setRecord} onClose={() => setRecord(null)} />}
    </div>
  )
}
