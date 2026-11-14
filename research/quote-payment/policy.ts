import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { defaultQuotePayment: boolean }
export const defaults: Settings = { ...baseDefaults, defaultQuotePayment: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid quote payment settings')
  const { defaultQuotePayment, ...base } = value as Record<string, unknown>
  if (defaultQuotePayment !== undefined && typeof defaultQuotePayment !== 'boolean') throw new Error('Invalid defaultQuotePayment flag')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { defaultQuotePayment, ...base } = settings
    super(world, level, now, map, drivers, base)
    this.settings = { ...this.settings, defaultQuotePayment: defaultQuotePayment ?? false }
  }

  override buildFrame(): ReturnType<Portfolio['buildFrame']> {
    const frame = super.buildFrame()
    if (!this.settings.defaultQuotePayment) return frame
    const removed = new Set([...frame.plans].filter(([, plan]) => plan.kind === 'quote' && (plan.multiplier ?? 1) > 1).map(([id]) => id))
    frame.input.alternatives = frame.input.alternatives.filter(a => !removed.has(a.id))
    for (const id of removed) frame.plans.delete(id)
    this.telemetry.push({ kind: 'quote_payment_filtered', at: this.now, removed: removed.size, retained: frame.input.alternatives.length, originalOmitted: frame.omitted })
    return frame
  }
}
