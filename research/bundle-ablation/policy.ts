import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import { planBundles } from '../../src/bundles.ts'
import type { BundleCandidate, BundlePlan } from '../../src/bundles.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, WorldMap } from '../../vendor/typescript/types.ts'

export type Settings = BaseSettings & { bundlePayment: 'legacy' | 'high' | 'low' }
export const defaults: Settings = { ...baseDefaults, bundlePayment: 'legacy' }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid ablation settings')
  const { bundlePayment, ...base } = value as Record<string, unknown>
  if (bundlePayment !== undefined && (typeof bundlePayment !== 'string' || !['legacy','high','low'].includes(bundlePayment))) throw new Error('Invalid bundle payment convention')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { bundlePayment, ...base } = settings
    super(world, level, now, map, drivers, base)
    this.settings = { ...this.settings, bundlePayment: bundlePayment ?? 'legacy' }
  }

  override bundlePlans(now: number, candidates: BundleCandidate[]): BundlePlan[] {
    if (this.settings.bundlePayment === 'legacy' || this.settings.portfolio && this.settings.bundlePayment === 'low') return super.bundlePlans(now, candidates)
    const prepared = candidates.map(candidate => {
      const held = this.held.get(candidate.order.id)
      const raw = held?.post.schedule ?? (!this.orders.has(candidate.order.id) ? this.feesFor(candidate.order, 1, false) : undefined)
      // A live open anchor keeps its actual schedule; never reverse rounded discounts.
      if (!raw) return candidate
      const schedule = this.settings.bundlePayment === 'low' ? this.payoutSchedule(raw, true) : raw
      return { ...candidate, post: { ...candidate.post, schedule } }
    })
    return planBundles(now, prepared, this.network)
  }

  override flushBundles(): void {
    if (this.settings.portfolio || this.settings.bundlePayment !== 'low') return super.flushBundles()
    if (![...this.held.values()].some(item => item.at + this.settings.bundleWait <= this.now)) return
    const candidates = [...this.held].filter(([id]) => this.orders.has(id)).map(([id, item]) => ({ order: this.orders.get(id)!, post: item.post, noteSafe: this.noteRules(this.requests.get(id)).safe }))
    const bundles = this.settings.bundlePairs ? this.bundlePlans(this.now, candidates) : []
    const paired = new Set(bundles.flatMap(bundle => bundle.indices))
    this.held.clear()
    this.outbox.push(...bundles.map(bundle => bundle.post), ...candidates.filter((_, i) => !paired.has(i)).map(candidate => ({ ...candidate.post, schedule: this.payoutSchedule(candidate.post.schedule, true) })))
  }
}
