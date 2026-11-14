import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "../src/policy.ts"
import { PlaceDemandModel } from "../src/place-market.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: [
  { from: "a", to: "a", km: 12, minutes: 15 }, { from: "a", to: "b", km: 150, minutes: 100 },
  { from: "b", to: "a", km: 150, minutes: 100 }, { from: "b", to: "b", km: 12, minutes: 15 },
] }
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 0 }))
const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(id = "R00059"): PriceRequest {
  return { id, dealerId: "D1", batchId: null, arrivedAt: 648, respondBy: 663, referenceFeeCents: 2500,
    note: { language: "en", text: "Hi there. In the workshop, ready tomorrow 10:00" },
    legs: [{ car: { premium: false, electric: false, chargePercent: null },
      pickup: { placeId: "a", privateAddress: false, hours, window: { from: 648, to: 2640 } },
      delivery: { placeId: "b", privateAddress: false, hours, window: { from: 648, to: 2640 } },
    }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 10000 }, { kind: "next_day", deadline: 2640, listPriceCents: 9000 }],
  }
}
const desk = (enabled = true) => new Dispatcher({} as World, 8, 648, map, drivers, { readiness: enabled, noteReader: false, adaptive: false, bundleWait: 0, backlog: 0.04 })
function won(r: PriceRequest): Order {
  return { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 14200, deadline: 2640, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 2539 }
}

test("the observed sub-24h calendar delay extends feasibility while preserving original prices and state", () => {
  const r = request()
  const original = structuredClone(r)
  const disabled = desk(false)
  disabled.quote(r)
  assert.equal(disabled.pending.size, 0)
  const d = desk()
  const plan = d.plannedRequest(r)
  assert.equal(plan.legs[0]!.pickup.window.from, 2040)
  assert.equal(plan.options[0]!.deadline, 2640)
  assert.equal(plan.legs[0]!.pickup.window.to, 4080)
  assert.deepEqual(plan.options.map(option => option.listPriceCents), [10000, 9000])
  d.quote(r)
  const action = d.outbox[0]!
  assert.equal(action.type, "quote")
  if (action.type === "quote") assert.equal(action.prices.same_day, 14200)
  assert.deepEqual(r, original)
  assert.deepEqual(d.requests.get(r.id), original)
  assert.equal(d.features(r).day, 0)
})

test("posting enforces revealed readiness even though won-order windows retain the old start", async () => {
  const d = desk()
  const r = request()
  r.note!.text += ". Manual gearbox. No plates."
  d.requests.set(r.id, r)
  const plan = d.plannedRequest(r)
  assert.equal(plan.note!.text, "Manual gearbox. No plates")
  assert.equal(d.noteRules(r).manual, true)
  await d.post(won(r), [0])
  const action = d.outbox.shift()!
  assert.equal(action.type, "post")
  if (action.type === "post") {
    assert.equal(action.stops[0]!.window!.from, 2040)
    assert.equal(action.stops[0]!.withPlates, true)
    assert.equal(action.audience.manualLicence, true)
  }
  await d.post(won(r), [0], { pickupFrom: 2100, manualLicence: false, plates: false })
  const retry = d.outbox.shift()!
  if (retry.type === "post") assert.equal(retry.stops[0]!.window!.from, 2100)
})

test("readiness reservations use actual pickup days without blocking today's unrelated work", () => {
  const d = desk()
  d.quote(request("R1"))
  d.quote(request("R2"))
  const tomorrow = request("R3")
  tomorrow.note = null
  tomorrow.legs[0]!.pickup.window.from = 2040
  tomorrow.options = [{ kind: "same_day", deadline: 2640, listPriceCents: 10000 }]
  d.quote(tomorrow)
  assert.equal(d.pending.has("R3"), false)
  const today = request("R4")
  today.note = null
  d.quote(today)
  assert.equal(d.pending.has("R4"), true)
})

test("readiness admission excludes weekend extensions, post-week caps, private work and trade-ins", () => {
  const d = desk()
  const thursday = request()
  thursday.arrivedAt += 3 * 1440
  thursday.legs[0]!.pickup.window.from += 3 * 1440
  thursday.options = [
    { kind: "same_day", deadline: 3 * 1440 + 1200, listPriceCents: 10000 },
    { kind: "next_day", deadline: 4 * 1440 + 1200, listPriceCents: 9000 },
    { kind: "within_3_days", deadline: 7 * 1440 + 1200, listPriceCents: 8000 },
  ]
  assert.deepEqual(d.plannedRequest(thursday).options.map(option => option.kind), ["same_day"])
  const privateJob = request()
  privateJob.legs[0]!.pickup.privateAddress = true
  assert.equal(d.readinessFor(privateJob), null)
  const trade = request()
  trade.legs.push(structuredClone(trade.legs[0]!))
  assert.equal(d.readinessFor(trade), null)
})

test("pure readiness equipment affects eligible supply and place priors stay opt-in", () => {
  const r = request()
  r.note!.text += ". Manual gearbox."
  const mixed = drivers.map((driver, i) => ({ ...driver, licence: i < 10 ? "manual" as const : "automatic_only" as const }))
  const d = new Dispatcher({} as World, 8, 648, map, mixed, { readiness: true, noteReader: false, minDrivers: 12 })
  assert.equal(d.supply(r), 10)
  d.quote(r)
  assert.equal(d.pending.size, 0)
  assert.equal(d.market instanceof PlaceDemandModel, false)
  const informed = new Dispatcher({} as World, 8, 648, map, drivers, { placePrior: 1 })
  assert.equal(informed.market instanceof PlaceDemandModel, true)
  assert.doesNotThrow(() => validateSettings({ placePrior: 0, readiness: false }))
  assert.throws(() => validateSettings({ placePrior: 2.01 }))
})
