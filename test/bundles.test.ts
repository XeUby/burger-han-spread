import { test } from "node:test"
import assert from "node:assert/strict"
import { planBundles } from "../src/bundles.ts"
import type { BundleCandidate } from "../src/bundles.ts"
import { Network } from "../src/planning.ts"

const points = { a: 0, b: 100, c: 200, far: 1000 }
const network = new Network({ places: [], roads: Object.entries(points).flatMap(([from, x]) => Object.entries(points).map(([to, y]) => ({ from, to, km: x === y ? 12 : Math.abs(x - y), minutes: x === y ? 25 : Math.round(Math.abs(x - y) * .8) }))) })
const hours = { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
function candidate(id: string, from: string, to: string): BundleCandidate {
  const order = { id, dealerId: "dealer", option: "same_day" as const, priceCents: 16000, deadline: 1180, lastPickupAt: 1050, status: "waiting" as const, deliveredAt: [null], legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: from, privateAddress: false, hours, window: { from: 500, to: 1180 } }, delivery: { placeId: to, privateAddress: false, hours, window: { from: 500, to: 1180 } } }] }
  return { order, noteSafe: true, post: { type: "post", stops: [{ orderId: id, leg: 0, kind: "pickup" }, { orderId: id, leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 600, feeCents: 10000 }, { at: 900, feeCents: 14500 }, { at: 960, feeCents: 19000 }, { at: 1020, feeCents: 25000 }] } }
}

test("return-oriented pairs preserve each car's pickup-delivery order and share their saving", () => {
  const a = candidate("a", "a", "b"), b = candidate("b", "b", "a")
  b.post.audience.manualLicence = true
  a.post.audience.experienced = true
  const before = structuredClone([a, b])
  const [plan] = planBundles(600, [a, b], network)
  assert(plan)
  assert.deepEqual(plan.orderIds, ["a", "b"])
  assert.deepEqual(plan.post.stops.map(s => [s.orderId, s.kind]), [["a", "pickup"], ["a", "delivery"], ["b", "pickup"], ["b", "delivery"]])
  assert.deepEqual(plan.post.audience, { experienced: true, manualLicence: true })
  assert.equal(plan.drivingMinutes, 185)
  assert(plan.discount > 0 && plan.discount <= .2)
  assert.equal(plan.feeSavingCents, 20000 - plan.post.schedule[0]!.feeCents)
  assert(plan.post.schedule.every((s, i, all) => i === 0 || s.at > all[i - 1]!.at && s.feeCents >= all[i - 1]!.feeCents))
  assert.deepEqual([a, b], before)
})

test("the reverse stop ordering remains available when the forward route misses a cutoff", () => {
  const a = candidate("a", "a", "b"), b = candidate("b", "b", "a")
  b.post.stops[0]!.window = { from: 500, to: 760 }
  const [plan] = planBundles(600, [a, b], network)
  assert.deepEqual(plan?.orderIds, ["b", "a"])
  assert(plan!.post.stops.every(s => s.window && s.window.from <= s.window.to))
})

test("unsafe, private, completed, trade-in and under-equipped work cannot enter a bundle", () => {
  const b = candidate("b", "b", "a")
  for (const mutate of [
    (a: BundleCandidate) => { a.noteSafe = false },
    (a: BundleCandidate) => { a.order.legs[0]!.pickup.privateAddress = true },
    (a: BundleCandidate) => { a.order.deliveredAt[0] = 590 },
    (a: BundleCandidate) => { a.order.legs.push(a.order.legs[0]!) },
    (a: BundleCandidate) => { a.order.legs[0]!.car.premium = true },
  ]) {
    const a = candidate("a", "a", "b")
    mutate(a)
    assert.deepEqual(planBundles(600, [a, b], network), [])
  }
  const a = candidate("a", "a", "far")
  a.order.legs[0]!.car = { electric: true, chargePercent: 10, premium: false }
  assert.deepEqual(planBundles(600, [a, candidate("b", "far", "a")], network), [])
})

test("closing times, charging and the legal road-minute cap constrain routes", () => {
  const a = candidate("a", "a", "b"), b = candidate("b", "b", "a")
  a.order.legs[0]!.delivery.hours = { ...hours, closes: 800 }
  assert.deepEqual(planBundles(600, [a, b], network), [])
  assert.deepEqual(planBundles(600, [candidate("a", "a", "far"), candidate("b", "far", "a")], network), [])
  const c = candidate("c", "a", "b"), d = candidate("d", "b", "a")
  c.order.deadline = d.order.deadline = 960
  c.post.stops[0]!.withCharging = d.post.stops[0]!.withCharging = true
  assert.deepEqual(planBundles(600, [c, d], network), [])
})

test("matching never uses one order twice and can make two independent bundles", () => {
  const inputs = [candidate("a", "a", "b"), candidate("b", "b", "a"), candidate("c", "b", "c"), candidate("d", "c", "b")]
  const plans = planBundles(600, inputs, network)
  assert.equal(plans.length, 2)
  assert.equal(new Set(plans.flatMap(p => p.indices)).size, 4)
  assert.throws(() => planBundles(600, inputs, network, { maxDiscount: 1 }))
})
