import { Dispatcher as Control, defaults as controlDefaults, validateSettings as validateControl } from "../../src/policy.ts"
import type { Settings as ControlSettings } from "../../src/policy.ts"
import { planBundles } from "../../src/bundles.ts"
import { chooseChainOffer } from "../../src/chain-offers.ts"
import { requestFeasibility } from "../../src/admission.ts"
import { needsCharge } from "../../src/planning.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DeskSnapshot, DriverProfile, Order, PostAction, PriceRequest, WorldMap } from "../../vendor/typescript/types.ts"
import prior from "../../experiments/booking-response-prior.json" with { type: "json" }

export type Settings = ControlSettings & { firstOptionOnly: boolean; openingCostAdmission: boolean; actionGuard: boolean; capacityValue: boolean; routeValue: boolean; driverValue: boolean; paymentProbe: boolean; randomSeed: number }
export const defaults: Settings = { ...controlDefaults, firstOptionOnly: false, openingCostAdmission: false, actionGuard: false, capacityValue: false, routeValue: false, driverValue: false, paymentProbe: false, randomSeed: 1 }

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Configuration must be an object")
  const base: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (key in controlDefaults) base[key] = v
    else if (key === "randomSeed") { if (!Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > 0xffffffff) throw new Error("Invalid random seed") }
    else if (!(key in defaults) || typeof v !== "boolean") throw new Error(`Invalid research setting ${key}`)
  }
  validateControl(base)
}

type Cohort = { at: number; place: string; bookedAt?: number; cancelledAt?: number }
type Anchor = { orderId: string; gigId?: string; post: PostAction }
type Link = { anchorId: string; credit: number }

