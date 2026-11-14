import { intervals, needsCharge } from "./planning.ts"
import type { Network } from "./planning.ts"
import type { Leg, OpeningHours, TimeWindow } from "../vendor/typescript/types.ts"
import type { HoursBound, TimedNote } from "./hours-note.ts"

export type TimedPlan = { pickup: TimeWindow; delivery: TimeWindow; latestPickupAt: number; earliestDeliveryAt: number; travelMinutes: number }

export function withNoteHours(leg: Leg, note: TimedNote): Leg {
  return { ...leg,
    pickup: { ...leg.pickup, window: { ...leg.pickup.window, from: Math.max(leg.pickup.window.from, note.readyAt ?? 0) }, hours: intersectHours(leg.pickup.hours, note.pickup) },
    delivery: { ...leg.delivery, hours: intersectHours(leg.delivery.hours, note.delivery) },
  }
}

/** Choose explicit stop windows inside both public hours and the fully parsed note. */
export function planTimedLeg(leg: Leg, note: TimedNote, deadline: number, startAfter: number, network: Network): TimedPlan | null {
  if (leg.pickup.privateAddress || leg.delivery.privateAddress || !Number.isFinite(deadline + startAfter)) return null
  const readyAt = Math.max(leg.pickup.window.from, note.readyAt ?? 0)
  const pickup = { ...leg.pickup, window: { from: readyAt, to: deadline }, hours: intersectHours(leg.pickup.hours, note.pickup) }
  const delivery = { ...leg.delivery, window: { from: leg.delivery.window.from, to: deadline }, hours: intersectHours(leg.delivery.hours, note.delivery) }
  const travelMinutes = Math.ceil(network.minutes(leg.pickup.placeId, leg.delivery.placeId) * 1.15) + 20 + (note.plates ? 30 : 0) + (needsCharge(leg, network) ? 40 : 0)
  const plans: TimedPlan[] = []
  for (const from of intervals(pickup, startAfter, deadline)) {
    for (const to of intervals(delivery, startAfter, deadline)) {
      const earliest = Math.max(from.from, to.from - travelMinutes)
      const latest = Math.min(from.to, to.to - travelMinutes)
      if (earliest > latest) continue
      plans.push({ pickup: { from: earliest, to: latest }, delivery: { from: Math.max(to.from, earliest + travelMinutes), to: to.to }, latestPickupAt: latest, earliestDeliveryAt: earliest + travelMinutes, travelMinutes })
    }
  }
  return plans.sort((a, b) => a.earliestDeliveryAt - b.earliestDeliveryAt || b.latestPickupAt - a.latestPickupAt)[0] ?? null
}

function intersectHours(publicHours: OpeningHours | null, bound: HoursBound | undefined): OpeningHours | null {
  if (!bound) return publicHours
  return {
    opens: Math.max(publicHours?.opens ?? 0, bound.opens),
    closes: Math.min(publicHours?.closes ?? 1440, bound.closes),
    weekdays: (publicHours?.weekdays ?? [0, 1, 2, 3, 4]).filter(day => day < 5),
    saturday: null,
  }
}
