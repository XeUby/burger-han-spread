import test from "node:test"
import assert from "node:assert/strict"
import { anchorTransport } from "./transport.ts"
import { Unreachable } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { Action, PostAction } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

const post: PostAction = { type: "post", stops: [{ orderId: "r", leg: 0, kind: "pickup" }, { orderId: "r", leg: 0, kind: "delivery" }], audience: { experienced: false, manualLicence: false }, schedule: [{ at: 0, feeCents: 10000 }, { at: 100, feeCents: 20000 }] }
test("every anchor arm restores original fees before advancing and returns original acknowledgements", async () => {
  for (const factor of [.5, 1, 2]) {
    const calls: unknown[] = []
    const raw = { act: async (actions: Action[]) => { calls.push(structuredClone(actions)); return actions.map(() => ({ ok: true, id: "g1" })) }, advance: async (target: unknown) => { calls.push(target); return { now: 10, events: [], results: [] } } } as unknown as World
    const world = anchorTransport(raw, factor, () => {})
    const result = await world.advance({ to: 10, actions: [post] })
    assert.deepEqual(calls, [[{ ...post, schedule: post.schedule.map(step => ({ ...step, feeCents: step.feeCents * factor })) }], [{ type: "reprice", gigId: "g1", schedule: post.schedule }], { to: 10 }])
    assert.deepEqual(result.results, [{ ok: true, id: "g1" }])
    assert.equal(post.schedule[0]!.feeCents, 10000)
  }
})

test("a failed restoration stops the practice clock and retains the failed acknowledgement", async () => {
  let calls = 0, advanced = false
  const records: unknown[] = []
  const raw = { act: async () => ++calls === 1 ? [{ ok: true, id: "g1" }] : [{ ok: false, reason: "restore refused" }], advance: async () => { advanced = true } } as unknown as World
  await assert.rejects(anchorTransport(raw, 2, row => records.push(row)).advance({ to: 10, actions: [post] }), /Anchor transport stopped/)
  assert.equal(advanced, false)
  assert(records.some(row => JSON.stringify(row).includes("restore refused")))
})

test("a missing post acknowledgement cannot advance with an unknown temporary fee", async () => {
  let advanced = false
  const raw = { act: async () => [], advance: async () => { advanced = true } } as unknown as World
  await assert.rejects(anchorTransport(raw, 2, () => {}).advance({ to: 10, actions: [post] }), /Missing action acknowledgements/)
  assert.equal(advanced, false)
})

test("an uncertain clock advance stops the probe instead of entering automatic recovery", async () => {
  const raw = { act: async () => [], advance: async () => { throw new Unreachable(0, "reply lost") } } as unknown as World
  await assert.rejects(anchorTransport(raw, 2, () => {}).advance({ to: 10 }), error => error instanceof Error && !(error instanceof Unreachable) && error.message.includes("Anchor advance stopped"))
})
