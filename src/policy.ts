import { Desk } from "./desk.ts"
import { Network, lastPickup, needsCharge } from "./planning.ts"
import { readNote } from "./notes.ts"
import { normalizeNote } from "./note-spelling.ts"
import { canRelist } from "./relisting.ts"
import { readReadiness } from "./readiness.ts"
import { readHours } from "./hours-note.ts"
import { readFacts } from "./note-reader.ts"
import { planTimedLeg, withNoteHours } from "./hours-plan.ts"
import type { TimedNote } from "./hours-note.ts"
import { lateRescueApplies, lateRescueSchedule } from "./late-rescue.ts"
import type { Readiness } from "./readiness.ts"
import type { NoteRules } from "./notes.ts"
import { PlaceDemandModel } from "./place-market.ts"
import { DemandModel } from "./optimizer.ts"
import { planBundles } from "./bundles.ts"
import { requestFeasibility } from "./admission.ts"
import { priceMenu } from "./menu.ts"
import { Fleet, fleetDefaults, type Queue, type Waiting } from "./fleet.ts"
import { logFleet } from "./fleet-log.ts"
import { chooseHomeOffers } from "./home-offers.ts"
import type { MarketFeatures } from "./optimizer.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeliveryOption, DeskEvent, DeskSnapshot, DriverProfile, FeeStep, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = {
  price: number; fee: number; payout: number; margin: number; capacity: number; maxKm: number; minDrivers: number
  notes: boolean; noteSpelling: boolean; relist: boolean; openingOnly: boolean; adaptive: boolean; earlyOffers: boolean; safetySlack: boolean
  auction: boolean; allowPrivate: boolean; tradeIns: boolean; homeOffers: boolean; readiness: boolean; bundlePairs: boolean; timedNotes: boolean; noteReader: boolean; lateRescue: boolean
  sameDayPremium: number; laterDiscount: number; placePrior: number; bundleWait: number
  backlog: number; priceFloor: number; costRatio: number; trustStep: number; sameDayBacklog: number; demandSlope: number
  earlyClimb: boolean
  /** Post a gig again as soon as its last pickup time has passed, so a driver can take the late car for the next day. */
  lateRepost: boolean
  /** The first fee of a gig posted again after its last pickup time, in full fees. */
  lateFee: number
  /** The fee, in full fees, a day and half a day before the last pickup, for a gig that no driver has taken. */
  climbDay: number; climbHalfDay: number
  /** What a route really costs against the dispatcher's estimate, for routes under 50 km, from 50 km to 100 km, and longer. */
  shortCost: number; middleCost: number; longCost: number
  /** Price against the drivers' cost — the fee plus the risk of a late car — instead of a flat share of the typical fee. */
  fleetRisk: boolean
  /** The share of won orders the drivers' model aims to deliver on time. */
  fleetOnTime: number
  /** What a late order pays back, as a share of its list price. */
  fleetRefund: number
  /** Euros one late order costs beyond its refund while we are still within the target. */
  fleetLatePrice: number
  /** How much of the harm to the cars that already wait we charge. */
  fleetCrowding: number
  /** Orders after which a week's first outcomes say something about its own drivers. */
  fleetCalm: number
  /** How firmly we hold, before a week's outcomes speak, that its world is the model's. */
  fleetDoubt: number
  /** One flat fee per gig, chosen from a grid of multiples of the typical fee. */
  fleetFlatFee: boolean
}
export const defaults: Settings = {
  price: 1.42, fee: 1.05, payout: 0.85, margin: 0.1, capacity: 0.35, maxKm: 700, minDrivers: 8,
  notes: true, noteSpelling: false, relist: false, openingOnly: true, adaptive: true, earlyOffers: false, safetySlack: false,
  auction: false, allowPrivate: false, tradeIns: false, homeOffers: false, readiness: false, bundlePairs: true, timedNotes: false, noteReader: true, lateRescue: true, sameDayPremium: 1, laterDiscount: 1, placePrior: 0, bundleWait: 15,
  backlog: 0.08, priceFloor: 0, costRatio: 1.15, trustStep: 0.01, sameDayBacklog: 4, demandSlope: 14, shortCost: 1, middleCost: 1, longCost: 1, climbDay: 1.1, climbHalfDay: 1.25, lateRepost: true, lateFee: 1,
  earlyClimb: true,
  fleetRisk: false, fleetOnTime: 0.95, fleetRefund: 0.54, fleetLatePrice: 300, fleetCrowding: 1, fleetCalm: 20, fleetDoubt: 4, fleetFlatFee: false,
}

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be an object")
  for (const [key, field] of Object.entries(value)) {
    if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`)
    if (typeof defaults[key as keyof Settings] === "boolean") { if (typeof field !== "boolean") throw new Error(`${key} must be boolean`); continue }
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || (field === 0 && !["margin", "priceFloor", "trustStep", "placePrior", "bundleWait", "fleetLatePrice"].includes(key))) throw new Error(`${key} must be a positive number`)
    if (key === "bundleWait" && (!Number.isInteger(field) || field > 30)) throw new Error("bundleWait must be an integer from 0 to 30")
    if ((key === "margin" || key === "capacity") && field >= 1) throw new Error(`${key} must be below 1`)
    if (key === "placePrior" && field > 2) throw new Error("placePrior must be at most 2")
    if (key === "payout" && field > 1) throw new Error("payout must be at most 1")
  }
}

export class Dispatcher extends Desk {
  network: Network
  drivers: DriverProfile[]
  settings: Settings
  pending = new Set<string>()
  quoted = new Set<string>()
  lateReposts = new Map<string, number>()
  noteFacts = new Map<string, { rules: NoteRules; timed: TimedNote | null }>()
  trust = new Map<string, number>()
  deliveredOrders = new Set<string>()
  raised = new Map<string, number>()
  lateResets = new Map<string, number>()
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
  homeOffersSent = new Map<string, number>()
  market: DemandModel
  bids = new Map<string, { features: MarketFeatures; ratio: number }>()
  deferred = new Map<string, PriceRequest>()
  held = new Map<string, { post: PostAction; at: number }>()
  postedAt = new Map<string, number>()
  relisted = new Set<string>()
  fleet: Fleet
  bookedCount = 0

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    super(world, level, now)
    validateSettings(settings)
    this.network = new Network(map)
    this.drivers = drivers
    this.settings = { ...defaults, ...settings }
    const marketSettings = { threshold: level === 8 ? 1.4 : level === 7 ? 1.25 : 1, slope: this.settings.demandSlope }
    this.market = this.settings.placePrior > 0 ? new PlaceDemandModel(marketSettings, this.settings.placePrior) : new DemandModel(marketSettings)
    const places = [...new Set(map.roads.flatMap(road => [road.from, road.to]))]
    this.fleet = new Fleet({
      ...fleetDefaults,
      onTime: this.settings.fleetOnTime,
      refund: this.settings.fleetRefund,
      latePrice: this.settings.fleetLatePrice,
      crowding: this.settings.fleetCrowding,
      calm: this.settings.fleetCalm,
      doubt: this.settings.fleetDoubt,
    }, this.network, places, drivers.map(driver => driver.homePlaceId))
  }

  quote(request: PriceRequest, immediate = false): void {
    this.requests.set(request.id, request)
    if (request.respondBy <= this.now || this.quoted.has(request.id)) return
    if (this.settings.auction && this.level >= 4 && !immediate) {
      if (this.deferred.has(request.id)) return
      this.deferred.set(request.id, request)
      this.outbox.push({ type: "quote", requestId: request.id, prices: { [request.options[0]!.kind]: 100_000_000 } })
      return
    }
    this.quoted.add(request.id)
    const reject = () => {
      if (this.level >= 4) this.outbox.push({ type: "quote", requestId: request.id, prices: { [request.options[0]!.kind]: 100_000_000 } })
    }
    const rules = this.noteRules(request)
    if (!rules.safe || (!this.settings.notes && request.note)) return reject()
    const plan = this.plannedRequest(request)
    const leg = plan.legs[0]!
    const road = this.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const supply = this.supply(request)
    if (road.km > this.settings.maxKm || supply < this.settings.minDrivers) return reject()
    const day = Math.floor(leg.pickup.window.from / 1440)
    let load = 0
    let unbooked = 0
    for (const other of this.requests.values()) {
      const order = this.orders.get(other.id)
      if (!this.pending.has(other.id) && (!order || order.status === "cancelled")) continue
      const first = this.plannedRequest(other).legs[0]!
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
    const latestOf = new Map<string, number>()
    for (const option of plan.options) {
      if (option.kind === "same_day" && supply < 15) continue
      if (option.kind === "same_day" && day === Math.floor(this.now / 1440) && unbooked >= this.settings.sameDayBacklog) continue
      const feasible = requestFeasibility(plan, option.deadline, this.network, this.settings)
      if (!feasible) continue
      const latest = feasible.latestPickupAt
      const buffer = supply < 30 || road.km > 300 ? 300 : 210
      if (latest < Math.max(this.now + buffer, leg.pickup.window.from + 120)) continue
      const hours = this.hoursFor(request)
      if (hours && !planTimedLeg(leg, hours, option.deadline, Math.max(this.now + buffer, leg.pickup.window.from + 120), this.network)) continue
      const price = Math.ceil(Math.max(option.listPriceCents * this.settings.price * trust, fee / (1 - this.settings.margin) + this.settings.priceFloor))
      if (this.level <= 3 && option.listPriceCents < fee * 1.3) continue
      prices[option.kind] = price
      latestOf.set(option.kind, latest)
    }
    if (!Object.keys(prices).length) return reject()
    if (this.settings.fleetRisk && this.settings.adaptive && this.level >= 4) {
      // Every option is priced over its own cost — the fee this car will need plus the risk of a late one —
      // so the dealer chooses the speed and we keep one margin over cost whichever it picks.
      const queue = this.fleetQueue()
      const features = this.features(request)
      let best: { ratio: number; profit: number } | null = null
      for (const option of request.options.filter(item => item.kind in prices)) {
        const cost = this.fleetCost(request, option, latestOf.get(option.kind) ?? this.now, queue)
        const choice = this.market.optimize(features, { costCents: cost, listPriceCents: option.listPriceCents, trust, minPrice: Math.ceil(cost) + 1 })
        if (choice.expectedProfitCents <= 0) { delete prices[option.kind]; continue }
        prices[option.kind] = Math.ceil(option.listPriceCents * trust * choice.ratio)
        if (!best || choice.expectedProfitCents > best.profit) best = { ratio: choice.ratio, profit: choice.expectedProfitCents }
      }
      if (!best) return reject()
      this.bids.set(request.id, { features, ratio: best.ratio })
    } else if (this.settings.adaptive && this.level >= 4) {
      const options = request.options.filter(option => option.kind in prices)
      const list = Math.min(...options.map(option => option.listPriceCents))
      const features = this.features(request)
      const choice = this.market.optimize(features, { costCents: fee * this.settings.costRatio * this.routeCost(request), listPriceCents: list, trust, minPrice: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor) })
      if (choice.expectedProfitCents <= 0) return reject()
      if (this.settings.sameDayPremium === 1 && this.settings.laterDiscount === 1) {
        for (const option of options) prices[option.kind] = Math.ceil(option.listPriceCents * trust * choice.ratio)
        this.bids.set(request.id, { features, ratio: choice.ratio })
      } else {
        const menu = priceMenu(options, { ratio: choice.ratio, trust, minPriceCents: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor), sameDayPremium: this.settings.sameDayPremium, laterDiscount: this.settings.laterDiscount })
        Object.assign(prices, menu.prices)
        this.bids.set(request.id, { features, ratio: menu.observationRatio })
      }
    }
    this.pending.add(request.id)
    this.outbox.push({ type: "quote", requestId: request.id, prices })
  }

  hoursFor(request: PriceRequest | undefined): TimedNote | null {
    if (this.settings.noteReader) return this.factsFor(request).timed
    if (!this.settings.timedNotes || !request || request.legs.length !== 1 || request.legs[0]!.pickup.privateAddress || request.legs[0]!.delivery.privateAddress) return null
    return readHours(request.note, request.arrivedAt)
  }

  /** What the full reader makes of the request's note: whether the dispatcher can serve it, and its times when it has any. */
  factsFor(request: PriceRequest | undefined): { rules: NoteRules; timed: TimedNote | null } {
    const unsafe = { rules: { safe: false, manual: false, plates: false }, timed: null }
    if (!request?.note) return { rules: { safe: true, manual: false, plates: false }, timed: null }
    const known = this.noteFacts.get(request.id)
    if (known) return known
    const facts = readFacts(request.note, request.arrivedAt)
    let result: { rules: NoteRules; timed: TimedNote | null } = unsafe
    // A car on summer tyres cannot be collected in snow; the dispatcher does not plan around snow yet.
    if (facts && !facts.summerTyres) {
      const rules = { safe: true, manual: facts.manual, plates: facts.plates }
      const hasTimes = facts.readyAt !== undefined || facts.deadline !== undefined || !!facts.pickup || !!facts.delivery
      const simple = request.legs.length === 1 && !request.legs[0]!.pickup.privateAddress && !request.legs[0]!.delivery.privateAddress
      if (!hasTimes) result = { rules, timed: null }
      // Times in the note of a trade-in or of a private address do not say which car or stop they mean.
      else if (simple) result = { rules, timed: { ...rules, safe: true, pickup: facts.pickup, delivery: facts.delivery, readyAt: facts.readyAt, deadline: facts.deadline } }
    }
    this.noteFacts.set(request.id, result)
    return result
  }

  readinessFor(request: PriceRequest): Readiness | null {
    const hours = this.hoursFor(request)
    if (hours?.readyAt !== undefined) return { safe: true, manual: hours.manual, plates: hours.plates, readyAt: hours.readyAt }
    if (!this.settings.readiness || request.legs.length !== 1 || request.legs[0]!.pickup.privateAddress || request.legs[0]!.delivery.privateAddress) return null
    return readReadiness(request.note, request.arrivedAt)
  }

  noteRules(request: PriceRequest | undefined): NoteRules {
    const note = request?.note ?? null
    if (this.settings.noteReader) return this.factsFor(request).timed ?? this.factsFor(request).rules
    return this.hoursFor(request) ?? (request ? this.readinessFor(request) : null) ?? readNote(this.settings.noteSpelling ? normalizeNote(note) : note)
  }

  plannedRequest(request: PriceRequest): PriceRequest {
    if (this.settings.noteSpelling && !this.settings.noteReader) {
      const note = normalizeNote(request.note)
      if (note !== request.note) request = { ...request, note }
    }
    const readiness = this.readinessFor(request)
    const hours = this.hoursFor(request)
    if (this.settings.noteReader && request.note && !hours) {
      // The feasibility check reads the note with the short reader, so it gets the note's meaning in that reader's words.
      const rules = this.factsFor(request).rules
      if (rules.safe) return { ...request, note: rules.manual || rules.plates ? { language: "en", text: [rules.manual ? "Manual gearbox" : "", rules.plates ? "No plates" : ""].filter(Boolean).join(". ") } : null }
    }
    if (!readiness && !hours) return request
    const first = request.legs[0]!
    const readyAt = Math.max(first.pickup.window.from, readiness?.readyAt ?? 0)
    const delay = Math.max(0, Math.floor(readyAt / 1440) - Math.floor(first.pickup.window.from / 1440)) * 1440
    const rules = hours ?? readiness!
    const equipment = [rules.manual ? "Manual gearbox" : "", rules.plates ? "No plates" : ""].filter(Boolean).join(". ")
    const options = request.options.map(option => ({ ...option, deadline: Math.min(option.deadline + delay, hours?.deadline ?? Infinity) }))
      .filter(option => option.deadline <= 7 * 1440 + 1200 && Math.floor(option.deadline / 1440) % 7 < 5)
    const leg = { ...first,
      pickup: { ...first.pickup, window: { from: readyAt, to: first.pickup.window.to + delay } },
      delivery: { ...first.delivery, window: { ...first.delivery.window, to: first.delivery.window.to + delay } },
    }
    return {
      ...request,
      note: equipment ? { language: "en", text: equipment } : null,
      legs: [hours ? withNoteHours(leg, hours) : leg],
      options,
    }
  }

  features(request: PriceRequest): MarketFeatures {
    const leg = request.legs[0]!
    return { day: Math.floor(request.arrivedAt / 1440), origin: leg.pickup.placeId, destination: leg.delivery.placeId, dealer: request.dealerId, km: this.network.km(leg.pickup.placeId, leg.delivery.placeId) }
  }

  nextDecisionAt(): number {
    return Math.min(this.now + 30, ...[...this.deferred.values()].map(request => Math.max(this.now + 1, request.respondBy - 5)), ...[...this.held.values()].map(item => Math.max(this.now + 1, item.at + this.settings.bundleWait)))
  }

  auctionValue(request: PriceRequest): number {
    const fee = this.baseFee(request)
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const list = Math.min(...request.options.map(option => option.listPriceCents))
    return this.market.optimize(this.features(request), { costCents: fee * this.settings.costRatio * this.routeCost(request), listPriceCents: list, trust, minPrice: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor) }).expectedProfitCents
  }

  /** Drivers ask more than the typical fee for a short route, which hardly pays their trip to the car and home. */
  routeCost(request: PriceRequest): number {
    const km = this.network.km(request.legs[0]!.pickup.placeId, request.legs[0]!.delivery.placeId)
    return km < 50 ? this.settings.shortCost : km < 100 ? this.settings.middleCost : this.settings.longCost
  }

  supply(request: PriceRequest): number {
    const first = request.legs[0]!
    const rules = this.noteRules(request)
    let count = 0
    for (const driver of this.drivers) {
      if (rules.manual && driver.licence !== "manual") continue
      if (request.legs.some(leg => leg.car.premium) && (driver.rating < 4.8 || driver.completedGigs < 50)) continue
      const km = this.network.km(driver.homePlaceId, first.pickup.placeId)
      count += km <= 35 ? 1 : km <= 70 ? 0.35 : 0
    }
    return count
  }

  /** The fee an order's open gig shows now, as a multiple of the order's typical fee. */
  postedMultiple(order: Order): number {
    const post = this.gigsOf(order.id).map(id => this.posts.get(id)).find(Boolean)
    const request = this.requests.get(order.id)
    if (!post || !request) return 1
    const step = post.schedule.findLast(item => item.at <= this.now) ?? post.schedule[0]
    return step ? step.feeCents / Math.max(1, request.referenceFeeCents) : 1
  }

  /** The gigs that wait for a driver now: the queue this request's cars would join. */
  fleetQueue(): Queue {
    const waiting: Waiting[] = []
    let late = 0
    for (const order of this.orders.values()) {
      if (order.status === "cancelled") continue
      const undelivered = order.legs.map((_, leg) => leg).filter(leg => order.deliveredAt[leg] === null)
      if (!undelivered.length) continue
      const carried = undelivered.filter(leg => {
        const gig = this.legGigs.get(order.id)?.get(leg)
        return gig !== undefined && this.booked.has(gig)
      })
      if (carried.length < undelivered.length) {
        const request = this.requests.get(order.id)
        if (!request) continue
        const option = request.options.find(item => item.kind === order.option) ?? request.options[0]!
        const car = this.fleet.car({ ...request, legs: order.legs }, option, this.pickupBy(order), this.now, this.postedAt.get(order.id) ?? this.now)
        waiting.push({ id: order.id, multiple: this.postedMultiple(order), car, listPrice: option.listPriceCents })
      }
      if (order.deliveredAt.every(at => at !== null) && !this.onTime(order)) late += 1
    }
    return this.fleet.queueOf(waiting, this.bookedCount, late)
  }

  onTime(order: Order): boolean {
    return order.legs.every((leg, i) => order.deliveredAt[i]! <= Math.min(order.deadline, leg.delivery.privateAddress ? leg.delivery.window.to + 30 : Infinity))
  }

  /** What the drivers' model expects this car to cost us, in cents: its fee plus the risk of a late refund. */
  fleetCost(request: PriceRequest, option: DeliveryOption, latestPickupAt: number, queue: Queue): number {
    const car = this.fleet.car(request, option, latestPickupAt, this.now)
    return this.fleet.cost(car, request.referenceFeeCents, option.listPriceCents, queue)
  }

  /** The flat fee, in cents, that the drivers' model finds cheapest for this order's car. */
  fleetFee(request: PriceRequest, option: DeliveryOption, latestPickupAt: number, since?: number): { cents: number; multiple: number } {
    const queue = this.fleetQueue()
    const car = this.fleet.car(request, option, latestPickupAt, this.now, since)
    const refund = this.settings.fleetRefund * option.listPriceCents
    const choice = this.fleet.fee(car, request.referenceFeeCents, refund, this.fleet.latePriceOf(queue), queue)
    return { cents: Math.max(1, Math.round(choice.multiple * request.referenceFeeCents)), multiple: choice.multiple }
  }

  baseFee(request: PriceRequest): number {
    const supply = this.supply(request)
    const extra = supply < 20 ? 0.18 : supply < 50 ? 0.08 : 0
    return Math.max(2000, Math.round(request.referenceFeeCents * (this.settings.fee + extra)))
  }

  pickupBy(order: Order): number {
    const hours = this.hoursFor(this.requests.get(order.id))
    if (hours) return planTimedLeg(order.legs[0]!, hours, Math.min(order.deadline, hours.deadline ?? Infinity), this.now, this.network)?.latestPickupAt ?? this.now
    if (!this.settings.safetySlack || order.legs.length !== 1) return order.lastPickupAt
    const request = this.requests.get(order.id)
    const rules = this.noteRules(request)
    const readiness = request ? this.readinessFor(request) : null
    const first = order.legs[0]!
    const leg = readiness ? { ...first, pickup: { ...first.pickup, window: { ...first.pickup.window, from: Math.max(first.pickup.window.from, readiness.readyAt) } } } : first
    return Math.min(order.lastPickupAt, lastPickup(leg, order.deadline, this.network, rules.plates))
  }

  payoutSchedule(schedule: FeeStep[], opening: boolean): FeeStep[] {
    if (this.settings.payout === 1) return schedule
    return schedule.map((step, index) => ({ ...step, feeCents: Math.max(1, Math.round(step.feeCents * (this.settings.openingOnly && (!opening || index > 0) ? 1 : this.settings.payout))) }))
  }

  feesFor(order: Order, cars: number, discounted = true): FeeStep[] {
    const request = this.requests.get(order.id)!
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + this.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    // A dealer can replace a local trip with a long one after the price is agreed.
    const routeChange = Math.max(1, duration(order.legs) / duration(request.legs))
    let fee = this.baseFee({ ...request, legs: order.legs }) * routeChange * cars / order.legs.length
    if (this.settings.fleetRisk) {
      const option = request.options.find(item => item.kind === order.option) ?? request.options[0]!
      fee = this.fleetFee({ ...request, legs: order.legs }, option, this.pickupBy(order), this.postedAt.get(order.id)).cents * cars / Math.max(1, order.legs.length)
    }
    const pay = (schedule: FeeStep[], opening: boolean) => discounted ? this.payoutSchedule(schedule, opening) : schedule
    if (this.level >= 2 && this.settings.lateRescue && cars === 1 && lateRescueApplies(order, this.now)) return pay(lateRescueSchedule(order, this.now, this.settings.lateRepost ? fee * this.settings.lateFee / 1.2 : fee), false)
    const rescue = this.urgent.has(order.id)
    const pickupBy = this.pickupBy(order)
    const remaining = pickupBy - this.now
    const start = rescue ? remaining <= 60 ? 2.5 : remaining <= 120 ? 1.9 : 1.5 : 1
    if (this.level === 1) return pay([{ at: this.now, feeCents: Math.round(fee * start) }], start === 1)
    // One flat fee per gig: a schedule with one step. A fee that rises teaches drivers to wait for the next step.
    if (this.settings.fleetFlatFee) return pay([{ at: this.now, feeCents: Math.round(fee * start) }], start === 1)
    // A steady initial price avoids teaching drivers to wait for hourly increases.
    const due = Math.max(this.now + 30, pickupBy - 240)
    // A gig that no driver has taken a day before its last pickup will not find one in the last four hours:
    // a driver needs time to see the gig and to reach the car. So the fee starts to climb a day ahead.
    const early = this.settings.earlyClimb ? [{ at: pickupBy - 1440, feeCents: Math.round(fee * Math.max(start, this.settings.climbDay)) }, { at: pickupBy - 720, feeCents: Math.round(fee * Math.max(start, this.settings.climbHalfDay)) }].filter(step => step.at >= this.now + 30 && step.at < due) : []
    return pay([
      { at: this.now, feeCents: Math.round(fee * start) },
      ...early,
      { at: due, feeCents: Math.round(fee * Math.max(start, 1.45)) },
      { at: Math.max(due + 30, pickupBy - 120), feeCents: Math.round(fee * Math.max(start, 1.9)) },
      { at: Math.max(due + 60, pickupBy - 60), feeCents: Math.round(fee * Math.max(start, 2.5)) },
    ], start === 1)
  }

  async post(order: Order, legs: number[], retry = { pickupFrom: 0, manualLicence: false, plates: false }): Promise<void> {
    if (!legs.length) return
    const request = this.requests.get(order.id)!
    const rules = this.noteRules(request)
    const stops: PostAction["stops"] = legs.flatMap(leg => {
      const car = order.legs[leg]!
      const from = Math.max(car.pickup.window.from, retry.pickupFrom, this.readinessFor(request)?.readyAt ?? 0)
      const cutoff = this.pickupBy(order)
      const to = this.settings.safetySlack && cutoff > Math.max(from, this.now + 30) ? Math.min(car.pickup.window.to, cutoff) : Math.max(from, car.pickup.window.to)
      return [
        { orderId: order.id, leg, kind: "pickup" as const, withPlates: rules.plates || retry.plates, withCharging: needsCharge(car, this.network), ...(from > car.pickup.window.from || to < car.pickup.window.to ? { window: { from, to } } : {}) },
        { orderId: order.id, leg, kind: "delivery" as const },
      ]
    })
    const hold = this.settings.bundleWait > 0 && this.level >= 3 && order.legs.length === 1 && rules.safe && !(this.settings.noteReader && this.hoursFor(request)) && !order.legs[0]!.pickup.privateAddress && !order.legs[0]!.delivery.privateAddress && !retry.pickupFrom && !retry.manualLicence && !retry.plates && !this.urgent.has(order.id) && this.pickupBy(order) > this.now + 360
    const post: PostAction = { type: "post", stops, audience: { experienced: legs.some(i => order.legs[i]!.car.premium), manualLicence: rules.manual || retry.manualLicence }, schedule: this.feesFor(order, legs.length, !hold) }
    const hours = this.hoursFor(request)
    if (hours) {
      const restrictions = { ...hours, plates: hours.plates || retry.plates, readyAt: Math.max(hours.readyAt ?? 0, retry.pickupFrom) }
      const timed = planTimedLeg(order.legs[0]!, restrictions, Math.min(order.deadline, hours.deadline ?? Infinity), this.now + 30, this.network)
        ?? planTimedLeg(order.legs[0]!, restrictions, Math.max(order.deadline, this.now + 7 * 1440), this.now + 30, this.network)
      if (!timed) {
        const reason = `No route inside parsed note hours for ${order.id}`
        if (!this.failures.some(failure => failure.reason === reason)) this.failures.push({ at: this.now, action: post, reason })
        return
      }
      post.stops[0]!.window = timed.pickup
      post.stops[1]!.window = timed.delivery
    }
    if (this.settings.fleetRisk && !this.fleet.forecast.has(order.id)) {
      // What the model said when this car went into the app, at the fee it actually shows: this week's outcomes are measured against it.
      const option = request.options.find(item => item.kind === order.option) ?? request.options[0]!
      const queue = this.fleetQueue()
      const car = this.fleet.car({ ...request, legs: order.legs }, option, this.pickupBy(order), this.now)
      const multiple = (post.schedule[0]?.feeCents ?? request.referenceFeeCents) / Math.max(1, request.referenceFeeCents)
      this.fleet.forecast.set(order.id, this.fleet.logit(car, multiple, queue))
      logFleet(process.env.FLEET_LOG, { kind: "post", orderId: order.id, at: this.now, multiple, typical: request.referenceFeeCents, list: option.listPriceCents, predicted: this.fleet.onTime(car, multiple, queue), car, backlog: queue.backlog, going: queue.going, known: queue.known, late: queue.late, world: queue.world })
    }
    if (hold) {
      this.held.set(order.id, { post, at: this.held.get(order.id)?.at ?? this.now })
    } else this.outbox.push(post)
  }

  flushBundles(): void {
    if (![...this.held.values()].some(item => item.at + this.settings.bundleWait <= this.now)) return
    const items = [...this.held.entries()].filter(([id]) => this.orders.has(id))
    this.held.clear()
    const candidates = items.map(([id, item]) => ({ order: this.orders.get(id)!, post: item.post, noteSafe: this.noteRules(this.requests.get(id)).safe }))
    const bundles = this.settings.bundlePairs ? planBundles(this.now, candidates, this.network) : []
    const paired = new Set(bundles.flatMap(bundle => bundle.indices))
    this.outbox.push(...bundles.map(bundle => bundle.post), ...candidates.filter((_, i) => !paired.has(i)).map(candidate => ({ ...candidate.post, schedule: this.payoutSchedule(candidate.post.schedule, true) })))
  }

  override async sendPostOf(orderId: string): Promise<void> {
    const item = this.held.get(orderId)
    if (item) { this.held.delete(orderId); this.outbox.push({ ...item.post, schedule: this.payoutSchedule(item.post.schedule, true) }) }
    await super.sendPostOf(orderId)
  }

  override async change(order: Order): Promise<void> {
    this.held.delete(order.id)
    await super.change(order)
  }

  override async repost(gigId: string): Promise<void> {
    const post = this.posts.get(gigId)
    if (!post?.stops.some(stop => this.hoursFor(this.requests.get(stop.orderId)))) return super.repost(gigId)
    const survivors = post.stops.filter(stop => stop.kind === "pickup" && this.legGigs.get(stop.orderId)?.get(stop.leg) === gigId && this.orders.get(stop.orderId)?.deliveredAt[stop.leg] === null)
    this.forgetGig(gigId)
    for (const stop of survivors) await this.post(this.orders.get(stop.orderId)!, [stop.leg])
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
    if (event.kind === "gig_booked") { this.gigDriver.set(event.gigId, event.driverId); this.bookedCount += 1 }
    if (this.settings.homeOffers && event.kind === "offer_answered" && !this.offeredDrivers.get(event.gigId)?.has(event.driverId)) {
      const key = `${Math.floor(event.at / 1440)}:${event.driverId}`
      this.offerCount.set(key, (this.offerCount.get(key) ?? 0) + 1)
      this.homeOffersSent.set(event.gigId, (this.homeOffersSent.get(event.gigId) ?? 0) + 1)
      if (!this.offeredDrivers.has(event.gigId)) this.offeredDrivers.set(event.gigId, new Set())
      this.offeredDrivers.get(event.gigId)!.add(event.driverId)
    }
    if (event.kind === "picked_up" || event.kind === "delivered") {
      const driver = this.gigDriver.get(event.gigId)
      if (driver) this.driverPlace.set(driver, { place: event.placeId, at: event.at })
    }
    if (event.kind === "order_cancelled") {
      this.held.delete(event.orderId)
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
        const onTime = this.onTime(order)
        this.trust.set(order.dealerId, onTime ? Math.min(25, count + 1) : Math.floor(count / 2))
        this.fleet.ordersSoFar += 1
        if (!onTime) this.fleet.lateSoFar += 1
        this.fleet.outcome.set(order.id, onTime ? 1 : 0)
        logFleet(process.env.FLEET_LOG, { kind: "outcome", orderId: order.id, at: this.now, onTime: onTime ? 1 : 0 })
      }
    }
  }

  homeOffers(): void {
    if (this.now < this.offersAfter) return
    const day = Math.floor(this.now / 1440)
    const usedToday = new Map(this.drivers.map(driver => [driver.id, this.offerCount.get(`${day}:${driver.id}`) ?? 0]))
    for (const [gigId, post] of this.posts) {
      const first = post.stops[0]!
      const order = this.orders.get(first.orderId)
      const request = this.requests.get(first.orderId)
      if (!order || !request) continue
      const active = (this.offers.get(gigId) ?? []).filter(offer => offer.until > this.now)
      this.offers.set(gigId, active)
      const shown = post.schedule.filter(step => step.at <= this.now).at(-1) ?? post.schedule[0]!
      const actions = chooseHomeOffers(this.now, {
        gigId, order, post, safe: this.noteRules(request).safe,
        open: !this.booked.has(gigId) && this.legGigs.get(order.id)?.get(first.leg) === gigId && !this.outbox.some(action => action.type === "withdraw" && action.gigId === gigId),
        openingFeeCents: this.baseFee(request), publicFeeCents: shown.feeCents, activeOffers: active.length, offersSent: this.homeOffersSent.get(gigId) ?? 0,
      }, this.drivers, this.network, { usedToday, attempted: this.offeredDrivers.get(gigId) ?? new Set(), viewedAt: this.viewedAt })
      for (const action of actions) {
        const used = (usedToday.get(action.driverId) ?? 0) + 1
        usedToday.set(action.driverId, used)
        this.offerCount.set(`${day}:${action.driverId}`, used)
        this.homeOffersSent.set(gigId, (this.homeOffersSent.get(gigId) ?? 0) + 1)
        active.push({ driver: action.driverId, until: this.now + 11 })
        if (!this.offeredDrivers.has(gigId)) this.offeredDrivers.set(gigId, new Set())
        this.offeredDrivers.get(gigId)!.add(action.driverId)
        this.outbox.push(action)
      }
    }
  }

  override carry(post: PostAction, gigId: string): void {
    super.carry(post, gigId)
    if (this.settings.relist) this.postedAt.set(gigId, this.now)
  }

  async relistOpenGigs(): Promise<void> {
    if (!this.settings.relist) return
    for (const [gigId, post] of this.posts) {
      const order = this.orders.get(post.stops[0]!.orderId)
      if (!order || this.relisted.has(order.id) || this.booked.has(gigId)) continue
      if (this.legGigs.get(order.id)?.get(0) !== gigId || !canRelist(order, post, this.now, this.postedAt.get(gigId) ?? this.now)) continue
      if (this.outbox.some(action => "gigId" in action && action.gigId === gigId)) continue
      this.relisted.add(order.id)
      const actions: Action[] = [{ type: "withdraw", gigId }]
      const results = await this.world.act(actions)
      this.readResults(actions, results)
      if (results.length === 1 && results[0]!.ok) this.outbox.push(structuredClone(post))
    }
  }

  async tick(): Promise<void> {
    this.flushBundles()
    const ready = [...this.deferred.values()].filter(request => request.respondBy <= this.now + 5)
      .sort((a, b) => this.auctionValue(b) - this.auctionValue(a) || a.id.localeCompare(b.id))
    for (const request of ready) {
      this.deferred.delete(request.id)
      this.quote(request, true)
    }
    for (const order of this.orders.values()) {
      if (order.status === "delivered" || order.status === "cancelled") continue
      const missing = order.legs.map((_, leg) => leg).filter(leg => order.deliveredAt[leg] === null && !this.held.has(order.id) && !this.legGigs.get(order.id)?.has(leg) && !this.outbox.some(a => a.type === "post" && a.stops.some(s => s.orderId === order.id && s.leg === leg)))
      if (missing.length) await this.post(order, missing)
      for (const gigId of this.gigsOf(order.id)) {
        if (this.booked.has(gigId)) continue
        if (this.level >= 3 && this.settings.earlyOffers && order.legs[0]!.pickup.window.from <= this.now + 180 && (this.lastOffer.get(gigId) ?? -Infinity) <= this.now - 30 && this.now % 1440 >= 420 && this.now % 1440 < 1260) {
          this.lastOffer.set(gigId, this.now)
          this.offer(gigId, order, order.lastPickupAt - this.now > 240 ? 1 : 3)
        }
        const resetLate = this.level >= 2 && this.settings.lateRescue && lateRescueApplies(order, this.now) && this.posts.get(gigId)?.stops.length === 2 && this.lateResets.get(gigId) !== order.lastPickupAt && this.lateReposts.get(order.id) !== order.lastPickupAt
        if (resetLate || this.now >= this.pickupBy(order) - 240 && (this.raised.get(gigId) ?? -Infinity) < this.now - 60) {
          if (resetLate) this.lateResets.set(gigId, order.lastPickupAt)
          this.raised.set(gigId, this.now)
          if (resetLate && this.settings.lateRepost && !this.hoursFor(this.requests.get(order.id)) && await this.repostLate(order, gigId)) continue
          await this.raise(order.id)
          if (this.level >= 3) this.offer(gigId, order)
        }
      }
    }
    await this.relistOpenGigs()
    if (this.settings.homeOffers && this.level >= 3) {
      const posts = this.outbox.filter(action => action.type === "post")
      for (let i = this.outbox.length - 1; i >= 0; i--) if (this.outbox[i]!.type === "post") this.outbox.splice(i, 1)
      if (posts.length) this.readResults(posts, await this.world.act(posts))
      this.homeOffers()
    }
  }

  /** A gig keeps the windows it was posted with, and after the last pickup time no driver can meet them.
   * Posted again, its stops run to the end of the world, and a driver can take the car for the next day. */
  async repostLate(order: Order, gigId: string): Promise<boolean> {
    const post = this.posts.get(gigId)
    if (!post || !await this.withdraw(order.id)) return false
    this.lateReposts.set(order.id, order.lastPickupAt) // once for each last pickup time
    this.outbox.push({ ...post, stops: post.stops.map(stop => ({ ...stop, window: undefined })), schedule: this.feesFor(order, 1) })
    return true
  }

  offer(gigId: string, order: Order, limit = 3): void {
    if (this.now < this.offersAfter) return
    const post = this.posts.get(gigId)
    if (!post) return
    if (new Set(post.stops.map(stop => stop.orderId)).size > 1) return
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
      if (result?.ok && action.type === "reprice") {
        const post = this.posts.get(action.gigId)
        if (post) post.schedule = action.schedule
      }
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
        if (this.settings.homeOffers) {
          this.homeOffersSent.set(event.gigId, (this.homeOffersSent.get(event.gigId) ?? 0) + 1)
          if (!this.offeredDrivers.has(event.gigId)) this.offeredDrivers.set(event.gigId, new Set())
          this.offeredDrivers.get(event.gigId)!.add(event.driverId)
        }
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
    if (this.settings.relist) {
      for (const gig of snapshot.gigs) {
        this.postedAt.set(gig.id, gig.postedAt)
        // A withdrawn gig may be our earlier attempt; never repeat it after restarting.
        if (gig.status === "withdrawn") for (const stop of gig.stops) this.relisted.add(stop.orderId)
      }
    }
    for (const order of snapshot.orders) if (order.status === "delivered") this.deliveredOrders.add(order.id)
    this.lastSeq = history.at(-1)?.seq ?? -1
  }
}
