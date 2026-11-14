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
function desk(viewedFee: boolean, bundleWait = 15) { const h = host(); return { ...h, d: new Dispatcher(h.world, 8, 500, map, drivers, { viewedFee, bundleWait }) } }

test("disabled exposure preserves the control actions and clock", async () => {
  const { d, world } = desk(false)
  const b = new Incumbent(world, 8, 500, map, drivers)
  const r = request("a")
  d.quote(r); b.quote(r)
  assert.deepEqual(d.takeActions(), b.takeActions())
  const event = { seq: 1, at: 515, kind: "order_won" as const, order: order(r) }
  d.now = b.now = 515
  await d.handle(structuredClone(event)); await b.handle(structuredClone(event))
  d.now = b.now = 530
  await d.tick(); await b.tick()
  assert.deepEqual(d.takeActions(), b.takeActions())
  assert.equal(d.nextDecisionAt(), b.nextDecisionAt())
  assert.throws(() => validateSettings({ viewedFee: 1 }))
})

test("overlapping premiums stay within the budget and wake before restoration is due", async () => {
  const { d } = desk(true, 0)
  for (let i = 0; i < 30; i++) {
    const r = request(`r${i}`), o = order(r)
    d.requests.set(r.id, r); d.orders.set(o.id, o)
    await d.post(o, [0])
  }
  const actions = d.takeActions()
  assert.ok(d.exposures.length > 0 && d.exposures.length < 30)
  assert.ok(d.reservedCents <= 60_000)
  assert.equal(d.reservedCents, d.exposures.reduce((sum, row) => sum + row.extraCents, 0))
  assert.equal(d.nextDecisionAt(), 505)
  assert.ok(actions.filter(action => action.type === "post" && action.schedule.length === 1).length === d.exposures.length)
})

test("unbooked exposures restore the exact normal schedule after five minutes", async () => {
  const { d, calls } = desk(true, 0)
  const r = request("a"), o = order(r)
  d.requests.set(r.id, r); d.orders.set(o.id, o)
  await d.post(o, [0])
  const normal = structuredClone(d.outbox[0])
  assert.ok(normal?.type === "post")
  const actions = d.takeActions()
  d.readResults(actions, [{ ok: true, id: "g1" }])
  await d.handle({ seq: 1, at: 502, kind: "gig_viewed", gigId: "g1", driverId: "D1" })
  d.now = 505
  await d.tick()
  assert.deepEqual(calls[0], [{ type: "reprice", gigId: "g1", schedule: normal.schedule }])
  assert.equal(d.active.size, 0)
  assert.equal(d.exposures[0]!.restoredAt, 505)
  assert.equal(d.exposures[0]!.views, 1)
  assert.deepEqual(d.posts.get("g1")!.schedule, normal.schedule)
})

test("early bookings retain the premium but a later drop uses normal fees", async () => {
  const { d, calls } = desk(true, 0)
  const r = request("a"), o = order(r)
  d.requests.set(r.id, r); d.orders.set(o.id, o)
  await d.post(o, [0])
  const actions = d.takeActions(), exposure = d.exposures[0]!
  d.readResults(actions, [{ ok: true, id: "g1" }])
  await d.handle({ seq: 1, at: 502, kind: "gig_booked", gigId: "g1", driverId: "D1", feeCents: exposure.feeCents })
  d.now = 505
  await d.tick()
  assert.equal(calls.length, 0)
  assert.equal(exposure.bookedAt, 502)
  assert.equal(d.active.size, 0)
  await d.handle({ seq: 2, at: 510, kind: "gig_dropped", gigId: "g1", driverId: "D1" })
  const reprices = d.takeActions().filter(action => action.type === "reprice")
  assert.equal(reprices.length, 1)
  assert.ok(reprices[0]!.schedule[0]!.feeCents < exposure.feeCents)
})

test("no premiums are introduced after the first day", async () => {
  const { d } = desk(true, 0)
  d.now = 1450
  const r = request("a"), o = order(r, true)
  d.requests.set(r.id, r); d.orders.set(o.id, o)
  await d.post(o, [0])
  const expected = structuredClone(d.outbox)
  assert.deepEqual(d.takeActions(), expected)
  assert.equal(d.exposures.length, 0)
})
