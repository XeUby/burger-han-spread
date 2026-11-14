import { test } from "node:test"
import assert from "node:assert/strict"
import { chooseChainOffer } from "../src/chain-offers.ts"
import type { ChainGig, CompletedTrip } from "../src/chain-offers.ts"
import { Network } from "../src/planning.ts"

const places = ["home", "away", "far"]
const network = new Network({ places: [], roads: places.flatMap(from => places.map(to => ({ from, to, km: from === to ? 12 : from === "far" || to === "far" ? 300 : 220, minutes: from === to ? 25 : from === "far" || to === "far" ? 200 : 160 }))) })
const hours = { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
function completion(): CompletedTrip {
  return { at: 600, placeId: "away", driver: { id: "d", homePlaceId: "home", licence: "manual", rating: 4.9, completedGigs: 100, drops: 0 } }
}
function candidate(): ChainGig {
  return { gigId: "g", open: true, openOffers: 0, openingFeeCents: 10000, publicFeeCents: 10000,
    order: { id: "r", dealerId: "dealer", option: "same_day", priceCents: 16000, deadline: 1100, lastPickupAt: 900, status: "waiting", deliveredAt: [null], legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: "away", privateAddress: false, hours, window: { from: 500, to: 1100 } }, delivery: { placeId: "home", privateAddress: false, hours, window: { from: 500, to: 1100 } } }] },
    post: { type: "post", stops: [{ orderId: "r", leg: 0, kind: "pickup" }, { orderId: "r", leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 500, feeCents: 10000 }] } }
}

test("a recently completed away-from-home driver receives a discounted homeward offer", () => {
  const choice = chooseChainOffer(600, completion(), [candidate()], network)
  assert.deepEqual(choice?.action, { type: "offer", gigId: "g", driverId: "d", feeCents: 8000 })
  assert.equal(choice?.feeSavingCents, 2000)
  assert.equal(choice?.homeKmSaved, 208)
})

test("home location or stale sightings cannot qualify as a displaced completion", () => {
  assert.equal(chooseChainOffer(631, completion(), [candidate()], network), null)
  assert.equal(chooseChainOffer(599, completion(), [candidate()], network), null)
  assert.equal(chooseChainOffer(600, { ...completion(), placeId: "home" }, [candidate()], network), null)
  const outward = candidate()
  outward.order.legs[0]!.delivery.placeId = "far"
  assert.equal(chooseChainOffer(600, completion(), [outward], network), null)
})

test("audience, current open state and remaining quota constrain handoff offers", () => {
  const gig = candidate()
  gig.post.audience.manualLicence = true
  const automatic = completion()
  automatic.driver.licence = "automatic_only"
  assert.equal(chooseChainOffer(600, automatic, [gig], network), null)
  gig.post.audience.experienced = true
  const novice = completion()
  novice.driver.completedGigs = 10
  assert.equal(chooseChainOffer(600, novice, [gig], network), null)
  assert.equal(chooseChainOffer(600, completion(), [{ ...gig, open: false }], network), null)
  assert.equal(chooseChainOffer(600, completion(), [{ ...gig, openOffers: 2 }], network), null)
  assert.equal(chooseChainOffer(600, completion(), [gig], network, { offersUsedToday: 2 }), null)
  assert.equal(chooseChainOffer(600, completion(), [gig], network, { attemptedGigIds: new Set(["g"]) }), null)
})

test("closing hours, charging and explicit stop cutoffs cannot be skipped", () => {
  const gig = candidate()
  gig.order.legs[0]!.delivery.hours = { ...hours, closes: 840 }
  assert(chooseChainOffer(600, completion(), [gig], network))
  gig.post.stops[0]!.withCharging = true
  assert.equal(chooseChainOffer(600, completion(), [gig], network), null)
  gig.post.stops[0]!.withCharging = false
  gig.post.stops[0]!.window = { from: 500, to: 630 }
  assert.equal(chooseChainOffer(600, completion(), [gig], network), null)
})

test("a private offer never exceeds the visible fee and requires a real discount", () => {
  assert.equal(chooseChainOffer(600, completion(), [{ ...candidate(), publicFeeCents: 7900 }], network), null)
  assert.throws(() => chooseChainOffer(600, completion(), [candidate()], network, { discount: 1 }))
})
