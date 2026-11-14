import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import { buildGraph } from '../graph/candidates.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { feasibleAdmission: boolean }
export const defaults: Settings = { ...baseDefaults, feasibleAdmission: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid feasible admission settings')
  const { feasibleAdmission, ...base } = value as Record<string, unknown>
  if (feasibleAdmission !== undefined && typeof feasibleAdmission !== 'boolean') throw new Error('Invalid feasibleAdmission flag')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  expansion = new Set<string>()

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { feasibleAdmission, ...base } = settings
    super(world, level, now, map, drivers, base)
    this.settings = { ...this.settings, feasibleAdmission: feasibleAdmission ?? false }
  }

  override proposals(request: PriceRequest): ReturnType<Portfolio['proposals']> {
    const original = super.proposals(request)
    if (!this.settings.feasibleAdmission || original.length || this.level < 4) return original
    const exposed = [...this.expansion].filter(id => this.pending.has(id) || this.orders.has(id) && !['delivered', 'cancelled'].includes(this.orders.get(id)!.status) && !this.gigsOf(id).some(g => this.booked.has(g))).length
    if (exposed >= 2) {
      this.telemetry.push({ kind: 'expansion_limited', at: this.now, requestId: request.id, exposed })
      return []
    }
    const graph = buildGraph([request], this.now, this.level, this.network, { pairRoutes: 0 })
    const options = graph.options.filter(o => o.constraints.source === 'plain' && o.constraints.legs.length === 1 && o.route.visits.every(v => !v.stop.privateAddress) && o.route.latestStart >= request.respondBy + 180)
    if (!options.length) return []
    const deadline = Math.min(...options.map(o => o.deadline))
    const first = options.find(o => o.deadline === deadline)!
    const trust = 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0)
    const choice = this.market.optimize(this.features(request), { costCents: this.baseFee(request) * this.settings.costRatio, listPriceCents: Math.min(...options.map(o => o.listPriceCents)), trust, minPrice: 1 })
    const prices = Object.fromEntries(options.map(o => [o.kind, Math.ceil(o.listPriceCents * trust * choice.ratio)]))
    const legs = structuredClone(request.legs)
    for (const leg of legs) for (const stop of [leg.pickup, leg.delivery]) stop.window.to = deadline
    this.expansion.add(request.id)
    this.telemetry.push({ kind: 'expansion_candidate', at: this.now, requestId: request.id, exposed, options: options.map(o => o.kind), latestStart: first.route.latestStart, supply: this.supply(request) })
    return [{ action: { type: 'quote', requestId: request.id, prices }, ratio: choice.ratio, order: { id: request.id, dealerId: request.dealerId, option: first.kind, priceCents: Math.min(...Object.values(prices)), deadline, legs, status: 'waiting', deliveredAt: [null], lastPickupAt: first.route.latestStart } }]
  }
}
