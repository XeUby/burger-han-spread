import test from 'node:test'
import assert from 'node:assert/strict'
import { Dispatcher, validateSettings } from './policy.ts'
import { Dispatcher as Original } from '../portfolio/policy.ts'
import type { Settings } from './policy.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, Order, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

const hours = { opens: 420, closes: 1200, weekdays: [0,1,2,3,4], saturday: null }
const map: WorldMap = { places: [], roads: ['a','b'].flatMap(from => ['a','b'].map(to => ({ from, to, km: from === to ? 0 : 100, minutes: from === to ? 0 : 70 }))) }
const drivers: DriverProfile[] = Array.from({ length: 80 }, (_, i) => ({ id: `d${i}`, homePlaceId: i % 2 ? 'a' : 'b', licence: 'manual', rating: 4.9, completedGigs: 100, drops: 0 }))
function setup(settings: Partial<Settings> = {}, original = false) {
  const base = { portfolio: true, ...settings }
  const desk = original ? new Original({} as World, 8, 500, map, drivers, base) : new Dispatcher({} as World, 8, 500, map, drivers, base)
  for (const [id, from, to] of [['one','a','b'], ['two','b','a']]) {
    const request: PriceRequest = { id: id!, arrivedAt: 400, respondBy: 415, dealerId: 'dealer', batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: from!, privateAddress: false, hours, window: { from: 400, to: 1200 } }, delivery: { placeId: to!, privateAddress: false, hours, window: { from: 400, to: 1200 } } }], options: [{ kind: 'same_day', deadline: 1200, listPriceCents: 12000 }] }
    const order: Order = { id: id!, dealerId: 'dealer', option: 'same_day', priceCents: 12000, deadline: 1200, legs: request.legs, status: 'waiting', deliveredAt: [null], lastPickupAt: 1080 }
    desk.requests.set(id!, request); desk.orders.set(id!, order)
    desk.held.set(id!, { post: { ...desk.singlePost(order), schedule: desk.feesFor(order, 1, false) }, at: 480 })
  }
  return desk
}

test('high and low conventions cross both architectures without changing solo payments', () => {
  for (const portfolio of [false, true]) {
    const high = setup({ portfolio, bundlePayment: 'high' }), low = setup({ portfolio, bundlePayment: 'low' })
    const inputs = (desk: Original) => desk.settings.portfolio ? desk.owned([]).map(o => ({ order: o.order, post: o.post, noteSafe: true })) : [...desk.held].map(([id, h]) => ({ order: desk.orders.get(id)!, post: h.post, noteSafe: true }))
    assert.equal(high.bundlePlans(500, inputs(high))[0]!.post.schedule[0]!.feeCents, 10848)
    assert.equal(low.bundlePlans(500, inputs(low))[0]!.post.schedule[0]!.feeCents, 9221)
    for (const desk of [high, low]) {
      const one = desk.orders.get('one')!
      assert.deepEqual(desk.singlePost(one), high.singlePost(one))
    }
    if (!portfolio) {
      high.flushBundles(); low.flushBundles()
      assert.equal((high.takeActions()[0] as any).schedule[0].feeCents, 10848)
      assert.equal((low.takeActions()[0] as any).schedule[0].feeCents, 9221)
    } else {
      const a = high.buildFrame(), b = low.buildFrame()
      const keeps = (frame: typeof a) => [...frame.plans.values()].filter(p => p.kind === 'keep').map(p => p.action)
      assert.deepEqual(keeps(a), keeps(b))
    }
  }
})

test('unchanged corners preserve original control output and original portfolio frame', () => {
  const originalControl = setup({ portfolio: false }, true), high = setup({ portfolio: false, bundlePayment: 'high' })
  originalControl.flushBundles(); high.flushBundles()
  assert.deepEqual(high.takeActions(), originalControl.takeActions())
  const originalPortfolio = setup({}, true), low = setup({ bundlePayment: 'low' })
  assert.deepEqual(low.buildFrame(), originalPortfolio.buildFrame())
})

test('an open anchor keeps its actual posted schedule under both conventions', () => {
  const high = setup({ bundlePayment: 'high' }), low = setup({ bundlePayment: 'low' })
  const inputs = (desk: Original) => [...desk.held].map(([id, h]) => ({ order: desk.orders.get(id)!, post: { ...h.post, schedule: desk.payoutSchedule(h.post.schedule, true) }, noteSafe: true }))
  const a = inputs(high), b = inputs(low)
  high.held.clear(); low.held.clear()
  assert.deepEqual(high.bundlePlans(500, a), low.bundlePlans(500, b))
})

test('invalid payment settings cannot silently choose a convention', () => {
  assert.throws(() => validateSettings({ bundlePayment: ['low'] }), /convention/)
})
