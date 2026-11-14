import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DriverProfile, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: [
  { from: "a", to: "a", km: 10, minutes: 15 },
  { from: "a", to: "b", km: 150, minutes: 100 },
  { from: "b", to: "a", km: 150, minutes: 100 },
  { from: "b", to: "b", km: 10, minutes: 15 },
] }
const drivers: DriverProfile[] = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 0 }))
const hours = { opens: 420, closes: 1260, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(id = "R1"): PriceRequest {
  return {
    id, dealerId: "D1", arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 5000,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: "a", privateAddress: false, hours, window: { from: 500, to: 2640 } }, delivery: { placeId: "b", privateAddress: false, hours, window: { from: 500, to: 2640 } } }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 10000 }, { kind: "next_day", deadline: 2640, listPriceCents: 9000 }],
  }
}
const desk = () => new Dispatcher({} as World, 8, 500, map, drivers, { adaptive: true, trustStep: 0.01 })

test("intentional rejection supplies no artificial price observation", async () => {
  const d = desk()
  const r = request()
  r.legs[0]!.pickup.privateAddress = true
  const features = d.features(r)
  const prior = d.market.threshold(features)
  d.quote(r)
  assert.equal(d.bids.has(r.id), false)
  const action = d.outbox[0]!
  assert.equal(action.type, "quote")
  if (action.type === "quote") assert.equal(Object.values(action.prices)[0], 100_000_000)
  await d.handle({ seq: 0, at: 515, kind: "order_lost", requestId: r.id })
  assert.equal(d.market.threshold(features), prior)
})

test("each admissible outcome updates demand once even when events repeat", async () => {
  const d = desk()
  const r = request()
  const features = d.features(r)
  const prior = d.market.threshold(features)
  d.quote(r)
  assert.ok(d.bids.has(r.id))
  await d.handle({ seq: 1, at: 515, kind: "order_lost", requestId: r.id })
  const learned = d.market.threshold(features)
  assert.ok(learned < prior)
  await d.handle({ seq: 1, at: 515, kind: "order_lost", requestId: r.id })
  await d.handle({ seq: 2, at: 516, kind: "order_lost", requestId: r.id })
  assert.equal(d.market.threshold(features), learned)
  assert.equal(d.bids.has(r.id), false)
})

test("adaptive option prices share the recorded trust-adjusted ratio", () => {
  const d = desk()
  const r = request()
  d.trust.set(r.dealerId, 10)
  d.quote(r)
  const bid = d.bids.get(r.id)!
  const action = d.outbox[0]!
  assert.equal(action.type, "quote")
  if (action.type !== "quote") return
  for (const option of r.options) {
    const price: number | undefined = action.prices[option.kind]
    if (price === undefined) continue
    assert.ok(price >= option.listPriceCents * 1.1 * bid.ratio)
    assert.ok(price < option.listPriceCents * 1.1 * bid.ratio + 1)
  }
})

test("adaptive setting preserves no-competitor levels", () => {
  const d = new Dispatcher({} as World, 3, 500, map, drivers, { adaptive: true })
  d.quote(request())
  assert.equal(d.bids.size, 0)
})

test("the quote window allocates a simultaneous batch by expected contribution", async () => {
  const d = desk()
  d.settings.auction = true
  d.settings.backlog = 0.001
  const cheap = request("cheap")
  const rich = request("rich")
  const medium = request("medium")
  cheap.options.forEach(option => { option.listPriceCents = 6000 })
  rich.options.forEach(option => { option.listPriceCents = 16000 })
  for (const r of [cheap, medium, rich]) d.quote(r)
  assert.equal(d.pending.size, 0)
  assert.equal(d.bids.size, 0)
  assert.equal(d.nextDecisionAt(), 510)
  d.now = 509
  await d.tick()
  assert.equal(d.pending.size, 0)
  d.now = 510
  await d.tick()
  assert.deepEqual([...d.pending], ["rich", "medium"])
  assert.equal(d.deferred.size, 0)
  assert.equal(d.bids.has("cheap"), false)
})

test("an expired deferred quote cannot reserve work or create a learning observation", async () => {
  const d = desk()
  d.settings.auction = true
  d.quote(request())
  d.now = 515
  await d.tick()
  assert.equal(d.deferred.size, 0)
  assert.equal(d.pending.size, 0)
  assert.equal(d.bids.size, 0)
})

