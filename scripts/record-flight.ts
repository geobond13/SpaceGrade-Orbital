// Records one live agent run per Flight Mode scenario into public/recordings/<name>.json,
// for the "Recorded run" replay in the UI. Name = scenario plus changed conditions.
// Usage: npm run record:flight   (or: npm run record:flight -- conjunction [operatorOnCall ...])
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgent } from '../src/lib/agent/loop'
import type { AgentEvent } from '../src/lib/agent/events'
import { flightBriefing, flightMode } from '../src/lib/agent/flight-mode'
import { detect } from '../src/lib/flight/fdir'
import { parseConditions, recordingName, SCENARIO_IDS, type ScenarioId } from '../src/lib/flight/scenarios'

async function main() {
  const only = process.argv[2] as ScenarioId | undefined
  mkdirSync('public/recordings', { recursive: true })
  for (const id of SCENARIO_IDS.filter((s) => !only || s === only)) {
    const event = detect(id)[0]
    const cond = parseConditions(id, Object.fromEntries(process.argv.slice(3).map((k) => [k, true])))
    const name = recordingName(id, cond)
    const t0 = Date.now()
    const events: { ms: number; e: AgentEvent }[] = []
    await runAgent(flightBriefing(event), (e) => { events.push({ ms: Date.now() - t0, e }) }, undefined, flightMode(event, [], cond))
    const answer = events.find((x) => x.e.type === 'answer')?.e
    const decisions = events.flatMap((x) => (x.e.type === 'decision' ? [`${x.e.decision.kind}:${x.e.decision.tier}`] : []))
    if (answer?.type !== 'answer') { console.error(`${name}: no answer, not saved`); continue }
    writeFileSync(`public/recordings/${name}.json`, JSON.stringify({ recordedAt: new Date().toISOString(), events }))
    console.log(`${name}: ${(events.at(-1)!.ms / 1000).toFixed(1)} s, ${decisions.join(', ')}, unknown ids ${answer.unknownIds.length}, quantities unmatched ${answer.quantities?.unmatched.join(', ') || 'none'}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
