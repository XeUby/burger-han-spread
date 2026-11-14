import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { DriverProfile, Order, PostAction, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"

const map: WorldMap = { places: [], roads: [
  { from: "a", to: "a", km: 12, minutes: 15 }, { from: "a", to: "b", km: 250, minutes: 100 },
  { from: "b", to: "a", km: 250, minutes: 100 }, { from: "b", to: "b", km: 12, minutes: 15 },
] }
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 0 }))
const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(id = "R1"): PriceRequest {
  return { id, dealerId: "D1", batchId: null, arrivedAt: 600, respondBy: 615, referenceFeeCents: 2500,
    note: { language: "en", text: "Pickup weekdays 9:00-16:00 only. Receiving weekdays 10:00-18:00 only." },
    legs: [{ car: { premium: false, electric: false, chargePercent: null },
      pickup: { placeId: "a", privateAddress: false, hours, window: { from: 600, to: 2640 } },
      delivery: { placeId: "b", privateAddress: false, hours, window: { from: 600, to: 2640 } },
    }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 10000 }, { kind: "next_day", deadline: 2640, listPriceCents: 9000 }],
  }
}
const desk = (enabled = true) => new Dispatcher({} as World, 8, 600, map, drivers, { timedNotes: enabled, adaptive: false })
const won = (r: PriceRequest, deadline = 2640): Order => ({ id: r.id, dealerId: r.dealerId, option: "next_day", priceCents: 14200, deadline, legs: structuredClone(r.legs), status: "waiting", deliveredAt: [null], lastPickupAt: deadline - 150 })
const nextPost = (d: Dispatcher): PostAction => {
  const action = d.outbox.shift()!
  assert.equal(action.type, "post")
  return action as PostAction
}

test("hours admission is opt-in, rejects infeasible options, and preserves the request", () => {
  const r = request(), original = structuredClone(r)
  const disabled = desk(false)
  disabled.quote(r)
  assert.equal(disabled.pending.size, 0)
  const d = desk()
  d.quote(r)
  assert.equal(d.pending.has(r.id), true)
  assert.deepEqual(r, original)
  const tight = request("tight")
  tight.note!.text = "Pickup 9:00-12:00. Receiving 10:00-18:00."
  const limited = desk()
  limited.quote(tight)
  const quote = limited.outbox[0]!
  assert.equal(quote.type, "quote")
  if (quote.type === "quote") {
    assert.equal(quote.prices.same_day, undefined)
    assert.equal(quote.prices.next_day, 12780)
  }
})

test("posting enforces note hours, readiness and equipment without changing public state", async () => {
  const d = desk(), r = request()
  r.note!.text += " Ready for pickup from tomorrow 11:00. Manual gearbox. No plates."
  const original = structuredClone(r), order = won(r, 4080)
  d.requests.set(r.id, r)
  await d.post(order, [0])
  const post = nextPost(d)
  assert.equal(post.stops[0]!.window!.from, 1440 + 660)
  assert.ok(post.stops[0]!.window!.to < 1440 + 960)
  assert.ok(post.stops[1]!.window!.to < 1440 + 1080)
  assert.equal(post.stops[0]!.withPlates, true)
  assert.equal(post.audience.manualLicence, true)
  assert.deepEqual(r, original)
  assert.deepEqual(order.legs, original.legs)
  await d.post(order, [0], { pickupFrom: 1440 + 700, manualLicence: false, plates: false })
  assert.equal(nextPost(d).stops[0]!.window!.from, 1440 + 700)
})

test("expiry replans the next open day and a duplicate expiry cannot duplicate posts", async () => {
  const d = desk(), r = request(), order = won(r)
  d.requests.set(r.id, r)
  await d.win(order)
  d.carry(nextPost(d), "g")
  d.now = 1000
  await d.repost("g")
  const post = nextPost(d)
  assert.equal(post.stops[0]!.window!.from, 1440 + 540)
  assert.ok(post.stops[0]!.window!.to < 1440 + 960)
  assert.ok(post.stops[1]!.window!.to < 1440 + 1080)
  await d.repost("g")
  assert.equal(d.outbox.length, 0)
})

test("mixed bundle expiry preserves restrictions and excludes already delivered members", async () => {
  const d = desk(), r = request(), plain = request("R2")
  plain.note = null
  for (const req of [r, plain]) { d.requests.set(req.id, req); await d.win(won(req)) }
  const first = nextPost(d), second = nextPost(d)
  d.carry({ ...first, stops: [...first.stops, ...second.stops] }, "shared")
  d.delivered(plain.id, 0, 900)
  d.now = 1000
  await d.repost("shared")
  assert.equal(d.outbox.length, 1)
  const post = nextPost(d)
  assert.deepEqual(post.stops.map(stop => stop.orderId), [r.id, r.id])
  assert.equal(post.stops[0]!.window!.from, 1440 + 540)
  assert.deepEqual(d.gigsOf(plain.id), [])
})

test("late recovery and route changes retain the note's closing times", async () => {
  const d = desk(), r = request(), order = won(r, 1200)
  d.requests.set(r.id, r)
  d.now = 1100
  order.legs[0]!.car = { premium: false, electric: true, chargePercent: 10 }
  await d.post(order, [0])
  const post = nextPost(d)
  assert.equal(post.stops[0]!.withCharging, true)
  assert.ok(post.stops[0]!.window!.from >= 1440 + 540)
  assert.ok(post.stops[0]!.window!.to < 1440 + 960)
  assert.ok(post.stops[1]!.window!.to < 1440 + 1080)
})
