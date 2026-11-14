import test from "node:test"
import assert from "node:assert/strict"
import { Network } from "../../src/planning.ts"
import { planTimedLeg } from "../../src/hours-plan.ts"
import type { Leg } from "../../vendor/typescript/types.ts"
import type { TimedNote } from "../../src/hours-note.ts"

const network = new Network({ places: [], roads: [{ from: "a", to: "b", km: 250, minutes: 120 }] })
const hours = { opens: 420, closes: 1260, weekdays: [0, 1, 2, 3, 4], saturday: { opens: 480, closes: 960 } }
const leg: Leg = { car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: "a", privateAddress: false, hours, window: { from: 420, to: 4320 } }, delivery: { placeId: "b", privateAddress: false, hours, window: { from: 420, to: 4320 } } }
const note: TimedNote = { safe: true, manual: false, plates: false, pickup: { opens: 540, closes: 960 }, delivery: { opens: 600, closes: 1020 } }

test("explicit windows obey actual hours and leave enough driving time", () => {
  const plan = planTimedLeg(leg, note, 1200, 500, network)!
  assert.equal(plan.travelMinutes, 158)
  assert.deepEqual(plan.pickup, { from: 540, to: 861 })
  assert.deepEqual(plan.delivery, { from: 698, to: 1019 })
  assert.equal(plan.pickup.to + plan.travelMinutes, plan.delivery.to)
})

test("readiness, charging, and plates all consume feasible time", () => {
  const electric = { ...leg, car: { ...leg.car, electric: true, chargePercent: 10 } }
  const parsed = { ...note, readyAt: 800, plates: true }
  assert.equal(planTimedLeg(electric, parsed, 1200, 500, network), null)
  const tomorrow = planTimedLeg(electric, parsed, 2640, 500, network)!
  assert.equal(tomorrow.travelMinutes, 228)
  assert.ok(tomorrow.delivery.to < 2 * 1440)
  assert.ok(tomorrow.pickup.from >= parsed.readyAt)
})

test("closed windows do not silently expand and private jobs remain excluded", () => {
  assert.equal(planTimedLeg(leg, note, 1200, 900, network), null)
  assert.equal(planTimedLeg({ ...leg, pickup: { ...leg.pickup, privateAddress: true } }, note, 1200, 500, network), null)
  const saturday = 5 * 1440
  const weekendLeg = { ...leg, pickup: { ...leg.pickup, window: { from: saturday + 480, to: saturday + 960 } } }
  assert.equal(planTimedLeg(weekendLeg, note, saturday + 960, saturday + 480, network), null)
})
