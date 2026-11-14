import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { practice } from "../src/run.ts"
import { DemandModel } from "../src/optimizer.ts"
import { Dispatcher } from "../src/policy.ts"
import { Unreachable } from "../vendor/typescript/spread.ts"
import type { Client } from "../vendor/typescript/spread.ts"
import type { Action, Advance, DeskEvent, DeskSnapshot, DriverProfile, Gig, Order, PriceRequest, Score, WorldMap } from "../vendor/typescript/types.ts"

const hours = { opens: 420, closes: 1260, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(id: string, at = 500): PriceRequest {
  const stop = { placeId: "a", privateAddress: false, hours, window: { from: 500, to: 1200 } }
  return { id, dealerId: "D1", arrivedAt: at, respondBy: at + 15, batchId: null, note: null, referenceFeeCents: 2500,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: stop }],
    options: [{ kind: "same_day", deadline: 1200, listPriceCents: 5000 }],
  }
}
const map: WorldMap = { places: [], roads: [{ from: "a", to: "a", km: 12, minutes: 25 }] }
const drivers: DriverProfile[] = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual", drops: 0 }))
const score: Score = { marginCents: 4000, revenueCents: 6500, marginShare: 4000 / 6500, wonOrders: 1, onTimeShare: 1, undeliveredShare: 0, ranked: true }

