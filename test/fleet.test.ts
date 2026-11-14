import assert from "node:assert/strict"
import test from "node:test"

import { Fleet, fleetDefaults, levelOf, type Car, type Queue } from "../src/fleet.ts"
import { Network } from "../src/planning.ts"

const map = { roads: [
  { from: "a", to: "b", km: 20, minutes: 25 },
  { from: "a", to: "c", km: 200, minutes: 150 },
  { from: "b", to: "c", km: 210, minutes: 160 },
] } as never
const network = new Network(map)
const fleet = () => new Fleet({ ...fleetDefaults }, network, ["a", "b", "c"], ["a", "a", "b"])

const request = (legs = 1) => ({
  id: "R1", dealerId: "d1", arrivedAt: 600, respondBy: 660, referenceFeeCents: 20_000, note: null,
  options: [{ kind: "next_day", listPriceCents: 30_000, deadline: 2_000 }],
  legs: Array.from({ length: legs }, () => ({ pickup: { placeId: "a", window: { from: 900, to: 1_200 }, privateAddress: false }, delivery: { placeId: "b", window: { from: 900, to: 1_500 }, privateAddress: false }, car: { premium: false, electric: false, chargePercent: null } })),
}) as never
const option = { kind: "next_day", listPriceCents: 30_000, deadline: 2_000 } as never
const empty: Queue = { backlog: 0, going: 1, known: 0, world: 0, late: 0, swing: 0, refunds: 0 }

test("the going fee is the queue's mean once a gig at this multiple joins", () => {
  assert.equal(levelOf({ ...empty, backlog: 3, going: 1 }, 1.3), 1.075)
  assert.equal(levelOf(empty, 1.3), 1.3)
})

test("a car with more slack is expected on time more often and needs a smaller fee", () => {
  const f = fleet()
  const tight = f.car(request(), option, 960, 900)
  const loose = f.car(request(), option, 960 + 48 * 60, 900)
  assert.ok(loose.slack! > tight.slack!)
  assert.ok(f.onTime(loose, 1, empty) > f.onTime(tight, 1, empty))
  const paid = f.fee(tight, 20_000, 16_200, 30_000, empty)
  const cheap = f.fee(loose, 20_000, 16_200, 30_000, empty)
  assert.ok(cheap.multiple <= paid.multiple)
})

test("a lower fee buys a smaller chance of an on-time car", () => {
  const f = fleet()
  const car = f.car(request(), option, 1_000, 900)
  assert.ok(f.onTime(car, 1.5, empty) > f.onTime(car, 0.85, empty))
  assert.ok(f.fee(car, 20_000, 16_200, 30_000, empty).late > 0)
})

test("the cost of a car is at least its fee, and grows as the week runs out of late orders", () => {
  const f = fleet()
  const car = f.car(request(), option, 1_000, 900)
  const calm = f.cost(car, 20_000, 30_000, empty)
  assert.ok(calm >= 0.85 * 20_000)
  f.ordersSoFar = 200
  const tight = f.cost(car, 20_000, 30_000, { ...empty, late: 40 })
  const spent = f.cost(car, 20_000, 30_000, { ...empty, late: 12 })
  assert.ok(tight > spent, "past the target a late order costs more")
  assert.ok(spent > calm, "with 200 orders seen the target is partly spent")
})

test("a trade-in is expected on time less often than a single car of the same route", () => {
  const f = fleet()
  const single = f.car(request(1), option, 1_000, 900)
  const trade = f.car(request(2), option, 1_000, 900)
  assert.equal(trade.trade_in, 1)
  assert.ok(f.onTime(trade, 1, empty) < f.onTime(single, 1, empty))
})

test("drivers near a place count: the supply of a home is the largest", () => {
  const f = fleet()
  assert.ok(f.supply.get("a")! > f.supply.get("c")!)
  assert.ok(f.supply.get("a")! > 0)
})

test("a week whose drivers are worse than the model shifts the chances down", () => {
  const f = fleet()
  const car = f.car(request(), option, 1_000, 900) as Car
  const before = f.onTime(car, 1, empty)
  for (let i = 0; i < 40; i++) { f.forecast.set(`o${i}`, 1.5); f.outcome.set(`o${i}`, 0) }
  const after = f.queueOf([], 40, 0)
  assert.ok(after.world < 0, "the week is worse than the model said")
  assert.ok(1 / (1 + Math.exp(-(f.logit(car, 1, empty) + after.world))) < before)
})
