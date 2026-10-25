// Token Factory smoke test: lists Nemotron models, runs one completion on each
// role, and one tool call on the router. Usage: npx tsx --env-file=.env.local scripts/smoke.ts
import { nebius, modelFor, costUsd } from '../src/lib/nebius'
import type { ModelRole } from '../agent.config'

async function main() {
  const ai = nebius()
  const models = await ai.models.list()
  const ids = models.data.map((m) => m.id)
  const nemotron = ids.filter((id) => /nemotron/i.test(id))
  console.log('Nemotron models on Token Factory:\n ', nemotron.join('\n  ') || '(none)')

  for (const role of ['planner', 'router'] as ModelRole[]) {
    const model = modelFor(role)
    if (!ids.includes(model)) console.warn(`!! ${role} model "${model}" is not in the model list`)
    const t0 = Date.now()
    const res = await ai.chat.completions.create({
      model,
      max_tokens: 200,
      messages: [{ role: 'user', content: 'In one sentence: what is a nonconformance report in aerospace QA?' }],
    })
    const u = res.usage
    console.log(`\n[${role}] ${model} ${Date.now() - t0}ms`, u, `$${costUsd(role, u?.prompt_tokens ?? 0, u?.completion_tokens ?? 0).toFixed(6)}`)
    console.log(' ', res.choices[0]?.message?.content?.slice(0, 300))
  }

  const res = await ai.chat.completions.create({
    model: modelFor('router'),
    max_tokens: 300,
    tools: [{
      type: 'function',
      function: {
        name: 'list_nonconformances',
        description: 'List nonconformance reports, optionally filtered by assembly and status.',
        parameters: {
          type: 'object',
          properties: { assembly: { type: 'string' }, status: { type: 'string', enum: ['open', 'closed', 'any'] } },
        },
      },
    }],
    messages: [{ role: 'user', content: 'Which propulsion parts have open NCRs?' }],
  })
  console.log('\n[router tool call]', JSON.stringify(res.choices[0]?.message?.tool_calls, null, 1), res.usage)
}

main().catch((e) => { console.error(e); process.exit(1) })
