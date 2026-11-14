import type { DeliveryOption, PriceRequest } from "../vendor/typescript/types.ts"
import { Network } from "./planning.ts"

const HOUR = 60
const NEAR_KM = 30

/**
 * What the drivers cost us. A car's cost is the fee we post plus the risk that it arrives late:
 * a late car pays back part of its list price, and every late order eats the room we keep under the
 * delivery minimum. So the fee is chosen to make fee + risk smallest, not to make the gig look cheap.
 *
 * The on-time weights below were fitted by the reference team on this same simulator (`fleet_fit`,
 * a logistic in 15 signs). The form of every sign is reproduced here; nothing else is borrowed.
 */
export type FleetSettings = {
  /** The multiples of the typical fee that a gig may open at. One flat fee per gig, so a schedule has one step. */
  fees: number[]
  /** The share of won orders we want on time: the delivery minimum with room for a bad week. */
  onTime: number
  /** What a late order pays back, as a share of its list price. */
  refund: number
  /** The share of cars with a driver that still arrive late: drops and slow drives. */
  bookedLate: number
  /** Euros one late order costs beyond its refund while we are still within the target. */
  latePrice: number
  /** How steeply that price rises as the expected late share comes near the target. */
  grip: number
  /** Orders after which a week's first outcomes say something about its own drivers. */
  calm: number
  /** How firmly we hold, before a week's outcomes speak, that its world is the model's. */
  doubt: number
  /** Bookings after which the drivers know that our fees stay as posted. */
  known: number
  /** How much of the harm to the cars that already wait we charge. */
  crowding: number
}

export const fleetDefaults: FleetSettings = {
  fees: [0.85, 1, 1.15, 1.3, 1.5],
  onTime: 0.97,
  refund: 0.54,
  bookedLate: 0.03,
  latePrice: 300,
  grip: 4,
  calm: 20,
  doubt: 4,
  known: 100,
  crowding: 1,
}

/** The logistic weights of "the car arrives on time". */
export const ON_TIME: Record<string, number> = {
  one: -5.80, fee: 3.96, level: 0.88, slack: 1.13, short: -1.85, long: -0.44, trade_in: -3.35,
  backlog: -0.58, known: 0.25, waited: -0.75, supply_pickup: 0.75, supply_delivery: 0.71,
  private_delivery: -0.75, premium: -0.82, pay: 1.97,
}

/** What we know about one car: how easily it finds a driver in time, and what the dealer pays for it. */
export type Car = Record<string, number>

/** The gigs that wait for a driver now: how many, at what fee, with what chances. */
export type Queue = { backlog: number; going: number; known: number; world: number; late: number; swing: number; refunds: number }

export type FeeChoice = { multiple: number; late: number; onTime: number }

/** A gig that waits for a driver, as the queue sees it. */
export type Waiting = { id: string; multiple: number; car: Car; listPrice: number }

/** The going fee once a gig at this multiple joins the queue: drivers choose among our open gigs. */
export function levelOf(queue: Queue, multiple: number): number {
  return (queue.backlog * queue.going + multiple) / (queue.backlog + 1)
}

export class Fleet {
  settings: FleetSettings
  network: Network
  /** Each place's drivers, counted by how near they live: a quarter at the app's 30 km. */
  supply = new Map<string, number>()
  /** Order -> the model's logit when the world took its gig: what this week's outcomes are measured against. */
  forecast = new Map<string, number>()
  /** Order -> 1 on time, 0 late (or undelivered): what this week's outcomes say. */
  outcome = new Map<string, number>()
  /** What the books have seen, so the shadow price knows how much of the target is already spent. */
  lateSoFar = 0
  ordersSoFar = 0

  constructor(settings: FleetSettings, network: Network, places: string[], homes: string[]) {
    this.settings = settings
    this.network = network
    for (const place of places) this.supply.set(place, Math.log1p(homes.reduce((sum, home) => sum + (1 + this.distance(home, place) / NEAR_KM) ** -2, 0)))
  }

  distance(from: string, to: string): number {
    if (from === to) return 0
    try { return this.network.km(from, to) } catch { return Infinity }
  }

  /** What we know at minute `now` about how easily this request finds a driver in time. */
  car(request: PriceRequest, option: DeliveryOption, latestPickupAt: number, now: number, since?: number): Car {
    const leg = request.legs[0]!
    const km = this.distance(leg.pickup.placeId, leg.delivery.placeId)
    return {
      one: 1,
      slack: Math.log1p(Math.max(0, latestPickupAt - now) / HOUR),
      short: km < 40 ? 1 : 0,
      long: Math.min(Math.max(km, 100), 800) / 100 - 1,
      premium: request.legs.some(item => item.car.premium) ? 1 : 0,
      trade_in: request.legs.length > 1 ? 1 : 0,
      supply_pickup: this.supply.get(leg.pickup.placeId) ?? 0,
      supply_delivery: this.supply.get(leg.delivery.placeId) ?? 0,
      private_delivery: leg.delivery.privateAddress ? 1 : 0,
      pay: Math.log(request.referenceFeeCents / request.legs.length / Math.max(1, option.listPriceCents)),
      waited: Math.min(1, Math.max(0, now - (since ?? now)) / HOUR),
    }
  }

