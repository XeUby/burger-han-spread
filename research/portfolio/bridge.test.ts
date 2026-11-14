import assert from "node:assert/strict"
import test from "node:test"
import { PortfolioSolver } from "./bridge.ts"
import type { Portfolio } from "./bridge.ts"

test("the persistent standard solver rejects future features and then solves a valid next decision", async () => {
  const solver = new PortfolioSolver()
  const problem: Portfolio = {
    now: 10, weights: [1], capacity: [{}], lateBudget: [0], mandatory: [], baseline: [],
    alternatives: [{ id: "q1", observedAt: 11, claims: ["request"], outcomes: [{ revenueCents: 100, fulfillmentCents: 60, refundCents: 10, penaltyCents: 0, futureCents: -5, capacity: {}, late: 0 }] }],
  }
  try {
    await assert.rejects(solver.solve(problem), /Invalid portfolio/)
    problem.alternatives[0]!.observedAt = 10
    const answer = await solver.solve(problem)
    assert.deepEqual(answer.selected, ["q1"])
    assert.equal(answer.expectedCents, 25)
    assert.equal(answer.provenOptimal, true)
    assert.equal(answer.usedBaselineFallback, false)
  } finally { solver.close() }
})
