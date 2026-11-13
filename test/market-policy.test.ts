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
