# Devpost text

## Description

SpaceGrade Agent answers the questions aerospace hardware teams spend days chasing across spreadsheets, test reports and NCR logs, such as *"what is blocking propulsion qualification?"*, *"is the star tracker ready for CDR?"* or *"draft a trade study for these two valve suppliers"*. It does it in under a minute, and every claim cites the record behind it.

NVIDIA Nemotron 3 Super plans the investigation, and Nemotron 3 Nano routes each step to one of seven tools over parts, requirements, test records, nonconformances and supplier quotes. Super then writes the final answer, or the narrative of a generated trade study whose tables are rendered straight from the data, or a what-if: "if NCR-001 closes, how does propulsion readiness change?" All model calls run on Nebius Token Factory.

The interface is a mission-control console built around a live 3D digital twin of the spacecraft. As each tool returns, the camera flies to the parts the agent is investigating, and parts glow by qualification status, with blocking nonconformances pulsing red. A readiness board and a requirement verification matrix fill in as the agent reads them. When the agent runs a simulation, the whole spacecraft re-colours to the simulated state. Engineers can also ask by voice and toggle what-ifs by hand. None of this costs extra model calls: every record id resolves to a part, so the visuals come from the agent's own event stream.

A telemetry feed shows the plan ticking off, every tool call with its arguments and the model that chose it, and tokens, latency and cost per step. A validator flags any cited id that no tool returned. A typical run costs under one cent. The demo runs on a fully synthetic smallsat program, and the code is MIT-licensed.

## Feedback on Nebius Token Factory and Nemotron

**What worked:**
- Token Factory was a true drop-in. We pointed the standard `openai` SDK at the base URL and changed nothing else.
- `/v1/models`, native tool calling, named `tool_choice`, streaming with `include_usage`, and the separate `reasoning_content` field all worked as documented.
- Showing the reasoning in the trace was easy.
- Prices are low enough that three full agent runs cost about $0.015.
- Nemotron 3 Super was a reliable planner and a careful writer: it stayed inside the tool results, and with a forced `tool_choice` it filled arguments correctly in about 2 s.

**What was harder:**
- Model ids are inconsistently cased (`nvidia/nemotron-3-super-120b-a12b` vs `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`), so our first guessed id returned 404 until we listed the models.
- Nemotron 3 Nano only called tools reliably with reasoning on. With `enable_thinking: false` it answered that no tool applied.
- With reasoning on, Nano spent 400–3,000 tokens and 2–17 s per routing turn. That often made it slower than Super with a forced tool call. When it hit `max_tokens` mid-reasoning, it sometimes emitted a tool call with empty arguments, and occasionally it returned no tool call even though a plan step remained.
- We handle all of this in the loop: we treat truncated turns as failures, fall back to Super with a named `tool_choice`, and stop once the plan is covered.
- Both models sometimes typeset record ids with Unicode non-breaking hyphens, so we normalize ids before validating citations.
- A documented low-latency, non-reasoning tool-calling mode for Nano would make it the ideal router.
