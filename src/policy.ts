import { Desk } from "./desk.ts"
import { Network, lastPickup, needsCharge } from "./planning.ts"
import { readNote } from "./notes.ts"
import { normalizeNote } from "./note-spelling.ts"
import { canRelist } from "./relisting.ts"
import { readReadiness } from "./readiness.ts"
import { readHours } from "./hours-note.ts"
import { readFacts } from "./note-reader.ts"
import { openingRatio } from "./booking.ts"
import { feeRatio, lateChance, REFUND_SHARE } from "./risk.ts"
import { planTimedLeg, withNoteHours } from "./hours-plan.ts"
import type { TimedNote } from "./hours-note.ts"
import { lateRescueApplies, lateRescueSchedule } from "./late-rescue.ts"
import type { Readiness } from "./readiness.ts"
import type { NoteRules } from "./notes.ts"
import { PlaceDemandModel } from "./place-market.ts"
import { DemandModel } from "./optimizer.ts"
import { extendBundle, planBundles } from "./bundles.ts"
import { requestFeasibility } from "./admission.ts"
import { priceMenu } from "./menu.ts"
import { chooseHomeOffers } from "./home-offers.ts"
import type { MarketFeatures } from "./optimizer.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DeskSnapshot, DriverProfile, FeeStep, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

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
  /** Minutes after posting when a gig that no driver took goes to `sitFee` times the full fee; 0 for never. */
  sitAfter: number; sitFee: number
  /** Pair a newly won car with a car whose gig has waited at least this many minutes without a driver; 0 for never. */
  pairOpen: number
  /** A request whose car can ride with one of our waiting cars is priced at this share of its cost, and the limits on open work do not refuse it; 0 for off. */
  pairQuote: number
  /** Minutes a gig with two cars may wait for a driver before its cars go alone; 0 for no limit. */
  pairPatience: number
  /** Decline routes shorter than this many kilometres; 0 for none. */
  minKm: number
  /** The opening fee, in full fees, of a single car on a route of 250 km or more; the same as `payout` by default. */
  longPayout: number
  /** Choose each single car's opening fee with the booking model: what a gig that no driver takes at its opening costs more, in typical fees; 0 for off. */
  bookMiss: number
  /** Take cars still on summer tyres, and collect them outside the snow that a forecast announces. */
  summerTyres: boolean
  /** Instead of declining a request over the limits on drivers and open work, price it dearer: cost × (1 + softLimits × overload); 0 keeps the hard limits. */
  softLimits: number
  /** One flat fee, in full fees, until the deadline warning, instead of the climbing schedule; 0 for the climb. */
  flatFee: number
  /** The fees of the last four hours before the last pickup, in full fees: at four hours, two hours and one hour. */
  dueFee: number; rescue2: number; rescue1: number
  /** Two cars in one gig: the most kilometres from the first delivery to the second pickup, and the largest discount on the two fees. */
  bundleKm: number; bundleDiscount: number
  /** The most cars in one gig: two, or more by adding a car whose pickup is near the gig's last delivery. */
  chainCars: number
  /** How far the market model lets a level per day and pickup town, and per lane, stray from the rest; 0 for none. */
  marketDayOrigin: number; marketLane: number
  /** Room under the limits on open and unbooked work, as a multiple, for routes under 100 km and for routes of 250 km or more: drivers go to the cars that earn most. */
  shortGate: number; longGate: number
  /** A late car halves its dealer's trust, so a car of a trusted dealer gets a dearer fee: × (1 + trustGuard × trust / 25). */
  trustGuard: number
  /** Right after posting, offer a single car to up to this many drivers who live near its delivery, at `homeShare` of the public fee; 0 for none. */
  homeDrivers: number; homeShare: number
  /** Post a single car whose pickup starts on a later day at this minute of that day (420 = 07:00), when its last pickup leaves time; 0 posts at once.
   * A driver hears of each order once, and books a later day only when they know they work then. */
  postAt: number
  /** Price each option by its own risk: the cost adds P(late) × (the refund + riskPenalty euros); 0 is off. Options with P(late) over `maxLate` are not sold,
   * and the limits on open work are `riskGate` times wider. */
  riskPenalty: number; maxLate: number; riskGate: number
  /** The penalty grows with the dealer's trust, which a late car halves: × (1 + riskTrust × trust / 25). And the least minutes to the last pickup an option needs. */
  riskTrust: number; minSlack: number
  /** Cost each option's fee from the fee model, times this; 0 keeps the fee estimate times costRatio. */
  feeModel: number
  /** The fee, in full fees, a day and half a day before the last pickup, for a gig that no driver has taken. */
  climbDay: number; climbHalfDay: number
  /** What a route really costs against the dispatcher's estimate, for routes under 50 km, from 50 km to 100 km, and longer. */
  shortCost: number; middleCost: number; longCost: number
}
export const defaults: Settings = {
  price: 1.42, fee: 1.05, payout: 0.85, margin: 0.1, capacity: 0.35, maxKm: 700, minDrivers: 8,
  notes: true, noteSpelling: false, relist: false, openingOnly: true, adaptive: true, earlyOffers: false, safetySlack: false,
  auction: false, allowPrivate: false, tradeIns: false, homeOffers: false, readiness: false, bundlePairs: true, timedNotes: false, noteReader: true, lateRescue: true, sameDayPremium: 1, laterDiscount: 1, placePrior: 0, bundleWait: 15,
  backlog: 0.08, priceFloor: 0, costRatio: 1.15, trustStep: 0.01, sameDayBacklog: 4, demandSlope: 14, shortCost: 1, middleCost: 1, longCost: 1, climbDay: 1.1, climbHalfDay: 1.25, lateRepost: true, lateFee: 1, sitAfter: 0, sitFee: 1, pairOpen: 180, pairQuote: 0, pairPatience: 0, minKm: 0, longPayout: 0.85, bookMiss: 0, summerTyres: false, softLimits: 0, flatFee: 0, dueFee: 1.45, rescue2: 1.6, rescue1: 1.8, bundleKm: 30, bundleDiscount: 0.2, chainCars: 2, marketDayOrigin: 0, marketLane: 0, shortGate: 1, longGate: 1, trustGuard: 0, homeDrivers: 0, homeShare: 0.8, postAt: 0, riskPenalty: 100, maxLate: 0.3, riskGate: 2, riskTrust: 0, minSlack: 0, feeModel: 0,
  earlyClimb: true,
}

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Configuration must be an object")
  for (const [key, field] of Object.entries(value)) {
    if (!(key in defaults)) throw new Error(`Unknown setting: ${key}`)
    if (typeof defaults[key as keyof Settings] === "boolean") { if (typeof field !== "boolean") throw new Error(`${key} must be boolean`); continue }
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0 || (field === 0 && !["margin", "priceFloor", "trustStep", "placePrior", "bundleWait", "sitAfter", "pairOpen", "pairQuote", "pairPatience", "minKm", "bookMiss", "softLimits", "flatFee", "marketDayOrigin", "marketLane", "trustGuard", "homeDrivers", "postAt", "riskPenalty", "riskTrust", "minSlack", "feeModel"].includes(key))) throw new Error(`${key} must be a positive number`)
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
  /** Gigs already offered to drivers who live near the delivery. */
  homeOffered = new Set<string>()
  /** Single cars waiting for the morning of their pickup day: order id -> when to post, and the post. */
  morning = new Map<string, { at: number; post: PostAction }>()
  /** Request or order id -> the waiting order that its car can ride with. */
  partners = new Map<string, string>()
  /** Orders whose two-car gig found no driver in time: they go alone from now on. */
  unpaired = new Set<string>()
  /** Snow from forecasts: when and where. */
  snow: { from: number; to: number; places: Set<string> }[] = []
  /** Orders and requests whose car is still on summer tyres. */
  tyres = new Set<string>()
  /** Why requests were declined, for the record. */
  declines = new Map<string, number>()
  /** A post was refused because the world already has a live gig for its car, so the dispatcher lost track of a gig. */
  resync = false
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

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    super(world, level, now)
    validateSettings(settings)
    this.network = new Network(map)
    this.drivers = drivers
    this.settings = { ...defaults, ...settings }
    const marketSettings = { threshold: level === 8 ? 1.4 : level === 7 ? 1.25 : 1, slope: this.settings.demandSlope, dayOrigin: this.settings.marketDayOrigin, lane: this.settings.marketLane }
    this.market = this.settings.placePrior > 0 ? new PlaceDemandModel(marketSettings, this.settings.placePrior) : new DemandModel(marketSettings)
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
    const reject = (reason = "other") => {
      this.declines.set(reason, (this.declines.get(reason) ?? 0) + 1)
      if (this.level >= 4) this.outbox.push({ type: "quote", requestId: request.id, prices: { [request.options[0]!.kind]: 100_000_000 } })
    }
    const rules = this.noteRules(request)
    if (!rules.safe || (!this.settings.notes && request.note)) return reject(request.legs.length > 1 ? "trade-in note" : request.legs.some(l => l.pickup.privateAddress || l.delivery.privateAddress) ? "private note" : "note")
    const plan = this.plannedRequest(request)
    const leg = plan.legs[0]!
    const road = this.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const supply = this.supply(request)
    if (road.km > this.settings.maxKm || road.km < this.settings.minKm) return reject("distance")
    let overload = 0
    if (supply < this.settings.minDrivers) {
      if (!this.settings.softLimits) return reject("few drivers")
      overload += (this.settings.minDrivers - supply) / this.settings.minDrivers
    }
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
    const partner = this.settings.pairQuote > 0 ? this.partnerFor(request) : null
    if (partner) this.partners.set(request.id, partner)
    else this.partners.delete(request.id)
    const gate = road.km < 100 ? this.settings.shortGate : road.km >= 250 ? this.settings.longGate : 1
    const riskWide = this.settings.riskPenalty > 0 ? this.settings.riskGate : 1
    const capacityLimit = Math.max(1, supply * this.settings.capacity * gate * riskWide)
    if (!partner && load >= capacityLimit) {
      if (!this.settings.softLimits) return reject("capacity")
      overload += (load + 1 - capacityLimit) / capacityLimit
    }
    const backlogLimit = Math.max(2, supply * this.settings.backlog * gate * riskWide)
    if (!partner && unbooked >= backlogLimit) {
      if (!this.settings.softLimits) return reject("backlog")
      overload += (unbooked + 1 - backlogLimit) / backlogLimit
    }
    const fee = this.baseFee(request)
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const prices: Record<string, number> = {}
    const risk: Record<string, number> = {}
    const feeCost: Record<string, number> = {}
    const deliveryDrivers = this.settings.riskPenalty > 0 ? this.drivers.reduce((sum, driver) => { const k = this.network.km(driver.homePlaceId, leg.delivery.placeId); return sum + (k <= 35 ? 1 : k <= 70 ? 0.35 : 0) }, 0) : 0
    for (const option of plan.options) {
      if (option.kind === "same_day" && supply < 15) continue
      if (option.kind === "same_day" && day === Math.floor(this.now / 1440) && unbooked >= this.settings.sameDayBacklog) continue
      const feasible = requestFeasibility(plan, option.deadline, this.network, this.settings)
      if (!feasible) continue
      const latest = feasible.latestPickupAt
      const buffer = this.settings.minSlack > 0 ? this.settings.minSlack : supply < 30 || road.km > 300 ? 300 : 210
      if (latest < Math.max(this.now + buffer, leg.pickup.window.from + 120)) continue
      const hours = this.hoursFor(request)
      if (hours && !planTimedLeg(leg, hours, option.deadline, Math.max(this.now + buffer, leg.pickup.window.from + 120), this.network)) continue
      const price = Math.ceil(Math.max(option.listPriceCents * this.settings.price * trust, fee / (1 - this.settings.margin) + this.settings.priceFloor))
      if (this.level <= 3 && option.listPriceCents < fee * 1.3) continue
      if (this.settings.riskPenalty > 0) {
        const signs = {
          km: road.km, slackHours: (latest - Math.max(this.now, leg.pickup.window.from)) / 60, pickupDrivers: supply, deliveryDrivers,
          unbookedShare: unbooked / (supply * 0.08 + 2), loadShare: load / (supply * 0.35 + 1), sameDay: option.kind === "same_day", threeDays: option.kind === "within_3_days",
          friday: Math.floor(this.now / 1440) % 7 === 4, afternoon: this.now % 1440 >= 900, premium: leg.car.premium,
        }
        const late = lateChance(signs)
        if (late > this.settings.maxLate) continue
        if (this.settings.feeModel > 0) feeCost[option.kind] = request.referenceFeeCents * feeRatio(signs) * this.settings.feeModel
        risk[option.kind] = late * (REFUND_SHARE * option.listPriceCents * 1.45 + this.settings.riskPenalty * 100 * (1 + this.settings.riskTrust * Math.min(25, this.trust.get(request.dealerId) ?? 0) / 25))
      }
      prices[option.kind] = price
    }
    if (!Object.keys(prices).length) return reject("no feasible option")
    if (this.settings.adaptive && this.level >= 4) {
      const options = request.options.filter(option => option.kind in prices)
      const list = Math.min(...options.map(option => option.listPriceCents))
      const features = this.features(request)
      const choice = this.market.optimize(features, { costCents: fee * this.settings.costRatio * this.routeCost(request) * (partner ? this.settings.pairQuote : 1) * (1 + this.settings.softLimits * overload), listPriceCents: list, trust, minPrice: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor) })
      if (choice.expectedProfitCents <= 0) return reject("no profit")
      if (this.settings.riskPenalty > 0) {
        // Each option at the price that is best for its own cost: the fee and its own risk of being late.
        let ratio = Infinity
        for (const option of options) {
          const own = this.market.optimize(features, { costCents: (feeCost[option.kind] ?? fee * this.settings.costRatio * this.routeCost(request)) + (risk[option.kind] ?? 0), listPriceCents: option.listPriceCents, trust, minPrice: Math.ceil(fee / (1 - this.settings.margin) + this.settings.priceFloor) })
          if (own.expectedProfitCents <= 0) { delete prices[option.kind]; continue }
          prices[option.kind] = Math.ceil(option.listPriceCents * trust * own.ratio)
          ratio = Math.min(ratio, own.ratio)
        }
        if (!Object.keys(prices).length) return reject("no profit")
        this.bids.set(request.id, { features, ratio })
      } else if (this.settings.sameDayPremium === 1 && this.settings.laterDiscount === 1) {
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
    if (facts?.summerTyres && this.settings.summerTyres) this.tyres.add(request.id)
    if (facts && (!facts.summerTyres || this.settings.summerTyres)) {
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

  /** A gig with two cars that no driver took within `pairPatience` minutes is taken out, and each car goes alone. */
  async splitWaitingPairs(): Promise<void> {
    for (const [gigId, post] of [...this.posts]) {
      const ids = [...new Set(post.stops.map(stop => stop.orderId))]
      if (ids.length < 2 || this.booked.has(gigId) || this.now - (this.postedAt.get(gigId) ?? this.now) < this.settings.pairPatience) continue
      if (!ids.every(id => this.legGigs.get(id)?.get(0) === gigId)) continue
      const actions: Action[] = [{ type: "withdraw", gigId }]
      const results = await this.world.act(actions)
      this.readResults(actions, results)
      if (results[0]?.ok) for (const id of ids) this.unpaired.add(id)
    }
  }

  /** One of our waiting cars that this request's car can share a gig with: the new car's pickup near the waiting car's
   * delivery, or its delivery near the waiting car's pickup, on the same day and in time for both deadlines. */
  partnerFor(request: PriceRequest): string | null {
    if (request.legs.length !== 1) return null
    const b = request.legs[0]!
    if (b.pickup.privateAddress || b.delivery.privateAddress) return null
    const deadline = Math.min(...request.options.map(option => option.deadline))
    const drive = (from: string, to: string) => from === to ? 0 : Math.ceil(this.network.minutes(from, to) * 1.15)
    const near = (from: string, to: string) => from === to || this.network.km(from, to) <= 30
    const taken = new Set(this.partners.values())
    for (const order of this.orders.values()) {
      if (order.status !== "waiting" || order.legs.length !== 1 || taken.has(order.id) || this.urgent.has(order.id)) continue
      const a = order.legs[0]!
      if (a.pickup.privateAddress || a.delivery.privateAddress || this.hoursFor(this.requests.get(order.id))) continue
      const gigs = this.gigsOf(order.id)
      if (gigs.some(gigId => this.booked.has(gigId) || (this.posts.get(gigId)?.stops.length ?? 0) > 2)) continue
      const start = this.now + 60
      if (near(a.delivery.placeId, b.pickup.placeId)) {
        const aDone = Math.max(a.pickup.window.from, start) + drive(a.pickup.placeId, a.delivery.placeId) + 20
        const bStart = Math.max(aDone + drive(a.delivery.placeId, b.pickup.placeId) + 10, b.pickup.window.from)
        if (aDone <= order.deadline - 30 && bStart + drive(b.pickup.placeId, b.delivery.placeId) + 20 <= deadline - 30 && Math.floor(aDone / 1440) === Math.floor(bStart / 1440)) return order.id
      }
      if (near(b.delivery.placeId, a.pickup.placeId)) {
        const bDone = Math.max(b.pickup.window.from, start) + drive(b.pickup.placeId, b.delivery.placeId) + 20
        const aStart = Math.max(bDone + drive(b.delivery.placeId, a.pickup.placeId) + 10, a.pickup.window.from)
        if (bDone <= deadline - 30 && aStart <= order.lastPickupAt && Math.floor(bDone / 1440) === Math.floor(aStart / 1440)) return order.id
      }
    }
    return null
  }

  /** A car on summer tyres cannot be collected while snow falls at its pickup or its delivery place: start after it. */
  afterSnow(orderId: string, leg: Order["legs"][number], from: number): number {
    if (!this.tyres.has(orderId)) return from
    for (let moved = true; moved;) {
      moved = false
      for (const snow of this.snow) {
        if ((snow.places.has(leg.pickup.placeId) || snow.places.has(leg.delivery.placeId)) && snow.from <= from + 720 && snow.to > from) { from = snow.to; moved = true }
      }
    }
    return from
  }

  /** The opening fee of a single car, in typical fees, from the booking model. */
  openingFor(order: Order, request: PriceRequest): number {
    const leg = order.legs[0]!
    const near = (place: string) => this.drivers.reduce((sum, driver) => { const km = this.network.km(driver.homePlaceId, place); return sum + (km <= 35 ? 1 : km <= 70 ? 0.35 : 0) }, 0)
    const from = Math.max(this.now, leg.pickup.window.from)
    return openingRatio({
      km: this.network.km(leg.pickup.placeId, leg.delivery.placeId), pickupDrivers: this.supply(request), deliveryDrivers: near(leg.delivery.placeId),
      slackHours: (this.pickupBy(order) - from) / 60, weekday: Math.floor(from / 1440) % 7, hour: Math.floor((from % 1440) / 60), premium: leg.car.premium,
    }, this.settings.bookMiss)
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

  payoutSchedule(schedule: FeeStep[], opening: boolean, order?: Order): FeeStep[] {
    const leg = order?.legs.length === 1 ? order.legs[0]! : null
    const payout = leg && this.network.km(leg.pickup.placeId, leg.delivery.placeId) >= 250 ? this.settings.longPayout : this.settings.payout
    if (opening && order && leg && this.settings.bookMiss > 0 && schedule.length) {
      // The booking model sets the opening fee; no later step may be lower.
      const request = this.requests.get(order.id)
      if (request) {
        const opens = Math.max(1, Math.round(request.referenceFeeCents * this.openingFor(order, request)))
        return schedule.map((step, index) => ({ ...step, feeCents: index === 0 ? opens : Math.max(step.feeCents, opens) }))
      }
    }
    if (payout === 1) return schedule
    return schedule.map((step, index) => ({ ...step, feeCents: Math.max(1, Math.round(step.feeCents * (this.settings.openingOnly && (!opening || index > 0) ? 1 : payout))) }))
  }

  feesFor(order: Order, cars: number, discounted = true): FeeStep[] {
    const request = this.requests.get(order.id)!
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + this.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    // A dealer can replace a local trip with a long one after the price is agreed.
    const routeChange = Math.max(1, duration(order.legs) / duration(request.legs))
    const guard = 1 + this.settings.trustGuard * Math.min(25, this.trust.get(order.dealerId) ?? 0) / 25
    const fee = this.baseFee({ ...request, legs: order.legs }) * routeChange * cars / order.legs.length * guard
    const pay = (schedule: FeeStep[], opening: boolean) => discounted ? this.payoutSchedule(schedule, opening, cars === 1 ? order : undefined) : schedule
    if (this.level >= 2 && this.settings.lateRescue && cars === 1 && lateRescueApplies(order, this.now)) return pay(lateRescueSchedule(order, this.now, this.settings.lateRepost ? fee * this.settings.lateFee / 1.2 : fee), false)
    const rescue = this.urgent.has(order.id)
    const pickupBy = this.pickupBy(order)
    const remaining = pickupBy - this.now
    const start = rescue ? remaining <= 60 ? this.settings.rescue1 : remaining <= 120 ? this.settings.rescue2 : Math.max(1.5, this.settings.dueFee) : 1
    if (this.level === 1) return pay([{ at: this.now, feeCents: Math.round(fee * start) }], start === 1)
    // Drivers learn from fees that rise and wait for them: one fee until the deadline warning, then the rescue fees.
    if (this.settings.flatFee > 0 && !rescue) return [{ at: this.now, feeCents: Math.round(fee * this.settings.flatFee) }]
    // A steady initial price avoids teaching drivers to wait for hourly increases.
    const due = Math.max(this.now + 30, pickupBy - 240)
    // A gig that no driver has taken a day before its last pickup will not find one in the last four hours:
    // a driver needs time to see the gig and to reach the car. So the fee starts to climb a day ahead.
    const sit = this.settings.sitAfter > 0 && start === 1 ? [{ at: this.now + this.settings.sitAfter, feeCents: Math.round(fee * this.settings.sitFee) }].filter(step => step.at < pickupBy - 1440 && step.at < due) : []
    const early = this.settings.earlyClimb ? [{ at: pickupBy - 1440, feeCents: Math.round(fee * Math.max(start, this.settings.climbDay)) }, { at: pickupBy - 720, feeCents: Math.round(fee * Math.max(start, this.settings.climbHalfDay)) }].filter(step => step.at >= this.now + 30 && step.at < due) : []
    return pay([
      { at: this.now, feeCents: Math.round(fee * start) },
      ...sit,
      ...early,
      { at: due, feeCents: Math.round(fee * Math.max(start, this.settings.dueFee)) },
      { at: Math.max(due + 30, pickupBy - 120), feeCents: Math.round(fee * Math.max(start, this.settings.rescue2)) },
      { at: Math.max(due + 60, pickupBy - 60), feeCents: Math.round(fee * Math.max(start, this.settings.rescue1)) },
    ], start === 1)
  }

  async post(order: Order, legs: number[], retry = { pickupFrom: 0, manualLicence: false, plates: false }): Promise<void> {
    if (!legs.length) return
    const request = this.requests.get(order.id)!
    const rules = this.noteRules(request)
    const stops: PostAction["stops"] = legs.flatMap(leg => {
      const car = order.legs[leg]!
      const from = this.afterSnow(order.id, car, Math.max(car.pickup.window.from, retry.pickupFrom, this.readinessFor(request)?.readyAt ?? 0))
      const cutoff = this.pickupBy(order)
      const to = this.settings.safetySlack && cutoff > Math.max(from, this.now + 30) ? Math.min(car.pickup.window.to, cutoff) : Math.max(from, car.pickup.window.to)
      return [
        { orderId: order.id, leg, kind: "pickup" as const, withPlates: rules.plates || retry.plates, withCharging: needsCharge(car, this.network), ...(from > car.pickup.window.from || to < car.pickup.window.to ? { window: { from, to } } : {}) },
        { orderId: order.id, leg, kind: "delivery" as const },
      ]
    })
    const hold = this.settings.bundleWait > 0 && this.level >= 3 && !this.unpaired.has(order.id) && order.legs.length === 1 && rules.safe && !(this.settings.noteReader && this.hoursFor(request)) && !order.legs[0]!.pickup.privateAddress && !order.legs[0]!.delivery.privateAddress && !retry.pickupFrom && !retry.manualLicence && !retry.plates && !this.urgent.has(order.id) && this.pickupBy(order) > this.now + 360
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
    if (hold) {
      this.held.set(order.id, { post, at: this.held.get(order.id)?.at ?? this.now })
    } else this.outbox.push(post)
  }

  async flushBundles(): Promise<void> {
    if (![...this.held.values()].some(item => item.at + this.settings.bundleWait <= this.now)) return
    const items = [...this.held.entries()].filter(([id]) => this.orders.has(id))
    this.held.clear()
    const candidates = items.map(([id, item]) => ({ order: this.orders.get(id)!, post: item.post, noteSafe: this.noteRules(this.requests.get(id)).safe }))
    const fresh = candidates.length
    // Cars whose gig has waited without a driver can ride with a newly won car, as the second car of one gig.
    const waiting: string[] = []
    if ((this.settings.pairOpen > 0 || this.settings.pairQuote > 0) && this.settings.bundlePairs) for (const [gigId, post] of this.posts) {
      const order = this.orders.get(post.stops[0]!.orderId)
      if (!order || post.stops.length !== 2 || order.legs.length !== 1 || this.unpaired.has(order.id) || this.booked.has(gigId) || this.urgent.has(order.id) || this.legGigs.get(order.id)?.get(0) !== gigId) continue
      const partnered = items.some(([id]) => this.partners.get(id) === order.id)
      if ((!partnered && (this.settings.pairOpen === 0 || this.now - (this.postedAt.get(gigId) ?? this.now) < this.settings.pairOpen)) || this.pickupBy(order) < this.now + 360 || this.hoursFor(this.requests.get(order.id))) continue
      if (this.outbox.some(action => "gigId" in action && action.gigId === gigId)) continue
      candidates.push({ order, post: { ...post, schedule: this.feesFor(order, 1, false) }, noteSafe: this.noteRules(this.requests.get(order.id)).safe })
      waiting.push(gigId)
    }
    const limits = { maxConnectorKm: this.settings.bundleKm, maxDiscount: this.settings.bundleDiscount }
    const bundles = this.settings.bundlePairs ? planBundles(this.now, candidates, this.network, limits).filter(bundle => bundle.indices.some(i => i < fresh)) : []
    // A pair can take more cars: each time the car that saves most, whose pickup is near the gig's last delivery.
    if (this.settings.chainCars > 2) {
      const taken = new Set(bundles.flatMap(bundle => bundle.indices))
      for (let b = 0; b < bundles.length; b++) {
        while (bundles[b]!.indices.length < this.settings.chainCars) {
          let best: { plan: ReturnType<typeof extendBundle>; index: number } | null = null
          candidates.forEach((candidate, i) => {
            if (taken.has(i)) return
            const plan = extendBundle(this.now, bundles[b]!, candidate, this.network, limits)
            if (plan && (!best || plan.feeSavingCents > best.plan!.feeSavingCents)) best = { plan, index: i }
          })
          if (!best) break
          const chosen = best as { plan: NonNullable<ReturnType<typeof extendBundle>>; index: number }
          bundles[b] = { ...chosen.plan, indices: [...bundles[b]!.indices, chosen.index] }
          taken.add(chosen.index)
        }
      }
    }
    const paired = new Set<number>()
    for (const bundle of bundles) {
      const old = bundle.indices.filter(i => i >= fresh).map(i => waiting[i - fresh]!)
      if (old.length) {
        const actions: Action[] = old.map(gigId => ({ type: "withdraw", gigId }))
        const results = await this.world.act(actions)
        this.readResults(actions, results)
        if (!results.every(result => result.ok)) continue
      }
      for (const i of bundle.indices) paired.add(i)
      this.outbox.push(bundle.post)
    }
    for (const candidate of candidates.slice(0, fresh).filter((_, i) => !paired.has(i))) {
      const post = { ...candidate.post, schedule: this.payoutSchedule(candidate.post.schedule, true, candidate.order) }
      const at = this.morningFor(candidate.order)
      if (at !== null) this.morning.set(candidate.order.id, { at, post })
      else this.outbox.push(post)
    }
  }

  override async sendPostOf(orderId: string): Promise<void> {
    const item = this.held.get(orderId)
    if (item) { this.held.delete(orderId); this.outbox.push({ ...item.post, schedule: this.payoutSchedule(item.post.schedule, true, this.orders.get(orderId)) }) }
    const waiting = this.morning.get(orderId)
    if (waiting) { this.morning.delete(orderId); this.outbox.push(waiting.post) }
    await super.sendPostOf(orderId)
  }

  override async change(order: Order): Promise<void> {
    this.held.delete(order.id)
    this.morning.delete(order.id)
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
    if (event.kind === "order_lost") this.partners.delete(event.requestId)
    if (event.kind === "forecast") this.snow.push({ from: event.from, to: event.to, places: new Set(event.placeIds) })
    if (event.kind === "gig_viewed") {
      if (!this.seen.has(event.gigId)) this.seen.set(event.gigId, new Set())
      this.seen.get(event.gigId)!.add(event.driverId)
      this.viewedAt.set(event.driverId, event.at)
    }
    if (event.kind === "gig_booked") this.gigDriver.set(event.gigId, event.driverId)
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
        const onTime = order.legs.every((leg, i) => order.deliveredAt[i]! <= Math.min(order.deadline, leg.delivery.privateAddress ? leg.delivery.window.to + 30 : Infinity))
        this.trust.set(order.dealerId, onTime ? Math.min(25, count + 1) : Math.floor(count / 2))
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
    this.postedAt.set(gigId, this.now)
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
    if (this.resync) await this.relearnGigs()
    for (const [id, item] of this.morning) {
      if (item.at > this.now && this.orders.has(id) && !this.urgent.has(id)) continue
      this.morning.delete(id)
      const order = this.orders.get(id)
      // Fees again from now: the schedule's steps must start at the posting.
      if (order && order.status !== "cancelled") this.outbox.push({ ...item.post, schedule: this.feesFor(order, 1) })
    }
    if (this.settings.pairPatience > 0) await this.splitWaitingPairs()
    await this.flushBundles()
    const ready = [...this.deferred.values()].filter(request => request.respondBy <= this.now + 5)
      .sort((a, b) => this.auctionValue(b) - this.auctionValue(a) || a.id.localeCompare(b.id))
    for (const request of ready) {
      this.deferred.delete(request.id)
      this.quote(request, true)
    }
    for (const order of this.orders.values()) {
      if (order.status === "delivered" || order.status === "cancelled") continue
      const missing = order.legs.map((_, leg) => leg).filter(leg => order.deliveredAt[leg] === null && !this.held.has(order.id) && !this.morning.has(order.id) && !this.legGigs.get(order.id)?.has(leg) && !this.outbox.some(a => a.type === "post" && a.stops.some(s => s.orderId === order.id && s.leg === leg)))
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
    if (this.settings.homeDrivers > 0 && this.level >= 3) this.offerHome()
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

  /** Takes back from the world every live gig that the dispatcher does not know, as a restart would. */
  async relearnGigs(): Promise<void> {
    this.resync = false
    this.syncGigs(await this.world.snapshot())
  }

  /** Makes the dispatcher's gigs match the world's: the world's live gigs are the truth. */
  syncGigs(snapshot: DeskSnapshot): void {
    for (const order of snapshot.orders) {
      const known = this.orders.get(order.id)
      if (known) order.deliveredAt.forEach((at, leg) => { if (at !== null) known.deliveredAt[leg] = at })
    }
    const live = new Map(snapshot.gigs.filter(gig => ["open", "booked", "working"].includes(gig.status)).map(gig => [gig.id, gig]))
    for (const [orderId, legs] of this.legGigs) for (const [leg, gigId] of legs) {
      if (live.has(gigId)) continue
      legs.delete(leg)
    }
    for (const gig of live.values()) {
      if (gig.status === "open") this.booked.delete(gig.id)
      else this.booked.add(gig.id)
      const open = gig.stops.filter(stop => this.orders.get(stop.orderId)?.deliveredAt[stop.leg] === null)
      const known = open.every(stop => this.legGigs.get(stop.orderId)?.get(stop.leg) === gig.id)
      if (known && this.posts.has(gig.id)) continue
      for (const stop of open) {
        this.held.delete(stop.orderId)
        this.legGigs.set(stop.orderId, (this.legGigs.get(stop.orderId) ?? new Map()).set(stop.leg, gig.id))
      }
      this.posts.set(gig.id, { type: "post", stops: gig.stops, audience: gig.audience, schedule: gig.schedule })
      this.postedAt.set(gig.id, gig.postedAt)
      console.error(JSON.stringify({ at: this.now, relearned: gig.id, orders: [...new Set(gig.stops.map(stop => stop.orderId))] }))
    }
  }

  /** When to post a single car whose pickup starts on a later day: that day at `postAt`, if its last pickup is at least eight hours later. */
  morningFor(order: Order): number | null {
    if (!this.settings.postAt || order.legs.length !== 1) return null
    const from = order.legs[0]!.pickup.window.from
    const day = Math.floor(from / 1440)
    if (day <= Math.floor(this.now / 1440)) return null
    const at = Math.max(from - 120, day * 1440 + this.settings.postAt)
    return this.pickupBy(order) - at >= 480 ? at : null
  }

  /** A driver who lives near the delivery needs no trip home, so the car costs them less: offer it to them first, below the
   * public fee. The public gig stays open; an offer that nobody takes costs nothing. */
  offerHome(): void {
    const hour = this.now % 1440
    if (hour < 420 || hour >= 1380) return
    const day = Math.floor(this.now / 1440)
    for (const [gigId, post] of this.posts) {
      if (this.booked.has(gigId) || this.homeOffered.has(gigId) || post.stops.length !== 2) continue
      if (this.now - (this.postedAt.get(gigId) ?? -Infinity) > 20) continue
      const order = this.orders.get(post.stops[0]!.orderId)
      if (!order || order.legs.length !== 1 || this.urgent.has(order.id)) continue
      const leg = order.legs[0]!
      if (leg.pickup.privateAddress || leg.delivery.privateAddress) continue
      const lastPickup = this.pickupBy(order)
      const shown = post.schedule.filter(step => step.at <= this.now).at(-1) ?? post.schedule[0]!
      const fee = Math.round(shown.feeCents * this.settings.homeShare)
      const chosen = this.drivers.filter(driver => {
        if ((this.offerCount.get(`${day}:${driver.id}`) ?? 0) >= 3) return false
        if (post.audience.experienced && (driver.rating < 4.8 || driver.completedGigs < 50)) return false
        if (post.audience.manualLicence && driver.licence !== "manual") return false
        if (this.network.km(driver.homePlaceId, leg.delivery.placeId) > 35) return false
        // The driver must reach the car by public transport before its last pickup.
        return this.now + 60 + 1.3 * this.network.minutes(driver.homePlaceId, leg.pickup.placeId) <= lastPickup
      }).sort((a, b) => this.network.km(a.homePlaceId, leg.delivery.placeId) - this.network.km(b.homePlaceId, leg.delivery.placeId) || a.id.localeCompare(b.id)).slice(0, this.settings.homeDrivers)
      this.homeOffered.add(gigId)
      for (const driver of chosen) {
        const key = `${day}:${driver.id}`
        this.offerCount.set(key, (this.offerCount.get(key) ?? 0) + 1)
        this.outbox.push({ type: "offer", gigId, driverId: driver.id, feeCents: fee })
      }
    }
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
        if (action.type === "post" && reason.includes("already in a live gig")) this.resync = true
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
