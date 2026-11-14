import { Dispatcher as Incumbent, defaults as baseline, validateSettings as validateBaseline } from "./incumbent.ts"
import type { Settings as BaselineSettings } from "./incumbent.ts"
import { planRoutes } from "./routes.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DriverProfile, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = BaselineSettings & { multiRoutes: boolean }
export const defaults: Settings = { ...baseline, multiRoutes: false }

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be an object")
  const { multiRoutes = false, ...rest } = value as Partial<Settings>
  if (typeof multiRoutes !== "boolean") throw new Error("multiRoutes must be boolean")
  validateBaseline(rest)
}

export class Dispatcher extends Incumbent {
  declare settings: Settings
  readonly metrics = { flushes: 0, routes: 0, largeRoutes: 0, coveredOrders: 0, savedWorkMinutes: 0, openingSavingCents: 0, truncatedBatches: 0 }

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { multiRoutes, ...rest } = { ...defaults, ...settings }
    super(world, level, now, map, drivers, rest)
    this.settings = { ...this.settings, multiRoutes }
  }

  override flushBundles(): void {
    if (!this.settings.multiRoutes) return super.flushBundles()
    if (![...this.held.values()].some(item => item.at + this.settings.bundleWait <= this.now)) return
    const candidates = [...this.held].flatMap(([id, item]) => {
      const order = this.orders.get(id)
      return order && order.status === "waiting" && !this.legGigs.get(id)?.size ? [{ order, post: item.post, noteSafe: this.noteRules(this.requests.get(id)).safe }] : []
    })
    this.held.clear()
    const result = planRoutes(this.now, candidates, this.network)
    const used = new Set(result.selected.flatMap(route => route.indices))
    this.outbox.push(...result.selected.map(route => route.post), ...candidates.filter((_, i) => !used.has(i)).map(candidate => ({ ...candidate.post, schedule: this.payoutSchedule(candidate.post.schedule, true) })))
    this.metrics.flushes++
    this.metrics.routes += result.selected.length
    this.metrics.largeRoutes += result.selected.filter(route => route.indices.length >= 3).length
    this.metrics.coveredOrders += used.size
    this.metrics.savedWorkMinutes += result.selected.reduce((sum, route) => sum + route.savedWorkMinutes, 0)
    this.metrics.openingSavingCents += result.selected.reduce((sum, route) => sum + route.feeSavingCents, 0)
    this.metrics.truncatedBatches += Number(result.truncated)
  }
}
