import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { Action, ActionResult, Advance } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

export type AnchorRecord = { at: number; stage: string; actions?: readonly Action[]; results?: ActionResult[]; error?: string }

/** Practice-only: restore the intended visible fee before any call advances the clock. */
export function anchorTransport(real: World, factor: number, record: (row: AnchorRecord) => void): World {
  if (![0.5, 1, 2].includes(factor)) throw new Error("Expected a predeclared anchor factor")
  let now = 0
  const act = async (actions: readonly Action[]): Promise<ActionResult[]> => {
    const submitted = actions.map(action => action.type === "post" ? { ...action, schedule: action.schedule.map(step => ({ ...step, feeCents: Math.max(1, Math.round(step.feeCents * factor)) })) } : action)
    const hasPost = actions.some(action => action.type === "post")
    try {
      if (hasPost) record({ at: now, stage: "post", actions: submitted })
      const results = await real.act(submitted)
      if (hasPost) record({ at: now, stage: "posted", results })
      if (results.length !== actions.length) throw new Error("Missing action acknowledgements")
      const restore: Action[] = actions.flatMap((action, i) => action.type === "post" && results[i]?.ok ? [{ type: "reprice" as const, gigId: results[i]!.id, schedule: action.schedule }] : [])
      if (restore.length) {
        record({ at: now, stage: "restore", actions: restore })
        const restored = await real.act(restore)
        record({ at: now, stage: "restored", results: restored })
        if (restored.length !== restore.length || restored.some(result => !result.ok)) throw new Error("Could not restore every intended fee")
      }
      return results
    } catch (error) {
      record({ at: now, stage: "error", error: String(error) })
      // An uncertain post or restore must stop this probe, not advance with a temporary fee.
      throw new Error(`Anchor transport stopped: ${String(error)}`)
    }
  }
  const advance = async ({ actions = [], ...target }: Advance) => {
    const results = await act(actions)
    const step = await real.advance(target)
    now = step.now
    return { ...step, results }
  }
  return new Proxy(real, { get(target, key) {
    if (key === "act") return act
    if (key === "advance") return advance
    const value = Reflect.get(target, key, target)
    return typeof value === "function" ? value.bind(target) : value
  } })
}
