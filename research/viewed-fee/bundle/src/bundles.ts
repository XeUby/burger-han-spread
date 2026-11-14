import { intervals, needsCharge } from "./planning.ts"
import type { Network } from "./planning.ts"
import type { FeeStep, Order, PostAction, StopPlace, StopRef } from "../vendor/typescript/types.ts"

export type BundleCandidate = { order: Order; post: PostAction; noteSafe: boolean }
export type BundleLimits = {
  maxConnectorKm?: number
  maxDrivingMinutes?: number
  bookingMinutes?: number
  deadlineBufferMinutes?: number
  maxDiscount?: number
}
export type BundlePlan = {
  indices: [number, number]
  orderIds: [string, string]
  post: PostAction
  drivingMinutes: number
  connectorKm: number
  latestPickupAt: number
  earliestDeliveryAt: number
  savedWorkMinutes: number
  feeSavingCents: number
  discount: number
}

/** Compares both sequential car orders and chooses disjoint pairs with the greatest fee savings. */
export function planBundles(now: number, candidates: readonly BundleCandidate[], network: Network, limits: BundleLimits = {}): BundlePlan[] {
  const maxConnectorKm = limits.maxConnectorKm ?? 30
  const maxDrivingMinutes = Math.min(720, limits.maxDrivingMinutes ?? 720)
  const bookingMinutes = limits.bookingMinutes ?? 90
  const deadlineBuffer = limits.deadlineBufferMinutes ?? 30
  const maxDiscount = limits.maxDiscount ?? 0.2
  if (![now, maxConnectorKm, maxDrivingMinutes, bookingMinutes, deadlineBuffer, maxDiscount].every(Number.isFinite) || maxConnectorKm < 0 || maxDrivingMinutes <= 0 || bookingMinutes < 0 || deadlineBuffer < 0 || maxDiscount <= 0 || maxDiscount >= 1) throw new Error("Invalid bundle limits")
  const pairs: BundlePlan[] = []
  for (let i = 0; i < candidates.length; i++) {
    if (!eligible(candidates[i]!, network)) continue
    for (let j = i + 1; j < candidates.length; j++) {
      if (!eligible(candidates[j]!, network) || candidates[i]!.order.id === candidates[j]!.order.id) continue
      const choices: BundlePlan[] = []
      for (const [a, b] of [[i, j], [j, i]] as [number, number][]) {
        const first = candidates[a]!, second = candidates[b]!
        const x = first.order.legs[0]!, y = second.order.legs[0]!
        const connectorKm = network.km(x.delivery.placeId, y.pickup.placeId)
        if (connectorKm > maxConnectorKm) continue
        const driveA = network.minutes(x.pickup.placeId, x.delivery.placeId)
        const driveB = network.minutes(y.pickup.placeId, y.delivery.placeId)
        const connector = network.minutes(x.delivery.placeId, y.pickup.placeId)
        const drivingMinutes = driveA + connector + driveB
        if (drivingMinutes > maxDrivingMinutes) continue
        const stops = [...first.post.stops, ...second.post.stops].map(stop => ({ ...stop }))
        const places = [x.pickup, x.delivery, y.pickup, y.delivery].map((place, k) => {
          const order = k < 2 ? first.order : second.order
          const own = stops[k]!.window
          return { ...place, window: { from: Math.max(place.window.from, own?.from ?? -Infinity), to: Math.min(place.window.to, own?.to ?? Infinity, order.deadline - deadlineBuffer, k % 2 === 0 ? order.lastPickupAt : Infinity) } }
        })
        const gaps = [workMinutes(driveA, stops[0]!), Math.ceil(connector * 1.15) + 10, workMinutes(driveB, stops[2]!)]
        const timing = sameDayTiming(places, gaps, now + bookingMinutes)
        if (!timing) continue
        const { earliest, latest, dayStart, dayEnd } = timing
        const separateWork = 90 + driveA + driveB + network.minutes(x.delivery.placeId, x.pickup.placeId) + network.minutes(y.delivery.placeId, y.pickup.placeId)
        const bundledWork = 45 + drivingMinutes + network.minutes(y.delivery.placeId, x.pickup.placeId)
        const savedWorkMinutes = Math.max(0, separateWork - bundledWork)
        const discount = Math.min(maxDiscount, 0.5 * savedWorkMinutes / separateWork)
        if (discount < 0.01) continue
        const opening = feeAt(first.post.schedule, now) + feeAt(second.post.schedule, now)
        const schedule = bundleSchedule(now, first, second, latest, discount)
        const feeSavingCents = opening - schedule[0]!.feeCents
        if (feeSavingCents <= 0) continue
        // Explicit windows prevent the engine from silently extending an infeasible bundle.
        for (let k = 0; k < stops.length; k++) stops[k]!.window = { from: Math.max(places[k]!.window.from, dayStart), to: Math.min(places[k]!.window.to, dayEnd, k === 0 ? latest : Infinity) }
        choices.push({ indices: [a, b], orderIds: [first.order.id, second.order.id], post: { type: "post", stops, audience: { experienced: first.post.audience.experienced || second.post.audience.experienced, manualLicence: first.post.audience.manualLicence || second.post.audience.manualLicence }, schedule }, drivingMinutes, connectorKm, latestPickupAt: latest, earliestDeliveryAt: earliest, savedWorkMinutes, feeSavingCents, discount })
      }
      choices.sort((a, b) => b.feeSavingCents - a.feeSavingCents || a.drivingMinutes - b.drivingMinutes || a.orderIds[0].localeCompare(b.orderIds[0]))
      if (choices[0]) pairs.push(choices[0])
    }
  }
  return selectPairs(pairs)
}

