import { intervals } from "./planning.ts"
import type { Network } from "./planning.ts"
import type { DriverProfile, OfferAction, Order, PostAction, StopPlace } from "../vendor/typescript/types.ts"

export type HomeGig = {
  gigId: string
  open: boolean
  safe: boolean
  order: Order
  post: PostAction
  openingFeeCents: number
  publicFeeCents: number
  activeOffers: number
  offersSent: number
}
export type HomeOfferLimits = {
  usedToday: ReadonlyMap<string, number>
  attempted: ReadonlySet<string>
  viewedAt: ReadonlyMap<string, number>
}

/** Reach drivers whose cheap trip to a pickup ends near home, before rescue prices start. */
export function chooseHomeOffers(now: number, gig: HomeGig, drivers: readonly DriverProfile[], network: Network, limits: HomeOfferLimits): OfferAction[] {
  if (!gig.open || !gig.safe || gig.activeOffers >= 2 || gig.offersSent >= 2 || now % 1440 < 420 || now % 1440 >= 1380) return []
  if (gig.order.status === "cancelled" || gig.order.status === "delivered" || gig.order.legs.length !== 1 || gig.order.deliveredAt[0] !== null) return []
  const [pickup, delivery] = gig.post.stops
  if (gig.post.stops.length !== 2 || !pickup || !delivery || pickup.kind !== "pickup" || delivery.kind !== "delivery" || pickup.leg !== 0 || delivery.leg !== 0 || pickup.orderId !== gig.order.id || delivery.orderId !== gig.order.id) return []
  const leg = gig.order.legs[0]!
  if (leg.pickup.privateAddress || leg.delivery.privateAddress) return []
  const pickupPlace = withWindow(leg.pickup, pickup.window)
  const deliveryPlace = withWindow(leg.delivery, delivery.window)
  const pickupWindows = intervals(pickupPlace, now, Math.min(gig.order.lastPickupAt, gig.order.deadline))
  const drive = Math.ceil(network.minutes(leg.pickup.placeId, leg.delivery.placeId) * 1.15) + 20 + (pickup.withPlates ? 30 : 0) + (pickup.withCharging ? 40 : 0)
  const feeCents = Math.round(gig.openingFeeCents * 0.85)
  if (!Number.isSafeInteger(feeCents) || feeCents <= 0 || feeCents >= gig.publicFeeCents) return []
  const candidates: { driver: DriverProfile; score: number }[] = []
  for (const driver of drivers) {
    if ((limits.usedToday.get(driver.id) ?? 0) >= 2 || limits.attempted.has(driver.id)) continue
    if ((gig.post.audience.experienced || leg.car.premium) && (driver.rating < 4.8 || driver.completedGigs < 50)) continue
    if (gig.post.audience.manualLicence && driver.licence !== "manual") continue
    const homeDistance = network.km(driver.homePlaceId, leg.delivery.placeId)
    if (homeDistance > 35 || network.km(driver.homePlaceId, leg.pickup.placeId) <= 100) continue
    const travel = Math.ceil(2 * network.minutes(driver.homePlaceId, leg.pickup.placeId)) + 30
    const feasible = pickupWindows.some(window => {
      const day = Math.floor(window.from / 1440)
      const pickupAt = Math.max(window.from, Math.max(now, day * 1440 + 420) + travel)
      if (pickupAt > window.to) return false
      return intervals(deliveryPlace, pickupAt + drive, Math.min(gig.order.deadline, day * 1440 + 1379)).length > 0
    })
    if (!feasible) continue
    const active = now - (limits.viewedAt.get(driver.id) ?? -Infinity) <= 120
    const score = homeDistance + travel * 0.03 - (active ? 20 : 0) - driver.rating * 2 + 40 * driver.drops / Math.max(1, driver.completedGigs)
    candidates.push({ driver, score })
  }
  candidates.sort((a, b) => a.score - b.score || a.driver.id.localeCompare(b.driver.id))
  return candidates.slice(0, Math.min(2 - gig.offersSent, 2 - gig.activeOffers))
    .map(({ driver }) => ({ type: "offer", gigId: gig.gigId, driverId: driver.id, feeCents }))
}

function withWindow(place: StopPlace, window: StopPlace["window"] | undefined): StopPlace {
  return window ? { ...place, window: { from: Math.max(place.window.from, window.from), to: Math.min(place.window.to, window.to) } } : place
}
