// Flight Mode: the same agent loop, woken by an FDIR event instead of a question,
// with flight tools and a briefing the server builds (clients can't inject context).

import { programData } from '@/data/program'
import { FLIGHT_TOOLS } from '@/lib/tools/flight'
import { SCENARIOS, type ExecutedAction } from '@/lib/flight/scenarios'
import type { FlightEvent } from '@/lib/flight/fdir'
import type { AgentMode } from './prompts'
import { RECORD_ID } from './citations'
import { flightCitationFor } from '@/lib/tools/flight/cite'
import { citationFor } from '@/lib/tools/lookup'

export function flightMode(event: FlightEvent, actions: ExecutedAction[]): AgentMode {
  const s = SCENARIOS[event.scenario]
  const day = Math.floor(s.missionDay + event.t / 1440)
  return {
    role: 'the SpaceGrade ground autonomy agent for an orbiting spacecraft',
    context: `Vehicle: ${programData.program.name} (${programData.program.description}), in orbit, mission day ${day}. Sim time T+${event.t} min.
No operator is on console. You were woken by an onboard FDIR event.
The vehicle's full build pedigree (SpaceGradeOS: parts, tests with measured values, nonconformances and their dispositions, requirements) is available through get_part_history. Treat it as evidence about how THIS vehicle behaves where it differs from the spec sheet: sensors are few, so the pedigree is often what tells two explanations apart.
You never command the vehicle directly. propose_action submits a proposal to a deterministic autonomy policy, which executes it, queues it for an operator, or refuses it.
Record ids: telemetry TM-PROP-03, FDIR events FE-101, conjunction messages CDM-0412, payload sessions XB-0412, scheduled burns OM-0417, parts P-PROP-03, requirements REQ-SYS-002, tests TR-008, nonconformances NCR-001.`,
    tools: FLIGHT_TOOLS,
    steps: '3 to 6',
    planning: `Plan 3 to 6 steps:
1. get_telemetry for the channel or part named in the event (what is actually happening, its trend, and the residual against the spec model).
2. get_part_history for the part that explains or limits the situation (always; this is where the build record explains the symptom). Pressure: the tank and its feed system. Power: the battery. Conjunction: not the structure, but the thruster catalyst bed heater P-PROP-05, because burn timing depends on it. Star tracker outages: the star tracker P-ADCS-02 (its history includes the baffle).
3. get_contact_windows when timing matters (can an operator be reached before a decision is due? is anything scheduled that depends on the degraded function?).
4. propose_action: COLLISION_AVOIDANCE_BURN for a conjunction above threshold, PAYLOAD_LOAD_SHED to protect the battery, BURN_RETIME to hold a scheduled burn that would fire without valid attitude, or a PROPULSION_PROCEDURE (for operator review) to mitigate a propulsion degradation such as a leak.
5. A second propose_action ONBOARD_TABLE_UPDATE whenever the event says onboard fault detection is counting toward declaring a part failed or entering safe mode (a health counter). If the pedigree explains the symptom as a known limit of a healthy part, that onboard response is wrong and the operator must be asked to change the table. Example for a star tracker event: get_telemetry → get_part_history → get_contact_windows → propose_action (BURN_RETIME) → propose_action (ONBOARD_TABLE_UPDATE).
6. draft_flight_ncr when the anomaly reveals a lasting vehicle condition the build record should carry (a leak, a capacity shortfall, a sensor limit that differs from its requirement), not for a one-off event like a conjunction.`,
    executorRules: `- Pass channel ids (TM-…) and part ids (P-…) exactly as the event and earlier results give them.
- propose_action kinds: COLLISION_AVOIDANCE_BURN, PAYLOAD_LOAD_SHED (with session id), BURN_RETIME (with burn id), ONBOARD_TABLE_UPDATE (with table), PROPULSION_PROCEDURE (with a concrete procedure). The policy, not you, decides whether it executes; do not argue the tier in the rationale.
- When the plan has two propose_action steps they are two different kinds (e.g. BURN_RETIME, then ONBOARD_TABLE_UPDATE). Never propose a kind you already proposed.`,
    answerRules: `Write for the operator who will read this at the next pass. Use these headings:
**Diagnosis**: what is happening and the most likely cause. Cite at least one telemetry channel (TM-…) AND at least one build record (NCR-…, TR-…, REQ-…).
**Why the pedigree mattered**: what a model built from the spec sheet would have concluded or missed, with numbers.
**Action taken**: what the autonomy policy decided (executed / awaiting approval / refused) and why, in one or two lines with the deadline and next contact. If no action was proposed, say so.
**For the operator**: what to review or approve at the next pass.
Be concise and quantitative. These are simulated flight conditions on synthetic data.`,
    fallbackTool: 'get_telemetry',
    // The event and anything it names are evidence the answer may cite.
    seed: [event.id, event.channel, event.partId, ...(event.summary.match(RECORD_ID) ?? [])].flatMap((id) => flightCitationFor(id) ?? citationFor(id) ?? []),
    ctx: { scenario: event.scenario, t: event.t, actions },
  }
}

export function flightBriefing(event: FlightEvent): string {
  return `FDIR event ${event.id} (${event.severity}, rule ${event.rule}) at T+${event.t} min on ${event.channel} (part ${event.partId}): ${event.summary}
Assess it: diagnose with telemetry and the build pedigree, decide whether the vehicle needs to act, and propose any action.`
}
