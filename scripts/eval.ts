// Runs the three demo queries headless against Token Factory and checks the
// answers. Usage: npm run eval   (or: npm run eval -- 2   to run only query 2)
import { runAgent } from '../src/lib/agent/loop'
import type { AgentEvent } from '../src/lib/agent/events'
import { DEMO_QUERIES } from '../src/lib/demo-queries'

async function main() {
  const only = Number(process.argv[2])
  const queries = DEMO_QUERIES.map((q, i) => ({ ...q, n: i + 1 })).filter((q) => !only || q.n === only)
  let grand = 0
  let failures = 0
  for (const q of queries) {
    const events: AgentEvent[] = []
    console.log(`\n=== Q${q.n}: ${q.question}`)
    await runAgent(q.question, (e) => {
      events.push(e)
      if (e.type === 'plan') console.log('plan:', e.steps.map((s) => s.tool).join(' → '))
      if (e.type === 'tool_call') console.log(`  call ${e.name} ${JSON.stringify(e.args)} [${e.model.split('/')[1]}]`)
      if (e.type === 'tool_result') console.log(`    → ${e.summary}`)
      if (e.type === 'notice') console.log('  notice:', e.message)
      if (e.type === 'usage') console.log(`  ${e.usage.label}: ${e.usage.promptTokens}+${e.usage.completionTokens} tok, ${e.usage.ms} ms`)
    })
    const answer = events.find((e) => e.type === 'answer')
    const done = events.find((e) => e.type === 'done')
    const doc = events.filter((e) => e.type === 'document').at(-1)
    if (answer?.type === 'answer') {
      console.log('\n' + answer.markdown)
      console.log('cited:', answer.citations.map((c) => c.id).join(', '))
      const problems = [
        ...(answer.unknownIds.length ? [`uncited/unknown ids: ${answer.unknownIds.join(', ')}`] : []),
        ...q.mustCite.filter((id) => !answer.citations.some((c) => c.id === id)).map((id) => `missing expected citation ${id}`),
        ...(q.expectDocument && !(doc?.type === 'document' && !doc.markdown.includes('{{'))) ? ['document missing or narrative unfilled'] : [],
      ]
      if (problems.length) { failures++; console.log('PROBLEMS:', problems) } else console.log('checks: ok')
    } else { failures++; console.log('NO ANSWER', events.filter((e) => e.type === 'error')) }
    if (doc?.type === 'document' && process.env.SHOW_DOC) console.log('\n' + doc.markdown)
    if (done?.type === 'done') {
      grand += done.totals.costUsd
      console.log(`totals: ${done.totals.promptTokens}+${done.totals.completionTokens} tok, ${done.totals.toolCalls} tool calls, ${(done.totals.ms / 1000).toFixed(1)} s, $${done.totals.costUsd.toFixed(4)}`)
    }
  }
  console.log(`\nAll queries: $${grand.toFixed(4)} estimated, ${failures} with problems`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
