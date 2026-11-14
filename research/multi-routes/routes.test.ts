import test from "node:test"
import assert from "node:assert/strict"
import { Network } from "../../src/planning.ts"
import { planBundles } from "../../src/bundles.ts"
import type { BundleCandidate } from "../../src/bundles.ts"
import { limits, makeRoute, planRoutes, selectRoutes } from "./routes.ts"
import type { Route } from "./routes.ts"

const places = ["A", "B", "C", "D", "E", "F"]
const network = new Network({ places: [], roads: places.flatMap(from => places.map(to => ({ from, to, km: from === to ? 0 : 20, minutes: from === to ? 0 : 20 }))) })
function candidate(id: string, pickup = "A", delivery = "B"): BundleCandidate {
  const place = (placeId: string) => ({ placeId, privateAddress: false, window: { from: 480, to: 1200 }, hours: { opens: 480, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null } })
  return { noteSafe: true, order: { id, dealerId: "D1", option: "same_day", deadline: 1200, priceCents: 9000, status: "waiting", deliveredAt: [null], lastPickupAt: 1150, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: place(pickup), delivery: place(delivery) }] }, post: { type: "post", stops: [{ orderId: id, leg: 0, kind: "pickup" }, { orderId: id, leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 480, feeCents: 5000 }, { at: 1000, feeCents: 12500 }] } }
}

test("two-car restriction reproduces the existing pair timing and fee", () => {
  const candidates = [candidate("a"), candidate("b", "B", "A")]
  const old = planBundles(480, candidates, network)[0]!
  const fresh = planRoutes(480, candidates, network, { maxCars: 2, connectorKm: 30, savingsShare: 0.5, maxDiscount: 0.2, singlePayout: 1 }).selected[0]!
  assert.deepEqual(fresh.post, old.post)
  assert.equal(fresh.feeSavingCents, old.feeSavingCents)
  assert.equal(fresh.savedWorkMinutes, old.savedWorkMinutes)
})

test("three-car routes save more than a pair and an unbundled single", () => {
  const candidates = [candidate("a"), candidate("b", "B", "C"), candidate("c", "C", "A")]
  const result = planRoutes(480, candidates, network)
  assert.equal(result.selected[0]?.indices.length, 3)
  const pair = planRoutes(480, candidates, network, { maxCars: 2 })
  assert.ok(result.selected[0]!.feeSavingCents > pair.selected[0]!.feeSavingCents)
  assert.equal(result.selected[0]!.post.stops.length, 6)
  assert.equal(result.truncated, false)
})

test("time windows, charging and the twelve-hour driving cap constrain routes", () => {
  const candidates = [candidate("a"), candidate("b", "C", "D"), candidate("c", "E", "F")]
  candidates[2]!.order.legs[0]!.pickup.window = { from: 480, to: 500 }
  assert.equal(makeRoute(480, [0, 1, 2], candidates, network, limits), null)
  const long = new Network({ places: [], roads: places.flatMap(from => places.map(to => ({ from, to, km: from === to ? 0 : 250, minutes: from === to ? 0 : 250 }))) })
  assert.equal(makeRoute(480, [0, 1, 2], candidates, long, limits), null)
  candidates[0]!.order.legs[0]!.car = { premium: false, electric: true, chargePercent: 20 }
  assert.equal(planRoutes(480, candidates.slice(0, 2), long, { connectorKm: 300 }).selected.length, 0)
})

test("exact packing avoids a locally best route that blocks two better routes", () => {
  const route = (indices: number[], feeSavingCents: number) => ({ indices, feeSavingCents } as Route)
  const candidates = [route([0, 1, 2], 100), route([0, 3], 70), route([1, 2, 4], 60)]
  assert.equal(selectRoutes(candidates, 5).reduce((sum, item) => sum + item.feeSavingCents, 0), 130)
})

test("exact packing agrees with exhaustive subset search", () => {
  const routes = Array.from({ length: 10 }, (_, i) => ({ indices: [...new Set([i % 7, (i*3 + 2) % 7, (i*5 + 4) % 7])], feeSavingCents: 10 + (i*37) % 91 } as Route))
  let optimum = 0
  for (let mask = 0; mask < 1 << routes.length; mask++) {
    const used = new Set<number>(); let total = 0, valid = true
    routes.forEach((route, i) => {
      if (!(mask & 1 << i)) return
      if (route.indices.some(index => used.has(index))) valid = false
      route.indices.forEach(index => used.add(index)); total += route.feeSavingCents
    })
    if (valid) optimum = Math.max(optimum, total)
  }
  assert.equal(selectRoutes(routes, 7).reduce((sum, row) => sum + row.feeSavingCents, 0), optimum)
})

test("bounded search reports truncation and never puts an order in two routes", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => candidate(`r${i}`))
  const result = planRoutes(480, candidates, network, { expansionLimit: 5 })
  assert.ok(result.truncated)
  assert.equal(result.expansions, 5)
  const ids = result.selected.flatMap(route => route.orderIds)
  assert.equal(ids.length, new Set(ids).size)
  const duplicated = planRoutes(480, [candidate("same"), candidate("same")], network)
  assert.equal(duplicated.selected.length, 0)
})