export class Dispatcher extends Control {
  declare settings: Settings
  telemetry: Record<string, unknown>[] = []
  cohorts = new Map<string, Cohort>()
  links = new Map<string, Link>()
  driverAttempts = new Set<string>()
  probeCount = 0
  randomState: number
  quoteFee: number | null = null

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const base = Object.fromEntries(Object.entries(settings).filter(([key]) => key in controlDefaults))
    super(world, level, now, map, drivers, base)
    this.settings = { ...defaults, ...settings }
    this.randomState = this.settings.randomSeed
  }

  override quote(request: PriceRequest, immediate = false): void {
    if (request.respondBy <= this.now || this.quoted.has(request.id)) return
    const full = request
    if (this.level <= 3 && this.settings.firstOptionOnly) request = { ...request, options: request.options.slice(0, 1) }
    const settings = this.settings
    const fee = super.baseFee(request)
    if (this.level <= 3 && settings.openingCostAdmission) this.quoteFee = fee * settings.payout / ((1-settings.margin)*1.3)
    if (settings.capacityValue) this.settings = { ...settings, capacity: Math.min(.9, settings.capacity*1.5), backlog: settings.backlog*1.5 }
    try { super.quote(request, immediate) } finally { this.settings = settings; this.quoteFee = null; this.requests.set(full.id, full) }
    const action = this.outbox.findLast(a => a.type === "quote" && a.requestId === request.id)
    if (!this.pending.has(request.id) || action?.type !== "quote") return
    if (!settings.capacityValue && !settings.routeValue) return
    const state = this.capacityState(request)
    const route = settings.routeValue ? this.routeForRequest(request, Object.keys(action.prices)) : null
    const credit = route?.credit ?? 0
    const opportunity = settings.capacityValue ? state.opportunityCents : 0
    const risk = settings.capacityValue ? fee*.08*(1-state.fastProbability) : 0
    const cost = Math.max(fee*.5, fee*settings.costRatio + opportunity + risk - credit)
    let probability = 1
    if (this.level <= 3) {
      const list = request.options[0]!.listPriceCents
      if (list < fee*settings.payout/(1-settings.margin) + opportunity + risk - credit) {
        this.outbox.splice(this.outbox.indexOf(action), 1)
        this.pending.delete(request.id)
        this.telemetry.push({ kind: "capacity_decline", at: this.now, requestId: request.id, ...state, cost, list, credit })
        return
      }
    } else {
      const options = request.options.filter(o => o.kind in action.prices)
      const trust = 1 + settings.trustStep*Math.min(25, this.trust.get(request.dealerId) ?? 0)
      const features = this.features(request)
      const choice = this.market.optimize(features, { costCents: cost, listPriceCents: Math.min(...options.map(o => o.listPriceCents)), trust, minPrice: Math.ceil(Math.max(1, fee/(1-settings.margin)-credit)) })
      for (const option of options) action.prices[option.kind] = Math.ceil(option.listPriceCents*trust*choice.ratio)
      this.bids.set(request.id, { features, ratio: choice.ratio })
      probability = choice.probability
    }
    if (route) this.links.set(request.id, { anchorId: route.anchor.orderId, credit })
    this.telemetry.push({ kind: "quote_value", at: this.now, requestId: request.id, ...state, cost, risk, opportunity, credit, probability, anchor: route?.anchor.orderId ?? null, prices: structuredClone(action.prices) })
  }

  override baseFee(request: PriceRequest): number { return this.quoteFee ?? super.baseFee(request) }

  capacityState(request: PriceRequest) {
    const leg = request.legs[0]!, place = leg.pickup.placeId
    const supply = this.supply(request)
    let successes = prior.fastBookingProbability*prior.priorOrders, observations = prior.priorOrders
    for (const cohort of this.cohorts.values()) {
      if (cohort.at + prior.horizonMinutes > this.now || cohort.cancelledAt !== undefined && cohort.cancelledAt < cohort.at + prior.horizonMinutes) continue
      const km = this.network.km(place, cohort.place)
      const weight = km <= 70 ? 1 : .1
      observations += weight
      successes += weight*Number(cohort.bookedAt !== undefined && cohort.bookedAt <= cohort.at+prior.horizonMinutes)
    }
    const fastProbability = successes/observations
    const day = Math.floor(Math.max(this.now, leg.pickup.window.from)/1440)
    let work = 0
    for (const other of this.requests.values()) {
      if (other.id === request.id) continue
      const order = this.orders.get(other.id)
      const pending = this.pending.has(other.id)
      if (!pending && (!order || ["cancelled", "delivered"].includes(order.status))) continue
      const trip = order?.legs[0] ?? other.legs[0]!
      if (Math.floor(Math.max(this.now, trip.pickup.window.from)/1440) !== day) continue
      const distance = this.network.km(place, trip.pickup.placeId)
      const weight = distance <= 30 ? 1 : distance <= 70 ? .5 : 0
      const bid = this.bids.get(other.id)
      const p = pending && bid ? this.market.probability(bid.features, bid.ratio) : 1
      const reservation = pending ? Math.min(1, p+.5*Math.sqrt(p*(1-p))) : this.gigsOf(other.id).some(g => this.booked.has(g)) ? .25 : 1
      work += weight*reservation*(45+this.network.minutes(trip.pickup.placeId, trip.delivery.placeId)*1.15)
    }
    // This is a scarcity price, not a promise that visible drivers will accept assignments.
    const budget = Math.max(90, supply*90*Math.max(.5, Math.min(1.5, fastProbability/prior.fastBookingProbability)))
    const utilization = work/budget
    const minutes = 45+this.network.minutes(place, leg.delivery.placeId)*1.15+(needsCharge(leg, this.network) ? 40 : 0)
    const destinationDemand = [...this.requests.values()].filter(r => r.arrivedAt < this.now && this.now-r.arrivedAt <= 1440 && this.network.km(leg.delivery.placeId, r.legs[0]!.pickup.placeId) <= 30).length
    const originDemand = [...this.requests.values()].filter(r => r.arrivedAt < this.now && this.now-r.arrivedAt <= 1440 && this.network.km(place, r.legs[0]!.pickup.placeId) <= 30).length
    const scarcity = Math.min(3, utilization*utilization)*20
    const positioningCents = Math.min(minutes*scarcity*.2, 150*Math.max(0, destinationDemand-originDemand)/(1+destinationDemand))
    return { supply, work, utilization, fastProbability, positioningCents, opportunityCents: Math.max(0, minutes*scarcity-positioningCents) }
  }

  anchors(): Anchor[] {
    const reserved = new Set([...this.links.values()].map(link => link.anchorId))
    const anchors: Anchor[] = []
    for (const [orderId, item] of this.held) {
      if (!reserved.has(orderId)) anchors.push({ orderId, post: { ...item.post, schedule: this.payoutSchedule(item.post.schedule, true) } })
    }
    for (const [gigId, post] of this.posts) {
      const orderId = post.stops[0]!.orderId
      if (post.stops.length === 2 && !reserved.has(orderId) && !this.booked.has(gigId) && this.legGigs.get(orderId)?.get(0) === gigId) anchors.push({ orderId, gigId, post })
    }
    return anchors.filter(a => {
      const order = this.orders.get(a.orderId)
      return order?.status !== "delivered" && order?.status !== "cancelled" && order && order.lastPickupAt > this.now+300
    })
  }

  singlePost(order: Order): PostAction {
    const rules = this.noteRules(this.requests.get(order.id))
    return { type: "post", stops: [{ orderId: order.id, leg: 0, kind: "pickup", withPlates: rules.plates, withCharging: needsCharge(order.legs[0]!, this.network) }, { orderId: order.id, leg: 0, kind: "delivery" }], audience: { experienced: order.legs[0]!.car.premium, manualLicence: rules.manual }, schedule: this.feesFor(order, 1) }
  }

  routeForRequest(request: PriceRequest, offered: string[]) {
    if (this.level < 3 || request.legs.length !== 1) return null
    const options = request.options.filter(o => offered.includes(o.kind))
    const deadline = Math.min(...options.map(o => o.deadline))
    const feasible = requestFeasibility(this.plannedRequest(request), deadline, this.network, this.settings)
    if (!feasible) return null
    const order: Order = { id: request.id, dealerId: request.dealerId, option: options[0]!.kind, priceCents: 0, deadline, legs: request.legs, status: "waiting", deliveredAt: [null], lastPickupAt: feasible.latestPickupAt }
    const post = this.singlePost(order)
    let best: { anchor: Anchor; credit: number } | null = null
    for (const anchor of this.anchors()) {
      const old = this.orders.get(anchor.orderId)!
      const route = planBundles(request.respondBy, [{ order: old, post: anchor.post, noteSafe: this.noteRules(this.requests.get(old.id)).safe }, { order, post, noteSafe: true }], this.network)[0]
      if (!route) continue
      // Reserve only half the modeled saving; an open anchor can be booked before the quote wins.
      const credit = route.feeSavingCents*(anchor.gigId ? .25 : .5)
      if (!best || credit > best.credit) best = { anchor, credit }
    }
    return best
  }

  async joinAnchors(): Promise<void> {
    for (const [orderId, link] of this.links) {
      const order = this.orders.get(orderId)
      if (!order) { if (!this.pending.has(orderId)) this.links.delete(orderId); continue }
      this.links.delete(orderId)
      const anchor = this.orders.get(link.anchorId)
      const item = this.held.get(orderId)
      const held = this.held.get(link.anchorId)
      const gigId = this.gigsOf(link.anchorId)[0]
      const post = held ? { ...held.post, schedule: this.payoutSchedule(held.post.schedule, true) } : gigId ? this.posts.get(gigId) : undefined
      if (!anchor || !item || !post || gigId && this.booked.has(gigId)) { this.telemetry.push({ kind: "route_fallback", at: this.now, orderId, anchorId: link.anchorId }); continue }
      const route = planBundles(this.now, [{ order: anchor, post, noteSafe: this.noteRules(this.requests.get(anchor.id)).safe }, { order, post: { ...item.post, schedule: this.payoutSchedule(item.post.schedule, true) }, noteSafe: true }], this.network)[0]
      if (!route || gigId && !await this.withdraw(anchor.id)) { this.telemetry.push({ kind: "route_fallback", at: this.now, orderId, anchorId: link.anchorId }); continue }
      this.held.delete(orderId)
      this.held.delete(anchor.id)
      this.outbox.push(route.post)
      this.telemetry.push({ kind: "route_joined", at: this.now, orderId, anchorId: anchor.id, credit: link.credit, openingSaving: route.feeSavingCents })
    }
  }

  offerReturns(): void {
    if (this.level < 3 || this.now < this.offersAfter || this.now%1440<420 || this.now%1440>=1380) return
    let gigs: { gigId: string; post: PostAction; order: Order; open: boolean; openingFeeCents: number; publicFeeCents: number; openOffers: number }[] | undefined
    for (const driver of this.drivers) {
      const position = this.driverPlace.get(driver.id)
      const key = `${Math.floor(this.now/1440)}:${driver.id}`
      if (!position || position.at>this.now || this.now-position.at>30 || this.network.km(position.place,driver.homePlaceId)<70 || (this.offerCount.get(key) ?? 0)>=2) continue
      if ([...this.legGigs.values()].some(legs => [...legs.values()].some(g => this.gigDriver.get(g)===driver.id && this.booked.has(g)))) continue
      gigs ??= [...this.posts].flatMap(([gigId, post]) => {
        const order = this.orders.get(post.stops[0]!.orderId)
        const request = order && this.requests.get(order.id)
        if (!order || !request || this.booked.has(gigId) || this.legGigs.get(order.id)?.get(0)!==gigId) return []
        return [{ gigId, post, order, open: true, openingFeeCents: this.baseFee(request)*this.settings.payout, publicFeeCents: (post.schedule.findLast(s => s.at<=this.now) ?? post.schedule[0]!).feeCents, openOffers: 0 }]
      })
      for (const gig of gigs) gig.openOffers=(this.offers.get(gig.gigId) ?? []).filter(o=>o.until>this.now).length
      const offer = chooseChainOffer(this.now, { driver, placeId: position.place, at: position.at }, gigs, this.network, { discount: .95, offersUsedToday: this.offerCount.get(key) ?? 0, attemptedGigIds: this.driverAttempts })
      if (!offer) continue
      const { action } = offer
      this.driverAttempts.add(action.gigId)
      this.offerCount.set(key, (this.offerCount.get(key) ?? 0)+1)
      const active = (this.offers.get(action.gigId) ?? []).filter(o => o.until>this.now)
      this.offers.set(action.gigId, [...active, { driver: driver.id, until: this.now+11 }])
      this.outbox.push(action)
      this.telemetry.push({ kind: "return_offer", at: this.now, ...offer })
    }
  }

  override async tick(): Promise<void> {
    if (this.settings.routeValue) await this.joinAnchors()
    await super.tick()
    if (this.settings.driverValue) this.offerReturns()
  }

  override takeActions(): Action[] {
    const actions = super.takeActions()
    return actions.filter(action => {
      if (this.settings.actionGuard && (action.type === "reprice" || action.type === "offer" || action.type === "withdraw") && (!this.posts.has(action.gigId) || this.booked.has(action.gigId))) {
        this.telemetry.push({ kind: "stale_skipped", at: this.now, action })
        return false
      }
      if (action.type === "post" && this.settings.paymentProbe && this.probeCount < 20 && action.stops.length === 2 && !this.urgent.has(action.stops[0]!.orderId)) {
        const order = this.orders.get(action.stops[0]!.orderId)
        if (order && order.lastPickupAt > this.now+480 && this.now%1440 >= 420 && this.now%1440 <= 1080) {
          this.randomState ^= this.randomState << 13; this.randomState ^= this.randomState >>> 17; this.randomState ^= this.randomState << 5
          const u = (this.randomState >>> 0)/4294967296
          const multiplier = [.92, 1, 1.08][Math.floor(u*3)]!
          const opening = action.schedule[0]!.feeCents
          action.schedule[0]!.feeCents = Math.min(action.schedule[1]?.feeCents ?? Infinity, Math.round(opening*multiplier))
          this.probeCount++
          this.telemetry.push({ kind: "payment_randomized", at: this.now, orderId: order.id, choices: [.92,1,1.08], probabilities: [1/3,1/3,1/3], multiplier, probability: 1/3, opening, selectedFee: action.schedule[0]!.feeCents, slack: order.lastPickupAt-this.now })
        }
      }
      return true
    })
  }

  override carry(post: PostAction, gigId: string): void {
    super.carry(post, gigId)
    this.telemetry.push({ kind: "post", at: this.now, gigId, post: structuredClone(post) })
  }

  override readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions, results)
    for (let i=0; i<actions.length; i++) this.telemetry.push({ kind: "action_result", at: this.now, action: structuredClone(actions[i]), result: structuredClone(results[i] ?? null) })
  }

  override async handle(event: DeskEvent): Promise<void> {
    if (event.seq <= this.lastSeq) return
    if (event.kind === "order_changed") for (const gigId of this.gigsOf(event.order.id)) {
      const post = this.posts.get(gigId)
      if (this.booked.has(gigId) && post?.stops.some(s => s.orderId === event.order.id && s.kind === "pickup" && !s.withCharging && needsCharge(event.order.legs[s.leg]!,this.network))) {
        this.telemetry.push({kind:"booked_charge_risk",at:this.now,orderId:event.order.id,gigId})
      }
    }
    this.observeSupply(event)
    await super.handle(event)
  }

  observeSupply(event: DeskEvent): void {
    if (event.kind === "order_won") this.cohorts.set(event.order.id, { at: event.at, place: event.order.legs[0]!.pickup.placeId })
    if (event.kind === "order_cancelled") { const c = this.cohorts.get(event.orderId); if (c) c.cancelledAt = event.at }
    if (event.kind === "gig_booked") for (const stop of this.posts.get(event.gigId)?.stops ?? []) {
      const c = this.cohorts.get(stop.orderId)
      if (c && c.bookedAt === undefined) c.bookedAt = event.at
    }
  }

  override async rejoin(snapshot: DeskSnapshot, history: DeskEvent[]): Promise<void> {
    const gigs = new Map(snapshot.gigs.map(g => [g.id, g]))
    for (const event of history) {
      if (event.kind === "gig_booked") for (const stop of gigs.get(event.gigId)?.stops ?? []) {
        const c = this.cohorts.get(stop.orderId)
        if (c && c.bookedAt === undefined) c.bookedAt = event.at
      }
      else this.observeSupply(event)
    }
    await super.rejoin(snapshot, history)
  }
}
