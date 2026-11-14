import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "./bundle/src/policy.ts"
import { Dispatcher as Incumbent } from "./bundle/src/incumbent.ts"
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from "./bundle/vendor/typescript/types.ts"
import type { World } from "./bundle/vendor/typescript/spread.ts"

const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const map: WorldMap = { places: [], roads: ["A", "B"].flatMap(from => ["A", "B"].map(to => ({ from, to, km: from === to ? 0 : 100, minutes: from === to ? 0 : 70 }))) }
const drivers: DriverProfile[] = Array.from({ length: 20 }, (_, i) => ({ id: `D${i}`, homePlaceId: i < 10 ? "A" : "B", licence: "manual", rating: 4.9, completedGigs: 100, drops: 0 }))
const request = (id: string, reverse = false): PriceRequest => ({ id, arrivedAt: 480, respondBy: 515, dealerId: id, batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: reverse ? "B" : "A", privateAddress: false, hours, window: { from: 500, to: 2640 } }, delivery: { placeId: reverse ? "A" : "B", privateAddress: false, hours, window: { from: 500, to: 2640 } } }], options: [{ kind: "same_day", deadline: 1200, listPriceCents: 12000 }, { kind: "next_day", deadline: 2640, listPriceCents: 10000 }] })
const order = (r: PriceRequest, next = false): Order => ({ id: r.id, dealerId: r.dealerId, option: next ? "next_day" : "same_day", deadline: next ? 2640 : 1200, priceCents: 14000, legs: structuredClone(r.legs), status: "waiting", deliveredAt: [null], lastPickupAt: next ? 2500 : 1050 })
function host() {
  let id = 0
  const calls: Action[][] = []
  return { calls, world: { act: async (actions: Action[]) => { calls.push(structuredClone(actions)); return actions.map(() => ({ ok: true as const, id: `g${++id}` })) } } as unknown as World }
}
function desk(architecture: number, bundleWait = 15) { const h = host(); return { ...h, d: new Dispatcher(h.world, 8, 500, map, drivers, { architecture, bundleWait }) } }

test("control mode preserves quotes, posts, schedules and decision clocks", async () => {
  const { d, world } = desk(0)
  const b = new Incumbent(world, 8, 500, map, drivers, { payout: 0.85, openingOnly: true })
  const r = request("r1")
  d.quote(r); b.quote(r)
  assert.deepEqual(d.takeActions(), b.takeActions())
  const event = { seq: 1, at: 515, kind: "order_won" as const, order: order(r) }
  d.now = b.now = 515
  await d.handle(structuredClone(event)); await b.handle(structuredClone(event))
  d.now = b.now = 530
  await d.tick(); await b.tick()
  assert.deepEqual(d.takeActions(), b.takeActions())
  assert.equal(d.nextDecisionAt(), b.nextDecisionAt())
  assert.throws(() => validateSettings({ architecture: 4 }))
})

test("joint acquisition prices return-compatible requests before either is won", () => {
  const { d } = desk(1, 30)
  d.quote(request("a")); d.quote(request("b", true))
  assert.equal(d.outbox.length, 0)
  assert.equal(d.nextDecisionAt(), 513)
  d.now = 513
  d.clearAuction()
  assert.equal(d.metrics.jointQuotedRequests, 2)
  assert.equal(d.outbox.filter(action => action.type === "quote").length, 2)
  assert.equal(d.pending.size, 2)
  assert.equal(d.auction.size, 0)
  assert.ok(d.outbox.every(action => action.type !== "quote" || Object.values(action.prices).every(price => price! < 100_000_000)))
})

test("calendar shifts admission to a free future day and enforces it after winning", async () => {
  const { d } = desk(2)
  d.reservations.set("busy", { day: 0, work: 3000, probability: 1, origin: "A" })
  const r = request("r1")
  d.quote(r)
  assert.equal(d.reservations.get(r.id)?.day, 1)
  assert.ok(d.reservations.get(r.id)!.probability < 1)
  const quote = d.takeActions()[0]!
  assert.ok(quote.type === "quote")
  assert.deepEqual(Object.keys(quote.prices), ["next_day"])
  await d.handle({ seq: 1, at: 515, kind: "order_won", order: order(r, true) })
  assert.equal(d.reservations.get(r.id)?.probability, 1)
  const post = d.held.get(r.id)!.post
  assert.ok(post.stops.every(stop => stop.window!.from >= 1440 && stop.window!.to <= 2640))
})

test("calendar releases rejected quotes and keeps changed mandatory work in its load", async () => {
  const { d } = desk(2)
  const r = request("r1")
  d.quote(r)
  const actions = d.takeActions()
  d.readResults(actions, [{ ok: false, reason: "Rejected" }])
  assert.ok(!d.reservations.has(r.id))
  assert.ok(!d.planned.has(r.id))
  await d.handle({ seq: 1, at: 515, kind: "order_won", order: order(r) })
  await d.handle({ seq: 2, at: 520, kind: "order_changed", order: order(r), message: { language: "en", text: "Changed" } })
  assert.equal(d.reservations.get(r.id)?.probability, 1)
  assert.ok(!d.planned.has(r.id))
})

test("proactive payment clocks cannot restart and held singles receive the full intended fee", async () => {
  const { d } = desk(3, 5)
  const r = request("r1"), o = order(r)
  d.requests.set(r.id, r); d.orders.set(o.id, o)
  const fee = d.baseFee(r)
  await d.post(o, [0])
  d.now = 505
  d.flushBundles()
  const post = d.takeActions()[0]!
  assert.ok(post.type === "post")
  assert.equal(post.schedule[0]!.feeCents, Math.round(fee * 1.1))
  d.now = 560
  const steps = d.feesFor(o, 1)
  assert.equal(steps[0]!.feeCents, Math.round(fee * 1.3))
  assert.ok(steps.every((step, i) => i === 0 || step.at > steps[i - 1]!.at && step.feeCents >= steps[i - 1]!.feeCents))
})

test("a partial rematch refusal never posts a bundle or duplicates the still-mapped job", async () => {
  const { d } = desk(3, 0)
  for (const r of [request("a"), request("b", true)]) { d.requests.set(r.id, r); d.orders.set(r.id, order(r)); await d.post(order(r), [0]) }
  const posts = d.takeActions()
  d.readResults(posts, [{ ok: true, id: "ga" }, { ok: true, id: "gb" }])
  d.now = 530
  d.world.act = async () => [{ ok: true, id: "ga" }, { ok: false, reason: "Booked concurrently" }]
  await d.combineOpen()
  assert.equal(d.metrics.rematchedBundles, 0)
  assert.equal(d.outbox.length, 0)
  assert.equal(d.legGigs.get("a")?.size, 0)
  assert.equal(d.legGigs.get("b")?.get(0), "gb")
  await d.tick()
  assert.equal(d.outbox.filter(action => action.type === "post").length, 1)
  assert.ok(d.outbox.every(action => action.type !== "post" || action.stops.every(stop => stop.orderId === "a")))
})
