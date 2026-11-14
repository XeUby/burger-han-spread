import { readFile, writeFile } from 'node:fs/promises'
import { Dispatcher } from '../../runs/frozen/portfolio-development-v1/src/policy.ts'
import { requestFeasibility } from '../../runs/frozen/portfolio-development-v1/src/admission.ts'
import type { PriceRequest, World } from '../../runs/frozen/portfolio-development-v1/vendor/typescript/spread.ts'

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const report = await read('docs/level8-estimate-v1-results.json')
const plan = await read('experiments/level8-estimate-v1.json')
const map = await read('docs/map.json')
const rows = []
for (const record of report.records.filter((r: any) => r.label.endsWith('-payments'))) {
  const world = record.worldId
  const events = await read(`runs/${world}.events.json`)
  const requests = new Map<string, PriceRequest>(events.filter((e: any) => e.kind === 'price_request').map((e: any) => [e.request.id, e.request]))
  const settings = plan.trials.find((t: any) => t.seed === record.seed && t.label === record.label).settings
  const desk = new Dispatcher({} as World, 8, 0, map, await read(`runs/${world}.drivers.json`), settings)
  const counts: Record<string, number> = {}
  let frame: any
  for (const d of await read(`runs/${world}.decisions.json`)) {
    if (d.kind === 'portfolio_solve') { frame = d; continue }
    if (d.kind !== 'portfolio_action' || d.plan.kind !== 'decline' || !d.result?.ok) continue
    const id = d.action.requestId
    if (Object.values(frame.plans).some((p: any) => p.kind === 'quote' && p.requestId === id)) continue
    const request = requests.get(id)!
    desk.now = d.at
    const rules = desk.noteRules(request)
    const trip = desk.plannedRequest(request)
    const leg = trip.legs[0]!
    const road = desk.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const supply = desk.supply(request)
    const buffer = supply < 30 || road.km > 300 ? 300 : 210
    let reason = 'dynamicAdmissionOrOther'
    if (!rules.safe) reason = 'unparsedNote'
    else if (road.km > settings.maxKm) reason = 'distanceLimit'
    else if (supply < settings.minDrivers) reason = 'homeSupplyLimit'
    else if (trip.legs.length !== 1) reason = 'multiLegScope'
    else if (leg.pickup.privateAddress || leg.delivery.privateAddress) reason = 'privateScope'
    else {
      const feasible = trip.options.filter(o => !(o.kind === 'same_day' && supply < 15)).map(o => requestFeasibility(trip, o.deadline, desk.network, settings)).filter(x => x !== null)
      if (!feasible.length) reason = 'noFeasibleOption'
      else if (!feasible.some(x => x.latestPickupAt >= Math.max(d.at + buffer, leg.pickup.window.from + 120))) reason = 'fixedBookingBuffer'
    }
    counts[reason] = (counts[reason] ?? 0) + 1
  }
  rows.push({worldId: world, seed: record.seed, counts})
  console.log(world, counts)
}
const totals: Record<string, number> = {}
for (const row of rows) for (const [key, value] of Object.entries(row.counts)) totals[key] = (totals[key] ?? 0) + value
await writeFile('docs/level8-admission-audit.json', JSON.stringify({scope: 'Static necessary gates on requests with no quote candidate, using the frozen policy and only decision-time request fields. First matching static exclusion; dynamic load was not replayed, so this does not assign a unique causal rejection reason.', rows, totals}, null, 2) + '\n')
console.log(totals)
