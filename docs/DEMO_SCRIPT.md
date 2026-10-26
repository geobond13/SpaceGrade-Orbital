# Demo script (3 minutes)

Open https://spacegrade-agent.vercel.app full screen in Chrome (voice needs Chrome, Edge or Safari, and microphone permission granted beforehand). Layout: readiness board and verification matrix on the left, the 3D twin in the middle with the answer below it, telemetry on the right. Each query takes 15–55 s live. While it runs, talk over the twin and the telemetry; that is the point of them.

## 0:00–0:20 · Setup

> "Hardware teams lose weeks chasing status across spreadsheets, test reports and NCR logs. This is SpaceGrade Agent: a mission-control console for a synthetic smallsat, KESTREL-1. The twin is coloured from the records: teal is verified, red pulsing is blocked by a nonconformance. Nemotron Super plans and writes, Nemotron Nano routes tool calls, all on Nebius Token Factory. Every claim has to cite a record."

Let the twin auto-rotate for a beat. Point at the red propulsion bay and at **PROP 62%** with NCR-001 and NCR-002 on the board.

## 0:20–1:05 · Query 1: the agent follows the thread

Click **Propulsion blockers**.

- A scan ring sweeps the whole spacecraft while Super plans. The **Flight plan** appears on the right.
- When `list_nonconformances` fires, the camera **flies to the propulsion bay**. Point at the tool call card: arguments, model tag (Nano or Super), the T+ timestamp. If a yellow notice appears (*"Nano returned no tool call; Super takes step 2"*), call it out: the loop forces the planned tool, so a step is never skipped.
- Matrix cells the agent read get an accent ring as results arrive.
- The answer: NCR-001 (valve seat leak, 3.2e-4 vs 1.0e-4 scc/s) and NCR-002 (catalyst bed heater). The camera frames exactly the cited valve and heater, with labels. Click **NCR-001**: the drawer opens and the twin zooms to the valve.

> "Every id is a link to the record it came from, and every record is a place on the spacecraft."

## 1:05–1:45 · Query 2: a what-if (by voice)

Click the **mic** and say: *"What if NCR-001 is dispositioned and the valve seat leak retest passes? How does propulsion readiness change?"* (Or click **What-if: fix the valve**.)

- Trace: the agent looks up the NCR, then calls `simulate_change`.
- The **What-if** panel opens on the twin, tagged *from agent*. The valve **flashes** as it changes state, PROP goes **62 → 69%** on the board, blocking NCRs drop 3 → 2, and the matrix cell for REQ-PROP-020 turns teal.
- The answer is labelled as a what-if and names what still blocks: NCR-002 and the battery NCR-005.
- Untick NCR-001 and tick **NCR-002** by hand to show it's interactive: the heater flashes, numbers move again. **Reset**.

## 1:45–2:40 · Query 3: a generated document

Click **Valve trade study**.

- Trace: `compare_suppliers` checks both quotes against six measurable valve requirements, then `draft_document`. If Nano tries to draft too early, the guardrail line shows it being refused until the comparison has run.
- Open the **generated document**. The compliance matrix shows Corvid does not meet the 8 W pull-in power limit, and the commercial table covers price, NRE, lead time and on-time delivery. Halden's open NCR-001 is listed under risks.
- The executive summary and recommendation are written by Nemotron Super and cited; everything else is rendered from data. Click **Download .md**.

## 2:40–3:00 · Close

Click **Explode** on the twin so the assemblies separate. Scroll the telemetry to **Run totals**: tokens, tool calls, wall time, cost (well under a cent). The header shows the session total.

> "Two Nemotron models with clear jobs, every call through Token Factory, every claim traceable to a record and a place on the spacecraft. Code is MIT on GitHub."
