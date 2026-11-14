import { intervals } from "./planning.ts"
import type { Network } from "./planning.ts"
import type { DriverProfile, OfferAction, Order, PostAction, StopPlace } from "../vendor/typescript/types.ts"

export type CompletedTrip = { driver: DriverProfile; placeId: string; at: number }
export type ChainGig = {
  gigId: string
  open: boolean
  order: Order
  post: PostAction
  openingFeeCents: number
  publicFeeCents: number
  openOffers: number
}
export type ChainOffer = {
  action: OfferAction
  deadheadKm: number
  homeKmSaved: number
  detourMinutes: number
  feeSavingCents: number
}
export type ChainOfferLimits = {
  discount?: number
  offersUsedToday?: number
  attemptedGigIds?: ReadonlySet<string>
}

/** Offers a return-oriented job to a driver whose completed trip reveals their location. */
export function chooseChainOffer(now: number, completed: CompletedTrip, gigs: readonly ChainGig[], network: Network, limits: ChainOfferLimits = {}): ChainOffer | null {
  const discount = limits.discount ?? 0.8
  if (!Number.isFinite(discount) || discount <= 0 || discount >= 1) throw new Error("Chain offer discount must be between zero and one")
  if (completed.at > now || now - completed.at > 30 || now % 1440 < 420 || now % 1440 >= 1380) return null
  // Keep one of the driver's three daily offers for deadline recovery.
  if ((limits.offersUsedToday ?? 0) >= 2) return null
  const driver = completed.driver
  const homeBefore = network.km(completed.placeId, driver.homePlaceId)
  if (homeBefore < 70) return null
  const candidates: ChainOffer[] = []
  for (const gig of gigs) {
    if (!gig.open || gig.openOffers >= 2 || limits.attemptedGigIds?.has(gig.gigId)) continue
    if (gig.order.status === "cancelled" || gig.order.status === "delivered" || gig.post.stops.length !== 2) continue
    const [pickup, delivery] = gig.post.stops
    if (!pickup || !delivery || pickup.kind !== "pickup" || delivery.kind !== "delivery" || pickup.orderId !== gig.order.id || delivery.orderId !== gig.order.id || pickup.leg !== delivery.leg) continue
    if (gig.order.deliveredAt[pickup.leg] !== null) continue
    const leg = gig.order.legs[pickup.leg]
    if (!leg || leg.pickup.privateAddress || leg.delivery.privateAddress) continue
    if ((gig.post.audience.experienced || leg.car.premium) && (driver.rating < 4.8 || driver.completedGigs < 50)) continue
    if (gig.post.audience.manualLicence && driver.licence !== "manual") continue
    const deadheadKm = network.km(completed.placeId, leg.pickup.placeId)
    const homeAfter = network.km(leg.delivery.placeId, driver.homePlaceId)
    if (deadheadKm > 30 || homeAfter > 35 && homeBefore - homeAfter < 40) continue
    const travelToPickup = network.minutes(completed.placeId, leg.pickup.placeId)
    const drive = network.minutes(leg.pickup.placeId, leg.delivery.placeId)
    const detourMinutes = Math.max(0, travelToPickup + drive + network.minutes(leg.delivery.placeId, driver.homePlaceId) - network.minutes(completed.placeId, driver.homePlaceId))
    if (detourMinutes > 90) continue
    const pickupPlace = withWindow(leg.pickup, pickup.window)
    const pickupAt = nextOpen(pickupPlace, now + travelToPickup + 10, Math.min(gig.order.lastPickupAt - 30, now + 90))
    if (pickupAt === null || Math.floor(pickupAt / 1440) !== Math.floor(now / 1440)) continue
    const extras = (pickup.withPlates ? 30 : 0) + (pickup.withCharging ? 40 : 0)
    const deliveryAt = nextOpen(withWindow(leg.delivery, delivery.window), pickupAt + Math.ceil(drive * 1.15) + extras + 20, gig.order.deadline)
    if (deliveryAt === null || Math.floor(deliveryAt / 1440) !== Math.floor(now / 1440)) continue
    const feeCents = Math.round(gig.openingFeeCents * discount)
    if (!Number.isSafeInteger(feeCents) || feeCents <= 0 || feeCents >= gig.publicFeeCents) continue
    candidates.push({ action: { type: "offer", gigId: gig.gigId, driverId: driver.id, feeCents }, deadheadKm, homeKmSaved: homeBefore - homeAfter, detourMinutes, feeSavingCents: gig.publicFeeCents - feeCents })
  }
  candidates.sort((a, b) => a.detourMinutes - b.detourMinutes || b.feeSavingCents - a.feeSavingCents || a.action.gigId.localeCompare(b.action.gigId))
  return candidates[0] ?? null
}

function withWindow(place: StopPlace, window: StopPlace["window"] | undefined): StopPlace {
  return window ? { ...place, window: { from: Math.max(place.window.from, window.from), to: Math.min(place.window.to, window.to) } } : place
}

function nextOpen(place: StopPlace, from: number, to: number): number | null {
  return intervals(place, from, to)[0]?.from ?? null
}