function eligible(candidate: BundleCandidate, network: Network): boolean {
  const { order, post } = candidate
  if (!candidate.noteSafe || order.legs.length !== 1 || order.status !== "waiting" || order.deliveredAt[0] !== null || post.stops.length !== 2 || !post.schedule.length) return false
  const [pickup, delivery] = post.stops
  if (!pickup || !delivery || pickup.orderId !== order.id || delivery.orderId !== order.id || pickup.leg !== 0 || delivery.leg !== 0 || pickup.kind !== "pickup" || delivery.kind !== "delivery") return false
  const leg = order.legs[0]!
  if (leg.pickup.privateAddress || leg.delivery.privateAddress || leg.car.premium && !post.audience.experienced || needsCharge(leg, network) && !pickup.withCharging) return false
  return post.schedule.every((step, i) => Number.isSafeInteger(step.at) && Number.isSafeInteger(step.feeCents) && step.feeCents > 0 && (i === 0 || step.at > post.schedule[i - 1]!.at && step.feeCents >= post.schedule[i - 1]!.feeCents))
}

function workMinutes(drive: number, pickup: StopRef): number {
  return Math.ceil(drive * 1.15) + 20 + (pickup.withCharging ? 40 : 0) + (pickup.withPlates ? 30 : 0)
}

function sameDayTiming(places: StopPlace[], gaps: number[], start: number): { earliest: number; latest: number; dayStart: number; dayEnd: number } | null {
  const firstDay = Math.floor(Math.max(start, places[0]!.window.from) / 1440)
  const lastDay = Math.floor(places[0]!.window.to / 1440)
  for (let day = firstDay; day <= lastDay; day++) {
    const dayStart = day * 1440, dayEnd = dayStart + 1439
    let earliest = Math.max(start, dayStart)
    for (let k = 0; k < places.length; k++) {
      earliest = intervals(places[k]!, earliest, Math.min(dayEnd, places[k]!.window.to))[0]?.from ?? Infinity
      if (!Number.isFinite(earliest)) break
      if (k < gaps.length) earliest += gaps[k]!
    }
    if (!Number.isFinite(earliest)) continue
    let latest = dayEnd
    for (let k = places.length - 1; k >= 0; k--) {
      latest = intervals(places[k]!, Math.max(places[k]!.window.from, dayStart), latest).at(-1)?.to ?? -Infinity
      if (!Number.isFinite(latest)) break
      if (k > 0) latest -= gaps[k - 1]!
    }
    if (latest >= Math.max(start, dayStart)) return { earliest, latest, dayStart, dayEnd }
  }
  return null
}

function feeAt(schedule: readonly FeeStep[], at: number): number {
  return (schedule.findLast(step => step.at <= at) ?? schedule[0]!).feeCents
}

function bundleSchedule(now: number, first: BundleCandidate, second: BundleCandidate, latest: number, discount: number): FeeStep[] {
  const opening = feeAt(first.post.schedule, now) + feeAt(second.post.schedule, now)
  const maximum = first.post.schedule.at(-1)!.feeCents + second.post.schedule.at(-1)!.feeCents
  const due = Math.max(now + 30, latest - 240)
  const fee = (multiplier: number) => Math.round(Math.min(maximum, opening * multiplier) * (1 - discount))
  return [{ at: now, feeCents: fee(1) }, { at: due, feeCents: fee(1.45) }, { at: Math.max(due + 30, latest - 120), feeCents: fee(1.9) }, { at: Math.max(due + 60, latest - 60), feeCents: fee(2.5) }]
}

function selectPairs(pairs: BundlePlan[]): BundlePlan[] {
  const adjacent = new Map<number, BundlePlan[]>()
  for (const pair of pairs) for (const index of pair.indices) adjacent.set(index, [...adjacent.get(index) ?? [], pair])
  const unseen = new Set(adjacent.keys()), selected: BundlePlan[] = []
  while (unseen.size) {
    const component: number[] = [], queue = [unseen.values().next().value!]
    while (queue.length) {
      const index = queue.pop()!
      if (!unseen.delete(index)) continue
      component.push(index)
      for (const pair of adjacent.get(index)!) for (const other of pair.indices) if (unseen.has(other)) queue.push(other)
    }
    // Small pending batches admit exact matching; cap exponential work for unexpectedly large queues.
    if (component.length > 20) {
      const available = new Set(component)
      for (const pair of pairs.toSorted((a, b) => b.feeSavingCents - a.feeSavingCents)) {
        if (pair.indices.every(index => available.has(index))) { selected.push(pair); for (const index of pair.indices) available.delete(index) }
      }
      continue
    }
    const positions = new Map(component.map((index, i) => [index, i]))
    const memo = new Map<number, { value: number; chosen: BundlePlan[] }>()
    function solve(mask: number): { value: number; chosen: BundlePlan[] } {
      if (!mask) return { value: 0, chosen: [] }
      const cached = memo.get(mask)
      if (cached) return cached
      const bit = 31 - Math.clz32(mask & -mask), index = component[bit]!
      const remaining = mask & ~(1 << bit)
      let best = solve(remaining)
      for (const pair of adjacent.get(index)!) {
        const other = positions.get(pair.indices[0] === index ? pair.indices[1] : pair.indices[0])!
        if (!(remaining & 1 << other)) continue
        const rest = solve(remaining & ~(1 << other)), value = rest.value + pair.feeSavingCents
        if (value > best.value) best = { value, chosen: [pair, ...rest.chosen] }
      }
      memo.set(mask, best)
      return best
    }
    selected.push(...solve((1 << component.length) - 1).chosen)
  }
  return selected
}
