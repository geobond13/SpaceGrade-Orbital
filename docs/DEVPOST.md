# Devpost text

## Tagline

A spacecraft's build record, in the loop: a ground autonomy agent on NVIDIA Nemotron that decides what this particular vehicle can safely do in orbit.

## Description

Spacecraft fly with defects that were accepted before launch: a heater that warms slowly, a battery lot a little under capacity, a baffle with thin coating. The review board signs a deviation and the vehicle ships. That knowledge lives in the build record. It rarely reaches the people, procedures and software that operate the vehicle.

SpaceGrade Flight Ops puts it in the loop. When onboard fault detection fires and nobody is on console, a ground autonomy agent wakes up. NVIDIA Nemotron 3 Super plans the investigation and Nemotron 3 Nano routes each step to a tool: telemetry, the part's build record (tests, defects, and how each was signed off for flight), and the operator schedule. The agent then proposes an action. A deterministic policy, not the model, decides whether it runs now, waits for an operator, or is refused. The rule is simple: act alone only when no human can be reached before the deadline. All model calls run on Nebius Token Factory.

The hero case: debris passes in two hours, and avoiding it takes a thruster burn after a preheat. On the spec sheet the preheat is 30 minutes, so the operator arriving at T+38 can decide. This vehicle's heater was accepted at 52 ohms, so the preheat takes 43 minutes, the deadline moves to T+32, and nobody can decide in time. The policy authorises the burn, and the console shows the preheat, the burn and the new miss distance as they happen. Change one condition (rework the heater, or put an on-call operator on shift) and the same evidence leads to "wait for the human". You can play that operator.

We built it to be trusted. The decision card is rendered from the policy's own record, never from model text. The agent's rationale is shown separately, flagged when the policy overrode it. Every cited record must come from a tool, and every number in the assessment is checked against tool output. Each action shows its real stage (authorised, preheating, burned, verified) from mission time. Three more scenarios (a slow leak, weak battery cells, a blinded star tracker) follow the same pattern, and every anomaly can go back to the build record as a flight NCR.

A build-phase console (Mission Control at /mission) answers engineering questions over the same records with a 3D twin. A typical flight run costs under one cent. All data is synthetic and the code is MIT-licensed.

## Feedback on Nebius Token Factory and Nemotron

**What worked:**
- Token Factory was a true drop-in. We pointed the standard `openai` SDK at the base URL and changed nothing else.
- `/v1/models`, native tool calling, named `tool_choice`, streaming with `include_usage`, and the separate `reasoning_content` field all worked as documented.
- Prices are low enough that our six-case flight eval costs about $0.04.
- Nemotron 3 Super was a reliable planner and a careful writer: it stayed inside the tool results, and with a forced `tool_choice` it filled arguments correctly in about 2 s.

**What was harder:**
- Model ids are inconsistently cased (`nvidia/nemotron-3-super-120b-a12b` vs `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`), so our first guessed id returned 404 until we listed the models.
- Nemotron 3 Nano only called tools reliably with reasoning on, and then spent 400–3,000 tokens and 2–17 s per routing turn. Truncated turns sometimes carried empty arguments, and once Nano shortened an enum value (`"COL"` for `COLLISION_AVOIDANCE_BURN`). The loop now treats rejected calls as not done, retries, and falls back to Super with a named `tool_choice`.
- Free-text rationales sometimes argued the wrong timing, which is why the deterministic policy, not the model, owns the decision and the screen says so.
- Both models sometimes typeset record ids with Unicode hyphens or wrote LaTeX, so we normalize answers before checking them.
- A documented low-latency, non-reasoning tool-calling mode for Nano would make it the ideal router.
