'use client'

import { useRef, useState } from 'react'
import type { AgentEvent } from '@/lib/agent/events'

export interface Run {
  question: string
  events: AgentEvent[]
  /** Client receive time (ms since epoch) of each event, parallel to `events`. */
  stamps: number[]
  startedAt: number
  answerRaw: string
  status: 'running' | 'done' | 'error'
  /** Set when the run is a replay of a recorded live run, not a live model call. */
  recorded?: { recordedAt: string; originalMs: number; speedup: number }
}

/** A live run captured by scripts/record-flight.ts: every event with its offset from the start. */
export interface Recording { recordedAt: string; events: { ms: number; e: AgentEvent }[] }

/** Runs the agent over the NDJSON endpoint and keeps every run's event log. */
export function useAgentRuns() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selected, setSelected] = useState(0)
  const busy = runs.some((r) => r.status === 'running')
  const timers = useRef<number[]>([])

  /** Ask a typed question. */
  function ask(question: string) {
    if (!question.trim()) return Promise.resolve()
    return start({ question }, question)
  }

  /** Start a run with any request body the agent route accepts (e.g. a Flight Mode event). */
  async function start(body: Record<string, unknown>, label: string) {
    if (busy) return
    const question = label
    const index = runs.length
    setSelected(index)
    setRuns((rs) => [...rs, { question, events: [], stamps: [], startedAt: Date.now(), answerRaw: '', status: 'running' }])
    const update = (fn: (r: Run) => Run) => setRuns((rs) => rs.map((r, i) => (i === index ? fn(r) : r)))
    const fail = (message: string) =>
      update((r) => ({ ...r, status: 'error', events: [...r.events, { type: 'error', message }], stamps: [...r.stamps, Date.now()] }))
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        fail(err.error ?? `Request failed (${res.status})`)
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
        const now = Date.now()
        update((r) => {
          let { answerRaw, status } = r
          const events = [...r.events]
          const stamps = [...r.stamps]
          for (const e of parsed) {
            if (e.type === 'answer_delta') { answerRaw += e.text; continue }
            if (e.type === 'done') status = 'done'
            if (e.type === 'error') status = 'error'
            events.push(e)
            stamps.push(now)
          }
          return { ...r, events, stamps, answerRaw, status }
        })
      }
      update((r) => (r.status === 'running' ? { ...r, status: 'done' } : r))
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Network error')
    }
  }

  /**
   * Replay a recorded run on a compressed clock, so a presentation does not wait on the model.
   * Resolves when the last event has played.
   */
  function replay(rec: Recording, label: string, targetMs = 14_000) {
    if (busy) return Promise.resolve()
    const originalMs = rec.events.at(-1)?.ms ?? 0
    const speedup = Math.max(1, originalMs / targetMs)
    const index = runs.length
    const startedAt = Date.now()
    setSelected(index)
    setRuns((rs) => [...rs, { question: label, events: [], stamps: [], startedAt, answerRaw: '', status: 'running', recorded: { recordedAt: rec.recordedAt, originalMs, speedup } }])
    return new Promise<void>((resolve) => {
      for (const { ms, e } of rec.events) {
        timers.current.push(window.setTimeout(() => {
          setRuns((rs) => rs.map((r, i) => {
            if (i !== index) return r
            // Stamps keep the original timing, so the trace still shows how long the live run took.
            if (e.type === 'answer_delta') return { ...r, answerRaw: r.answerRaw + e.text }
            return { ...r, events: [...r.events, e], stamps: [...r.stamps, r.startedAt + ms], status: e.type === 'done' ? 'done' : e.type === 'error' ? 'error' : r.status }
          }))
        }, ms / speedup))
      }
      timers.current.push(window.setTimeout(() => {
        setRuns((rs) => rs.map((r, i) => (i === index && r.status === 'running' ? { ...r, status: 'done' } : r)))
        resolve()
      }, originalMs / speedup + 50))
    })
  }

  function reset() {
    // A replay still playing must not write into the next scenario's runs.
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
    setRuns([])
    setSelected(0)
  }

  return { runs, selected, setSelected, busy, ask, start, replay, reset }
}
