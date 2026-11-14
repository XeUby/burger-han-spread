import { test } from "node:test"
import assert from "node:assert/strict"
import { Dispatcher, validateSettings } from "../src/policy.ts"
import { Network, intervals, lastPickup, needsCharge } from "../src/planning.ts"
import { readNote } from "../src/notes.ts"
import type { DeskSnapshot, DriverProfile, Order, PriceRequest, WorldMap } from "../vendor/typescript/types.ts"
import type { World } from "../vendor/typescript/spread.ts"

const map: WorldMap = {
  places: [],
  roads: [
    { from: "a", to: "a", km: 12, minutes: 25 },
    { from: "a", to: "b", km: 220, minutes: 140 },
    { from: "b", to: "a", km: 220, minutes: 140 },
    { from: "b", to: "b", km: 12, minutes: 25 },
  ],
}
const network = new Network(map)
const hours = { opens: 480, closes: 1080, weekdays: [0, 1, 2, 3, 4], saturday: null }
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 1 }))
function request(id = "R1"): PriceRequest {
  return {
    id, dealerId: "D1", arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 7000,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: "a", privateAddress: false, hours, window: { from: 500, to: 2640 } }, delivery: { placeId: "b", privateAddress: false, hours, window: { from: 500, to: 2640 } } }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 12000 }, { kind: "next_day", deadline: 2640, listPriceCents: 11000 }],
  }
}
function order(r = request()): Order {
  return { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 18000, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 900 }
}
function desk(): Dispatcher {
  const world = { act: async (actions: unknown[]) => actions.map((_, i) => ({ ok: true, id: `g${i}` })) } as unknown as World
  return new Dispatcher(world, 8, 500, map, drivers, { bundleWait: 0, backlog: 0.04 })
}

test("uncertain notes cannot win, but harmless tyres in the boot are allowed", () => {
  assert.equal(readNote({ text: "Summer tyres in the trunk, go with the car. Cheers.", language: "en" }).safe, true)
  for (const text of ["Still on summer tyres", "Ready tomorrow 10:30", "Nothing special. Deliver before 12", "No plates. Ready Fri 10"])
    assert.equal(readNote({ text, language: "en" }).safe, false, text)
  assert.deepEqual(readNote({ text: "Auto ilman kilpiä. Kiitos.", language: "fi" }), { safe: true, plates: true, manual: false })
})

test("planning respects daily closing time and weekend closure", () => {
  const leg = request().legs[0]!
  assert.equal(lastPickup(leg, 1200, network), 898)
  const stop = { ...leg.pickup, window: { from: 5 * 1440, to: 8 * 1440 } }
  assert.deepEqual(intervals(stop, 5 * 1440, 8 * 1440), [{ from: 7 * 1440 + 480, to: 7 * 1440 + 1079 }])
})

test("low battery adds charging only on routes longer than 200 km", () => {
  const leg = request().legs[0]!
  leg.car = { premium: false, electric: true, chargePercent: 20 }
  assert.equal(needsCharge(leg, network), true)
  leg.delivery.placeId = "a"
  assert.equal(needsCharge(leg, network), false)
})

test("pending quotes reserve capacity before a batch wins", () => {
  const d = desk()
  d.settings.capacity = 0.15
  for (let i = 0; i < 20; i++) d.quote(request(`R${i}`))
  assert.equal(d.pending.size, 2)
  assert.equal(d.outbox.filter(a => a.type === "quote" && Object.values(a.prices)[0]! < 100_000_000).length, 2)
})

test("lost quotes release capacity for the next dealer", async () => {
  const d = desk()
  d.quote(request("R1"))
  d.quote(request("R2"))
  d.quote(request("R3"))
  assert.equal(d.pending.has("R3"), false)
  await d.handle({ seq: 0, at: 515, kind: "order_lost", requestId: "R1" })
  d.quote(request("R4"))
  assert.equal(d.pending.has("R4"), true)
})

test("booked gigs clear the backlog limit but retain the daily capacity limit", async () => {
  const d = desk()
  d.settings.capacity = 0.15
  for (let i = 0; i < 20; i++) {
    const r = request(`R${i}`)
    d.quote(r)
    if (!d.pending.has(r.id)) continue
    await d.handle({ seq: i * 2, at: 515, kind: "order_won", order: order(r) })
    const post = d.outbox.findLast(a => a.type === "post")!
    d.readResults([post], [{ ok: true, id: `g${i}` }])
    await d.handle({ seq: i * 2 + 1, at: 516, kind: "gig_booked", gigId: `g${i}`, driverId: `d${i}`, feeCents: 7000 })
  }
  assert.equal(d.orders.size, 6)
})

test("direct offers respect the per-gig and daily per-driver limits", async () => {
  const d = desk()
  const r = request()
  d.requests.set(r.id, r)
  const o = order(r)
  d.orders.set(o.id, o)
  await d.post(o, [0])
  const post = d.outbox.shift()!
  d.readResults([post], [{ ok: true, id: "g1" }])
  for (let round = 0; round < 8; round++) {
    const before = d.outbox.length
    d.offer("g1", o)
    assert(d.outbox.length - before <= 3)
    d.now += 12
  }
  const counts = new Map<string, number>()
  for (const action of d.outbox) if (action.type === "offer") counts.set(action.driverId, (counts.get(action.driverId) ?? 0) + 1)
  assert([...counts.values()].every(count => count <= 3))
})

test("declining at levels 1–3 sends no quote because every quote wins", () => {
  const d = new Dispatcher({} as World, 3, 500, map, drivers)
  const r = request()
  r.note = { text: "Unknown timing constraint", language: "en" }
  d.quote(r)
  assert.equal(d.outbox.length, 0)
})

