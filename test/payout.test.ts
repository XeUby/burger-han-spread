import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: ["a", "b"].flatMap(from => ["a", "b"].map(to => ({ from, to, km: from === to ? 12 : 100, minutes: from === to ? 25 : 80 }))) }
const drivers: DriverProfile[] = Array.from({ length: 80 }, (_, i) => ({ id: `d${i}`, homePlaceId: i < 40 ? "a" : "b", rating: 4.9, licence: "manual", completedGigs: 100, drops: 0 }))
function request(id = "r", from = "a", to = "b"): PriceRequest {
  const stop = { privateAddress: false, hours: { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }, window: { from: 500, to: 1180 } }
  return { id, dealerId: "dealer", batchId: null, arrivedAt: 500, respondBy: 515, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { ...stop, placeId: from }, delivery: { ...stop, placeId: to } }], options: [{ kind: "same_day", deadline: 1180, listPriceCents: 10000 }] }
}
function desk(payout = 1, openingOnly = false, bundleWait = 0) {
  return new Dispatcher({ act: async (actions: unknown[]) => actions.map(() => ({ ok: true, id: "g" })) } as unknown as World, 8, 500, map, drivers, { payout, openingOnly, bundleWait })
}
function remember(d: Dispatcher, r = request()): Order {
  const order: Order = { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 15000, deadline: 1180, lastPickupAt: 1050, legs: r.legs, status: "waiting", deliveredAt: [null] }
  d.requests.set(r.id, r)
  d.orders.set(r.id, order)
  return order
}

test("payout cuts leave customer quote actions and base cost estimates unchanged", () => {
  const control = desk(), full = desk(.85), opening = desk(.85, true)
  for (const d of [control, full, opening]) d.quote(request())
  assert.equal(control.outbox[0]!.type, "quote")
  assert.deepEqual(full.outbox, control.outbox)
  assert.deepEqual(opening.outbox, control.outbox)
  assert.equal(full.baseFee(request()), control.baseFee(request()))
  assert.equal(opening.baseFee(request()), control.baseFee(request()))
  assert.throws(() => validateSettings({ payout: 1.01 }))
  assert.throws(() => validateSettings({ payout: 0 }))
})

test("opening-only cuts retain every rescue step; full cuts include late rescue", () => {
  const control = desk(), full = desk(.85), opening = desk(.85, true)
  const order = remember(control)
  for (const d of [full, opening]) remember(d)
  for (const stage of ["normal", "urgent", "late"]) {
    if (stage === "urgent") for (const d of [control, full, opening]) d.urgent.add(order.id)
    if (stage === "late") for (const d of [control, full, opening]) d.now = order.lastPickupAt + 1
    const original = control.feesFor(order, 1)
    assert.deepEqual(full.feesFor(order, 1), original.map(step => ({ ...step, feeCents: Math.round(step.feeCents * .85) })))
    assert.deepEqual(opening.feesFor(order, 1), original.map((step, i) => ({ ...step, feeCents: stage === "normal" && i === 0 ? Math.round(step.feeCents * .85) : step.feeCents })))
  }
})

test("held singles get one cut without moving the original fee-step clocks", async () => {
  for (const openingOnly of [false, true]) {
    const control = desk(1, false, 15), treatment = desk(.85, openingOnly, 15)
    for (const d of [control, treatment]) {
      await d.post(remember(d), [0])
      d.now = 515
      d.flushBundles()
    }
    const a = control.outbox[0]!, b = treatment.outbox[0]!
    assert(a.type === "post" && b.type === "post")
    assert.deepEqual(b.stops, a.stops)
    assert.deepEqual(b.schedule, a.schedule.map((step, i) => ({ ...step, feeCents: Math.round(step.feeCents * (openingOnly && i > 0 ? 1 : .85)) })))
  }
})

test("bundle selection and every bundled fee remain unchanged in both payout variants", async () => {
  const desks = [desk(1, false, 15), desk(.85, false, 15), desk(.85, true, 15)]
  for (const d of desks) {
    await d.post(remember(d, request("r1", "a", "b")), [0])
    await d.post(remember(d, request("r2", "b", "a")), [0])
    d.now = 515
    d.flushBundles()
  }
  assert.equal(desks[0]!.outbox.length, 1)
  const bundle = desks[0]!.outbox[0]!
  assert(bundle.type === "post" && bundle.stops.length === 4)
  assert.deepEqual(desks[1]!.outbox, desks[0]!.outbox)
  assert.deepEqual(desks[2]!.outbox, desks[0]!.outbox)
})
