import test from "node:test"
import assert from "node:assert/strict"
import { DemandModel } from "../src/optimizer.ts"
import { PlaceDemandModel } from "../src/place-market.ts"
import { placePrior } from "../src/place-prior.ts"

const features = { day: 0, origin: "a", destination: "b", dealer: "D1", km: 150 }

test("zero prior weight reproduces the original online model exactly", () => {
  const original = new DemandModel()
  const prior = new PlaceDemandModel({}, 0)
  for (let i = 0; i < 50; i++) {
    const f = { ...features, day: i % 5, origin: `o${i % 3}`, dealer: `d${i % 7}` }
    const ratio = 1.1 + (i % 5) / 10
    assert.equal(prior.probability(f, ratio), original.probability(f, ratio))
    assert.deepEqual(prior.optimize(f, { costCents: 5000, listPriceCents: 10000, trust: 1.1 }), original.optimize(f, { costCents: 5000, listPriceCents: 10000, trust: 1.1 }))
    prior.observe(f, ratio, i % 2 === 0)
    original.observe(f, ratio, i % 2 === 0)
  }
})

test("place offsets affect learning consistently with their prior threshold", () => {
  const prior = new PlaceDemandModel({}, 1, { intercept: 0, "origin:a": 0.1, "destination:b": -0.05 })
  const equivalent = new DemandModel({ threshold: 1.45 })
  assert.ok(Math.abs(prior.threshold(features) - 1.45) < 1e-12)
  for (let i = 0; i < 20; i++) {
    const ratio = i === 0 ? 0.01 : 1.5
    prior.observe(features, ratio, i % 3 === 0)
    equivalent.observe(features, ratio, i % 3 === 0)
    assert.ok(Math.abs(prior.probability(features, 1.5) - equivalent.probability(features, 1.5)) < 1e-12)
  }
})

test("training provenance excludes frontier and future validation worlds", () => {
  assert.equal(placePrior.trainingWorlds.length, 24)
  assert.equal(new Set(placePrior.trainingWorlds.map(row => row.worldId)).size, 24)
  assert.equal(placePrior.quoteCount, 11313)
  assert.ok(placePrior.trainingWorlds.every(row => !row.seed.startsWith("frontier")))
  assert.throws(() => new PlaceDemandModel({}, -1))
})
