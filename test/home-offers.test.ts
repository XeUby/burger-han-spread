import test from "node:test"
import assert from "node:assert/strict"
import { chooseHomeOffers } from "../src/home-offers.ts"
import type { HomeGig, HomeOfferLimits } from "../src/home-offers.ts"
import { Network } from "../src/planning.ts"
import { Dispatcher } from "../src/policy.ts"
import type { Action, DriverProfile, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"
import type { World } from "../vendor/typescript/spread.ts"

const places = ["pickup", "home", "nearhome", "unrelated"]
const map: WorldMap = { places: [], roads: places.flatMap(from => places.map(to => {
  const local = from === to || ["home", "nearhome"].includes(from) && ["home", "nearhome"].includes(to)
  return { from, to, km: local ? 12 : 180, minutes: local ? 20 : 130 }
})) }
const network = new Network(map)
const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const profile = (id: string, homePlaceId = "home"): DriverProfile => ({ id, homePlaceId, rating: 4.9, completedGigs: 100, drops: 0, licence: "manual" })
function gig(id = "R1"): HomeGig {
  return {
    gigId: `g${id}`, open: true, safe: true, activeOffers: 0, offersSent: 0, openingFeeCents: 10000, publicFeeCents: 10000,
    order: { id, dealerId: "D1", option: "same_day", deadline: 1200, lastPickupAt: 1000, priceCents: 15000, status: "waiting", deliveredAt: [null], legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: "pickup", privateAddress: false, hours, window: { from: 500, to: 1200 } }, delivery: { placeId: "home", privateAddress: false, hours, window: { from: 500, to: 1200 } } }] },
    post: { type: "post", stops: [{ orderId: id, leg: 0, kind: "pickup" }, { orderId: id, leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 500, feeCents: 10000 }] },
  }
}
const limits = (): HomeOfferLimits => ({ usedToday: new Map(), attempted: new Set(), viewedAt: new Map() })

test("discounted home offers reach related destination profiles only", () => {
  const drivers = [profile("a"), profile("b", "nearhome"), profile("c", "pickup"), profile("d", "unrelated")]
  const offers = chooseHomeOffers(500, gig(), drivers, network, limits())
  assert.deepEqual(offers.map(action => action.driverId), ["a", "b"])
  assert.ok(offers.every(action => action.feeCents === 8500))
})

test("shared active slots, daily quota and lifetime attempts reserve rescue capacity", () => {
  const drivers = [profile("a"), profile("b"), profile("c")]
  const context = { ...limits(), usedToday: new Map([["a", 2]]), attempted: new Set(["b"]) }
  assert.deepEqual(chooseHomeOffers(500, gig(), drivers, network, context).map(action => action.driverId), ["c"])
  assert.equal(chooseHomeOffers(500, { ...gig(), activeOffers: 1 }, drivers, network, limits()).length, 1)
  assert.equal(chooseHomeOffers(500, { ...gig(), activeOffers: 2 }, drivers, network, limits()).length, 0)
  assert.equal(chooseHomeOffers(500, { ...gig(), offersSent: 2 }, drivers, network, limits()).length, 0)
})

test("licence, experience, public stops and safe notes constrain offers", () => {
  const candidate = gig()
  candidate.post.audience = { experienced: true, manualLicence: true }
  const drivers = [profile("eligible"), { ...profile("auto"), licence: "automatic_only" as const }, { ...profile("novice"), completedGigs: 10 }]
  assert.deepEqual(chooseHomeOffers(500, candidate, drivers, network, limits()).map(action => action.driverId), ["eligible"])
  candidate.order.legs[0]!.delivery.privateAddress = true
  assert.deepEqual(chooseHomeOffers(500, candidate, drivers, network, limits()), [])
  assert.deepEqual(chooseHomeOffers(500, { ...gig(), safe: false }, drivers, network, limits()), [])
  assert.deepEqual(chooseHomeOffers(500, { ...gig(), open: false }, drivers, network, limits()), [])
})

