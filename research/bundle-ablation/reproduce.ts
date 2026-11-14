import { writeFile, readFile } from 'node:fs/promises'
import { Dispatcher as Control } from '../../src/policy.ts'
import { Dispatcher as Portfolio } from '../portfolio/policy.ts'
import { planBundles } from '../../src/bundles.ts'
import type { World } from '../../vendor/typescript/spread.ts'
import type { DriverProfile, Order, PriceRequest, WorldMap } from '../../vendor/typescript/types.ts'

const hours = { opens: 420, closes: 1200, weekdays: [0, 1, 2, 3, 4], saturday: null }
const map: WorldMap = { places: [], roads: ['a','b'].flatMap(from => ['a','b'].map(to => ({ from, to, km: from === to ? 0 : 100, minutes: from === to ? 0 : 70 }))) }
const drivers: DriverProfile[] = Array.from({ length: 80 }, (_, i) => ({ id: `d${i}`, homePlaceId: i % 2 ? 'a' : 'b', licence: 'manual', rating: 4.9, completedGigs: 100, drops: 0 }))
const host = {} as World
const control = new Control(host, 8, 500, map, drivers)
const portfolio = new Portfolio(host, 8, 500, map, drivers, { portfolio: true })
for (const [id, from, to] of [['one','a','b'],['two','b','a']]) {
  const request: PriceRequest = { id: id!, arrivedAt: 400, respondBy: 415, dealerId: 'dealer', batchId: null, note: null, referenceFeeCents: 6000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: { placeId: from!, privateAddress: false, hours, window: { from: 400, to: 1200 } }, delivery: { placeId: to!, privateAddress: false, hours, window: { from: 400, to: 1200 } } }], options: [{ kind: 'same_day', deadline: 1200, listPriceCents: 12000 }] }
  const order: Order = { id: id!, dealerId: 'dealer', option: 'same_day', priceCents: 12000, deadline: 1200, legs: request.legs, status: 'waiting', deliveredAt: [null], lastPickupAt: 1080 }
  for (const desk of [control, portfolio]) { desk.requests.set(id!, request); desk.orders.set(id!, order) }
  for (const desk of [control, portfolio]) {
    const post = { ...portfolio.singlePost(order), schedule: desk.feesFor(order, 1, false) }
    desk.held.set(id!, { post, at: 480 })
  }
}
const controlInputs = [...control.held].map(([id, h]) => ({ order: control.orders.get(id)!, post: h.post, noteSafe: true }))
const portfolioInputs = portfolio.owned([]).map(o => ({ order: o.order, post: o.post, noteSafe: true }))
const high = planBundles(500, controlInputs, control.network)[0]!
const low = planBundles(500, portfolioInputs, portfolio.network)[0]!
if (!high || !low || low.post.schedule[0]!.feeCents >= high.post.schedule[0]!.feeCents) throw new Error('Payment-convention difference was not reproduced')
const report = JSON.parse(await readFile('docs/level8-estimate-v1-results.json', 'utf8'))
const outcomes: { worldId: string; label: string; bundles: number; offers: Record<string, number> }[] = []
for (const record of report.records) {
  const decisions = JSON.parse(await readFile(`runs/${record.worldId}.decisions.json`, 'utf8'))
  const events = JSON.parse(await readFile(`runs/${record.worldId}.events.json`, 'utf8'))
  const bundles = decisions.filter((d: any) => d.kind === 'action_result' && d.action.type === 'post' && d.result?.ok && new Set(d.action.stops.map((s: any) => s.orderId)).size > 1).length
  const offers: Record<string, number> = {}
  for (const event of events.filter((e: any) => e.kind === 'offer_answered')) offers[event.answer] = (offers[event.answer] ?? 0) + 1
  outcomes.push({ worldId: record.worldId, label: record.label, bundles, offers })
}
const result = { scope: 'Offline reproduction on identical held orders. Successful bundle posts counted from action_result for both architectures, rather than portfolio-specific telemetry.', fixture: { controlSchedule: high.post.schedule, portfolioSchedule: low.post.schedule, ratio: low.post.schedule[0]!.feeCents / high.post.schedule[0]!.feeCents, sameRoute: JSON.stringify(high.post.stops) === JSON.stringify(low.post.stops) }, outcomes }
await writeFile('docs/bundle-payment-confound.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ fixture: result.fixture, totals: ['benchmark','payments'].map(arm => ({ arm, bundles: outcomes.filter(r => r.label.endsWith('-' + arm)).reduce((s, r) => s + r.bundles, 0), offers: outcomes.filter(r => r.label.endsWith('-' + arm)).reduce((s, r) => { for (const [k, n] of Object.entries(r.offers)) s[k] = (s[k] ?? 0) + n; return s }, {} as Record<string, number>) })) }, null, 2))
