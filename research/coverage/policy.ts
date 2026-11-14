import { createHash } from 'node:crypto'
import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import { buildGraph } from '../graph/candidates.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { Action, Advance, DriverProfile, FeeStep, Order, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { coverage: boolean; escalationDelay: number }
export const defaults: Settings = { ...baseDefaults, coverage: false, escalationDelay: 0 }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid coverage settings')
  const { coverage, escalationDelay, ...base } = value as Record<string, unknown>
  if (coverage !== undefined && typeof coverage !== 'boolean') throw new Error('Invalid coverage flag')
  if (escalationDelay !== undefined && escalationDelay !== 0 && escalationDelay !== 60) throw new Error('Invalid weekly escalation regime')
  validateBase(base)
}

export function assignment(seed: number, domain: string, id: string, choices: number): number {
  if (!Number.isSafeInteger(choices) || choices < 1 || choices > 256) throw new Error('Invalid assignment choices')
  const limit = Math.floor(4294967296 / choices) * choices
  for (let draw = 0; ; draw++) {
    const n = createHash('sha256').update(`${seed}:${domain}:${id}:${draw}`).digest().readUInt32BE(0)
    if (n < limit) return n % choices
  }
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  screened = new Set<string>()
  explored = new Set<string>()
  acquisitionCount = 0
  dailyAssignments = new Map<number, number>()
  paymentCount = 0
  offerProbeCount = 0
  treated = new WeakSet<object>()

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { coverage, escalationDelay, ...base } = settings
    let desk: Dispatcher | undefined
    const connection = new Proxy(world, { get(target, key) {
      if (key === 'act') return (actions: Action[]) => { desk?.intervene(actions); return target.act(actions) }
      if (key === 'advance') return (input: Advance) => { desk?.intervene(input.actions ?? []); return target.advance(input) }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    super(connection, level, now, map, drivers, base)
    this.settings = { ...this.settings, coverage: coverage ?? false, escalationDelay: escalationDelay ?? 0 }
    desk = this
  }

  override quote(request: PriceRequest, immediate = false): void {
    if (!this.settings.coverage) return super.quote(request, immediate)
    if (request.arrivedAt > this.now) throw new Error('Future request')
    if (this.screened.has(request.id) || request.respondBy <= this.now || this.quoted.has(request.id)) return
    this.screened.add(request.id)
    this.requests.set(request.id, request)
    const graph = buildGraph([request], this.now, this.level, this.network, { pairRoutes: 0 })
    const baseline = super.proposal(request)
    const options = graph.options.filter(o => o.constraints.source === 'plain' && o.constraints.legs.length === 1 && o.route.visits.every(v => !v.stop.privateAddress) && o.route.latestStart >= request.respondBy + 180)
    const day = Math.floor(this.now / 1440)
    const exposed = [...this.explored].filter(id => this.pending.has(id) || this.orders.has(id) && !['delivered', 'cancelled'].includes(this.orders.get(id)!.status) && !this.gigsOf(id).some(g => this.booked.has(g))).length
    const reason = baseline ? 'incumbent_candidate' : !options.length ? 'unsupported_or_insufficient_slack' : this.acquisitionCount >= 24 || (this.dailyAssignments.get(day) ?? 0) >= 6 ? 'assignment_budget' : exposed >= 2 ? 'exposure_limit' : 'eligible_exploration'
    this.telemetry.push({ kind: 'acquisition_funnel', at: this.now, requestId: request.id, stage: reason, baselineCandidate: !!baseline, graphOptions: graph.options.map(o => ({ option: o.kind, deadline: o.deadline, latestStart: o.route.latestStart })), omitted: graph.omitted, features: this.features(request), supply: this.supply(request), exposed })
    if (reason !== 'eligible_exploration') return super.quote(request, immediate)
    this.acquisitionCount++
    this.dailyAssignments.set(day, (this.dailyAssignments.get(day) ?? 0) + 1)
    const option = options.sort((a,b) => b.route.latestStart-a.route.latestStart || b.listPriceCents-a.listPriceCents)[0]!
    const arm = assignment(this.settings.randomSeed, 'acquisition', request.id, 3)
    const ratio = [0, 1.25, 1.5][arm]!
    const price = arm === 0 ? 100_000_000 : Math.ceil(Math.max(option.listPriceCents * ratio, this.baseFee(request) * 1.35))
    const action: Extract<Action, {type:'quote'}> = { type: 'quote', requestId: request.id, prices: { [option.kind]: price } }
    this.quoted.add(request.id)
    if (arm !== 0) {
      this.explored.add(request.id)
      this.pending.add(request.id)
      this.bids.set(request.id, { features: this.features(request), ratio: price / option.listPriceCents })
    }
    this.outbox.push(action)
    this.telemetry.push({ kind: 'acquisition_randomized', at: this.now, requestId: request.id, arm: ['decline', 'quote_125', 'quote_150'][arm], probability: 1/3, choices: ['decline', 'quote_125', 'quote_150'], probabilities: [1/3,1/3,1/3], option: option.kind, listPriceCents: option.listPriceCents, priceCents: price, latestStart: option.route.latestStart, features: this.features(request), supply: this.supply(request), exposed, action: structuredClone(action) })
  }

  override feesFor(order: Order, cars: number, discounted = true): FeeStep[] {
    const schedule = super.feesFor(order, cars, discounted)
    if (!this.settings.coverage || !this.settings.escalationDelay || schedule.length < 3 || this.urgent.has(order.id)) return schedule
    return schedule.map((step, i) => ({ ...step, at: i > 0 && i < schedule.length - 1 ? Math.min(step.at + this.settings.escalationDelay, schedule[i+1]!.at - 1) : step.at }))
  }

  override takeActions(): Action[] {
    const actions = super.takeActions()
    this.intervene(actions)
    return actions
  }

  intervene(actions: readonly Action[]): void {
    if (!this.settings.coverage) return
    for (const action of actions) {
      if (this.treated.has(action)) continue
      this.treated.add(action)
      if (action.type === 'post' && this.paymentCount < 40) {
        const ids = [...new Set(action.stops.map(s => s.orderId))]
        const orders = ids.map(id => this.orders.get(id))
        if (orders.some(o => !o || o.lastPickupAt < this.now + 360 || this.urgent.has(o.id))) continue
        const index = this.paymentCount++
        const arm = assignment(this.settings.randomSeed, 'payment', String(index), 3)
        const opening = action.schedule[0]!.feeCents
        const multiplier = [.92, 1, 1.08][arm]!
        const original = structuredClone(action)
        action.schedule[0]!.feeCents = Math.max(1, Math.min(action.schedule[1]?.feeCents ?? Infinity, Math.round(opening * multiplier)))
        this.telemetry.push({ kind: 'opening_randomized', at: this.now, index, orderIds: ids, probability: 1/3, choices: [.92,1,1.08], probabilities: [1/3,1/3,1/3], multiplier, original, action: structuredClone(action), slack: Math.min(...orders.map(o => o!.lastPickupAt-this.now)), features: ids.map(id => this.features(this.requests.get(id)!)), weeklyEscalationDelay: this.settings.escalationDelay })
      }
      if (action.type === 'offer' && this.offerProbeCount < 40) {
        const index = this.offerProbeCount++
        const multiplier = [1, 1.08][assignment(this.settings.randomSeed, 'offer', String(index), 2)]!
        const originalFee = action.feeCents
        action.feeCents = Math.round(action.feeCents * multiplier)
        this.telemetry.push({ kind: 'offer_randomized', at: this.now, index, probability: .5, choices: [1,1.08], probabilities: [.5,.5], multiplier, originalFee, action: structuredClone(action), driver: this.drivers.find(d => d.id === action.driverId), observedPosition: this.driverPlace.get(action.driverId), gig: structuredClone(this.posts.get(action.gigId)), weeklyEscalationDelay: this.settings.escalationDelay })
      }
    }
  }
}
