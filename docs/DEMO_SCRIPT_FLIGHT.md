# Flight Mode demo (2 minutes, product vision)

Open `/flight` full screen. Telemetry is on the left, the 3D twin and the operations timeline are in the middle with the agent's decision below, and the trace is on the right. Each agent run takes 20–40 s; sim time holds while it reasons.

## 0:00–0:20 · The problem

> "Spacecraft are short on sensors: every sensor costs money, mass and power. So when something drifts in orbit, the telemetry usually fits two or three explanations. Engineers break the tie with the vehicle's history. SpaceGradeOS holds that history: every test, every nonconformance, every disposition. Flight Mode puts it in the loop, at 3 a.m., with nobody on console."

## 0:20–1:10 · Conjunction, nobody on console (the hero)

Click **Run scenario** (Conjunction is the default).

- At T+2 the onboard fault detection fires FE-201: debris, Pc 2.1e-4, closest approach in 118 min. The banner turns red: *no operator on console*. The timeline hatches a **36-minute gap** before the next pass.
- The agent reads the conjunction telemetry, then goes to the **catalyst bed heater's pedigree** (the camera flies to it), because burn timing depends on it.
- The **decision card**: preheat takes **43 min as-built** (NCR-002, a 52 Ω heater) instead of 30. That moves the decision deadline to **T+32, before the T+38 pass**. With the spec sheet, a human would have had time; with the real vehicle, they don't. **Executed autonomously**, and every envelope check is shown.

> "The model didn't decide to burn. It proposed. A deterministic policy checked the envelope and the deadline and executed, because no human could be reached in time. The build record is what made that call correct."

- Let it play: the heater warms on the twin (cyan) and its telemetry lags the dashed spec curve. At the burn, the **miss distance jumps from 180 m to 1.2 km**.

## 1:10–1:40 · Slow pressure loss (diagnosis)

Click **Slow pressure loss** and **Run scenario**.

- Seven days of telemetry: the raw pressure swings with every orbit, and the temperature-compensated channel shows the slow decline.
- The agent infers a helium leak of **3.2e-4 scc/s, the same rate the qualification unit's valve leaked in NCR-001**. On the twin the tank is the symptom (orange) and the valve is the cause (red).
- It projects that the leak strands propellant and breaks REQ-SYS-002 around mission day 710. Propulsion procedures need a human, so the card says **Awaiting operator approval**: click **Approve**.
- **Back to the build record**: open the drafted flight NCR. The anomaly flows back into SpaceGradeOS.

## 1:40–2:00 · Eclipse power (optional) and close

The weak cell lot (NCR-005) means the next eclipse with an X-band downlink would hit 20.4% depth of discharge against a 20% limit, while the onboard model says 19.6%. The payload session is shed autonomously.

> "Same agent, same citations, now in orbit. Today it runs as an always-on ground agent. Next, it compiles what it learns into onboard tables tuned to the as-built vehicle."
