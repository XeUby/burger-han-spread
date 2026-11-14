import test from 'node:test'
import assert from 'node:assert/strict'
import { Network } from '../../src/planning.ts'
import type { PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'
import { buildGraph } from './candidates.ts'
import { interpret } from './constraints.ts'
import { portfolioValue } from './value.ts'

const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const map: WorldMap = { places: [], roads: ['a', 'b', 'c'].flatMap(from => ['a', 'b', 'c'].map(to => ({ from, to, km: from === to ? 0 : 220, minutes: from === to ? 0 : 100 }))) }
const network = new Network(map)
function request(id = 'one', reverse = false): PriceRequest {
  const stop = { privateAddress: false, hours, window: { from: 500, to: 2640 } }
  return { id, dealerId: 'dealer', batchId: null, arrivedAt: 500, respondBy: 515, note: null, referenceFeeCents: 20000,
    legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { ...structuredClone(stop), placeId: reverse ? 'b' : 'a' }, delivery: { ...structuredClone(stop), placeId: reverse ? 'a' : 'b' } }],
    options: [{ kind: 'same_day', deadline: 1200, listPriceCents: 1000 }, { kind: 'next_day', deadline: 2640, listPriceCents: 900 }] }
}

test('costly standalone requests still generate joint acquisition and every fallback', () => {
  const graph = buildGraph([request('out'), request('back', true)], 500, 8, network)
  assert.equal(graph.options.length, 4)
  assert(graph.pairs.length > 0)
  for (const pair of graph.pairs) {
    assert.notEqual(graph.options.find(o => o.id === pair.first)!.requestId, graph.options.find(o => o.id === pair.second)!.requestId)
    assert.equal(pair.fallback.length, 2)
    assert.equal(pair.route.visits.length, 4)
  }
  const cheaper = [request('out'), request('back', true)].map(r => ({ ...r, referenceFeeCents: 1 }))
  assert.deepEqual(buildGraph(cheaper, 500, 8, network), graph)
})

test('private slots are considered but never extended to invent feasibility', () => {
  const r = request()
  r.legs[0]!.delivery = { ...r.legs[0]!.delivery, privateAddress: true, hours: null, window: { from: 700, to: 760 } }
  const graph = buildGraph([r], 500, 8, network)
  assert.equal(graph.options.length, 2)
  assert.deepEqual(graph.options[0]!.route.visits[1]!.stop.window, { from: 700, to: 760 })
  r.legs[0]!.delivery.window = { from: 520, to: 550 }
  assert.equal(buildGraph([r], 500, 8, network).options.length, 0)
})

test('trade-in returns preserve slot, licence, premium and charging restrictions', () => {
  const r = request()
  const first = r.legs[0]!
  first.delivery = { ...first.delivery, privateAddress: true, hours: null, window: { from: 700, to: 760 } }
  r.legs.push({ car: { electric: true, chargePercent: 10, premium: true }, pickup: structuredClone(first.delivery), delivery: structuredClone(first.pickup) })
  r.note = { language: 'en', text: 'Manual transmission. No plates.' }
  const graph = buildGraph([r], 500, 8, network)
  assert(graph.options.length)
  const route = graph.options[0]!.route
  assert.deepEqual(route.audience, { experienced: true, manualLicence: true })
  assert.equal(route.visits[2]!.ref.withCharging, true)
  assert.equal(route.visits[2]!.ref.withPlates, true)
  assert.deepEqual(route.visits[2]!.stop.window, { from: 700, to: 760 })
})

test('low levels cannot escape the actual first option or use unsupported pair routes', () => {
  const a = request(), b = request('two', true)
  a.options[0]!.deadline = 550
  assert.equal(buildGraph([a], 500, 1, network).options.length, 0)
  assert.equal(buildGraph([a], 500, 8, network).options.length, 1)
  assert.equal(buildGraph([b, request('three')], 500, 2, network).pairs.length, 0)
})

test('parsed readiness and site hours survive into every route', () => {
  const r = request()
  r.note = { language: 'en', text: 'Ready for pickup from tomorrow 10am. Receiving 10-16 only.' }
  const parsed = interpret(r, 500, 8)
  assert(parsed.ok)
  assert.equal(parsed.value.deadlineShift, 1440)
  assert.equal(parsed.value.legs[0]!.pickup.window.from, 2040)
  const graph = buildGraph([r], 500, 8, network)
  assert(graph.options.length)
  assert.equal(graph.options[0]!.route.visits[1]!.stop.hours?.closes, 960)
  assert(graph.options.every(o => o.route.earliestDelivery >= 2040))
})

test('unknown corrections abstain rather than silently dropping a denied constraint', () => {
  const r = request()
  r.note = { language: 'en', text: 'Not tomorrow 10am; correction, Thursday 3pm, release after payment.' }
  assert.deepEqual(interpret(r, 500, 8), { ok: false, reason: 'unresolved_note' })
  assert.equal(buildGraph([r], 500, 8, network).omitted[0]!.reason, 'unresolved_note')
})

test('future observations are forbidden and inputs remain unchanged', () => {
  const r = request(), before = structuredClone(r)
  buildGraph([r], 500, 8, network)
  assert.deepEqual(r, before)
  assert.throws(() => buildGraph([{ ...r, arrivedAt: 501 }], 500, 8, network), /Future/)
  assert.equal(buildGraph([r], 515, 8, network).omitted[0]!.reason, 'response_closed')
})

test('candidate budgets expose their omissions and arbitrary identifiers do not change route value', () => {
  const a = request('a'), b = request('b', true)
  const limited = buildGraph([a, b], 500, 8, network, { requests: 1 })
  assert.equal(limited.omitted.filter(o => o.reason === 'request_budget').length, 1)
  const unlimited = buildGraph([a, b], 500, 8, network)
  const capped = buildGraph([a, b], 500, 8, network, { pairRoutes: 1 })
  assert.equal(capped.pairs.length, 1)
  assert.equal(capped.omitted.filter(o => o.reason === 'pair_budget').length, unlimited.pairs.length - 1)
  const renamed = buildGraph([{ ...a, id: 'z' }, { ...b, id: 'q' }], 500, 8, network)
  assert.deepEqual(renamed.pairs.map(p => [p.route.latestStart, p.route.earliestDelivery, p.route.drivingMinutes]), unlimited.pairs.map(p => [p.route.latestStart, p.route.earliestDelivery, p.route.drivingMinutes]))
})

test('partial wins can overturn an attractive both-win route without assuming independent wins', () => {
  const outcome = (revenue: number, fees: number) => ({ revenue, fees, refunds: 0, penalties: 0, capacity: 0, future: 0 })
  const branches = [
    { wins: 'neither' as const, probability: .1, outcome: outcome(0, 0) },
    { wins: 'first' as const, probability: .4, outcome: outcome(100, 180) },
    { wins: 'second' as const, probability: .4, outcome: outcome(100, 180) },
    { wins: 'both' as const, probability: .1, outcome: outcome(200, 100) },
  ]
  assert.equal(portfolioValue(branches), -54)
  assert.throws(() => portfolioValue(branches.slice(1)), /four joint/)
  assert.throws(() => portfolioValue(branches.map(b => ({ ...b, probability: .5 }))), /four joint/)
})
