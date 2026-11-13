import { Desk } from "./desk.ts"
import { Network, lastPickup, needsCharge } from "./planning.ts"
import { readNote } from "./notes.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DeskSnapshot, DriverProfile, FeeStep, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = { price: number; fee: number; margin: number; capacity: number; maxKm: number; minDrivers: number; notes: boolean }
export const defaults: Settings = { price: 1.42, fee: 1.05, margin: 0.28, capacity: 0.18, maxKm: 400, minDrivers: 12, notes: true }

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be an object")
  for (const [key, field] of Object.entries(value)) {
    if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`)
    if (key === "notes") { if (typeof field !== "boolean") throw new Error("notes must be boolean"); continue }
    if (typeof field !== "number" || !Number.isFinite(field) || field <= 0) throw new Error(`${key} must be a positive number`)
    if ((key === "margin" || key === "capacity") && field >= 1) throw new Error(`${key} must be below 1`)
  }
}

export class Dispatcher extends Desk {
  network: Network
  drivers: DriverProfile[]
  settings: Settings
  pending = new Set<string>()
  quoted = new Set<string>()
  trust = new Map<string, number>()
  deliveredOrders = new Set<string>()
  raised = new Map<string, number>()
  offers = new Map<string, { driver: string; until: number }[]>()
  offerCount = new Map<string, number>()
  seen = new Map<string, Set<string>>()
  failures: { at: number; action: Action; reason: string }[] = []
  lastSeq = -1
  offersAfter = 0

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    super(world, level, now)
    validateSettings(settings)
    this.network = new Network(map)
    this.drivers = drivers
    this.settings = { ...defaults, ...settings }
  }

  quote(request: PriceRequest): void {
    this.requests.set(request.id, request)
    if (request.respondBy <= this.now || this.quoted.has(request.id)) return
    this.quoted.add(request.id)
    const reject = () => {
      if (this.level >= 4) this.outbox.push({ type: "quote", requestId: request.id, prices: { [request.options[0]!.kind]: 100_000_000 } })
    }
    const rules = readNote(request.note)
    if (request.legs.length !== 1 || !rules.safe || (!this.settings.notes && request.note)) return reject()
    const leg = request.legs[0]!
    if (leg.pickup.privateAddress || leg.delivery.privateAddress) return reject()
    const road = this.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const supply = this.supply(request)
    if (road.km > this.settings.maxKm || supply < this.settings.minDrivers) return reject()
    const day = Math.floor(leg.pickup.window.from / 1440)
    let load = 0
    let unbooked = 0
    for (const other of this.requests.values()) {
      const order = this.orders.get(other.id)
      if (!this.pending.has(other.id) && (!order || order.status === "cancelled")) continue
      const first = other.legs[0]!
      if (Math.floor(first.pickup.window.from / 1440) !== day) continue
      const distance = this.network.km(leg.pickup.placeId, first.pickup.placeId)
      if (distance <= 70) {
        const weight = distance <= 30 ? 1 : 0.5
        load += weight
        if (this.pending.has(other.id) || (order?.status !== "delivered" && !this.gigsOf(other.id).some(id => this.booked.has(id)))) unbooked += weight
      }
    }
    if (load >= Math.max(1, supply * this.settings.capacity)) return reject()
    if (unbooked >= Math.max(2, supply * 0.04)) return reject()
    const fee = this.baseFee(request)
    const trust = 1 + 0.007 * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const prices: Record<string, number> = {}
    for (const option of request.options) {
      if (option.kind === "same_day" && supply < 15) continue
      const latest = lastPickup(leg, option.deadline, this.network, rules.plates)
      const buffer = supply < 30 || road.km > 300 ? 300 : 210
      if (latest < Math.max(this.now + buffer, leg.pickup.window.from + 120)) continue
      const price = Math.ceil(Math.max(option.listPriceCents * this.settings.price * trust, fee / (1 - this.settings.margin) + 1000))
      if (this.level <= 3 && option.listPriceCents < fee * 1.3) continue
      prices[option.kind] = price
    }
    if (!Object.keys(prices).length) return reject()
    this.pending.add(request.id)
    this.outbox.push({ type: "quote", requestId: request.id, prices })
  }

  supply(request: PriceRequest): number {
    const first = request.legs[0]!
    const rules = readNote(request.note)
    let count = 0
    for (const driver of this.drivers) {
      if (rules.manual && driver.licence !== "manual") continue
      if (first.car.premium && (driver.rating < 4.8 || driver.completedGigs < 50)) continue
      const km = this.network.km(driver.homePlaceId, first.pickup.placeId)
      count += km <= 35 ? 1 : km <= 70 ? 0.35 : 0
    }
    return count
  }

  baseFee(request: PriceRequest): number {
    const supply = this.supply(request)
    const extra = supply < 20 ? 0.18 : supply < 50 ? 0.08 : 0
    return Math.max(2000, Math.round(request.referenceFeeCents * (this.settings.fee + extra)))
  }

  feesFor(order: Order, cars: number): FeeStep[] {
    const request = this.requests.get(order.id)!
    const fee = this.baseFee(request) * cars / order.legs.length
    const rescue = this.urgent.has(order.id)
    const remaining = order.lastPickupAt - this.now
    const start = rescue ? remaining <= 60 ? 2.5 : remaining <= 120 ? 1.9 : 1.5 : 1
    if (this.level === 1) return [{ at: this.now, feeCents: Math.round(fee * start) }]
    // A steady initial price avoids teaching drivers to wait for hourly increases.
    const due = Math.max(this.now + 30, order.lastPickupAt - 240)
    return [
      { at: this.now, feeCents: Math.round(fee * start) },
      { at: due, feeCents: Math.round(fee * Math.max(start, 1.45)) },
      { at: Math.max(due + 30, order.lastPickupAt - 120), feeCents: Math.round(fee * Math.max(start, 1.9)) },
      { at: Math.max(due + 60, order.lastPickupAt - 60), feeCents: Math.round(fee * Math.max(start, 2.5)) },
    ]
  }

  async post(order: Order, legs: number[], retry = { pickupFrom: 0, manualLicence: false, plates: false }): Promise<void> {
    if (!legs.length) return
    const request = this.requests.get(order.id)!
    const rules = readNote(request.note)
    const stops: PostAction["stops"] = legs.flatMap(leg => {
      const car = order.legs[leg]!
      const from = Math.max(car.pickup.window.from, retry.pickupFrom)
      return [
        { orderId: order.id, leg, kind: "pickup" as const, withPlates: rules.plates || retry.plates, withCharging: needsCharge(car, this.network), ...(from > car.pickup.window.from ? { window: { from, to: Math.max(from, car.pickup.window.to) } } : {}) },
        { orderId: order.id, leg, kind: "delivery" as const },
      ]
    })
    this.outbox.push({ type: "post", stops, audience: { experienced: legs.some(i => order.legs[i]!.car.premium), manualLicence: rules.manual || retry.manualLicence }, schedule: this.feesFor(order, legs.length) })
  }

  async handle(event: DeskEvent): Promise<void> {
    if (event.seq <= this.lastSeq) return
    this.lastSeq = event.seq
    if (event.kind === "order_won") this.pending.delete(event.order.id)
    if (event.kind === "order_lost") this.pending.delete(event.requestId)
    if (event.kind === "gig_viewed") {
      if (!this.seen.has(event.gigId)) this.seen.set(event.gigId, new Set())
      this.seen.get(event.gigId)!.add(event.driverId)
    }
    if (event.kind === "order_cancelled") {
      for (const gig of event.gigs) {
        if (gig.outcome === "withdrawn" || gig.outcome === "released") this.posts.delete(gig.gigId)
      }
    }
    await super.handle(event)
    if (event.kind === "gig_dropped" || event.kind === "no_show") {
      const post = this.posts.get(event.gigId)
      if (post) {
        const order = this.orders.get(post.stops[0]!.orderId)
        if (order && order.lastPickupAt - this.now < 300) await this.raise(order.id)
      }
    }
    if (event.kind === "delivered") {
      const order = this.orders.get(event.orderId)
      if (order && order.deliveredAt.every(at => at !== null) && !this.deliveredOrders.has(order.id)) {
        order.status = "delivered"
        this.deliveredOrders.add(order.id)
        const count = this.trust.get(order.dealerId) ?? 0
        this.trust.set(order.dealerId, Math.max(...order.deliveredAt as number[]) <= order.deadline ? Math.min(25, count + 1) : Math.floor(count / 2))
      }
    }
  }

  async tick(): Promise<void> {
    for (const order of this.orders.values()) {
      if (order.status === "delivered" || order.status === "cancelled") continue
      const missing = order.legs.map((_, leg) => leg).filter(leg => order.deliveredAt[leg] === null && !this.legGigs.get(order.id)?.has(leg) && !this.outbox.some(a => a.type === "post" && a.stops.some(s => s.orderId === order.id && s.leg === leg)))
      if (missing.length) await this.post(order, missing)
      for (const gigId of this.gigsOf(order.id)) {
        if (this.booked.has(gigId)) continue
        if (this.now >= order.lastPickupAt - 240 && (this.raised.get(gigId) ?? -Infinity) < this.now - 60) {
          this.raised.set(gigId, this.now)
          await this.raise(order.id)
          if (this.level >= 3) this.offer(gigId, order)
        }
      }
    }
  }

  offer(gigId: string, order: Order): void {
    if (this.now < this.offersAfter) return
    const post = this.posts.get(gigId)
    if (!post) return
    const active = (this.offers.get(gigId) ?? []).filter(x => x.until > this.now)
    this.offers.set(gigId, active)
    const place = order.legs[post.stops[0]!.leg]!.pickup.placeId
    const candidates = this.drivers.filter(driver =>
      (!post.audience.experienced || (driver.rating >= 4.8 && driver.completedGigs >= 50)) &&
      (!post.audience.manualLicence || driver.licence === "manual") &&
      this.network.km(driver.homePlaceId, place) <= 100,
    ).sort((a, b) => {
      const cost = (d: DriverProfile) => this.network.minutes(d.homePlaceId, place) - (this.seen.get(gigId)?.has(d.id) ? 30 : 0) + 20 * d.drops / Math.max(1, d.completedGigs)
      return cost(a) - cost(b)
    })
    for (const driver of candidates) {
      if (active.length >= 3) break
      const key = `${Math.floor(this.now / 1440)}:${driver.id}`
      if ((this.offerCount.get(key) ?? 0) >= 3 || active.some(x => x.driver === driver.id)) continue
      this.offerCount.set(key, (this.offerCount.get(key) ?? 0) + 1)
      active.push({ driver: driver.id, until: this.now + 11 })
      this.outbox.push({ type: "offer", gigId, driverId: driver.id, feeCents: this.feesFor(order, post.stops.filter(s => s.kind === "pickup").length)[0]!.feeCents })
    }
  }

  readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions, results)
    actions.forEach((action, i) => {
      const result = results[i]
      if (!result || !result.ok) {
        const reason = result && !result.ok ? result.reason : "missing action result"
        this.failures.push({ at: this.now, action, reason })
        console.error(JSON.stringify({ at: this.now, action: action.type, reason }))
      }
    })
  }

  async rejoin(snapshot: DeskSnapshot, history: DeskEvent[]): Promise<void> {
    this.now = snapshot.now
    if (history.length) this.offersAfter = snapshot.now + 11
    for (const event of history) {
      if (event.kind === "price_request") this.requests.set(event.request.id, event.request)
      if (event.kind === "gig_viewed") {
        if (!this.seen.has(event.gigId)) this.seen.set(event.gigId, new Set())
        this.seen.get(event.gigId)!.add(event.driverId)
      }
      if (event.kind === "offer_answered") {
        const key = `${Math.floor(event.at / 1440)}:${event.driverId}`
        this.offerCount.set(key, (this.offerCount.get(key) ?? 0) + 1)
      }
      if (event.kind === "ledger" && event.line.orderId) {
        const request = this.requests.get(event.line.orderId)
        if (!request) continue
        const count = this.trust.get(request.dealerId) ?? 0
        if (event.line.kind === "revenue") this.trust.set(request.dealerId, Math.min(25, count + 1))
        if (event.line.kind === "late_refund") this.trust.set(request.dealerId, Math.floor(Math.max(0, count - 1) / 2))
      }
    }
    await super.rejoin(snapshot, history)
    for (const order of snapshot.orders) if (order.status === "delivered") this.deliveredOrders.add(order.id)
    this.lastSeq = history.at(-1)?.seq ?? -1
  }
}
