import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: [{ from: "a", to: "a", km: 12, minutes: 25 }] }
const drivers: DriverProfile[] = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 0 }))
const hours = { opens: 420, closes: 1260, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(): PriceRequest {
  const stop = { placeId: "a", privateAddress: false, hours, window: { from: 500, to: 2640 } }
  return {
    id: "R1", dealerId: "D1", arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 2500,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: stop }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 5000 }],
  }
}

function order(r: PriceRequest): Order {
  return { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 7000, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1175 }
}

test("a rejected quote action neither reserves capacity nor teaches a fictitious loss", async () => {
  const d = new Dispatcher({} as World, 8, 500, map, drivers, { adaptive: true })
  const r = request()
  const features = d.features(r)
  const prior = d.market.threshold(features)
  d.quote(r)
  assert.equal(d.pending.has(r.id), true)
  assert.equal(d.bids.has(r.id), true)
  const quote = d.outbox.shift()!
  d.readResults([quote], [{ ok: false, reason: "Response deadline passed" }])
  assert.equal(d.pending.has(r.id), false)
  assert.equal(d.bids.has(r.id), false)
  await d.handle({ seq: 1, at: 515, kind: "order_lost", requestId: r.id })
  assert.equal(d.market.threshold(features), prior)
  d.quote(r)
  assert.equal(d.outbox.length, 0)
})

test("a concurrent booking that prevents withdrawal keeps its gig and queues no replacement", async () => {
  const sent: Action[] = []
  const world = { act: async (actions: Action[]) => {
    sent.push(...actions)
    return actions.map(() => ({ ok: false as const, reason: "Gig g1 is booked" }))
  } } as unknown as World
  const d = new Dispatcher(world, 8, 500, map, drivers, { bundleWait: 0 })
  const r = request()
  const o = order(r)
  d.requests.set(r.id, r)
  await d.win(o)
  const post = d.outbox.shift()!
  d.readResults([post], [{ ok: true, id: "g1" }])
  await d.change({ ...o, deadline: 2640 })
  assert.deepEqual(sent.map(action => action.type), ["withdraw"])
  assert.deepEqual(d.gigsOf(r.id), ["g1"])
  assert.equal(d.outbox.some(action => action.type === "post"), false)
  await d.handle({ seq: 1, at: 501, kind: "gig_booked", gigId: "g1", driverId: "d1", feeCents: 2500 })
  await d.tick()
  assert.equal(d.booked.has("g1"), true)
  assert.deepEqual(d.gigsOf(r.id), ["g1"])
  assert.equal(d.outbox.some(action => action.type === "post"), false)
})
