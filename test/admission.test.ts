import test from "node:test"
import assert from "node:assert/strict"
import { requestFeasibility } from "../src/admission.ts"
import { Network, lastPickup } from "../src/planning.ts"
import type { PriceRequest, StopPlace, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: [
  { from: "a", to: "a", km: 10, minutes: 15 }, { from: "a", to: "b", km: 220, minutes: 100 },
  { from: "b", to: "a", km: 220, minutes: 100 }, { from: "b", to: "b", km: 10, minutes: 15 },
] }
const network = new Network(map)
const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const dealer = (placeId: string): StopPlace => ({ placeId, privateAddress: false, hours: structuredClone(hours), window: { from: 500, to: 2640 } })
const home = (): StopPlace => ({ placeId: "b", privateAddress: true, hours: null, window: { from: 960, to: 1020 } })
function trade(): PriceRequest {
  const car = { premium: false, electric: false, chargePercent: null }
  return { id: "R1", dealerId: "D1", arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 5000,
    legs: [{ car: { ...car }, pickup: dealer("a"), delivery: home() }, { car: { ...car }, pickup: home(), delivery: dealer("a") }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 10000 }],
  }
}

test("a trade-in needs permission and a feasible return, not only an outbound arrival", () => {
  const r = trade()
  assert.equal(requestFeasibility(r, 1200, network), null)
  assert.deepEqual(requestFeasibility(r, 1200, network, { tradeIns: true }), { latestPickupAt: 870, drivingMinutes: 215 })
  r.legs[1]!.delivery.hours!.closes = 1080
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true }), null)
})

test("trade-in planning includes return charging, plates, and dealer opening days", () => {
  const r = trade()
  r.note = { language: "en", text: "No plates" }
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true })!.latestPickupAt, 840)
  r.note = null
  r.legs[1]!.delivery.hours!.closes = 1140
  assert.ok(requestFeasibility(r, 1200, network, { tradeIns: true }))
  r.legs[1]!.car = { premium: false, electric: true, chargePercent: 20 }
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true }), null)
  const weekend = trade()
  for (const leg of weekend.legs) for (const stop of [leg.pickup, leg.delivery]) stop.window = { from: stop.window.from + 5 * 1440, to: stop.window.to + 5 * 1440 }
  assert.equal(requestFeasibility(weekend, 1200 + 5 * 1440, network, { tradeIns: true }), null)
})

test("private slots stay hard even when the selected option ends the following day", () => {
  const r = trade()
  r.legs = [{ ...r.legs[0]!, pickup: home(), delivery: dealer("a") }]
  assert.equal(requestFeasibility(r, 2640, network), null)
  assert.equal(requestFeasibility(r, 2640, network, { allowPrivate: true })!.latestPickupAt, 1020)
  r.legs[0]!.pickup.window = { from: 960, to: 950 }
  assert.equal(requestFeasibility(r, 2640, network, { allowPrivate: true }), null)
})

test("private delivery appointments limit pickup even with a later order deadline", () => {
  const r = trade()
  r.legs = [r.legs[0]!]
  assert.equal(requestFeasibility(r, 2640, network, { allowPrivate: true })!.latestPickupAt, 885)
  r.legs[0]!.pickup.window.from = 900
  assert.equal(requestFeasibility(r, 2640, network, { allowPrivate: true }), null)
})

test("public single-leg behavior is preserved and uncertain notes remain excluded", () => {
  const r = trade()
  r.legs = [{ ...r.legs[0]!, delivery: dealer("b") }]
  assert.equal(requestFeasibility(r, 1200, network)!.latestPickupAt, lastPickup(r.legs[0]!, 1200, network))
  r.note = { language: "en", text: "Ready tomorrow 12:00" }
  assert.equal(requestFeasibility(r, 2640, network, { allowPrivate: true, tradeIns: true }), null)
})

test("trade-in shape and driving limits exclude unsupported multi-car routes", () => {
  const r = trade()
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true, maxTradeMinutes: 200 }), null)
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true, maxTradeMinutes: 721 }), null)
  r.legs[1]!.delivery.placeId = "b"
  assert.equal(requestFeasibility(r, 1200, network, { tradeIns: true }), null)
})
