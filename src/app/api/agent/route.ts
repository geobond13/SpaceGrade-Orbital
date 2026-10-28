import { agentConfig } from '../../../../agent.config'
import { runAgent } from '@/lib/agent/loop'
import type { AgentEvent } from '@/lib/agent/events'
import type { AgentMode } from '@/lib/agent/prompts'
import { flightBriefing, flightMode } from '@/lib/agent/flight-mode'
import { detect } from '@/lib/flight/fdir'
import { ACTION_CLASSES } from '@/lib/flight/autonomy'
import { isScenarioId, parseConditions, type ExecutedAction } from '@/lib/flight/scenarios'

export const maxDuration = 300

// Best-effort per-instance limiter; enough to stop a public demo being drained.
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const hourAgo = Date.now() - 3_600_000
  const recent = (hits.get(ip) ?? []).filter((t) => t > hourAgo)
  if (recent.length >= agentConfig.caps.runsPerIpPerHour) return true
  hits.set(ip, [...recent, Date.now()])
  return false
}

const ACTION_KINDS = new Set(Object.keys(ACTION_CLASSES))

/** Executed actions the client reports; only the shape is trusted, never free text into the prompt. */
function parseActions(raw: unknown): ExecutedAction[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).flatMap((a) => {
    const x = a as { kind?: unknown; t?: unknown; params?: unknown }
    if (typeof x.kind !== 'string' || !ACTION_KINDS.has(x.kind) || typeof x.t !== 'number' || !Number.isFinite(x.t)) return []
    const session = (x.params as { session?: unknown } | undefined)?.session
    return [{ kind: x.kind as ExecutedAction['kind'], t: x.t, params: typeof session === 'string' ? { session: session.slice(0, 20) } : {} }]
  })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown; flight?: { scenario?: unknown; eventId?: unknown; actions?: unknown; conditions?: unknown } } | null
  let question = typeof body?.question === 'string' ? body.question.trim() : ''
  let mode: AgentMode | undefined
  if (body?.flight) {
    // Flight runs are woken by an FDIR event; the server builds the briefing from its own sim.
    const { scenario, eventId } = body.flight
    const event = isScenarioId(scenario) ? detect(scenario).find((e) => e.id === eventId) : undefined
    if (!event) return Response.json({ error: 'unknown flight scenario or event' }, { status: 400 })
    question = flightBriefing(event)
    mode = flightMode(event, parseActions(body.flight.actions), parseConditions(event.scenario, body.flight.conditions))
  }
  if (!question || question.length > 1000) return Response.json({ error: 'question must be 1 to 1000 characters' }, { status: 400 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (limited(ip)) return Response.json({ error: `Demo limit: ${agentConfig.caps.runsPerIpPerHour} runs per hour. Try again later.` }, { status: 429 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(e) + '\n')) } catch { /* client gone */ }
      }
      const started = Date.now()
      try {
        await runAgent(question, (e) => {
          if (e.type === 'done') console.log(JSON.stringify({ event: 'agent_run', question: question.slice(0, 120), ...e.totals, wallMs: Date.now() - started }))
          emit(e)
        }, req.signal, mode)
      } catch (err) {
        console.error('agent run failed', err)
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Agent run failed' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
