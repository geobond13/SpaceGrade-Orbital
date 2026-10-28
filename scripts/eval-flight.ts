// Runs each Flight Mode scenario headless: the FDIR event wakes the agent, and we
// check it cites the telemetry and the right build record and lands on the
// expected autonomy tier. Usage: npm run eval:flight   (or: npm run eval:flight -- conjunction)
import { runAgent } from '../src/lib/agent/loop'
import type { AgentEvent } from '../src/lib/agent/events'
import { flightBriefing, flightMode } from '../src/lib/agent/flight-mode'
import { detect } from '../src/lib/flight/fdir'
import type { Conditions, ScenarioId } from '../src/lib/flight/scenarios'
import type { Tier } from '../src/lib/flight/autonomy'

interface Case { name: string; scenario: ScenarioId; cond?: Conditions; mustCite: string[]; tier: Tier; action: string; also?: { action: string; tier: Tier } }

// The as-built cases, plus the conjunction with each condition changed: the same evidence path must land on a different tier.
const CASES: Case[] = [
  { name: 'valve-leak', scenario: 'valve-leak', mustCite: ['NCR-001', 'TM-PROP-03'], tier: 'gated', action: 'PROPULSION_PROCEDURE' },
  { name: 'conjunction', scenario: 'conjunction', mustCite: ['NCR-002', 'CDM-0412'], tier: 'auto', action: 'COLLISION_AVOIDANCE_BURN' },
  { name: 'eclipse-power', scenario: 'eclipse-power', mustCite: ['NCR-005', 'TM-PWR-02'], tier: 'auto', action: 'PAYLOAD_LOAD_SHED' },
  { name: 'tracker-dropout', scenario: 'tracker-dropout', mustCite: ['NCR-004', 'TM-ADCS-02'], tier: 'auto', action: 'BURN_RETIME', also: { action: 'ONBOARD_TABLE_UPDATE', tier: 'gated' } },
  { name: 'conjunction+reworked-heater', scenario: 'conjunction', cond: { heaterConforming: true }, mustCite: ['CDM-0412'], tier: 'gated', action: 'COLLISION_AVOIDANCE_BURN' },
  { name: 'conjunction+on-call', scenario: 'conjunction', cond: { operatorOnCall: true }, mustCite: ['NCR-002', 'CDM-0412'], tier: 'gated', action: 'COLLISION_AVOIDANCE_BURN' },
]

async function main() {
  const only = process.argv[2]
  let grand = 0
  let failures = 0
  for (const c of CASES.filter((x) => !only || x.name === only || x.scenario === only)) {
    const id = c.name
    const event = detect(c.scenario)[0]
    const events: AgentEvent[] = []
    console.log(`\n=== ${id}: ${event.id} ${event.summary}`)
    await runAgent(flightBriefing(event), (e) => {
      events.push(e)
      if (e.type === 'plan') console.log('plan:', e.steps.map((s) => s.tool).join(' → '))
      if (e.type === 'tool_call') console.log(`  call ${e.name} ${JSON.stringify(e.args)} [${e.model.split('/')[1]}]`)
      if (e.type === 'tool_result') console.log(`    → ${e.summary}`)
      if (e.type === 'decision') console.log(`  DECISION ${e.decision.kind}: ${e.decision.tier} (${e.decision.reason})`)
      if (e.type === 'notice') console.log('  notice:', e.message)
    }, undefined, flightMode(event, [], c.cond))
    const EXPECT = { [id]: c }
    const answer = events.find((e) => e.type === 'answer')
    const done = events.find((e) => e.type === 'done')
    const decision = events.filter((e) => e.type === 'decision').find((e) => e.type === 'decision' && e.decision.kind === EXPECT[id].action)
    if (answer?.type === 'answer') {
      console.log('\n' + answer.markdown)
      console.log('cited:', answer.citations.map((x) => x.id).join(', '))
      console.log('quantities:', answer.quantities?.checked, 'checked, unmatched:', answer.quantities?.unmatched.join(', ') || 'none')
      const problems = [
        ...(answer.unknownIds.length ? [`unknown ids: ${answer.unknownIds.join(', ')}`] : []),
        ...EXPECT[id].mustCite.filter((m) => !answer.citations.some((x) => x.id === m)).map((m) => `missing citation ${m}`),
        ...(() => {
          const also = EXPECT[id].also
          if (!also) return []
          const d = events.find((e) => e.type === 'decision' && e.decision.kind === also.action)
          return d?.type === 'decision' ? (d.decision.tier === also.tier ? [] : [`${also.action} tier ${d.decision.tier}, expected ${also.tier}`]) : [`no ${also.action} proposed`]
        })(),
        ...(decision?.type === 'decision' ? (decision.decision.tier === EXPECT[id].tier ? [] : [`tier ${decision.decision.tier}, expected ${EXPECT[id].tier}`]) : [`no ${EXPECT[id].action} proposed`]),
      ]
      if (problems.length) { failures++; console.log('PROBLEMS:', problems) } else console.log('checks: ok')
    } else { failures++; console.log('NO ANSWER', events.filter((e) => e.type === 'error')) }
    if (done?.type === 'done') {
      grand += done.totals.costUsd
      console.log(`totals: ${done.totals.promptTokens}+${done.totals.completionTokens} tok, ${done.totals.toolCalls} tool calls, ${(done.totals.ms / 1000).toFixed(1)} s, $${done.totals.costUsd.toFixed(4)}`)
    }
  }
  console.log(`\nAll cases: $${grand.toFixed(4)} estimated, ${failures} with problems`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
