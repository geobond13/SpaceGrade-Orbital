// Flight Mode: the same agent loop, woken by an FDIR event instead of a question,
// with flight tools and a briefing the server builds (clients can't inject context).

import { programData } from '@/data/program'
import { FLIGHT_TOOLS } from '@/lib/tools/flight'
import { COMMAND_PATH, scenarioWith, type Conditions, type ExecutedAction } from '@/lib/flight/scenarios'
import type { FlightEvent } from '@/lib/flight/fdir'
import type { AgentMode } from './prompts'
import { RECORD_ID } from './citations'
import { flightCitationFor } from '@/lib/tools/flight/cite'
import { citationFor } from '@/lib/tools/lookup'

export const FLIGHT_TOOL_LABELS: Record<string, string> = {
  get_telemetry: 'telemetry',
  get_part_history: 'the build record',
  get_contact_windows: 'the contact schedule',
  propose_action: 'the autonomy policy',
  draft_flight_ncr: 'the flight NCR draft',
}

export function flightMode(event: FlightEvent, actions: ExecutedAction[], cond: Conditions = {}): AgentMode {
  const s = scenarioWith(event.scenario, cond)
  const day = Math.floor(s.missionDay + event.t / 1440)
  return {
    role: 'the SpaceGrade ground autonomy agent for an orbiting spacecraft',
    context: `Vehicle: ${programData.program.name} (${programData.program.description}), in orbit, mission day ${day}. Sim time T+${event.t} min.
No operator is on console (lights-out operations). Commands still reach the vehicle: ${COMMAND_PATH.label}, ${COMMAND_PATH.detail}. What is missing is a human to decide, not the link.
You were woken by an onboard FDIR event. FDIR has already detected the symptom; your job is diagnosis (which cause), prognosis (what happens next) and choosing an action.
The vehicle's build pedigree (SpaceGradeOS: parts, tests with measured values, nonconformances) is available through get_part_history. Records are as of qualification; each NCR also carries asFlown, the disposition the vehicle launched with. Treat the pedigree as evidence about how THIS vehicle behaves where it differs from its spec sheet: sensors are few, so the pedigree is often what tells two explanations apart.
The vehicle is in orbit. Hardware cannot be repaired, replaced or reworked. Corrective actions now are operational (timing, loads, onboard tables, procedures); hardware fixes belong to the next build, recorded through a flight NCR.
You never command the vehicle directly. propose_action submits a proposal to a deterministic autonomy policy, which authorises it, queues it for an operator, or refuses it. The policy computes deadlines and operator reachability itself.
Record id formats: telemetry TM-XXXX-01, FDIR events FE-101, conjunction messages CDM-0412, payload sessions XB-0412, scheduled burns OM-0417, parts P-XXXX-01, requirements REQ-XXX-001, tests TR-001, nonconformances NCR-001.`,
    tools: FLIGHT_TOOLS,
    toolLabels: FLIGHT_TOOL_LABELS,
    steps: '3 to 6',
    planning: `Plan 3 to 6 steps:
1. get_telemetry for the channel or part named in the event (what is actually happening, its trend, and the residual against the spec model).
2. get_part_history for the part that explains or limits the situation (always; this is where the build record explains the symptom). Pressure: the tank P-PROP-02 (its history includes the feed system valves). Power: the battery P-PWR-02. Conjunction: the thruster catalyst bed heater P-PROP-05, because an avoidance burn cannot fire until the bed is preheated, so the heater sets the timing (not the structure, not the valve). Star tracker outages: the star tracker P-ADCS-02 (its history includes the baffle).
3. get_contact_windows when timing matters (can an operator be reached before a decision is due? is anything scheduled that depends on the degraded function?).
4. propose_action: COLLISION_AVOIDANCE_BURN for a conjunction above threshold, PAYLOAD_LOAD_SHED to protect the battery, BURN_RETIME to hold a scheduled burn that would fire without valid attitude, or a PROPULSION_PROCEDURE (for operator review) to mitigate a propulsion degradation such as a leak.
5. A second propose_action ONBOARD_TABLE_UPDATE whenever the event says onboard fault detection is counting toward declaring a part failed or entering safe mode (a health counter). If the pedigree explains the symptom as a known limit of a healthy part, that onboard response is wrong and the operator must be asked to change the table. Example for a star tracker event: get_telemetry → get_part_history → get_contact_windows → propose_action (BURN_RETIME) → propose_action (ONBOARD_TABLE_UPDATE).
6. draft_flight_ncr when the anomaly reveals a lasting vehicle condition the build record should carry (a leak, a capacity shortfall, a sensor limit that differs from its requirement), not for a one-off event like a conjunction.`,
    executorRules: `- Pass channel ids (TM-…) and part ids (P-…) exactly as the event and earlier results give them.
- propose_action kinds, spelled in full: COLLISION_AVOIDANCE_BURN, PAYLOAD_LOAD_SHED (with session id), BURN_RETIME (with burn id), ONBOARD_TABLE_UPDATE (with table), PROPULSION_PROCEDURE (with a concrete procedure). If a tool returns an error, fix the arguments and call it again. The rationale states the technical reason with record ids only; never predict the tier, deadline or whether an operator is reachable, because the policy computes those.
- When the plan has two propose_action steps they are two different kinds (e.g. BURN_RETIME, then ONBOARD_TABLE_UPDATE). Never propose a kind you already proposed.`,
    answerRules: `Write for the operator who will read this at the next pass. The console already shows the policy decision, its deadline and its live status from the decision record, so do not write an action section and do not restate the tier.
Use exactly these headings:
**Diagnosis**: what is happening and the most likely cause. Cite at least one telemetry channel (TM-…) AND at least one build record (NCR-…, TR-…, REQ-…), and say how the NCR was dispositioned for flight (asFlown).
**Why the build record mattered**: FDIR already caught the symptom; say what the record changed about the diagnosis, the prognosis or the action, against what the spec-sheet model implies. Quantitative.
**For the operator**: two short lists. "At the next pass (<station>, T+…)" for decisions and checks an operator can do during that contact. "Afterwards" for verification that happens later, each with its time. Operational steps only for this vehicle; put hardware changes under "next build".
Rules for numbers: copy deadlines, contact times and statuses exactly from the propose_action and get_contact_windows results. Where a result gives a "statement", reuse its wording: "remaining" and "lost" are different quantities. Say "authorised" for autonomous actions, not "executed": the effect (preheat, burn) follows over time.
Be concise. These are simulated flight conditions on synthetic data.`,
    fallbackTool: 'get_telemetry',
    // The event and anything it names are evidence the answer may cite.
    seed: [event.id, event.channel, event.partId, ...(event.summary.match(RECORD_ID) ?? [])].flatMap((id) => flightCitationFor(id) ?? citationFor(id) ?? []),
    ctx: { scenario: event.scenario, t: event.t, actions, cond },
  }
}

export function flightBriefing(event: FlightEvent): string {
  return `FDIR event ${event.id} (${event.severity}, rule ${event.rule}) at T+${event.t} min on ${event.channel} (part ${event.partId}): ${event.summary}
Assess it: diagnose with telemetry and the build pedigree, decide whether the vehicle needs to act, and propose any action.`
}
