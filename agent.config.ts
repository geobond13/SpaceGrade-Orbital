// Single place to swap models, caps and pricing. Every model id can also be
// overridden with an env var so a deploy can switch models without a commit.

export const agentConfig = {
  models: {
    // Planning + final reasoning. Swap to Nemotron 3 Ultra via PLANNER_MODEL.
    planner: process.env.PLANNER_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    // Fast tool routing + summarisation of large tool results.
    router: process.env.ROUTER_MODEL ?? 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
  },
  caps: {
    maxRounds: 8, // tool-calling rounds per run
    maxTokensPerRun: 60_000, // prompt + completion, all calls in one run
    runsPerIpPerHour: 10, // public demo rate limit
  },
  // USD per 1M tokens, used only for the cost estimate shown in the trace.
  // Check against the Token Factory pricing page before quoting numbers.
  pricing: {
    planner: { input: 0.3, output: 0.9 },
    router: { input: 0.06, output: 0.24 },
  },
} as const

export type ModelRole = keyof typeof agentConfig.models