test("practice recovers unknown commits, preserves learned state and provenance, and writes pristine events", async t => {
  const directory = await mkdtemp(join(tmpdir(), "spread-recovery-"))
  const previousDirectory = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }) })
  const requests = [request("R1"), request("R2"), request("R3", 540)]
  const events: DeskEvent[] = requests.slice(0, 2).map((request, seq) => ({ seq, at: 500, kind: "price_request", request }))
  let orders: Order[] = []
  let gigs: Gig[] = []
  let now = 500
  let stage = 0
  let failedRead = false
  let creates = 0
  const sent: Action[] = []
  const observations: { model: DemandModel; won: boolean }[] = []
  const recoveredDesks: Dispatcher[] = []
  let joined = 0
  const rejoin = Dispatcher.prototype.rejoin
  t.mock.method(Dispatcher.prototype, "rejoin", async function (this: Dispatcher, ...args: Parameters<Dispatcher["rejoin"]>) {
    await rejoin.apply(this, args)
    if (!joined++) {
      this.offerCount.set("0:d0", 3)
      this.homeOffersSent.set("prior-gig", 3)
      this.offers.set("prior-gig", [{ driver: "d0", until: 600 }])
      this.offeredDrivers.set("prior-gig", new Set(["d0"]))
    } else recoveredDesks.push(this)
  })
  const observe = DemandModel.prototype.observe
  t.mock.method(DemandModel.prototype, "observe", function (this: DemandModel, ...args: Parameters<DemandModel["observe"]>) {
    observations.push({ model: this, won: args[2] })
    return observe.apply(this, args)
  })
  const snapshot = (): DeskSnapshot => structuredClone({ worldId: "test-recovery", now, endsAt: 800, orders, gigs, openRequests: stage === 0 ? requests.slice(0, 2) : [], driverPositions: [], score })
  const world = {
    id: "test-recovery",
    roster: async () => drivers,
    snapshot: async () => snapshot(),
    events: async () => {
      if (stage === 1 && !failedRead) { failedRead = true; throw new Unreachable(0, "Transient read 503") }
      return structuredClone(events)
    },
    score: async () => score,
    reveal: async () => ({ requests: [], orders: [], views: [] }),
    act: async () => { throw new Error("No internal act expected in this fixture") },
    advance: async ({ actions = [] }: Advance) => {
      sent.push(...structuredClone(actions))
      if (stage === 0) {
        const quote = actions.find(action => action.type === "quote" && action.requestId === "R1")
        assert.equal(quote?.type, "quote")
        if (quote?.type !== "quote") throw new Error("Missing first quote")
        orders = [{ id: "R1", dealerId: "D1", option: "same_day", priceCents: quote.prices.same_day!, deadline: 1200, legs: requests[0]!.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1175 }]
        events.push({ seq: 2, at: 515, kind: "order_won", order: structuredClone(orders[0]!) }, { seq: 3, at: 515, kind: "order_lost", requestId: "R2" })
        now = 515
        stage++
        // R1 committed; R2 was never submitted. Neither action's acknowledgement reached the client.
        throw new Unreachable(0, "Quote acknowledgement lost")
      }
      if (stage === 1) {
        const post = actions.find(action => action.type === "post")
        assert.equal(post?.type, "post")
        if (post?.type !== "post") throw new Error("Missing post")
        gigs = [{ id: "g1", status: "booked", postedAt: 515, feeCents: 2500, driverId: "d1", stops: structuredClone(post.stops), audience: post.audience, schedule: post.schedule }]
        events.push({ seq: 4, at: 516, kind: "gig_booked", gigId: "g1", driverId: "d1", feeCents: 2500 })
        now = 516
        stage++
        throw new Unreachable(0, "Post committed; acknowledgement lost")
      }
      if (stage === 2) {
        assert.equal(actions.some(action => action.type === "post"), false)
        now = 540
        const event: DeskEvent = { seq: 5, at: 540, kind: "price_request", request: requests[2]! }
        events.push(event)
        stage++
        return { now, results: [], events: [structuredClone(event)] }
      }
      if (stage === 3) {
        assert.equal(actions[0]?.type, "quote")
        const event: DeskEvent = { seq: 6, at: 555, kind: "order_lost", requestId: "R3" }
        events.push(event)
        now = 555
        stage++
        return { now, results: actions.map(() => ({ ok: true as const, id: "R3" })), events: [structuredClone(event)] }
      }
      orders[0]!.status = "delivered"
      orders[0]!.deliveredAt[0] = 750
      gigs[0]!.status = "done"
      const delivered: DeskEvent = { seq: 7, at: 750, kind: "delivered", orderId: "R1", leg: 0, gigId: "g1", placeId: "a" }
      events.push(delivered)
      now = 800
      return { now, results: [], events: [structuredClone(delivered)] }
    },
  }
  const client = { create: async () => { creates++; return world }, map: async () => map } as unknown as Client
  assert.deepEqual(await practice(client, { seed: "recovery-fixture", label: "test-provenance", settings: { adaptive: true } }), score)
  assert.equal(creates, 1)
  assert.equal(sent.filter(action => action.type === "post").length, 1)
  assert.deepEqual(observations.map(observation => observation.won), [true, false])
  assert.equal(observations[0]!.model, observations[1]!.model)
  assert.equal(recoveredDesks.length, 2)
  for (const d of recoveredDesks) {
    assert.equal(d.offerCount.get("0:d0"), 3)
    assert.equal(d.homeOffersSent.get("prior-gig"), 3)
    assert.equal(d.offeredDrivers.get("prior-gig")!.has("d0"), true)
    assert.deepEqual(d.offers.get("prior-gig"), [{ driver: "d0", until: 600 }])
  }
  const saved: DeskEvent[] = JSON.parse(await readFile("runs/test-recovery.events.json", "utf8"))
  assert.deepEqual(saved.map(event => event.seq), [0, 1, 2, 3, 4, 5, 6, 7])
  const won = saved.find(event => event.kind === "order_won")!
  if (won.kind !== "order_won") throw new Error("Missing won event")
  assert.equal(won.order.status, "waiting")
  assert.deepEqual(won.order.deliveredAt, [null])
  const meta = JSON.parse(await readFile("runs/test-recovery.meta.json", "utf8"))
  const result = JSON.parse((await readFile("runs/results.jsonl", "utf8")).trim())
  const hash = createHash("sha256")
  for (const file of (await readdir(new URL("../src", import.meta.url))).filter(file => file.endsWith(".ts")).sort()) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8")
    hash.update(file).update(source)
    assert.equal(await readFile(`runs/sources/${meta.revision}/${file}`, "utf8"), source)
  }
  assert.equal(meta.revision, hash.digest("hex"))
  assert.equal(result.revision, meta.revision)
  assert.equal(meta.seed, "recovery-fixture")
  assert.equal(meta.label, "test-provenance")
  assert.equal(JSON.parse(await readFile("runs/test-recovery.recoveries.json", "utf8")).length, 2)
})

