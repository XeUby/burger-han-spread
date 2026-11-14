import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import { requestFeasibility } from '../../src/admission.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { optionQuotes: boolean }
export const defaults: Settings = { ...baseDefaults, optionQuotes: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid option settings')
  const { optionQuotes, ...base } = value as Record<string, unknown>
  if (optionQuotes !== undefined && typeof optionQuotes !== 'boolean') throw new Error('Invalid optionQuotes flag')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { optionQuotes, ...base } = settings
    super(world, level, now, map, drivers, base)
    this.settings = { ...this.settings, optionQuotes: optionQuotes ?? false }
  }

  override alternativeLimit(): number { return this.settings.optionQuotes ? 360 : super.alternativeLimit() }

  override proposals(request: PriceRequest): ReturnType<Portfolio['proposals']> {
    const proposal = super.proposal(request)
    if (!proposal) return []
    if (!this.settings.optionQuotes || this.level < 4 || Object.keys(proposal.action.prices).length === 1) return [proposal]
    const plan = this.plannedRequest(request)
    return plan.options.flatMap(option => {
      const price = proposal.action.prices[option.kind]
      if (price === undefined) return []
      const feasible = requestFeasibility(plan, option.deadline, this.network, this.settings)
      if (!feasible) return []
      const legs = structuredClone(plan.legs)
      for (const leg of legs) for (const stop of [leg.pickup, leg.delivery]) {
        if (!stop.privateAddress) stop.window.to = option.deadline
      }
      return [{ action: { ...proposal.action, prices: { [option.kind]: price } }, ratio: proposal.ratio,
        order: { ...proposal.order, option: option.kind, priceCents: price, deadline: option.deadline, legs, lastPickupAt: feasible.latestPickupAt } }]
    })
  }
}
