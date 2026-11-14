import { Dispatcher as Incumbent, defaults as baseline, validateSettings as validateBaseline } from "./incumbent.ts"
import type { Settings as BaselineSettings } from "./incumbent.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DriverProfile, FeeStep, PostAction, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = BaselineSettings & { viewedFee: boolean }
export const defaults: Settings = { ...baseline, viewedFee: false }
type Exposure = { gigId?: string; at: number; until: number; feeCents: number; extraCents: number; original: FeeStep[]; orders: string[]; views: number; bookedAt?: number; bookedFeeCents?: number; restoredAt?: number; cancelled?: string }

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be an object")
  const { viewedFee = false, ...rest } = value as Partial<Settings>
  if (typeof viewedFee !== "boolean") throw new Error("viewedFee must be boolean")
  validateBaseline(rest)
}

export class Dispatcher extends Incumbent {
  declare settings: Settings
  readonly exposures: Exposure[] = []
  readonly prepared = new Map<PostAction, Exposure>()
  readonly active = new Map<string, Exposure>()
  readonly pulsed = new Map<string, Exposure>()
  readonly touched = new Set<string>()
  reservedCents = 0

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { viewedFee, ...rest } = { ...defaults, ...settings }
    super(world, level, now, map, drivers, rest)
    this.settings = { ...this.settings, viewedFee }
  }

  override takeActions(): Action[] {
    const actions = super.takeActions()
    if (!this.settings.viewedFee || this.now >= 1440) return actions
    return actions.map(action => {
      if (action.type !== "post") return action
      const orders = [...new Set(action.stops.map(stop => stop.orderId))]
      const repeated = orders.some(id => this.touched.has(id))
      orders.forEach(id => this.touched.add(id))
      if (repeated || orders.some(id => (this.orders.get(id)?.lastPickupAt ?? 0) < this.now + 360)) return action
      const normal = (action.schedule.findLast(step => step.at <= this.now) ?? action.schedule[0]!).feeCents
      const feeCents = Math.round(normal * 1.5), extraCents = feeCents - normal
      if (this.reservedCents + extraCents > 60_000) return action
      // Reserve the full premium even if nobody books, so overlapping exposures cannot exceed the cap.
      this.reservedCents += extraCents
      const exposure: Exposure = { at: this.now, until: this.now + 5, feeCents, extraCents, original: structuredClone(action.schedule), orders, views: 0 }
      const posted: PostAction = { ...action, schedule: [{ at: this.now, feeCents }] }
      this.prepared.set(posted, exposure)
      this.exposures.push(exposure)
      return posted
    })
  }

  override readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions, results)
    actions.forEach((action, i) => {
      if (action.type === "post") {
        const exposure = this.prepared.get(action)
        if (!exposure) return
        this.prepared.delete(action)
        const result = results[i]
        if (!result?.ok) { exposure.cancelled = "post refused"; return }
        exposure.gigId = result.id
        this.active.set(result.id, exposure)
        this.pulsed.set(result.id, exposure)
        // Recovery and later drops must use the normal policy, not the temporary flat fee.
        this.posts.get(result.id)!.schedule = structuredClone(exposure.original)
      }
    })
  }

  override nextDecisionAt(): number {
    return Math.min(super.nextDecisionAt(), ...[...this.active.values(), ...this.prepared.values()].map(exposure => Math.max(this.now + 1, exposure.until)))
  }

  override async tick(): Promise<void> {
    for (const [id, exposure] of this.active) {
      if (this.booked.has(id) || !this.posts.has(id)) { this.active.delete(id); continue }
      if (exposure.until > this.now) continue
      const action: Action = { type: "reprice", gigId: id, schedule: exposure.original }
      const results = await this.world.act([action])
      this.readResults([action], results)
      if (results.length !== 1 || !results[0]!.ok) throw new Error(`Cannot restore exposed gig ${id}`)
      exposure.restoredAt = this.now
      this.active.delete(id)
    }
    await super.tick()
  }

  override async handle(event: DeskEvent): Promise<void> {
    if (event.seq <= this.lastSeq) return
    if (event.kind === "gig_viewed") {
      const exposure = this.active.get(event.gigId)
      if (exposure && event.at <= exposure.until) exposure.views++
    }
    if (event.kind === "gig_booked") {
      const exposure = this.pulsed.get(event.gigId)
      if (exposure && exposure.bookedAt === undefined) { exposure.bookedAt = event.at; exposure.bookedFeeCents = event.feeCents }
      this.active.delete(event.gigId)
    }
    if (event.kind === "order_changed" || event.kind === "order_cancelled") {
      const id = event.kind === "order_changed" ? event.order.id : event.orderId
      for (const exposure of this.active.values()) if (exposure.orders.includes(id)) { exposure.cancelled = event.kind; exposure.until = this.now }
    }
    await super.handle(event)
    if (event.kind === "order_changed") for (const [id, exposure] of this.active) {
      const post = this.posts.get(id)
      if (exposure.orders.includes(event.order.id) && post) exposure.original = this.feesForPost(post)
    }
    if (event.kind === "gig_dropped" || event.kind === "no_show") {
      const exposure = this.pulsed.get(event.gigId), post = this.posts.get(event.gigId)
      if (exposure && !exposure.restoredAt && post && !this.booked.has(event.gigId) && !this.outbox.some(action => action.type === "reprice" && action.gigId === event.gigId)) {
        this.outbox.push({ type: "reprice", gigId: event.gigId, schedule: this.feesForPost(post) })
      }
    }
  }
}
