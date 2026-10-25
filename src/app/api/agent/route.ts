import { agentConfig } from '../../../../agent.config'
import { runAgent } from '@/lib/agent/loop'
import type { AgentEvent } from '@/lib/agent/events'

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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
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
        }, req.signal)
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
