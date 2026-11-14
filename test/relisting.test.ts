import test from "node:test"
import assert from "node:assert/strict"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, ActionResult, DeskSnapshot, Order, PostAction } from "../vendor/typescript/types.ts"

function fixture(refuse = false) {
  const calls: Action[][] = []
  const world = { act: async (actions: Action[]): Promise<ActionResult[]> => {
    calls.push(structuredClone(actions))
    return actions.map(() => refuse ? { ok: false, reason: "Gig booked concurrently" } : { ok: true, id: "g" })
  } } as unknown as World
  const desk = new Dispatcher(world, 8, 600, { places: [], roads: [] }, [], { relist: true })
  const stop = { placeId: "a", privateAddress: false, hours: null, window: { from: 500, to: 1200 } }
  const order: Order = { id: "r", dealerId: "d", option: "same_day", priceCents: 10000, deadline: 1200, lastPickupAt: 1100, status: "waiting", deliveredAt: [null], legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: stop }] }
  const post: PostAction = { type: "post", stops: [{ orderId: "r", leg: 0, kind: "pickup", withPlates: true, window: { from: 500, to: 1100 } }, { orderId: "r", leg: 0, kind: "delivery" }], audience: { experienced: true, manualLicence: true }, schedule: [{ at: 600, feeCents: 4000 }, { at: 900, feeCents: 6000 }] }
  desk.orders.set(order.id, order)
  desk.carry(post, "g")
  desk.now = 630
  return { desk, calls, order, post }
}

test("relisting keeps every post term and happens at most once per order", async () => {
  const { desk, calls, post } = fixture()
  await desk.tick()
  assert.deepEqual(calls, [[{ type: "withdraw", gigId: "g" }]])
  assert.deepEqual(desk.gigsOf("r"), [])
  assert.deepEqual(desk.outbox, [post])
  const queued = desk.takeActions()
  desk.readResults(queued, [{ ok: true, id: "replacement" }])
  desk.now += 60
  await desk.tick()
  assert.equal(calls.length, 1)
  assert.deepEqual(desk.gigsOf("r"), ["replacement"])
})

test("disabled, booked, shared, young, private, distant-ready and urgent gigs stay untouched", async () => {
  const changes = [
    ({ desk }: ReturnType<typeof fixture>) => { desk.settings.relist = false },
    ({ desk }: ReturnType<typeof fixture>) => { desk.booked.add("g") },
    ({ post }: ReturnType<typeof fixture>) => { post.stops.push({ orderId: "other", leg: 0, kind: "pickup" }) },
    ({ desk }: ReturnType<typeof fixture>) => { desk.now = 629 },
    ({ order }: ReturnType<typeof fixture>) => { order.legs[0]!.pickup = { ...order.legs[0]!.pickup, privateAddress: true } },
    ({ order }: ReturnType<typeof fixture>) => { order.legs[0]!.pickup = { ...order.legs[0]!.pickup, window: { from: 900, to: 1200 } } },
    ({ order }: ReturnType<typeof fixture>) => { order.lastPickupAt = 809 },
    ({ desk }: ReturnType<typeof fixture>) => { desk.outbox.push({ type: "reprice", gigId: "g", schedule: [{ at: 630, feeCents: 5000 }] }) },
  ]
  for (const change of changes) {
    const f = fixture()
    change(f)
    await f.desk.relistOpenGigs()
    assert.equal(f.calls.length, 0)
    assert.equal(f.desk.relisted.size, 0)
  }
})

test("refused withdrawal cannot duplicate a booked gig or retry indefinitely", async () => {
  const { desk, calls } = fixture(true)
  await desk.relistOpenGigs()
  assert.equal(desk.outbox.length, 0)
  assert.deepEqual(desk.gigsOf("r"), ["g"])
  assert.equal(desk.failures.length, 1)
  await desk.relistOpenGigs()
  assert.equal(calls.length, 1)
})

test("restart restores posting time and prevents another attempt after withdrawal", async () => {
  const { desk, post, order, calls } = fixture()
  const snapshot = { now: 660, orders: [order], openRequests: [], gigs: [
    { ...post, id: "old", status: "withdrawn", postedAt: 550, feeCents: 4000, driverId: null },
    { ...post, id: "g", status: "open", postedAt: 630, feeCents: 4000, driverId: null },
  ] } as unknown as DeskSnapshot
  await desk.rejoin(snapshot, [])
  assert.equal(desk.postedAt.get("g"), 630)
  assert.equal(desk.relisted.has("r"), true)
  await desk.relistOpenGigs()
  assert.equal(calls.length, 0)
})
