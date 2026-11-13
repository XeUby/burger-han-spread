import { Desk } from "./desk.ts"
import { Network, lastPickup, needsCharge } from "./planning.ts"
import { readNote } from "./notes.ts"
import { DemandModel } from "./optimizer.ts"
import type { MarketFeatures } from "./optimizer.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DeskSnapshot, DriverProfile, FeeStep, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = {
  price: number; fee: number; margin: number; capacity: number; maxKm: number; minDrivers: number
  notes: boolean; adaptive: boolean; earlyOffers: boolean; safetySlack: boolean
  backlog: number; priceFloor: number; costRatio: number; trustStep: number; sameDayBacklog: number; demandSlope: number
}
export const defaults: Settings = {
  price: 1.42, fee: 1.05, margin: 0.1, capacity: 0.18, maxKm: 550, minDrivers: 12,
  notes: true, adaptive: true, earlyOffers: false, safetySlack: false,
  backlog: 0.04, priceFloor: 0, costRatio: 1.15, trustStep: 0.01, sameDayBacklog: 4, demandSlope: 14,
}

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be an object")
  for (const [key, field] of Object.entries(value)) {
    if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`)
    if (typeof defaults[key as keyof Settings] === "boolean") { if (typeof field !== "boolean") throw new Error(`${key} must be boolean`); continue }
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || (field === 0 && !["margin", "priceFloor", "trustStep"].includes(key))) throw new Error(`${key} must be a positive number`)
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
  lastOffer = new Map<string, number>()
  viewedAt = new Map<string, number>()
  driverPlace = new Map<string, { place: string; at: number }>()
  gigDriver = new Map<string, string>()
  offeredDrivers = new Map<string, Set<string>>()
  market: DemandModel
  bids = new Map<string, { features: MarketFeatures; ratio: number }>()

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    super(world, level, now)
    validateSettings(settings)
    this.network = new Network(map)
    this.drivers = drivers
    this.settings = { ...defaults, ...settings }
    this.market = new DemandModel({ threshold: level === 8 ? 1.4 : level === 7 ? 1.25 : 1, slope: this.settings.demandSlope })
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
    if (unbooked >= Math.max(2, supply * this.settings.backlog)) return reject()
    const fee = this.baseFee(request)
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const prices: Record<string, number> = {}
    for (const option of request.options) {
      if (option.kind === "same_day" && supply < 15) continue
      if (option.kind === "same_day" && day === Math.floor(this.now / 1440) && unbooked >= this.settings.sameDayBacklog) continue
      const latest = lastPickup(leg, option.deadline, this.network, rules.plates)
      const buffer = supply < 30 || road.km > 300 ? 300 : 210
      if (latest < Math.max(this.now + buffer, leg.pickup.window.from + 120)) continue
      const price = Math.ceil(Math.max(option.listPriceCents * this.settings.price * trust, fee / (1 - this.settings.margin) + this.settings.priceFloor))
      if (this.level <= 3 && option.listPriceCents < fee * 1.3) continue
      prices[option.kind] = price
    }
    if (!Object.keys(prices).length) return reject()
    if (this.settings.adaptive && this.level >= 4) {
      const options = request.options.filter(option => option.kind in prices)
      const list = Math.min(...options.map(option => option.listPriceCents))
      const features = this.features(request)
      const choice = this.market.optimize(features, { costCents: fee * this.settings.costRatio, listPriceCents: list, trust, minPrice: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor) })
      if (choice.expectedProfitCents <= 0) return reject()
      for (const option of options) prices[option.kind] = Math.ceil(option.listPriceCents * trust * choice.ratio)
      this.bids.set(request.id, { features, ratio: choice.ratio })
    }
    this.pending.add(request.id)
    this.outbox.push({ type: "quote", requestId: request.id, prices })
  }

  features(request: PriceRequest): MarketFeatures {
    const leg = request.legs[0]!
    return { day: Math.floor(request.arrivedAt / 1440), origin: leg.pickup.placeId, destination: leg.delivery.placeId, dealer: request.dealerId, km: this.network.km(leg.pickup.placeId, leg.delivery.placeId) }
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

  pickupBy(order: Order): number {
    if (!this.settings.safetySlack || order.legs.length !== 1) return order.lastPickupAt
    const rules = readNote(this.requests.get(order.id)?.note ?? null)
    return Math.min(order.lastPickupAt, lastPickup(order.legs[0]!, order.deadline, this.network, rules.plates))
  }

  feesFor(order: Order, cars: number): FeeStep[] {
    const request = this.requests.get(order.id)!
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + this.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    // A dealer can replace a local trip with a long one after the price is agreed.
    const routeChange = Math.max(1, duration(order.legs) / duration(request.legs))
    const fee = this.baseFee({ ...request, legs: order.legs }) * routeChange * cars / order.legs.length
    const rescue = this.urgent.has(order.id)
    const pickupBy = this.pickupBy(order)
    const remaining = pickupBy - this.now
    const start = rescue ? remaining <= 60 ? 2.5 : remaining <= 120 ? 1.9 : 1.5 : 1
    if (this.level === 1) return [{ at: this.now, feeCents: Math.round(fee * start) }]
    // A steady initial price avoids teaching drivers to wait for hourly increases.
    const due = Math.max(this.now + 30, pickupBy - 240)
    return [
      { at: this.now, feeCents: Math.round(fee * start) },
      { at: due, feeCents: Math.round(fee * Math.max(start, 1.45)) },
      { at: Math.max(due + 30, pickupBy - 120), feeCents: Math.round(fee * Math.max(start, 1.9)) },
      { at: Math.max(due + 60, pickupBy - 60), feeCents: Math.round(fee * Math.max(start, 2.5)) },
    ]
  }

  async post(order: Order, legs: number[], retry = { pickupFrom: 0, manualLicence: false, plates: false }): Promise<void> {
    if (!legs.length) return
    const request = this.requests.get(order.id)!
    const rules = readNote(request.note)
    const stops: PostAction["stops"] = legs.flatMap(leg => {
      const car = order.legs[leg]!
      const from = Math.max(car.pickup.window.from, retry.pickupFrom)
      const cutoff = this.pickupBy(order)
      const to = this.settings.safetySlack && cutoff > Math.max(from, this.now + 30) ? Math.min(car.pickup.window.to, cutoff) : Math.max(from, car.pickup.window.to)
      return [
        { orderId: order.id, leg, kind: "pickup" as const, withPlates: rules.plates || retry.plates, withCharging: needsCharge(car, this.network), ...(from > car.pickup.window.from || to < car.pickup.window.to ? { window: { from, to } } : {}) },
        { orderId: order.id, leg, kind: "delivery" as const },
      ]
    })
    this.outbox.push({ type: "post", stops, audience: { experienced: legs.some(i => order.legs[i]!.car.premium), manualLicence: rules.manual || retry.manualLicence }, schedule: this.feesFor(order, legs.length) })
  }

  async handle(event: DeskEvent): Promise<void> {
    if (event.seq <= this.lastSeq) return
    this.lastSeq = event.seq
    if (event.kind === "order_won" || event.kind === "order_lost") {
      const id = event.kind === "order_won" ? event.order.id : event.requestId
      const bid = this.bids.get(id)
      if (bid) this.market.observe(bid.features, bid.ratio, event.kind === "order_won")
      this.bids.delete(id)
    }
    if (event.kind === "order_won") this.pending.delete(event.order.id)
    if (event.kind === "order_lost") this.pending.delete(event.requestId)
    if (event.kind === "gig_viewed") {
      if (!this.seen.has(event.gigId)) this.seen.set(event.gigId, new Set())
      this.seen.get(event.gigId)!.add(event.driverId)
      this.viewedAt.set(event.driverId, event.at)
    }
    if (event.kind === "gig_booked") this.gigDriver.set(event.gigId, event.driverId)
    if (event.kind === "picked_up" || event.kind === "delivered") {
      const driver = this.gigDriver.get(event.gigId)
      if (driver) this.driverPlace.set(driver, { place: event.placeId, at: event.at })
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
        if (this.level >= 3 && this.settings.earlyOffers && order.legs[0]!.pickup.window.from <= this.now + 180 && (this.lastOffer.get(gigId) ?? -Infinity) <= this.now - 30 && this.now % 1440 >= 420 && this.now % 1440 < 1260) {
          this.lastOffer.set(gigId, this.now)
          this.offer(gigId, order, order.lastPickupAt - this.now > 240 ? 1 : 3)
        }
        if (this.now >= this.pickupBy(order) - 240 && (this.raised.get(gigId) ?? -Infinity) < this.now - 60) {
          this.raised.set(gigId, this.now)
          await this.raise(order.id)
          if (this.level >= 3) this.offer(gigId, order)
        }
      }
    }
  }

  offer(gigId: string, order: Order, limit = 3): void {
    if (this.now < this.offersAfter) return
    const post = this.posts.get(gigId)
    if (!post) return
    const active = (this.offers.get(gigId) ?? []).filter(x => x.until > this.now)
    this.offers.set(gigId, active)
    const place = order.legs[post.stops[0]!.leg]!.pickup.placeId
    const location = (driver: DriverProfile) => {
      const position = this.driverPlace.get(driver.id)
      return this.settings.earlyOffers && position && this.now - position.at < 180 ? position.place : driver.homePlaceId
    }
    const candidates = this.drivers.filter(driver =>
      (!post.audience.experienced || (driver.rating >= 4.8 && driver.completedGigs >= 50)) &&
      (!post.audience.manualLicence || driver.licence === "manual") &&
      this.network.km(location(driver), place) <= 100,
    ).sort((a, b) => {
      const cost = (d: DriverProfile) => this.network.minutes(location(d), place) - (this.seen.get(gigId)?.has(d.id) ? 30 : 0) - (this.settings.earlyOffers && this.now - (this.viewedAt.get(d.id) ?? -Infinity) < 120 ? 25 : 0) + 20 * d.drops / Math.max(1, d.completedGigs)
      return cost(a) - cost(b)
    })
    for (const driver of candidates) {
      if (active.length >= limit) break
      const key = `${Math.floor(this.now / 1440)}:${driver.id}`
      if ((this.offerCount.get(key) ?? 0) >= 3 || active.some(x => x.driver === driver.id)) continue
      if (this.settings.earlyOffers && this.offeredDrivers.get(gigId)?.has(driver.id)) continue
      this.offerCount.set(key, (this.offerCount.get(key) ?? 0) + 1)
      active.push({ driver: driver.id, until: this.now + 11 })
      if (!this.offeredDrivers.has(gigId)) this.offeredDrivers.set(gigId, new Set())
      this.offeredDrivers.get(gigId)!.add(driver.id)
      this.outbox.push({ type: "offer", gigId, driverId: driver.id, feeCents: this.feesFor(order, post.stops.filter(s => s.kind === "pickup").length)[0]!.feeCents })
    }
  }

  readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions, results)
    actions.forEach((action, i) => {
      const result = results[i]
      if (!result || !result.ok) {
        if (action.type === "quote") {
          this.pending.delete(action.requestId)
          this.bids.delete(action.requestId)
        }
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