test("expired requests get no action", () => {
  const d = desk()
  d.now = 515
  d.quote(request())
  assert.equal(d.outbox.length, 0)
})

test("premium, manual, plates and charging constraints reach the post", async () => {
  const d = desk()
  const r = request()
  r.note = { text: "Manual gearbox. No plates.", language: "en" }
  r.legs[0]!.car = { premium: true, electric: true, chargePercent: 20 }
  d.requests.set(r.id, r)
  await d.post(order(r), [0])
  const post = d.outbox[0]!
  assert.equal(post.type, "post")
  if (post.type !== "post") return
  assert.deepEqual(post.audience, { experienced: true, manualLicence: true })
  assert.equal(post.stops[0]!.withPlates, true)
  assert.equal(post.stops[0]!.withCharging, true)
})

test("rescue schedules stay bounded, ordered and whole even days late", () => {
  const d = desk()
  d.requests.set("R1", request())
  d.urgent.add("R1")
  d.now = 15000
  const steps = d.feesFor(order(), 1)
  assert(steps.every(s => Number.isInteger(s.at) && Number.isInteger(s.feeCents)))
  assert(steps.every((s, i) => i === 0 || (s.at > steps[i - 1]!.at && s.feeCents >= steps[i - 1]!.feeCents)))
  assert(Math.max(...steps.map(s => s.feeCents)) <= Math.ceil(d.baseFee(request()) * 2.5))
})

test("repricing through the last on-time pickup does not reset a scheduled raise", () => {
  const d = desk()
  d.requests.set("R1", request())
  d.urgent.add("R1")
  d.now = 680
  const earlier = d.feesFor(order(), 1)
  for (const now of [790, 850, order().lastPickupAt]) {
    d.now = now
    const shown = earlier.filter(s => s.at <= now).at(-1)!.feeCents
    assert(d.feesFor(order(), 1)[0]!.feeCents >= shown)
  }
})

test("duplicate events do not duplicate gigs or dealer trust", async () => {
  const d = desk()
  d.requests.set("R1", request())
  const won = { seq: 0, at: 515, kind: "order_won" as const, order: order() }
  await d.handle(won)
  await d.handle(won)
  assert.equal(d.outbox.filter(a => a.type === "post").length, 1)
  const delivered = { seq: 1, at: 800, kind: "delivered" as const, orderId: "R1", leg: 0, gigId: "g1", placeId: "b" }
  await d.handle(delivered)
  await d.handle(delivered)
  assert.equal(d.trust.get("D1"), 1)
})

test("restart after a failed visit makes exactly one corrected post", async () => {
  const d = desk()
  const snapshot: DeskSnapshot = { worldId: "w1", now: 700, endsAt: 15000, orders: [order()], openRequests: [], gigs: [], driverPositions: [], score: { marginCents: 0, revenueCents: 0, marginShare: 0, wonOrders: 1, onTimeShare: 1, undeliveredShare: 0, ranked: true } }
  await d.rejoin(snapshot, [
    { seq: 0, at: 500, kind: "price_request", request: request() },
    { seq: 1, at: 600, kind: "visit_failed", orderId: "R1", leg: 0, gigId: "g1", reason: "no_plates" },
  ])
  const posts = d.outbox.filter(a => a.type === "post")
  assert.equal(posts.length, 1)
  assert.equal(posts[0]!.stops[0]!.withPlates, true)
  await d.tick()
  assert.equal(d.outbox.filter(a => a.type === "post").length, 1)
})

test("invalid tuning settings fail before a world is created", () => {
  assert.throws(() => validateSettings({ margin: 1 }))
  assert.throws(() => validateSettings({ fee: NaN }))
  assert.throws(() => validateSettings({ capacity: -1 }))
  assert.throws(() => validateSettings({ fees: 1 }))
  assert.throws(() => validateSettings(null))
})

test("a same-day queue limit preserves later delivery choices", () => {
  const d = desk()
  d.settings.backlog = 0.5
  d.settings.sameDayBacklog = 2
  d.quote(request("R1"))
  d.quote(request("R2"))
  d.quote(request("R3"))
  const action = d.outbox.at(-1)!
  assert.equal(action.type, "quote")
  if (action.type !== "quote") return
  assert.equal(action.prices.same_day, undefined)
  assert.ok(action.prices.next_day && action.prices.next_day < 100_000_000)
})

test("robust pickup cutoffs reach the gig, with late recovery still possible", async () => {
  const d = desk()
  d.settings.safetySlack = true
  d.requests.set("R1", request())
  const o = order()
  await d.post(o, [0])
  const onTime = d.outbox.shift()!
  assert.equal(onTime.type, "post")
  if (onTime.type !== "post") return
  assert.equal(onTime.stops[0]!.window!.to, 898)
  d.now = 1000
  await d.post(o, [0])
  const late = d.outbox.shift()!
  assert.equal(late.type, "post")
  if (late.type === "post") assert.equal(late.stops[0]!.window, undefined)
})

test("an unbooked reroute is repriced for the new driving work", async () => {
  const d = desk()
  const r = request()
  r.legs[0]!.delivery.placeId = "a"
  r.referenceFeeCents = 1500
  d.requests.set(r.id, r)
  const original = order(r)
  const oldFee = d.feesFor(original, 1)[0]!.feeCents
  const changed = structuredClone(original)
  changed.legs[0]!.delivery.placeId = "b"
  const newFee = d.feesFor(changed, 1)[0]!.feeCents
  assert(newFee > oldFee * 2)
  assert.equal(r.legs[0]!.delivery.placeId, "a")
  d.orders.set(original.id, original)
  await d.change(changed)
  const post = d.outbox.find(a => a.type === "post")!
  assert.equal(post.type, "post")
  if (post.type === "post") assert.equal(post.schedule[0]!.feeCents, newFee)
})
