import { test } from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "../src/policy.ts"
import type { DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"
import type { World } from "../vendor/typescript/spread.ts"

const map: WorldMap = {
  places: [],
  roads: [
    { from: "a", to: "a", km: 12, minutes: 25 }, { from: "a", to: "b", km: 220, minutes: 140 },
    { from: "b", to: "a", km: 220, minutes: 140 }, { from: "b", to: "b", km: 12, minutes: 25 },
  ],
}
const hours = { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: i % 2 ? "a" : "b", rating: 4.9, completedGigs: 100, licence: "manual", drops: 1 }))
function request(id: string, from: string, to: string): PriceRequest {
  return {
    id, dealerId: "D1", arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 7000,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: from, privateAddress: false, hours, window: { from: 500, to: 2640 } }, delivery: { placeId: to, privateAddress: false, hours, window: { from: 500, to: 2640 } } }],
    options: [{ kind: "next_day", deadline: 2640, listPriceCents: 11000 }],
  }
}
const order = (r: PriceRequest): Order => ({ id: r.id, dealerId: r.dealerId, option: "next_day", priceCents: 16000, deadline: 2640, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 2400 })
const desk = (pairQuote: number) => new Dispatcher({ act: async (actions: unknown[]) => actions.map((_, i) => ({ ok: true, id: `g${i}` })) } as unknown as World, 8, 500, map, drivers, { pairQuote, bundleWait: 0, adaptive: false })

test("a car that starts where a waiting car ends can share its gig", () => {
  const d = desk(0.6)
  const waiting = request("R1", "a", "b")
  d.requests.set(waiting.id, waiting)
  d.orders.set(waiting.id, order(waiting))
  assert.equal(d.partnerFor(request("R2", "b", "a")), "R1")
  assert.equal(d.partnerFor(request("R3", "a", "a")), "R1", "its delivery is at the waiting car's pickup")
})

test("a booked, urgent or already partnered car has no room", () => {
  const d = desk(0.6)
  const waiting = request("R1", "a", "b")
  d.requests.set(waiting.id, waiting)
  d.orders.set(waiting.id, order(waiting))
  d.partners.set("R9", "R1")
  assert.equal(d.partnerFor(request("R2", "b", "a")), null)
  d.partners.clear()
  d.urgent.add("R1")
  assert.equal(d.partnerFor(request("R2", "b", "a")), null)
  d.urgent.clear()
  d.carry({ type: "post", stops: [{ orderId: "R1", leg: 0, kind: "pickup" }, { orderId: "R1", leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 500, feeCents: 7000 }] }, "g1")
  d.booked.add("g1")
  assert.equal(d.partnerFor(request("R2", "b", "a")), null)
})

test("the open-work limits do not refuse a car that can share a gig", () => {
  const d = desk(0.6)
  d.settings.capacity = 0.0001
  const waiting = request("R1", "a", "b")
  d.requests.set(waiting.id, waiting)
  d.orders.set(waiting.id, order(waiting))
  d.quote(request("R2", "b", "a"))
  assert.equal(d.partners.get("R2"), "R1")
  const quote = d.outbox.find(action => action.type === "quote")
  assert.ok(quote && quote.type === "quote" && Object.values(quote.prices).every(price => price! < 100_000_000))
  const off = desk(0)
  off.requests.set(waiting.id, waiting)
  off.orders.set(waiting.id, order(waiting))
  off.quote(request("R2", "b", "a"))
  assert.equal(off.partners.size, 0, "switched off, no car is partnered")
})
