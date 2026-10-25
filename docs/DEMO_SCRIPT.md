# Demo script (3 minutes)

Open https://spacegrade-agent.vercel.app with the browser at full width, so the chat is on the left and the trace on the right. Each query takes 20–55 s live. While it runs, talk over the trace; that is the point of it.

## 0:00–0:25 · Setup

> "Hardware teams lose weeks chasing status across spreadsheets, test reports and NCR logs. This is SpaceGrade Agent. It runs on NVIDIA Nemotron through Nebius Token Factory, over a synthetic smallsat program: 50 parts, 36 requirements, 61 test records, 5 nonconformances. Super plans and writes; Nano routes tool calls. Every claim has to cite a record."

## 0:25–1:15 · Query 1: planning and following the thread

Click **Propulsion blockers**: *"Which components on the propulsion assembly have open nonconformances, and what's blocking qualification?"*

- Point at the **Plan**. Super wrote NCRs → affected requirements → test evidence. Each step ticks off as its tool returns.
- Point at a **tool call card**: the arguments and the model tag (Nano or Super). If a yellow notice appears (*"Nano returned no tool call; Super takes step 2"*), call it out: the loop forces the planned tool, so a step is never skipped.
- The answer: NCR-001 (isolation valve seat leak, 3.2e-4 vs 1.0e-4 scc/s) and NCR-002 (catalyst bed heater), both blocking. Click **NCR-001** to open the record drawer, then click through to its test record **TR-008**.

> "Every id is a link to the record it came from."

## 1:15–1:55 · Query 2: multi-tool readiness check

Click **Star tracker CDR readiness**.

- Trace: `search_parts` → `get_requirements` (status derived from test records) → `get_test_results`.
- The answer lists the unverified requirements: sun exclusion, the thermal-vacuum range and lost-in-space acquisition, plus vibration still in progress. It also catches that open NCR-004 on the baffle has to close before the sun-exclusion test can run.
- Point at the trace line *"all citations verified against tool output"*.

## 1:55–2:45 · Query 3: a generated document

Click **Valve trade study**.

- Trace: `compare_suppliers` checks both quotes against six measurable valve requirements, then `draft_document`. If Nano tries to draft too early, the guardrail line shows it being refused until the comparison has run.
- Open the **generated document**. The compliance matrix shows Corvid does not meet the 8 W pull-in power limit, and the commercial table covers price, NRE, lead time and on-time delivery. Halden's open NCR-001 is listed under risks.
- The executive summary and recommendation are written by Nemotron Super and cited. Everything else is rendered from data. Click **Download .md**.

## 2:45–3:00 · Close

Scroll to **Run totals**: tokens, tool calls, wall time, cost (about half a cent).

> "Two Nemotron models with clear jobs, every call through Token Factory, every claim traceable. Code is MIT on GitHub."
