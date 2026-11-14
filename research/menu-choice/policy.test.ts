import assert from 'node:assert/strict'
import test from 'node:test'
import { Dispatcher } from './policy.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { Action, PriceRequest, DriverProfile, WorldMap } from '../../vendor/typescript/types.ts'
import type { Solution } from '../portfolio/bridge.ts'

const map: WorldMap = { places: [], roads: ['a', 'b'].flatMap(from => ['a', 'b'].map(to => ({ from, to, km: from === to ? 0 : 100, minutes: from === to ? 0 : 70 }))) }
const drivers: DriverProfile[] = Array.from({ length: 80 }, (_, i) => ({ id: `d${i}`, homePlaceId: 'a', licence: 'manual', rating: 4.9, completedGigs: 100, drops: 0 }))
const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
function request(id: string): PriceRequest {
  const stop = { privateAddress: false, hours, window: { from: 500, to: 2640 } }
  return { id, dealerId: 'dealer', arrivedAt: 500, respondBy: 515, batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { ...stop, placeId: 'a' }, delivery: { ...stop, placeId: 'b' } }], options: [{ kind: 'same_day', deadline: 1200, listPriceCents: 12000 }, { kind: 'next_day', deadline: 2640, listPriceCents: 10000 }] }
}
function setup(enabled = true, outcome: 'ok' | 'reject' | 'unknown' = 'ok') {
  const sent: Action[] = []
  const world = { act: async (actions: Action[]) => { sent.push(...structuredClone(actions)); if (outcome === 'unknown') throw new Error('Lost response'); return actions.map(() => outcome === 'ok' ? { ok: true, id: 'ack' } : { ok: false, reason: 'Rejected' }) } } as unknown as World
  const desk = new Dispatcher(world, 8, 500, map, drivers, { portfolio: true, menuChoice: enabled, randomSeed: 27 })
  return { desk, sent }
}
function decision(desk: Dispatcher, id: string) {
  desk.pending.clear()
  const r = request(id)
  desk.quote(r)
  const frame = desk.buildFrame()
  const chosen = [...frame.plans].find(([, p]) => p.kind === 'quote' && p.request?.id === id && !p.anchor)!
  assert(chosen)
  return { frame, chosen, solution: { selected: [chosen[0]] } as Solution }
}

test('randomized menus reach the execution boundary unchanged and never train scalar demand', async () => {
  const { desk, sent } = setup()
  for (let i = 0; i < 8; i++) {
    const { frame, chosen, solution } = decision(desk, `r${i}`)
    const original = structuredClone(chosen[1].action)
    await desk.execute(frame, solution)
    const assignment = desk.telemetry.findLast(d => d.kind === 'menu_randomized')!
    assert.deepEqual(sent.at(-1), assignment.action)
    assert.deepEqual(chosen[1].action, original)
    const a = assignment.action as Extract<Action, { type: 'quote' }>
    const before = original as typeof a
    assert.equal(a.prices.next_day, before.prices.next_day)
    assert.equal(a.prices.same_day, assignment.arm === 'premium' ? Math.ceil(before.prices.same_day! * 1.1) : before.prices.same_day)
    assert.equal(desk.bids.has(`r${i}`), false)
    assert.equal(assignment.probability, .5)
  }
  assert.equal(new Set(desk.telemetry.filter(d => d.kind === 'menu_randomized').map(d => d.arm)).size, 2)
  const ninth = decision(desk, 'ninth')
  await desk.execute(ninth.frame, ninth.solution)
  assert.equal(desk.assigned.size, 8)
  assert.equal(desk.bids.has('ninth'), true)
})

test('disabled intervention preserves the original action and learning', async () => {
  const { desk, sent } = setup(false)
  const { frame, chosen, solution } = decision(desk, 'r')
  await desk.execute(frame, solution)
  assert.deepEqual(sent[0], chosen[1].action)
  assert.equal(desk.assigned.size, 0)
  assert.equal(desk.bids.has('r'), true)
})

test('rejected and unknown transmissions retain assignments without learning', async () => {
  for (const outcome of ['reject', 'unknown'] as const) {
    const { desk, sent } = setup(true, outcome)
    const { frame, solution } = decision(desk, 'r')
    if (outcome === 'unknown') await assert.rejects(desk.execute(frame, solution), /Lost response/)
    else await desk.execute(frame, solution)
    assert.equal(desk.assigned.size, 1)
    assert.equal(desk.bids.has('r'), false)
    assert.deepEqual(desk.telemetry.find(d => d.kind === 'menu_randomized')!.action, sent[0])
  }
})

test('weekly cap and ineligible selected plans leave execution untouched', async () => {
  for (const reason of ['weekly', 'anchor', 'single', 'note', 'private'] as const) {
    const { desk, sent } = setup()
    const { frame, chosen, solution } = decision(desk, 'r')
    if (reason === 'weekly') for (let i = 0; i < 40; i++) desk.assigned.add(`old${i}`)
    if (reason === 'anchor') chosen[1].anchor = 'reserved'
    if (reason === 'single' && chosen[1].action?.type === 'quote') delete chosen[1].action.prices.next_day
    if (reason === 'note') chosen[1].request!.note = { language: 'en', text: 'Summer tyres in boot' }
    if (reason === 'private') chosen[1].request!.legs[0]!.pickup.privateAddress = true
    const before = structuredClone(chosen[1].action)
    await desk.execute(frame, solution)
    assert.deepEqual(sent[0], before)
    assert.equal(desk.telemetry.some(d => d.kind === 'menu_randomized'), false)
  }
})
