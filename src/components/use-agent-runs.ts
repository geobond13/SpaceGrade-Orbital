'use client'

import { useState } from 'react'
import type { AgentEvent } from '@/lib/agent/events'

export interface Run {
  question: string
  events: AgentEvent[]
  /** Client receive time (ms since epoch) of each event, parallel to `events`. */
  stamps: number[]
  startedAt: number
  answerRaw: string
  status: 'running' | 'done' | 'error'
}

/** Runs the agent over the NDJSON endpoint and keeps every run's event log. */
export function useAgentRuns() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selected, setSelected] = useState(0)
  const busy = runs.some((r) => r.status === 'running')

  async function ask(question: string) {
    if (!question.trim() || busy) return
    const index = runs.length
    setSelected(index)
    setRuns((rs) => [...rs, { question, events: [], stamps: [], startedAt: Date.now(), answerRaw: '', status: 'running' }])
    const update = (fn: (r: Run) => Run) => setRuns((rs) => rs.map((r, i) => (i === index ? fn(r) : r)))
    const fail = (message: string) =>
      update((r) => ({ ...r, status: 'error', events: [...r.events, { type: 'error', message }], stamps: [...r.stamps, Date.now()] }))
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
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

  return { runs, selected, setSelected, busy, ask }
}
