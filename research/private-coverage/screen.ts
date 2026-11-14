import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Network } from '../../src/planning.ts'
import { buildGraph } from '../graph/candidates.ts'
import type { PriceRequest } from '../../vendor/typescript/types.ts'

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const reference = await read('docs/level8-estimate-v1-results.json')
const network = new Network(await read('docs/map.json'))
const records = []
for (const record of reference.records.filter((r: any) => r.label.endsWith('-payments'))) {
  const bytes = await readFile(`runs/${record.worldId}.events.json`)
  if (createHash('sha256').update(bytes).digest('hex') !== record.artifactHashes.events) throw new Error('Changed events')
  const requests: PriceRequest[] = JSON.parse(bytes.toString()).filter((e: any) => e.kind === 'price_request').map((e: any) => e.request)
  const counts: Record<string, number> = {}
  const eligible = []
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1 }
  for (const request of requests) {
    if (request.legs.length !== 1 || !request.legs.some(l => l.pickup.privateAddress || l.delivery.privateAddress)) continue
    count('privateSingleArrivals')
    const graph = buildGraph([request], request.arrivedAt, 8, network, { pairRoutes: 0 })
    const plain = graph.options.filter(o => o.constraints.source === 'plain')
    if (!plain.length) { count('noPlainFeasibleOption'); continue }
    count('plainFeasible')
    const options = plain.filter(o => o.route.latestStart >= request.respondBy + 180)
    if (!options.length) { count('insufficientBookingSlack'); continue }
    count('eligibleBeforeExposureLimits')
    eligible.push({ requestId: request.id, arrivedAt: request.arrivedAt, respondBy: request.respondBy, origin: request.legs[0]!.pickup.placeId, destination: request.legs[0]!.delivery.placeId, referenceFeeCents: request.referenceFeeCents, privatePickup: request.legs[0]!.pickup.privateAddress, privateDelivery: request.legs[0]!.delivery.privateAddress, options: options.map(o => ({ kind: o.kind, deadline: o.deadline, listPriceCents: o.listPriceCents, latestStart: o.route.latestStart, bookingSlack: o.route.latestStart - request.respondBy })) })
  }
  records.push({ seed: record.seed, worldId: record.worldId, counts, eligible })
}
const totals: Record<string, number> = {}
for (const r of records) for (const [key, n] of Object.entries(r.counts)) totals[key] = (totals[key] ?? 0) + n
const output = { scope: 'Arrival-time physical eligibility on eight familiar incumbent weeks. No counterfactual wins, fees or profits inferred.', eligibility: 'One leg, at least one private stop, plain supported note, graph-feasible option with at least180minutes of pickup slack after response deadline. Private appointment windows remain fixed.', totals, records, limitations: ['Driver willingness and availability are unobserved. Feasibility is not booking probability or profitability.', 'Future private appointment failure and displacement costs require intervention outcomes.', 'Counts precede any daily or simultaneous exposure limits; they do not predict realized assignments.', 'No proposal to change incumbent pricing or admit the full population follows from this screen.'] }
await writeFile('docs/private-coverage-screen.json', JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(totals))
