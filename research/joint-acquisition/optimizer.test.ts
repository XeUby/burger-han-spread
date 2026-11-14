import test from "node:test"
import assert from "node:assert/strict"
import { joint, probability, single } from "./optimizer.ts"
import type { Bid } from "./optimizer.ts"

test("joint prices and bounds agree with exhaustive integer search", () => {
  for (const saving of [0, 40, 130]) {
    const a: Bid = { cost: 80, scale: 110, threshold: 1.4, slope: 12, minimum: 50, maximum: 230 }
    const b: Bid = { cost: 65, scale: 80, threshold: 1.3, slope: 8, minimum: 40, maximum: 200 }
    let best = -Infinity
    for (let p = a.minimum; p <= a.maximum; p++) for (let r = b.minimum; r <= b.maximum; r++) {
      const q = probability(a, p), z = probability(b, r)
      best = Math.max(best, q * (p - a.cost) + z * (r - b.cost) + saving * q * z)
    }
    const result = joint(a, b, saving, 0.000001)
    assert.ok(result.expectedProfit <= best + 1e-8)
    assert.ok(result.upperBound >= best - 1e-8)
    assert.ok(best - result.expectedProfit <= 0.000001)
    if (!saving) assert.deepEqual(result.prices, [single(a).price, single(b).price])
  }
})

test("a valuable combined route can justify acquiring a cheap leg below its solo cost", () => {
  const a: Bid = { cost: 4000, scale: 2500, threshold: 1.4, slope: 14, minimum: 1000, maximum: 7000 }
  const b: Bid = { cost: 9000, scale: 10000, threshold: 1.4, slope: 14, minimum: 5000, maximum: 25000 }
  const result = joint(a, b, 5000)
  assert.ok(result.prices[0] < a.cost)
  assert.ok(result.upperBound - result.expectedProfit <= 0.01 + 1e-8)
  assert.ok(result.evaluations < 1000)
})