test("successful status reads do not restart the recovery budget when advances keep failing", async t => {
  const directory = await mkdtemp(join(tmpdir(), "spread-recovery-bound-"))
  const previousDirectory = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }) })
  let clock = 0
  let attempts = 0
  t.mock.method(Date, "now", () => clock)
  const snapshot: DeskSnapshot = { worldId: "test-bound", now: 500, endsAt: 800, orders: [], gigs: [], openRequests: [], driverPositions: [], score }
  const world = {
    id: "test-bound", roster: async () => drivers, snapshot: async () => structuredClone(snapshot), events: async () => [],
    advance: async () => {
      if (++attempts > 2) throw new Error("Recovery budget restarted after successful reads")
      clock += 60_001
      throw new Unreachable(0, "Advance remains unavailable")
    },
  }
  const client = { create: async () => world, map: async () => map } as unknown as Client
  await assert.rejects(practice(client, { seed: "bounded-recovery" }), /recovery exceeded 60 seconds/)
  assert.equal(attempts, 2)
  assert.equal(JSON.parse(await readFile("runs/test-bound.recoveries.json", "utf8")).length, 1)
  await assert.rejects(readFile("runs/results.jsonl", "utf8"), /ENOENT/)
})

test("ordinary delivery cannot mutate the saved order_won event", async t => {
  const directory = await mkdtemp(join(tmpdir(), "spread-pristine-log-"))
  const previousDirectory = process.cwd()
  process.chdir(directory)
  t.after(async () => { process.chdir(previousDirectory); await rm(directory, { recursive: true, force: true }) })
  const r = request("R1")
  const order: Order = { id: r.id, dealerId: r.dealerId, option: "same_day", priceCents: 6500, deadline: 1200, legs: r.legs, status: "waiting", deliveredAt: [null], lastPickupAt: 1175 }
  let stage = 0
  let now = 500
  const world = {
    id: "test-pristine", roster: async () => drivers, score: async () => score,
    reveal: async () => ({ requests: [], orders: [], views: [] }),
    events: async () => [{ seq: 0, at: 500, kind: "price_request", request: r }],
    snapshot: async () => structuredClone({ worldId: "test-pristine", now, endsAt: 800, orders: stage ? [order] : [], gigs: [], openRequests: stage ? [] : [r], driverPositions: [], score }),
    advance: async ({ actions = [] }: Advance) => {
      if (!stage++) {
        now = 515
        return { now, results: actions.map(() => ({ ok: true as const, id: "R1" })), events: [{ seq: 1, at: 515, kind: "order_won" as const, order: structuredClone(order) }] }
      }
      if (stage === 2) {
        now = 516
        return { now, results: actions.map(() => ({ ok: true as const, id: "g1" })), events: [{ seq: 2, at: 516, kind: "gig_booked" as const, gigId: "g1", driverId: "d1", feeCents: 2500 }] }
      }
      order.status = "delivered"
      order.deliveredAt[0] = 750
      now = 800
      return { now, results: [], events: [{ seq: 3, at: 750, kind: "delivered" as const, orderId: "R1", leg: 0, gigId: "g1", placeId: "a" }] }
    },
  }
  const client = { create: async () => world, map: async () => map } as unknown as Client
  await practice(client, { seed: "pristine-history" })
  const events: DeskEvent[] = JSON.parse(await readFile("runs/test-pristine.events.json", "utf8"))
  const won = events.find(event => event.kind === "order_won")!
  if (won.kind !== "order_won") throw new Error("Missing won event")
  assert.equal(won.order.status, "waiting")
  assert.deepEqual(won.order.deliveredAt, [null])
  const final: DeskSnapshot = JSON.parse(await readFile("runs/test-pristine.snapshot.json", "utf8"))
  assert.equal(final.orders[0]!.status, "delivered")
  assert.deepEqual(final.orders[0]!.deliveredAt, [750])
})
