# Demo video script (under 3 minutes)

One decision advantage, shown three ways: as built, with one condition changed, and with a human in the loop. Record at 1920×1080 in Chrome. Use **Live agent** for the first run, so the video shows a real Nemotron call, and **Recorded run** if you need to retake.

## 0:00–0:20 · The claim

Open https://spacegrade-agent.vercel.app (Conjunction, nobody on console).

> "Spacecraft fly with defects that were accepted before launch. The paperwork says so, but the paperwork never reaches operations. SpaceGrade puts a spacecraft's build record into the loop of a ground autonomy agent, running on NVIDIA Nemotron through Nebius."

Point at the three numbered lines in the intro: fault detection is fixed rules; the agent reads telemetry and the build record; a deterministic policy, not the model, decides.

## 0:20–1:15 · Conjunction, as built (the hero)

Press **Run scenario**. FE-201 fires at T+2: debris, closest approach in 118 min. The red banner says nobody is on console and the relay link is up.

While the agent works (right panel), say:
> "Nemotron Super plans, Nano routes each tool call. It reads the collision telemetry, then the thruster's build record, then who is on shift."

When the decision card appears, stay on the timing chart:
> "On the spec sheet the heater warms the thrusters in 30 minutes, so the latest time to start is T+45, after the operator arrives at T+38. Fine, wait for the human. But this vehicle's heater is 52 ohms. NCR-002, accepted for flight. It takes 43 minutes, so the deadline is T+32, six minutes before anyone is on console. The policy authorises the burn."

Click the red **Cause in the build record** box on the twin to open NCR-002 and show the **As flown** section: use-as-is under deviation, and "reached operations: no".

Back on the card, point at the lifecycle: authorised, preheat commanded, **bed at 315 °C · now**.
> "Authorised isn't done. The bed is still heating; the burn fires at T+45."

Switch to 1 h/s and let it pass T+47: the miss distance goes from 180 m to about 1.2 km and the last step reads "Miss distance checked".

## 1:15–1:55 · Change one condition

Click the scenario button again (resets). Tick **On-call operator at T+20**. Run.
> "Same evidence, but now a human can be reached before the deadline."

The card says **Waiting for an operator**: "An operator is on console 12 min before it is due." Playback stops at T+20 with "You are the operator". Click **Approve at T+20**. Preheat starts at T+20, from your decision.

(Alternative: tick **Heater reworked before launch**: deadline back to T+45, so the T+38 operator decides.)

## 1:55–2:35 · Trust

Scroll to the agent assessment.
> "The model writes the assessment, but it doesn't get to state the decision. The card above is the policy's own record. Every cited record must come from a tool, every number must match tool output, and when the agent's rationale disagrees with the policy, the card says the policy overrode it."

Point at the two check lines under the evidence chips and open **Policy checks and the agent's rationale**.

## 2:35–2:55 · Close

Click **Blinded star tracker** (or show it recorded): the burn is held autonomously, and an onboard table change waits for the operator.
> "Act alone only when nobody can decide in time, and never on the vehicle's own rules. Every flight anomaly goes back to the build record as a flight NCR. A build record that flies with the spacecraft."
