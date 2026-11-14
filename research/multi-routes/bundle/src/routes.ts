import { intervals, needsCharge } from "./planning.ts"
import type { Network } from "./planning.ts"
import type { BundleCandidate } from "./bundles.ts"
import type { FeeStep, PostAction, StopPlace } from "../vendor/typescript/types.ts"

export type Route = { indices: number[]; orderIds: string[]; post: PostAction; drivingMinutes: number; savedWorkMinutes: number; feeSavingCents: number; latestPickupAt: number }
export type Limits = { maxCars: number; connectorKm: number; savingsShare: number; maxDiscount: number; singlePayout: number; expansionLimit: number }
export const limits: Limits = { maxCars: 4, connectorKm: 90, savingsShare: 0.8, maxDiscount: 0.45, singlePayout: 0.85, expansionLimit: 30_000 }

/** Enumerate short feasible routes, then choose disjoint routes by opening-fee savings. */
export function planRoutes(now: number, candidates: BundleCandidate[], network: Network, options: Partial<Limits> = {}) {
  const config = { ...limits, ...options }
  if (!Number.isInteger(config.maxCars) || config.maxCars < 2 || config.maxCars > 6 || config.connectorKm < 0 || config.savingsShare < 0 || config.savingsShare > 1 || config.maxDiscount <= 0 || config.maxDiscount >= 1 || config.singlePayout <= 0 || config.singlePayout > 1 || !Number.isInteger(config.expansionLimit) || config.expansionLimit < 1) throw new Error("Invalid route limits")
  const valid = candidates.flatMap((candidate, index) => eligible(candidate, network) ? [index] : [])
  const subsets = new Map<string, Route>()
  let expansions = 0, truncated = false
  function extend(indices: number[]) {
    if (indices.length >= config.maxCars) return
    const last = candidates[indices.at(-1)!]!.order.legs[0]!
    for (const next of valid) {
      if (indices.some(index => candidates[index]!.order.id === candidates[next]!.order.id)) continue
      const leg = candidates[next]!.order.legs[0]!
      if (network.km(last.delivery.placeId, leg.pickup.placeId) > config.connectorKm) continue
      if (expansions >= config.expansionLimit) { truncated = true; return }
      expansions++
      const path = [...indices, next], route = makeRoute(now, path, candidates, network, config)
      if (!route) continue
      const key = path.toSorted((a, b) => a - b).join(",")
      if (route.feeSavingCents > (subsets.get(key)?.feeSavingCents ?? 0)) subsets.set(key, route)
      extend(path)
    }
  }
  for (const index of valid) extend([index])
  const routes = [...subsets.values()]
  return { selected: selectRoutes(routes, candidates.length), enumerated: routes.length, expansions, truncated }
}

export function makeRoute(now: number, indices: number[], candidates: BundleCandidate[], network: Network, config: Limits): Route | null {
  const items = indices.map(index => candidates[index]!), stops = items.flatMap(item => item.post.stops.map(stop => ({ ...stop })))
  const places: StopPlace[] = [], gaps: number[] = []
  let driving = 0, separate = 0, opening = 0, singleOpening = 0, maximum = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!, leg = item.order.legs[0]!, pickup = stops[2*i]!
    const drive = network.minutes(leg.pickup.placeId, leg.delivery.placeId)
    driving += drive
    separate += 45 + drive + network.minutes(leg.delivery.placeId, leg.pickup.placeId)
    const fee = feeAt(item.post.schedule, now)
    opening += fee
    singleOpening += Math.round(fee * config.singlePayout)
    maximum += item.post.schedule.at(-1)!.feeCents
    for (const [k, place] of [leg.pickup, leg.delivery].entries()) {
      const own = stops[2*i+k]!.window
      places.push({ ...place, window: { from: Math.max(place.window.from, own?.from ?? -Infinity), to: Math.min(place.window.to, own?.to ?? Infinity, item.order.deadline - 30, k === 0 ? item.order.lastPickupAt : Infinity) } })
    }
    gaps.push(Math.ceil(drive * 1.15) + 20 + (pickup.withCharging ? 40 : 0) + (pickup.withPlates ? 30 : 0))
    if (i + 1 < items.length) {
      const connector = network.minutes(leg.delivery.placeId, items[i+1]!.order.legs[0]!.pickup.placeId)
      driving += connector
      gaps.push(Math.ceil(connector * 1.15) + 10)
    }
  }
  if (driving > 720) return null
  const timing = sameDay(places, gaps, now + 90)
  if (!timing) return null
  const first = items[0]!.order.legs[0]!, last = items.at(-1)!.order.legs[0]!
  const shared = 45 + driving + network.minutes(last.delivery.placeId, first.pickup.placeId)
  const savedWorkMinutes = Math.max(0, separate - shared)
  const discount = Math.min(config.maxDiscount, config.savingsShare * savedWorkMinutes / separate)
  const pay = (multiplier: number) => Math.round(Math.min(maximum, opening * multiplier) * (1 - discount))
  const due = Math.max(now + 30, timing.latest - 240)
  const schedule = [{ at: now, feeCents: pay(1) }, { at: due, feeCents: pay(1.45) }, { at: Math.max(due + 30, timing.latest - 120), feeCents: pay(1.9) }, { at: Math.max(due + 60, timing.latest - 60), feeCents: pay(2.5) }]
  stops.forEach((stop, i) => { stop.window = { from: Math.max(places[i]!.window.from, timing.start), to: Math.min(places[i]!.window.to, timing.end, i === 0 ? timing.latest : Infinity) } })
  return { indices, orderIds: items.map(item => item.order.id), post: { type: "post", stops, audience: { experienced: items.some(item => item.post.audience.experienced), manualLicence: items.some(item => item.post.audience.manualLicence) }, schedule }, drivingMinutes: driving, savedWorkMinutes, feeSavingCents: singleOpening - schedule[0]!.feeCents, latestPickupAt: timing.latest }
}

