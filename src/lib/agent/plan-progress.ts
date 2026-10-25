import type { PlanStep } from './events'

/**
 * Which plan steps are done, given the tools called so far (in order).
 * Step i is done once its tool has been called as many times as it appears
 * in steps 0..i. Shared by the loop (to steer the router) and the UI.
 */
export function planProgress(plan: PlanStep[], called: string[]): boolean[] {
  const counts = new Map<string, number>()
  for (const name of called) counts.set(name, (counts.get(name) ?? 0) + 1)
  const needed = new Map<string, number>()
  return plan.map((s) => {
    needed.set(s.tool, (needed.get(s.tool) ?? 0) + 1)
    return (counts.get(s.tool) ?? 0) >= needed.get(s.tool)!
  })
}
