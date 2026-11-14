import { createHash } from 'node:crypto'
import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import { buildGraph } from '../graph/candidates.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DeskEvent, DriverProfile, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { privateCoverage: boolean }
export const defaults: Settings = { ...baseDefaults, privateCoverage: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid private coverage settings')
  const { privateCoverage, ...base } = value as Record<string, unknown>
  if (privateCoverage !== undefined && typeof privateCoverage !== 'boolean') throw new Error('Invalid privateCoverage flag')
  if (privateCoverage && base.allowPrivate) throw new Error('Coverage requires private admission disabled in the incumbent')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  screened = new Set<string>()
  explored = new Set<string>()
  assignments = 0
  dailyAssignments = new Map<number, number>()
  stopped = false

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { privateCoverage, ...base } = settings
    super(world, level, now, map, drivers, base)
    this.settings = { ...this.settings, privateCoverage: privateCoverage ?? false }
  }

  override quote(request: PriceRequest, immediate = false): void {
    if (!this.settings.privateCoverage || this.level < 4 || request.legs.length !== 1 || !request.legs.some(l => l.pickup.privateAddress || l.delivery.privateAddress)) return super.quote(request, immediate)
    if (request.arrivedAt > this.now) throw new Error('Future request')
    if (this.screened.has(request.id) || this.quoted.has(request.id) || request.respondBy <= this.now) return
    this.screened.add(request.id)
    this.requests.set(request.id, request)
    const graph = buildGraph([request], this.now, this.level, this.network, { pairRoutes: 0 })
    const options = graph.options.filter(o => o.constraints.source === 'plain' && o.route.latestStart >= request.respondBy + 180)
    const day = Math.floor(this.now / 1440)
    const exposed = [...this.explored].filter(id => this.pending.has(id) || this.orders.has(id) && !['delivered', 'cancelled'].includes(this.orders.get(id)!.status) && !this.gigsOf(id).some(g => this.booked.has(g))).length
    const reason = this.stopped ? 'visit_failure_stop' : !options.length ? 'unsupported_or_insufficient_slack' : this.assignments >= 24 || (this.dailyAssignments.get(day) ?? 0) >= 4 ? 'assignment_budget' : exposed >= 2 ? 'exposure_limit' : 'eligible'
    this.telemetry.push({ kind: 'private_funnel', at: this.now, requestId: request.id, reason, exposed, options: options.map(o => o.kind), omitted: graph.omitted })
    if (reason !== 'eligible') return super.quote(request, immediate)
    this.assignments++
    this.dailyAssignments.set(day, (this.dailyAssignments.get(day) ?? 0) + 1)
    const quote = (createHash('sha256').update(`private-coverage:${this.settings.randomSeed}:${request.id}`).digest().readUInt32BE(0) & 1) === 1
    const baseFee = this.baseFee(request)
    const ratio = Math.max(1.4, 1.35 * baseFee / Math.min(...options.map(o => o.listPriceCents)))
    const prices = quote ? Object.fromEntries(options.map(o => [o.kind, Math.ceil(o.listPriceCents * ratio)])) : { [request.options[0]!.kind]: 100_000_000 }
    const action = { type: 'quote' as const, requestId: request.id, prices }
    this.quoted.add(request.id)
    if (quote) { this.pending.add(request.id); this.explored.add(request.id) }
    this.outbox.push(action)
    this.telemetry.push({ kind: 'private_randomized', at: this.now, requestId: request.id, arm: quote ? 'quote' : 'decline', probability: .5, choices: ['decline', 'quote'], probabilities: [.5, .5], action: structuredClone(action), ratio, baseFee, supply: this.supply(request), exposed, request: structuredClone(request), options: options.map(o => ({ kind: o.kind, listPriceCents: o.listPriceCents, deadline: o.deadline, latestStart: o.route.latestStart })) })
  }

  override async handle(event: DeskEvent): Promise<void> {
    await super.handle(event)
    if (event.kind === 'visit_failed' && this.explored.has(event.orderId)) {
      this.stopped = true
      this.telemetry.push({ kind: 'private_exploration_stopped', at: this.now, orderId: event.orderId, seq: event.seq })
    }
  }
}
