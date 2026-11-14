import { test } from "node:test"
import assert from "node:assert/strict"
import { live } from "../src/run.ts"
import type { Client } from "../vendor/typescript/spread.ts"
import type { Action, DeskEvent, DeskSnapshot, DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

test("live runner quotes, waits for the default bundle window, posts and stops at world end", { timeout: 15000 }, async () => {
  const hours = { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
  const stop = { placeId: "a", privateAddress: false, hours, window: { from: 500, to: 1200 } }
  const request: PriceRequest = { id: "R1", dealerId: "D1", batchId: null, arrivedAt: 500, respondBy: 515, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: stop }], options: [{ kind: "same_day", deadline: 1200, listPriceCents: 5000 }], referenceFeeCents: 2500, note: null }
  const order: Order = { id: "R1", dealerId: "D1", option: "same_day", priceCents: 6750, deadline: 1200, legs: request.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1175 }
  const score = { marginCents: 4000, revenueCents: 6750, marginShare: 0.59, wonOrders: 1, onTimeShare: 1, undeliveredShare: 0, ranked: true }
  const snapshot: DeskSnapshot = { worldId: "w1", now: 500, endsAt: 1000, openRequests: [request], orders: [], gigs: [], driverPositions: [], score }
  const map: WorldMap = { places: [], roads: [{ from: "a", to: "a", minutes: 25, km: 12 }] }
  const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, drops: 0, licence: "manual" }))
  const events: DeskEvent[] = [{ seq: 0, at: 500, kind: "price_request", request }]
  const sent: Action[] = []
  let now = 500
  const world = {
    id: "w1",
    snapshot: async () => structuredClone(snapshot),
    roster: async () => drivers,
    events: async (after = -1) => structuredClone(events.filter(e => e.seq > after && e.at <= now)),
    score: async () => score,
    act: async (actions: Action[]) => {
      sent.push(...actions)
      return actions.map(action => {
        if (action.type === "quote") events.push({ seq: 1, at: 515, kind: "order_won", order })
        if (action.type === "post") {
          assert.ok(now >= 530)
          events.push({ seq: 2, at: now + 1, kind: "gig_booked", gigId: "g1", driverId: "d1", feeCents: 2500 }, { seq: 3, at: 800, kind: "delivered", gigId: "g1", orderId: "R1", leg: 0, placeId: "a" })
          now = 1000
        }
        return { ok: true, id: action.type === "post" ? "g1" : "R1" }
      })
    },
  }
  const client = { world: () => world, map: async () => map, final: async () => { now = Math.min(1000, now + 5); return { worldId: "w1", startsAt: "2026-11-15T06:00:00Z", now } } } as unknown as Client
  await live(client, {})
  assert.deepEqual(sent.map(a => a.type), ["quote", "post"])
})
