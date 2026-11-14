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

import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const empty: Portfolio = { now: 0, weights: [1], capacity: [{}], lateBudget: [0], mandatory: [], baseline: [], alternatives: [] }

async function fake(source: string, run: (solver: PortfolioSolver) => Promise<void>, limits = { startupMs: 2000, responseMs: 100 }) {
  const dir = await mkdtemp(join(tmpdir(), "portfolio-bridge-"))
  const script = join(dir, "solver.cjs")
  await writeFile(script, source)
  const solver = new PortfolioSolver(process.execPath, { script, ...limits })
  try { await run(solver) } finally { solver.close(); await rm(dir, { recursive: true, force: true }) }
}

const ready = 'console.log(JSON.stringify({ready:true,version:"9.11.4210"}));'

test("startup can exceed the response budget without spending the decision budget", async () => {
  await fake(`setTimeout(()=>{${ready}},300); require('node:readline').createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({version:'9.11.4210',selected:[]})));`, async solver => {
    const first = solver.solve(empty)
    await assert.rejects(solver.solve(empty), /must finish/)
    assert.deepEqual((await first).selected, [])
    assert.deepEqual((await solver.solve(empty)).selected, [])
  })
})

test("startup and response stalls have separate bounded failures", async () => {
  await fake('process.stdin.resume()', async solver => {
    await assert.rejects(solver.solve(empty), /startup budget/)
    await assert.rejects(solver.solve(empty), /startup budget/)
  }, { startupMs: 100, responseMs: 100 })
  await fake(`${ready} process.stdin.resume()`, async solver => {
    await assert.rejects(solver.solve(empty), /response budget/)
  })
})

test("bad readiness, early exit, and close reject queued work", async () => {
  await fake('console.log(JSON.stringify({ready:true,version:"wrong"})); process.stdin.resume()', async solver => {
    await assert.rejects(solver.solve(empty), /unfrozen solver version/)
  })
  await fake('process.exit(7)', async solver => {
    await assert.rejects(solver.solve(empty), /exited \(7\)/)
  })
  await fake('process.stdin.resume()', async solver => {
    const pending = solver.solve(empty)
    solver.close()
    await assert.rejects(pending, /closed/)
    await assert.rejects(solver.solve(empty), /closed/)
  })
})
