import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "./bundle/src/policy.ts"
import { Dispatcher as Incumbent } from "./bundle/src/incumbent.ts"
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from "./bundle/vendor/typescript/types.ts"
import type { World } from "./bundle/vendor/typescript/spread.ts"

const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const map: WorldMap = { places: [], roads: ["A", "B"].flatMap(from => ["A", "B"].map(to => ({ from, to, km: from === to ? 0 : 10, minutes: from === to ? 0 : 10 }))) }
const drivers: DriverProfile[] = Array.from({ length: 20 }, (_, i) => ({ id: `D${i}`, homePlaceId: i < 10 ? "A" : "B", licence: "manual", rating: 4.9, completedGigs: 100, drops: 0 }))
const request = (id: string, reverse = false): PriceRequest => ({ id, arrivedAt: 480, respondBy: 515, dealerId: id, batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: reverse ? "B" : "A", privateAddress: false, hours, window: { from: 500, to: 2640 } }, delivery: { placeId: reverse ? "A" : "B", privateAddress: false, hours, window: { from: 500, to: 2640 } } }], options: [{ kind: "same_day", deadline: 1200, listPriceCents: 12000 }, { kind: "next_day", deadline: 2640, listPriceCents: 10000 }] })
const order = (r: PriceRequest, next = false): Order => ({ id: r.id, dealerId: r.dealerId, option: next ? "next_day" : "same_day", deadline: next ? 2640 : 1200, priceCents: 14000, legs: structuredClone(r.legs), status: "waiting", deliveredAt: [null], lastPickupAt: next ? 2500 : 1050 })
function host() {
  let id = 0
  const calls: Action[][] = []
  return { calls, world: { act: async (actions: Action[]) => { calls.push(structuredClone(actions)); return actions.map(() => ({ ok: true as const, id: `g${++id}` })) } } as unknown as World }
}
function desk(multiRoutes: boolean, bundleWait = 30) { const h = host(); return { ...h, d: new Dispatcher(h.world, 8, 500, map, drivers, { multiRoutes, bundleWait }) } }

test("disabled multi-route mode preserves control quotes, posts and clock", async () => {
  const { d, world } = desk(false, 15)
  const b = new Incumbent(world, 8, 500, map, drivers)
  const r = request("a")
  d.quote(r); b.quote(r)
  assert.deepEqual(d.takeActions(), b.takeActions())
  for (const x of [d, b]) await x.handle({ seq: 1, at: 515, kind: "order_won", order: order(r) })
  d.now = b.now = 530
  await d.tick(); await b.tick()
  assert.deepEqual(d.takeActions(), b.takeActions())
  assert.equal(d.nextDecisionAt(), b.nextDecisionAt())
  assert.throws(() => validateSettings({ multiRoutes: 1 }))
})

test("three held cars form one legal route and every leg is carried once", async () => {
  const { d } = desk(true)
  for (const id of ["a", "b", "c"]) {
    const r = request(id), o = order(r)
    d.requests.set(id, r); d.orders.set(id, o)
    await d.post(o, [0])
  }
  d.now = 530
  d.flushBundles()
  const actions = d.takeActions()
  assert.equal(actions.length, 1)
  const post = actions[0]!
  assert.ok(post.type === "post")
  assert.equal(post.stops.length, 6)
  assert.equal(d.metrics.largeRoutes, 1)
  assert.equal(d.metrics.coveredOrders, 3)
  d.readResults(actions, [{ ok: true, id: "g1" }])
  for (const id of ["a", "b", "c"]) assert.deepEqual(d.gigsOf(id), ["g1"])
  assert.ok(post.schedule.every((step, i) => i === 0 || step.at > post.schedule[i-1]!.at && step.feeCents >= post.schedule[i-1]!.feeCents))
})