/** Exact set packing for small queues; deterministic greedy packing for larger ones. */
export function selectRoutes(routes: Route[], size: number): Route[] {
  const profitable = routes.filter(route => route.feeSavingCents > 0)
  if (size > 20) {
    const used = new Set<number>(), chosen: Route[] = []
    for (const route of profitable.toSorted((a, b) => b.feeSavingCents - a.feeSavingCents || b.indices.length - a.indices.length)) {
      if (route.indices.some(index => used.has(index))) continue
      route.indices.forEach(index => used.add(index)); chosen.push(route)
    }
    return chosen
  }
  const masks = profitable.map(route => route.indices.reduce((mask, index) => mask | 1 << index, 0))
  const memo = new Map<number, { value: number; chosen: Route[] }>()
  function solve(mask: number): { value: number; chosen: Route[] } {
    if (!mask) return { value: 0, chosen: [] }
    const cached = memo.get(mask)
    if (cached) return cached
    const first = mask & -mask
    let best = solve(mask ^ first)
    profitable.forEach((route, index) => {
      const bits = masks[index]!
      if (!(bits & first) || (bits & mask) !== bits) return
      const rest = solve(mask ^ bits), value = rest.value + route.feeSavingCents
      if (value > best.value) best = { value, chosen: [route, ...rest.chosen] }
    })
    memo.set(mask, best)
    return best
  }
  return solve((1 << size) - 1).chosen
}

function eligible({ order, post, noteSafe }: BundleCandidate, network: Network): boolean {
  if (!noteSafe || order.status !== "waiting" || order.legs.length !== 1 || order.deliveredAt[0] !== null || post.stops.length !== 2 || !post.schedule.length) return false
  const leg = order.legs[0]!, [pickup, delivery] = post.stops
  if (!pickup || !delivery || pickup.orderId !== order.id || delivery.orderId !== order.id || pickup.leg !== 0 || delivery.leg !== 0 || pickup.kind !== "pickup" || delivery.kind !== "delivery") return false
  if (leg.pickup.privateAddress || leg.delivery.privateAddress || leg.car.premium && !post.audience.experienced || needsCharge(leg, network) && !pickup.withCharging) return false
  return post.schedule.every((step, i) => Number.isSafeInteger(step.at) && Number.isSafeInteger(step.feeCents) && step.feeCents > 0 && (i === 0 || step.at > post.schedule[i-1]!.at && step.feeCents >= post.schedule[i-1]!.feeCents))
}

function sameDay(places: StopPlace[], gaps: number[], from: number) {
  for (let day = Math.floor(Math.max(from, places[0]!.window.from) / 1440); day <= Math.floor(places[0]!.window.to / 1440); day++) {
    const start = day * 1440, end = start + 1439
    let earliest = Math.max(from, start), latest = end
    for (let i = 0; i < places.length; i++) {
      earliest = intervals(places[i]!, earliest, Math.min(end, places[i]!.window.to))[0]?.from ?? Infinity
      if (!Number.isFinite(earliest)) break
      if (i < gaps.length) earliest += gaps[i]!
    }
    if (!Number.isFinite(earliest)) continue
    for (let i = places.length - 1; i >= 0; i--) {
      latest = intervals(places[i]!, Math.max(start, places[i]!.window.from), latest).at(-1)?.to ?? -Infinity
      if (!Number.isFinite(latest)) break
      if (i > 0) latest -= gaps[i-1]!
    }
    if (latest >= Math.max(from, start)) return { start, end, latest }
  }
  return null
}

function feeAt(schedule: FeeStep[], at: number): number { return (schedule.findLast(step => step.at <= at) ?? schedule[0]!).feeCents }
