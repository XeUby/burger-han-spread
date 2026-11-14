import { test } from "node:test"
import assert from "node:assert/strict"
import { Desk } from "../src/desk.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, Order, PostAction, PriceRequest } from "../vendor/typescript/types.ts"

class TestDesk extends Desk {
  quote(_request: PriceRequest): void {}
  feesFor(_order: Order, cars: number) { return [{ at: this.now, feeCents: 1000 * cars }] }
  async post(order: Order, legs: number[]): Promise<void> {
    this.outbox.push({ type: "post", stops: legs.flatMap(leg => [{ orderId: order.id, leg, kind: "pickup" as const }, { orderId: order.id, leg, kind: "delivery" as const }]), audience: { experienced: false, manualLicence: false }, schedule: this.feesFor(order, legs.length) })
  }
}

function fixture(refuse = false) {
  const calls: Action[][] = []
  const world = { act: async (actions: Action[]): Promise<ActionResult[]> => {
    calls.push(structuredClone(actions))
    return actions.map(action => refuse ? { ok: false, reason: "Gig booked concurrently" } : { ok: true, id: action.type === "post" ? "queued" : "g" })
  } } as unknown as World
  const desk = new TestDesk(world, 8, 600)
  const stop = { placeId: "a", privateAddress: false, hours: null, window: { from: 500, to: 1200 } }
  for (const id of ["a", "b"]) desk.orders.set(id, { id, dealerId: "dealer", option: "same_day", priceCents: 5000, deadline: 1200, lastPickupAt: 1100, status: "waiting", deliveredAt: [null], legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: stop }] })
  const post: PostAction = { type: "post", stops: ["a", "b"].flatMap(orderId => [{ orderId, leg: 0, kind: "pickup" as const, withPlates: true, window: { from: 500, to: 1000 } }, { orderId, leg: 0, kind: "delivery" as const, window: { from: 500, to: 1100 } }]), audience: { experienced: true, manualLicence: true }, schedule: [{ at: 500, feeCents: 4000 }, { at: 700, feeCents: 6000 }, { at: 900, feeCents: 8000 }] }
  desk.carry(post, "g")
  return { desk, calls, post }
}

test("withdrawing a shared gig clears every contained order, while a refused withdrawal preserves all", async () => {
  const { desk } = fixture()
  assert.equal(await desk.withdraw("b"), true)
  assert.deepEqual(desk.gigsOf("a"), [])
  assert.deepEqual(desk.gigsOf("b"), [])
  assert.equal(desk.posts.has("g"), false)
  const failed = fixture(true).desk
  assert.equal(await failed.withdraw("b"), false)
  assert.deepEqual(failed.gigsOf("a"), ["g"])
  assert.deepEqual(failed.gigsOf("b"), ["g"])
})

test("expiry splits survivors into single-car posts and never duplicates an already delivered car", () => {
  const { desk } = fixture()
  desk.repost("g")
  assert.equal(desk.outbox.length, 2)
  for (const action of desk.outbox) {
    assert.equal(action.type, "post")
    if (action.type !== "post") continue
    assert.equal(new Set(action.stops.map(stop => stop.orderId)).size, 1)
    assert.equal(action.stops.length, 2)
    assert(action.stops.every(stop => stop.window === undefined))
    assert.equal(action.stops[0]!.withPlates, true)
    assert.equal(action.schedule[0]!.feeCents, 1000)
  }
  assert.deepEqual(desk.gigsOf("a"), [])
  assert.deepEqual(desk.gigsOf("b"), [])
  desk.repost("g")
  assert.equal(desk.outbox.length, 2)
  const partial = fixture().desk
  partial.delivered("a", 0, 590)
  partial.repost("g")
  assert.equal(partial.outbox.length, 1)
  assert.equal(partial.outbox[0]!.type === "post" && partial.outbox[0]!.stops[0]!.orderId, "b")
})

test("cancellation clears a withdrawn survivor mapping even if policy already removed the post", async () => {
  const { desk } = fixture()
  desk.posts.delete("g")
  desk.booked.add("g")
  await desk.handle({ seq: 1, at: 600, kind: "order_cancelled", orderId: "a", gigs: [{ gigId: "g", outcome: "released" }] })
  assert.equal(desk.orders.has("a"), false)
  assert.equal(desk.orders.has("b"), true)
  assert.deepEqual(desk.gigsOf("b"), [])
  assert.equal(desk.booked.has("g"), false)
  const continued = fixture().desk
  await continued.handle({ seq: 1, at: 600, kind: "order_cancelled", orderId: "a", gigs: [{ gigId: "g", outcome: "continues" }] })
  assert.deepEqual(continued.gigsOf("b"), ["g"])
})

test("changing a member withdraws the entire unbooked bundle and leaves the other member recoverable", async () => {
  const { desk } = fixture()
  await desk.change({ ...desk.orders.get("b")!, deadline: 1300 })
  assert.deepEqual(desk.gigsOf("a"), [])
  assert.deepEqual(desk.gigsOf("b"), [])
  assert.equal(desk.outbox.length, 1)
  assert.equal(desk.outbox[0]!.type === "post" && desk.outbox[0]!.stops[0]!.orderId, "b")
})

test("raising either bundle member preserves the bundle schedule instead of multiplying one order fee", async () => {
  const { desk } = fixture()
  await desk.raise("b")
  assert.deepEqual(desk.outbox, [{ type: "reprice", gigId: "g", schedule: [{ at: 600, feeCents: 4000 }, { at: 700, feeCents: 6000 }, { at: 900, feeCents: 8000 }] }])
  desk.now = 750
  assert.deepEqual(desk.feesForPost(desk.posts.get("g")!), [{ at: 750, feeCents: 6000 }, { at: 900, feeCents: 8000 }])
})

test("a second member can flush a queued bundle, and cancellation removes a not-yet-posted bundle", async () => {
  const { desk, post, calls } = fixture()
  desk.legGigs.clear()
  desk.posts.clear()
  desk.outbox.push(post)
  await desk.sendPostOf("b")
  assert.equal(calls.length, 1)
  assert.deepEqual(desk.gigsOf("b"), ["queued"])
  const pending = fixture()
  pending.desk.outbox.push(pending.post)
  await pending.desk.handle({ seq: 1, at: 600, kind: "order_cancelled", orderId: "b", gigs: [{ gigId: "g", outcome: "withdrawn" }] })
  assert.equal(pending.desk.outbox.length, 0)
})