test("travel allowance, opening windows and charging must fit before deadline", () => {
  const candidate = gig()
  candidate.order.lastPickupAt = 780
  assert.equal(chooseHomeOffers(500, candidate, [profile("a")], network, limits()).length, 0)
  candidate.order.lastPickupAt = 1000
  candidate.post.stops[0]!.window = { from: 500, to: 780 }
  assert.equal(chooseHomeOffers(500, candidate, [profile("a")], network, limits()).length, 0)
  candidate.post.stops[0]!.window = undefined
  candidate.order.legs[0]!.delivery.hours = { ...hours, closes: 980 }
  assert.equal(chooseHomeOffers(500, candidate, [profile("a")], network, limits()).length, 1)
  candidate.post.stops[0]!.withCharging = true
  assert.equal(chooseHomeOffers(500, candidate, [profile("a")], network, limits()).length, 0)
  assert.deepEqual(chooseHomeOffers(400, gig(), [profile("a")], network, limits()), [])
})

function desk() {
  const sent: Action[][] = []
  let sequence = 0
  const world = { act: async (actions: Action[]) => {
    sent.push(structuredClone(actions))
    return actions.map(() => ({ ok: true as const, id: `g${sequence++}` }))
  } } as unknown as World
  const drivers = [profile("a"), profile("b"), ...Array.from({ length: 40 }, (_, i) => profile(`local${i}`, "pickup"))]
  return { d: new Dispatcher(world, 8, 500, map, drivers, { homeOffers: true }), sent }
}
function add(d: Dispatcher, id: string) {
  const candidate = gig(id)
  const request: PriceRequest = { id, dealerId: "D1", arrivedAt: 480, respondBy: 495, note: null, batchId: null, legs: candidate.order.legs, options: [{ kind: "same_day", deadline: 1200, listPriceCents: 15000 }], referenceFeeCents: 6000 }
  d.requests.set(id, request)
  d.orders.set(id, candidate.order)
}

test("tick obtains post ids before advancing and sends cheap offers in the same minute", async () => {
  const { d, sent } = desk()
  add(d, "R1")
  d.outbox.push({ type: "quote", requestId: "other", prices: { same_day: 12345 } })
  await d.tick()
  assert.equal(d.now, 500)
  assert.equal(sent.length, 1)
  assert.ok(sent[0]!.every(action => action.type === "post"))
  assert.equal(d.outbox.filter(action => action.type === "quote").length, 1)
  const offers = d.outbox.filter(action => action.type === "offer")
  assert.equal(offers.length, 2)
  assert.ok(offers.every(action => action.gigId === "g0" && action.feeCents === Math.round(d.baseFee(d.requests.get("R1")!) * 0.85)))
  d.takeActions()
  d.now += 20
  await d.tick()
  assert.equal(d.outbox.filter(action => action.type === "offer").length, 0)
})

test("dispatcher shares driver quota across gigs and rejects stale gig mappings", async () => {
  const { d } = desk()
  add(d, "R1")
  await d.tick()
  d.takeActions()
  add(d, "R2")
  await d.tick()
  assert.equal(d.outbox.filter(action => action.type === "offer").length, 2)
  d.takeActions()
  add(d, "R3")
  await d.tick()
  assert.equal(d.outbox.filter(action => action.type === "offer").length, 0)
  assert.equal(d.offerCount.get("0:a"), 2)
  assert.equal(d.offerCount.get("0:b"), 2)
  d.offerCount.clear()
  d.legGigs.get("R3")!.clear()
  d.homeOffers()
  assert.equal(d.outbox.filter(action => action.type === "offer").length, 0)
})

test("answers to in-flight offers recovered after reconnect consume quota once", async () => {
  const { d } = desk()
  await d.handle({ seq: 1, at: 510, kind: "offer_answered", gigId: "old", driverId: "a", answer: "declined" })
  await d.handle({ seq: 1, at: 510, kind: "offer_answered", gigId: "old", driverId: "a", answer: "declined" })
  assert.equal(d.offerCount.get("0:a"), 1)
  assert.equal(d.homeOffersSent.get("old"), 1)
})
