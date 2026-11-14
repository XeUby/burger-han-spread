import { createHash } from 'node:crypto'
import { Dispatcher as Portfolio, defaults as baseDefaults, validateSettings as validateBase } from '../portfolio/policy.ts'
import type { Settings as BaseSettings } from '../portfolio/policy.ts'
import type { Solution } from '../portfolio/bridge.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, WorldMap } from '../../vendor/typescript/types.ts'

type Frame = Parameters<Portfolio['execute']>[0]
export type Settings = BaseSettings & { menuChoice: boolean }
export const defaults: Settings = { ...baseDefaults, menuChoice: false }
export function validateSettings(value: unknown): asserts value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid menu settings')
  const { menuChoice, ...base } = value as Record<string, unknown>
  if (menuChoice !== undefined && typeof menuChoice !== 'boolean') throw new Error('Invalid menuChoice flag')
  if (menuChoice && base.portfolio !== true) throw new Error('Menu intervention requires portfolio execution')
  validateBase(base)
}

export class Dispatcher extends Portfolio {
  declare settings: Settings
  assigned = new Set<string>()
  dailyAssignments = new Map<number, number>()

  constructor(world: World, level: number, now: number, map: WorldMap, drivers: DriverProfile[], settings: Partial<Settings> = {}) {
    validateSettings(settings)
    const { menuChoice, ...base } = settings
    super(world, level, now, map, drivers, base)
    if (menuChoice && level !== 8) throw new Error('Menu study is level 8 only')
    this.settings = { ...this.settings, menuChoice: menuChoice ?? false }
  }

  override async execute(frame: Frame, solution: Solution): Promise<void> {
    const plan = solution.selected.map(id => frame.plans.get(id)!).filter(p => p.kind === 'quote' || p.kind === 'decline' || p.due <= this.now).sort((a, b) => a.due - b.due)[0]
    const request = plan?.request, action = plan?.action
    const day = Math.floor(this.now / 1440)
    if (!this.settings.menuChoice || plan?.kind !== 'quote' || plan.anchor || !request || action?.type !== 'quote' || request.note !== null || request.legs.length !== 1 || request.legs.some(l => l.pickup.privateAddress || l.delivery.privateAddress) || action.prices.same_day === undefined || Object.keys(action.prices).length < 2 || this.assigned.size >= 40 || (this.dailyAssignments.get(day) ?? 0) >= 8) return super.execute(frame, solution)
    if (this.assigned.has(request.id) || request.arrivedAt > this.now || request.respondBy <= this.now || !this.waiting.has(request.id)) throw new Error('Invalid menu assignment state')
    const original = structuredClone(action)
    const premium = (createHash('sha256').update(`menu-choice:${this.settings.randomSeed}:${request.id}`).digest().readUInt32BE(0) & 1) === 1
    const transmitted = structuredClone(action)
    if (premium) transmitted.prices.same_day = Math.ceil(transmitted.prices.same_day! * 1.10)
    this.assigned.add(request.id)
    this.dailyAssignments.set(day, (this.dailyAssignments.get(day) ?? 0) + 1)
    this.telemetry.push({ kind: 'menu_randomized', at: this.now, requestId: request.id, arm: premium ? 'premium' : 'original', probability: .5, choices: ['original', 'premium'], probabilities: [.5, .5], original, action: structuredClone(transmitted), request: structuredClone(request), supply: this.supply(request), baseFee: this.baseFee(request), trustFactor: this.level === 8 ? 1 + this.settings.trustStep * Math.min(25, this.trust.get(request.dealerId) ?? 0) : 1 })
    const plans = new Map(frame.plans)
    for (const [id, candidate] of plans) if (candidate === plan) plans.set(id, { ...candidate, action: transmitted })
    try { await super.execute({ ...frame, plans }, solution) } finally { this.bids.delete(request.id) }
  }
}
