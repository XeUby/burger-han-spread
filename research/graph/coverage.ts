import { readFile, writeFile } from 'node:fs/promises'
import { Network } from '../../src/planning.ts'
import type { PriceRequest } from '../../vendor/typescript/types.ts'
import { buildGraph } from './candidates.ts'

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const report = await read('docs/level8-estimate-v1-results.json')
const network = new Network(await read('docs/map.json'))
const rows = []
for (const record of report.records.filter((r: any) => r.label.endsWith('-payments'))) {
  const events = await read(`runs/${record.worldId}.events.json`)
  const requests: PriceRequest[] = events.filter((e: any) => e.kind === 'price_request').map((e: any) => e.request)
  const byId = new Map(requests.map(r => [r.id, r]))
  const decisions = await read(`runs/${record.worldId}.decisions.json`)
  const previous = new Set<string>()
  for (const d of decisions) if (d.kind === 'portfolio_solve') for (const p of Object.values(d.plans) as any[]) if (p.kind === 'quote') previous.add(p.requestId)
  const counts: Record<string, number> = {}
  const omissions: Record<string, number> = {}
  const increment = (name: string) => { counts[name] = (counts[name] ?? 0) + 1 }
  for (const request of requests) {
    const graph = buildGraph([request], request.arrivedAt, 8, network)
    increment('requests')
    if (!graph.options.length) {
      const reason = graph.omitted[0]?.reason ?? 'unknown'
      omissions[reason] = (omissions[reason] ?? 0) + 1
      if (previous.has(request.id)) increment('oldCandidateMissingFromGraph')
      continue
    }
    increment('physicallyModeled')
    if (!previous.has(request.id)) increment('newCoverage')
    if (graph.options.some(o => o.constraints.source !== 'plain')) increment('timedNotes')
    if (request.legs.length > 1) increment('multiLeg')
    else if (request.legs.some(l => l.pickup.privateAddress || l.delivery.privateAddress)) increment('privateSingle')
  }
  const pairs = new Set<string>()
  for (const d of decisions) {
    if (d.kind !== 'portfolio_solve') continue
    const ids = [...new Set<string>((Object.values(d.plans) as any[]).map(p => p.requestId).filter(Boolean))]
    if (ids.length < 2) continue
    const graph = buildGraph(ids.map(id => byId.get(id)!), d.at, 8, network)
    for (const pair of graph.pairs) pairs.add([graph.options.find(o => o.id === pair.first)!.requestId, graph.options.find(o => o.id === pair.second)!.requestId].sort().join(':'))
  }
  rows.push({ worldId: record.worldId, seed: record.seed, counts, omissions, distinctPairsOnObservedFrames: pairs.size })
  console.log(rows.at(-1))
}
const totals: Record<string, number> = {}, omissions: Record<string, number> = {}
for (const row of rows) {
  for (const [key, n] of Object.entries(row.counts)) totals[key] = (totals[key] ?? 0) + n
  for (const [key, n] of Object.entries(row.omissions)) omissions[key] = (omissions[key] ?? 0) + n
}
await writeFile('docs/graph-coverage-v1.json', JSON.stringify({ scope: 'Offline feasibility/candidate coverage on already retired development seeds; not a counterfactual rollout or profit estimate. Solo coverage uses request arrival; pair coverage uses concurrent requests from recorded solver frames only. No driver is assumed assigned or willing to book.', rows, totals, omissions, distinctPairs: rows.reduce((sum, r) => sum + r.distinctPairsOnObservedFrames, 0), limitations: ['Physical model uses road times plus conservative service margins and a declared30-minute booking delay; driver access and willingness remain to be modeled.', 'Unresolved/corrected notes still abstain. Semantic coverage has not been generalized by a new parser.', 'Changed acquisition would change later events; these counts cannot predict achieved routes or profit.'] }, null, 2) + '\n')
console.log({ totals, omissions })