  signs(car: Car, multiple: number, queue: Queue): Record<string, number> {
    const level = levelOf(queue, multiple)
    return { ...car, fee: Math.log(multiple / level), level: Math.log(level), backlog: Math.log1p(queue.backlog), known: Math.log1p(Math.min(queue.known, this.settings.known)) }
  }

  logit(car: Car, multiple: number, queue: Queue): number {
    const signs = this.signs(car, multiple, queue)
    let sum = 0
    for (const [name, weight] of Object.entries(ON_TIME)) sum += weight * (signs[name] ?? 0)
    return sum
  }

  /** The chance that the car arrives on time, moved by what this week's own drivers have shown. */
  onTime(car: Car, multiple: number, queue: Queue): number {
    return sigmoid(this.logit(car, multiple, queue) + queue.world)
  }

  /** The fee multiple that costs least in all: the fee, the expected cost of a late car, and the harm to the cars that wait. */
  fee(car: Car, typical: number, refund: number, latePrice: number, queue: Queue, floor = 0): FeeChoice {
    const total = (multiple: number) => multiple * typical + (1 - this.onTime(car, multiple, queue)) * (refund + latePrice) + this.harm(multiple, queue, latePrice)
    const allowed = this.settings.fees.filter(multiple => multiple >= floor)
    const pick = allowed.length ? allowed.reduce((best, multiple) => total(multiple) < total(best) ? multiple : best) : floor
    const chance = this.onTime(car, pick, queue)
    return { multiple: pick, late: 1 - chance, onTime: chance }
  }

  /** What we expect to pay, in cents, to move this car by this option: its fee, its refund risk, and the room it takes under the minimum. */
  cost(car: Car, typical: number, listPrice: number, queue: Queue, floor = 0): number {
    const refund = this.settings.refund * listPrice
    const latePrice = this.latePriceOf(queue)
    const { multiple, late } = this.fee(car, typical, refund, latePrice, queue, floor)
    const risk = late * refund + Math.max(0, late - (1 - this.settings.onTime)) * latePrice + this.harm(multiple, queue, latePrice)
    return Math.round(typical * multiple + risk)
  }

  /** What one more gig at this fee costs the cars that already wait: it lengthens the queue, and a fee above theirs draws their drivers. */
  harm(multiple: number, queue: Queue, latePrice: number): number {
    if (!queue.backlog) return 0
    const outbid = (ON_TIME.fee! - ON_TIME.level!) * Math.log(levelOf(queue, multiple) / queue.going)
    return this.settings.crowding * (queue.refunds + queue.swing * latePrice) * (outbid - ON_TIME.backlog! / (1 + queue.backlog))
  }

  /** The shadow price, in cents, of one late order: small while the books expect far fewer than we allow, steep as they come near that share and past it. */
  latePriceOf(queue: Queue): number {
    const used = queue.late / (this.settings.calm + this.ordersSoFar) / (1 - this.settings.onTime)
    return this.settings.latePrice * 100 * Math.min(2, used) ** this.settings.grip
  }

  /** The queue this gig would join: the orders that wait for a driver, at the fees they show, and this week's own shift. */
  queueOf(waiting: Waiting[], known: number, expectedLate: number): Queue {
    const backlog = waiting.length
    const going = backlog ? waiting.reduce((sum, item) => sum + item.multiple, 0) / backlog : 1
    const base: Queue = { backlog, going, known, world: 0, late: expectedLate, swing: 0, refunds: 0 }
    const logits = new Map<string, number>()
    for (const item of waiting) {
      const alone: Queue = { ...base, backlog: Math.max(0, backlog - 1), going: backlog > 1 ? (going * backlog - item.multiple) / (backlog - 1) : 1 }
      logits.set(item.id, this.logit(item.car, item.multiple, alone))
    }
    const queue: Queue = { ...base }
    queue.world = this.learned(logits)
    queue.late = expectedLate
    for (const item of waiting) {
      const chance = sigmoid(logits.get(item.id)! + queue.world)
      queue.swing += chance * (1 - chance)
      queue.refunds += chance * (1 - chance) * this.settings.refund * item.listPrice
      if (!this.outcome.has(item.id)) queue.late += 1 - chance - this.settings.bookedLate
    }
    return queue
  }

  /** The intercept that best explains this week's own orders against what the model said when we posted each. */
  learned(waiting: Map<string, number>): number {
    const seen: [number, number][] = []
    for (const [id, logit] of this.forecast) {
      const outcome = this.outcome.get(id)
      if (outcome !== undefined) seen.push([logit, outcome])
    }
    if (!seen.length) return 0
    let shift = 0
    for (let step = 0; step < 4; step++) {
      const chances = seen.map(([logit]) => sigmoid(logit + shift))
      const gradient = seen.reduce((sum, [, outcome], i) => sum + outcome - chances[i]!, 0) - this.settings.doubt * shift
      const curvature = chances.reduce((sum, chance) => sum + chance * (1 - chance), 0) + this.settings.doubt
      shift += gradient / curvature
    }
    void waiting
    return Math.max(-1, Math.min(1, shift))
  }
}

function sigmoid(value: number): number {
  return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value))
}
