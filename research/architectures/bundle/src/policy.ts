import { Dispatcher as Incumbent, defaults as incumbentDefaults, validateSettings as validateIncumbent } from "./incumbent.ts"
import type { Settings as IncumbentSettings } from "./incumbent.ts"
import { requestFeasibility } from "./admission.ts"
import { planBundles } from "./bundles.ts"
import type { BundleCandidate } from "./bundles.ts"
import { needsCharge } from "./planning.ts"
import { joint, single } from "./joint.ts"
import type { Bid } from "./joint.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskEvent, DriverProfile, FeeStep, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

export type Settings = IncumbentSettings & { architecture: number }
export const defaults: Settings = { ...incumbentDefaults, payout: 0.85, openingOnly: true, architecture: 0 }
type Option = PriceRequest["options"][number]
type Reservation = { day: number; work: number; probability: number; origin: string }
type Lot = { request: PriceRequest; options: Option[]; bid: Bid; candidate: BundleCandidate }

export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be an object")
  const { architecture = 0, ...rest } = value as Partial<Settings>
  if (![0, 1, 2, 3].includes(architecture)) throw new Error("Unknown architecture")
  validateIncumbent(rest)
}

export class Dispatcher extends Incumbent {
  declare settings: Settings
  readonly auction = new Map<string, PriceRequest>()
  readonly reservations = new Map<string, Reservation>()
  readonly planned = new Set<string>()
  readonly opened = new Map<string, number>()
  readonly rematched = new Set<string>()
  readonly metrics = { jointQuotedRequests: 0, calendarQuotes: 0, laterDayQuotes: 0, composedBundles: 0, rematchedBundles: 0, highVolumeQuotes: 0 }
  lastRematch = -Infinity

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { architecture, ...rest } = { ...defaults, ...settings }
    super(world, level, now, map, drivers, rest)
    this.settings = { ...this.settings, architecture }
  }

  override quote(request: PriceRequest, immediate = false): void {
    if (!this.settings.architecture) return super.quote(request, immediate)
    this.requests.set(request.id, request)
    if (request.respondBy <= this.now || this.quoted.has(request.id)) return
    if (this.settings.architecture === 1) { this.auction.set(request.id, request); return }
    if (this.settings.architecture === 2) return this.calendarQuote(request)
    const options = this.feasibleOptions(request, 120, 4)
    const supply = this.supply(request)
    const backlog = [...this.orders.values()].filter(order => order.status === "waiting" && !this.gigsOf(order.id).some(id => this.booked.has(id)) && this.network.km(order.legs[0]!.pickup.placeId, request.legs[0]!.pickup.placeId) <= 70).length
    const pending = [...this.pending].filter(id => this.network.km(this.requests.get(id)!.legs[0]!.pickup.placeId, request.legs[0]!.pickup.placeId) <= 70).length
    if (!options.length || backlog + pending >= Math.max(6, supply * 0.18)) return this.decline(request)
    const bid = this.bid(request, options, 1.1, 1.03), choice = single(bid)
    if (choice.profit <= 0) return this.decline(request)
    this.metrics.highVolumeQuotes++
    this.submit(request, options, choice.price / bid.scale)
  }

  feasibleOptions(request: PriceRequest, buffer: number, minimumSupply: number): Option[] {
    if (!this.noteRules(request).safe || request.legs.length !== 1) return []
    const leg = request.legs[0]!
    if (leg.pickup.privateAddress || leg.delivery.privateAddress || this.network.road(leg.pickup.placeId, leg.delivery.placeId).km > 900 || this.supply(request) < minimumSupply) return []
    return request.options.filter(option => {
      const trip = requestFeasibility(request, option.deadline, this.network)
      return trip && trip.latestPickupAt >= Math.max(this.now + buffer, leg.pickup.window.from + 60)
    })
  }

  bid(request: PriceRequest, options: Option[], costMultiplier: number, floorMultiplier: number): Bid {
    const fee = this.baseFee(request)
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const scale = Math.min(...options.map(option => option.listPriceCents)) * trust
    return { cost: fee * costMultiplier, scale, threshold: this.market.threshold(this.features(request)), slope: this.settings.demandSlope, minimum: Math.max(1, Math.ceil(fee * floorMultiplier)), maximum: Math.ceil(Math.max(scale, fee) * 2.5) }
  }

  submit(request: PriceRequest, options: Option[], ratio: number): void {
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    this.quoted.add(request.id)
    this.pending.add(request.id)
    this.bids.set(request.id, { features: this.features(request), ratio })
    this.outbox.push({ type: "quote", requestId: request.id, prices: Object.fromEntries(options.map(option => [option.kind, Math.ceil(option.listPriceCents * trust * ratio)])) })
  }

  decline(request: PriceRequest): void {
    this.quoted.add(request.id)
    this.outbox.push({ type: "quote", requestId: request.id, prices: { [request.options[0]!.kind]: 100_000_000 } })
  }

  lot(request: PriceRequest): Lot | null {
    const options = this.feasibleOptions(request, 180, 6)
    if (!options.length) return null
    const option = options.toSorted((a, b) => a.deadline - b.deadline)[0]!
    const leg = request.legs[0]!, rules = this.noteRules(request)
    const order: Order = { id: request.id, dealerId: request.dealerId, option: option.kind, priceCents: 0, deadline: option.deadline, status: "waiting", deliveredAt: [null], lastPickupAt: requestFeasibility(request, option.deadline, this.network)!.latestPickupAt, legs: [{ ...leg, pickup: { ...leg.pickup, window: { ...leg.pickup.window, to: option.deadline } }, delivery: { ...leg.delivery, window: { ...leg.delivery.window, to: option.deadline } } }] }
    const fee = this.baseFee(request)
    const post: PostAction = { type: "post", stops: [{ orderId: request.id, leg: 0, kind: "pickup", withPlates: rules.plates, withCharging: needsCharge(leg, this.network) }, { orderId: request.id, leg: 0, kind: "delivery" }], audience: { experienced: leg.car.premium, manualLicence: rules.manual }, schedule: [{ at: this.now, feeCents: fee }, { at: Math.max(this.now + 1, order.lastPickupAt), feeCents: Math.round(2.5 * fee) }] }
    return { request, options, bid: this.bid(request, options, 1.15, 0.65), candidate: { order, post, noteSafe: true } }
  }

  clearAuction(): void {
    if (![...this.auction.values()].some(request => request.respondBy <= this.now + 2)) return
    const requests = [...this.auction.values()].filter(request => request.respondBy > this.now)
    this.auction.clear()
    const lots = requests.flatMap(request => { const lot = this.lot(request); return lot ? [lot] : [] })
    const paired = new Set<string>()
    const plans = planBundles(this.now + 15, lots.map(lot => lot.candidate), this.network, { maxConnectorKm: 90, maxDiscount: 0.4, bookingMinutes: 60 })
    for (const plan of plans) {
      const a = lots[plan.indices[0]]!, b = lots[plan.indices[1]]!
      const choice = joint(a.bid, b.bid, plan.feeSavingCents)
      if (choice.expectedProfit <= 0) continue
      this.submit(a.request, a.options, choice.prices[0] / a.bid.scale)
      this.submit(b.request, b.options, choice.prices[1] / b.bid.scale)
      this.metrics.jointQuotedRequests += 2
      paired.add(a.request.id)
      paired.add(b.request.id)
    }
    for (const request of requests) if (!paired.has(request.id)) super.quote(request, true)
  }

  work(request: Pick<PriceRequest, "legs">): number {
    const leg = request.legs[0]!
    return 45 + this.network.minutes(leg.pickup.placeId, leg.delivery.placeId) + 0.65 * this.network.minutes(leg.delivery.placeId, leg.pickup.placeId)
  }

  calendarQuote(request: PriceRequest): void {
    const options = this.feasibleOptions(request, 150, 6)
    const leg = request.legs[0]!, work = this.work(request), budget = Math.max(180, this.supply(request) * 180)
    let best: { option: Option; day: number; ratio: number; probability: number; profit: number } | undefined
    for (const option of options) for (let day = Math.max(Math.floor(this.now / 1440), Math.floor(leg.pickup.window.from / 1440)); day <= Math.floor(option.deadline / 1440); day++) {
      const start = Math.max(this.now + 150, day * 1440, leg.pickup.window.from), end = Math.min(option.deadline, day * 1440 + 1439)
      const planned: PriceRequest = { ...request, legs: [{ ...leg, pickup: { ...leg.pickup, window: { from: start, to: Math.min(end, leg.pickup.window.to) } }, delivery: { ...leg.delivery, window: { from: Math.max(day * 1440, leg.delivery.window.from), to: Math.min(end, leg.delivery.window.to) } } }] }
      const trip = requestFeasibility(planned, end, this.network)
      if (!trip || trip.latestPickupAt < start + 60) continue
      const load = [...this.reservations.values()].filter(item => item.day === day && this.network.km(item.origin, leg.pickup.placeId) <= 70).reduce((sum, item) => sum + item.work * item.probability, 0)
      const utilization = load / budget
      if (load + work > budget * 1.2) continue
      const bid = this.bid(request, [option], 0.98, 1.03)
      bid.cost += work * 20 * utilization ** 3
      const choice = single(bid), ratio = choice.price / bid.scale, probability = this.market.probability(this.features(request), ratio)
      if (choice.profit > 0 && (!best || choice.profit > best.profit)) best = { option, day, ratio, probability, profit: choice.profit }
    }
    if (!best) return this.decline(request)
    this.reservations.set(request.id, { day: best.day, work, probability: best.probability, origin: leg.pickup.placeId })
    this.planned.add(request.id)
    this.metrics.calendarQuotes++
    if (best.day > Math.floor(leg.pickup.window.from / 1440)) this.metrics.laterDayQuotes++
    this.submit(request, [best.option], best.ratio)
  }

  override async post(order: Order, legs: number[], retry = { pickupFrom: 0, manualLicence: false, plates: false }): Promise<void> {
    await super.post(order, legs, retry)
    if (this.settings.architecture !== 2 || !this.planned.has(order.id)) return
    const reservation = this.reservations.get(order.id)
    if (!reservation || reservation.day < Math.floor(this.now / 1440) || order.lastPickupAt < this.now) return
    const posts = [...this.outbox.filter((action): action is PostAction => action.type === "post"), ...[...this.held.values()].map(item => item.post)]
    for (const post of posts) for (const stop of post.stops) if (stop.orderId === order.id) {
      const place = order.legs[stop.leg]![stop.kind === "pickup" ? "pickup" : "delivery"]
      const from = Math.max(place.window.from, stop.window?.from ?? 0, reservation.day * 1440)
      const to = Math.min(place.window.to, stop.window?.to ?? Infinity, reservation.day * 1440 + 1439, order.deadline)
      if (from <= to) stop.window = { from, to }
    }
  }

  override flushBundles(): void {
    if (![1, 3].includes(this.settings.architecture)) return super.flushBundles()
    if (!this.held.size || ![...this.held.values()].some(item => item.at + this.settings.bundleWait <= this.now)) return
    const entries = [...this.held.entries()]
    this.held.clear()
    const candidates = entries.flatMap(([id, item]) => {
      const order = this.orders.get(id)
      return order && order.status === "waiting" && !this.legGigs.get(id)?.size ? [{ order, post: item.post, noteSafe: this.noteRules(this.requests.get(id)).safe }] : []
    })
    const plans = planBundles(this.now, candidates, this.network, { maxConnectorKm: 90, maxDiscount: this.settings.architecture === 1 ? 0.4 : 0.35, bookingMinutes: 60 })
    const matched = new Set(plans.flatMap(plan => plan.indices))
    this.metrics.composedBundles += plans.length
    this.outbox.push(...plans.map(plan => plan.post), ...candidates.filter((_, i) => !matched.has(i)).map(candidate => ({ ...candidate.post, schedule: this.payoutSchedule(candidate.post.schedule, true) })))
  }

  override payoutSchedule(schedule: FeeStep[], opening: boolean): FeeStep[] {
    return this.settings.architecture === 3 ? schedule : super.payoutSchedule(schedule, opening)
  }

  override feesFor(order: Order, cars: number, discounted = true): FeeStep[] {
    if (this.settings.architecture !== 3 || order.lastPickupAt <= this.now) return super.feesFor(order, cars, discounted)
    const request = this.requests.get(order.id)!
    const duration = (legs: Order["legs"]) => 45 + legs.reduce((sum, leg) => sum + this.network.minutes(leg.pickup.placeId, leg.delivery.placeId), 0)
    const fee = this.baseFee({ ...request, legs: order.legs }) * Math.max(1, duration(order.legs) / duration(request.legs)) * cars / order.legs.length
    if (!this.opened.has(order.id)) this.opened.set(order.id, this.now)
    const opened = this.opened.get(order.id)!
    const steps = [{ at: opened, multiplier: 1.1 }, { at: opened + 45, multiplier: 1.3 }, { at: opened + 120, multiplier: 1.5 }, { at: Math.max(opened + 121, order.lastPickupAt - 120), multiplier: 1.9 }, { at: Math.max(opened + 122, order.lastPickupAt - 60), multiplier: 2.5 }]
    const active = steps.findLast(step => step.at <= this.now) ?? steps[0]!
    return [{ at: this.now, feeCents: Math.round(fee * active.multiplier) }, ...steps.filter(step => step.at > this.now).map(step => ({ at: step.at, feeCents: Math.round(fee * step.multiplier) }))]
  }

  async combineOpen(): Promise<void> {
    if (this.now < this.lastRematch + 15) return
    this.lastRematch = this.now
    const open = [...this.posts.entries()].flatMap(([id, post]) => {
      const order = this.orders.get(post.stops[0]!.orderId)
      if (!order || this.booked.has(id) || this.rematched.has(order.id) || post.stops.length !== 2 || order.lastPickupAt < this.now + 240 || this.legGigs.get(order.id)?.get(0) !== id || (this.opened.get(order.id) ?? this.now) > this.now - 20) return []
      return [{ id, candidate: { order, post, noteSafe: this.noteRules(this.requests.get(order.id)).safe } }]
    })
    for (const plan of planBundles(this.now, open.map(item => item.candidate), this.network, { maxConnectorKm: 90, maxDiscount: 0.35, bookingMinutes: 60 })) {
      const actions = plan.indices.map(index => ({ type: "withdraw" as const, gigId: open[index]!.id }))
      for (const id of plan.orderIds) this.rematched.add(id)
      const results = await this.world.act(actions)
      this.readResults(actions, results)
      if (results.length === 2 && results.every(result => result.ok)) { this.outbox.push(plan.post); this.metrics.rematchedBundles++ }
    }
  }

  override readResults(actions: Action[], results: ActionResult[]): void {
    super.readResults(actions, results)
    actions.forEach((action, index) => { if (action.type === "quote" && results[index] && !results[index]!.ok) { this.reservations.delete(action.requestId); this.planned.delete(action.requestId) } })
  }

  override async handle(event: DeskEvent): Promise<void> {
    if (event.seq <= this.lastSeq) return
    if (this.settings.architecture === 2) {
      if (event.kind === "order_won") { const item = this.reservations.get(event.order.id); if (item) item.probability = 1 }
      if (event.kind === "order_lost") { this.reservations.delete(event.requestId); this.planned.delete(event.requestId) }
      if (event.kind === "order_cancelled") { this.reservations.delete(event.orderId); this.planned.delete(event.orderId) }
      if (event.kind === "order_changed") {
        this.planned.delete(event.order.id)
        const leg = event.order.legs[0]!
        this.reservations.set(event.order.id, { day: Math.floor(Math.max(this.now, leg.pickup.window.from) / 1440), work: this.work(event.order), probability: 1, origin: leg.pickup.placeId })
      }
      if (event.kind === "delivered") { const item = this.reservations.get(event.orderId); if (item) item.day = Math.floor(event.at / 1440) }
    }
    await super.handle(event)
  }

  override nextDecisionAt(): number {
    if (!this.settings.architecture) return super.nextDecisionAt()
    return Math.min(super.nextDecisionAt(), this.now + 15, ...[...this.auction.values()].map(request => Math.max(this.now + 1, request.respondBy - 2)))
  }

  override async tick(): Promise<void> {
    if (this.settings.architecture === 1) this.clearAuction()
    if (this.settings.architecture === 3) await this.combineOpen()
    await super.tick()
  }
}