test("private work is admitted only with a feasible appointment and the feature enabled", () => {
  const r = request()
  r.legs[0]!.delivery.privateAddress = true
  r.legs[0]!.delivery.hours = null
  r.legs[0]!.delivery.window = { from: 950, to: 1010 }
  const disabled = desk()
  disabled.quote(r)
  assert.equal(disabled.pending.size, 0)
  const enabled = desk()
  enabled.settings.allowPrivate = true
  enabled.quote(r)
  assert.equal(enabled.pending.size, 1)
  const impossible = desk()
  impossible.settings.allowPrivate = true
  r.id = "too-soon"
  r.legs[0]!.delivery.window = { from: 520, to: 580 }
  impossible.quote(r)
  assert.equal(impossible.pending.size, 0)
})

test("a late private leg does not earn trust merely because the return leg met its deadline", async () => {
  const d = desk()
  const r = request()
  const outbound = structuredClone(r.legs[0]!)
  outbound.delivery.privateAddress = true
  outbound.delivery.window = { from: 700, to: 760 }
  const inbound = structuredClone(outbound)
  inbound.pickup = outbound.delivery
  inbound.delivery = outbound.pickup
  d.requests.set(r.id, { ...r, legs: [outbound, inbound] })
  d.orders.set(r.id, { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 10000, deadline: 1200, legs: [outbound, inbound], status: "waiting", deliveredAt: [800, null], lastPickupAt: 600 })
  d.trust.set(r.dealerId, 10)
  await d.handle({ seq: 1, at: 1000, kind: "delivered", orderId: r.id, leg: 1, gigId: "g1", placeId: "a" })
  assert.equal(d.trust.get(r.dealerId), 5)
})

test("briefly held posts form a sequential bundle without duplicate pending legs", async () => {
  const d = desk()
  d.settings.bundleWait = 15
  const a = request("out")
  const b = request("back")
  b.legs[0]!.pickup.placeId = "b"
  b.legs[0]!.delivery.placeId = "a"
  for (const r of [a, b]) {
    d.requests.set(r.id, r)
    await d.win({ id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 12000, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1000 })
  }
  await d.tick()
  assert.equal(d.outbox.length, 0)
  assert.equal(d.held.size, 2)
  assert.equal(d.nextDecisionAt(), 515)
  d.now = 515
  await d.tick()
  const posts = d.outbox.filter(action => action.type === "post")
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0]!.stops.map(stop => stop.kind), ["pickup", "delivery", "pickup", "delivery"])
  assert.equal(new Set(posts[0]!.stops.map(stop => stop.orderId)).size, 2)
  assert.equal(d.held.size, 0)
  await d.tick()
  assert.equal(d.outbox.filter(action => action.type === "post").length, 1)
})

test("deadline recovery force-flushes a held job and cancellation removes a held job", async () => {
  const d = desk()
  Object.assign(d.world, { act: async (actions: unknown[]) => actions.map(() => ({ ok: true, id: "g1" })) })
  d.settings.bundleWait = 15
  for (const id of ["urgent", "cancel"]) {
    const r = request(id)
    d.requests.set(id, r)
    await d.win({ id, dealerId: r.dealerId, option: "same_day", priceCents: 12000, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1000 })
  }
  await d.raise("urgent")
  assert.equal(d.held.has("urgent"), false)
  assert.deepEqual(d.gigsOf("urgent"), ["g1"])
  await d.handle({ seq: 1, at: 500, kind: "order_cancelled", orderId: "cancel", gigs: [] })
  assert.equal(d.held.has("cancel"), false)
})

test("the delay-only control holds eligible jobs then posts them separately", async () => {
  const d = desk()
  Object.assign(d.settings, { bundleWait: 15, bundlePairs: false })
  for (const id of ["out", "back"]) {
    const r = request(id)
    if (id === "back") {
      r.legs[0]!.pickup.placeId = "b"
      r.legs[0]!.delivery.placeId = "a"
    }
    d.requests.set(id, r)
    await d.win({ id, dealerId: r.dealerId, option: "same_day", priceCents: 12000, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1000 })
  }
  await d.tick()
  assert.equal(d.outbox.length, 0)
  d.now = 515
  await d.tick()
  const posts = d.outbox.filter(action => action.type === "post")
  assert.equal(posts.length, 2)
  assert.ok(posts.every(post => post.stops.length === 2))
  assert.equal(d.held.size, 0)
})
