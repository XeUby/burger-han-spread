import type { PriceRequest, StopPlace } from "../vendor/typescript/types.ts"
import { Network, intervals, lastPickup, needsCharge } from "./planning.ts"
import { readNote } from "./notes.ts"

export type AdmissionSettings = { allowPrivate?: boolean; tradeIns?: boolean; maxTradeMinutes?: number }
export type FeasibleTrip = { latestPickupAt: number; drivingMinutes: number }

/** Checks every stop in the posted order; a private slot is never extended to rescue feasibility. */
export function requestFeasibility(request: PriceRequest, deadline: number, network: Network, settings: AdmissionSettings = {}): FeasibleTrip | null {
  const rules = readNote(request.note)
  if (!rules.safe || !Number.isFinite(deadline) || !request.legs.length) return null
  const first = request.legs[0]!
  if (request.legs.length === 1) {
    if ((first.pickup.privateAddress || first.delivery.privateAddress) && !settings.allowPrivate) return null
    const latestPickupAt = lastPickup(first, deadline, network, rules.plates)
    return Number.isFinite(latestPickupAt) ? { latestPickupAt, drivingMinutes: network.minutes(first.pickup.placeId, first.delivery.placeId) } : null
  }
  if (!settings.tradeIns || request.legs.length !== 2) return null
  const second = request.legs[1]!
  if (first.pickup.privateAddress || second.delivery.privateAddress || !first.delivery.privateAddress || !second.pickup.privateAddress) return null
  if (first.delivery.placeId !== second.pickup.placeId || first.pickup.placeId !== second.delivery.placeId) return null
  const limit = settings.maxTradeMinutes ?? 360
  if (!(limit > 0) || limit > 720) return null
  const outward = network.minutes(first.pickup.placeId, first.delivery.placeId)
  const inward = network.minutes(second.pickup.placeId, second.delivery.placeId)
  const transfer = network.minutes(first.delivery.placeId, second.pickup.placeId)
  const drivingMinutes = outward + transfer + inward
  if (drivingMinutes > limit) return null
  const travel = request.legs.map((leg, i) => Math.ceil((i === 0 ? outward : inward) * 1.15) + 20 + (rules.plates ? 30 : 0) + (needsCharge(leg, network) ? 40 : 0))
  const stops = [first.pickup, first.delivery, second.pickup, second.delivery]
  const gaps = [travel[0]!, transfer, travel[1]!]
  let latest = deadline
  for (let i = stops.length - 1; i >= 0; i--) {
    latest = latestStop(stops[i]!, latest)
    if (!Number.isFinite(latest)) return null
    if (i > 0) latest -= gaps[i - 1]!
  }
  return { latestPickupAt: latest, drivingMinutes }
}

function latestStop(stop: StopPlace, latest: number): number {
  const ranges = intervals(stop, stop.window.from, latest)
  return ranges.at(-1)?.to ?? -Infinity
}
