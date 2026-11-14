import test from "node:test"
import assert from "node:assert/strict"
import { lateRescueApplies, lateRescueSchedule } from "../src/late-rescue.ts"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Order, PriceRequest } from "../vendor/typescript/types.ts"

const stop = { placeId: "a", privateAddress: false, hours: null, window: { from: 480, to: 1200 } }
const request: PriceRequest = { id: "r", dealerId: "d", batchId: null, arrivedAt: 480, respondBy: 495, note: null, referenceFeeCents: 4000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: { ...stop, placeId: "b" } }], options: [{ kind: "same_day", deadline: 1200, listPriceCents: 8000 }] }
const order: Order = { id: "r", dealerId: "d", option: "same_day", priceCents: 10000, deadline: 1200, lastPickupAt: 1000, legs: request.legs, status: "waiting", deliveredAt: [null] }
function desk(enabled = true) {
  const d = new Dispatcher({} as World, 8, 1001, { places: [], roads: [{ from: "a", to: "b", km: 200, minutes: 180 }] }, [], { lateRescue: enabled, lateRepost: false, lateFee: 1.2 })
  d.requests.set(order.id, request)
  d.orders.set(order.id, structuredClone(order))
  d.urgent.add(order.id)
  d.carry({ type: "post", stops: [{ orderId: "r", leg: 0, kind: "pickup" }, { orderId: "r", leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 1000, feeCents: 12300 }] }, "g")
  d.raised.set("g", 990)
  return d
}

test("only public single-car work strictly beyond its last pickup is eligible", () => {
  assert.equal(lateRescueApplies(order, 1000), false)
  assert.equal(lateRescueApplies(order, 1001), true)
  for (const kind of ["pickup", "delivery"] as const) {
    const changed = structuredClone(order)
    changed.legs[0]![kind].privateAddress = true
    assert.equal(lateRescueApplies(changed, 1001), false)
  }
  assert.equal(lateRescueApplies({ ...order, legs: [...order.legs, ...order.legs] }, 1001), false)
})

test("late escalation returns to the full fee within six hours and cannot restart its clock", () => {
  assert.deepEqual(lateRescueSchedule(order, 1001, 10000), [{ at: 1001, feeCents: 12000 }, { at: 1121, feeCents: 14500 }, { at: 1241, feeCents: 19000 }, { at: 1361, feeCents: 25000 }])
  assert.deepEqual(lateRescueSchedule(order, 1180, 10000), [{ at: 1180, feeCents: 14500 }, { at: 1241, feeCents: 19000 }, { at: 1361, feeCents: 25000 }])
  assert.deepEqual(lateRescueSchedule(order, 2000, 10000), [{ at: 2000, feeCents: 25000 }])
})

test("enabled repricing resets an open late gig once even after a recent raise", async () => {
  const d = desk()
  await d.tick()
  const actions = d.takeActions(), reset = actions.find(action => action.type === "reprice")!
  assert.equal(reset.type, "reprice")
  if (reset.type === "reprice") assert.equal(reset.schedule[0]!.feeCents, Math.round(d.baseFee(request) * 1.2))
  await d.tick()
  assert.equal(d.outbox.some(action => action.type === "reprice"), false)
  const off = desk(false)
  await off.tick()
  assert.equal(off.outbox.some(action => action.type === "reprice"), false)
  assert.equal(off.feesFor(order, 1)[0]!.feeCents, Math.round(off.baseFee(request) * 2.5))
})

test("booked and shared gigs cannot receive the reset; direct offers use the current step", async () => {
  const booked = desk()
  booked.booked.add("g")
  await booked.tick()
  assert.equal(booked.outbox.length, 0)
  const shared = desk()
  shared.posts.get("g")!.stops.push({ orderId: "other", leg: 0, kind: "pickup" }, { orderId: "other", leg: 0, kind: "delivery" })
  await shared.tick()
  assert.equal(shared.outbox.length, 0)
  const late = desk()
  late.now = 1250
  assert.equal(late.feesFor(order, 1)[0]!.feeCents, Math.round(late.baseFee(request) * 1.9))
})
