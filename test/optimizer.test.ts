import test from "node:test"
import assert from "node:assert/strict"
import { DemandModel, optimalLogisticPrice } from "../src/optimizer.ts"

const features = { day: 0, origin: "helsinki", destination: "tampere", dealer: "D1", km: 180 }

test("logistic pricing finds the same cent optimum as exhaustive search", () => {
  for (const costCents of [0, 60, 150, 220, 270]) {
    const inputs = { costCents, listPriceCents: 150, trust: 1.15, threshold: 1.4, slope: 14, minPrice: 100, maxPrice: 280 }
    const actual = optimalLogisticPrice(inputs)
    const scores = Array.from({ length: 181 }, (_, i) => {
      const price = i + 100
      return (price - costCents) / (1 + Math.exp(14 * (price / (150 * 1.15) - 1.4)))
    })
    assert.ok(Math.abs(actual.expectedProfitCents - Math.max(...scores)) < 1e-10)
    assert.ok(Number.isInteger(actual.priceCents))
  }
})

test("price optimizer prices trust and cost without violating explicit bounds", () => {
  const inputs = { costCents: 8000, listPriceCents: 10000, trust: 1, threshold: 1.4, slope: 14 }
  const original = optimalLogisticPrice(inputs)
  assert.ok(optimalLogisticPrice({ ...inputs, trust: 1.25 }).priceCents > original.priceCents)
  assert.ok(optimalLogisticPrice({ ...inputs, costCents: 12000 }).priceCents > original.priceCents)
  assert.equal(optimalLogisticPrice({ ...inputs, minPrice: 20000, maxPrice: 20001 }).priceCents, 20000)
  assert.throws(() => optimalLogisticPrice({ ...inputs, minPrice: 2, maxPrice: 1 }))
})

test("wins raise and losses lower the learned market threshold", () => {
  const won = new DemandModel()
  const lost = new DemandModel()
  for (let i = 0; i < 20; i++) {
    won.observe(features, 1.4, true)
    lost.observe(features, 1.4, false)
  }
  assert.ok(won.probability(features, 1.4) > 0.9)
  assert.ok(lost.probability(features, 1.4) < 0.1)
  assert.ok(won.probability(features, 1.3) > won.probability(features, 1.5))
})

test("day effects absorb temporary price wars and begin fresh next day", () => {
  const model = new DemandModel()
  for (let i = 0; i < 40; i++) model.observe(features, 1.4, false)
  const today = model.threshold(features)
  const tomorrow = model.threshold({ ...features, day: 1 })
  assert.ok(today < tomorrow)
  assert.ok(tomorrow < 1.4)
  for (let i = 0; i < 40; i++) model.observe({ ...features, day: 1 }, 1.4, true)
  assert.ok(model.threshold({ ...features, day: 1 }) > model.threshold(features))
})

test("market learning remains finite across extreme results and many contexts", () => {
  const model = new DemandModel()
  for (let i = 0; i < 2000; i++) {
    const context = { day: i % 5, origin: `O${i % 12}`, destination: `P${i % 17}`, dealer: `D${i % 8}`, km: i % 500 }
    model.observe(context, i % 2 ? 0.8 : 2, i % 3 === 0)
    const price = model.optimize(context, { costCents: 5000, listPriceCents: 10000, trust: 1.2 })
    assert.ok(Number.isFinite(price.expectedProfitCents))
    assert.ok(price.probability >= 0 && price.probability <= 1)
  }
})
