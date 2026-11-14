import fs from "node:fs"
import { Dispatcher } from "../src/policy.ts"
import { requestFeasibility } from "../src/admission.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { PriceRequest } from "../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const map = read("docs/map.json")
const rows = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`)
  const drivers = read(`runs/${worldId}.drivers.json`)
  const desk = new Dispatcher({} as World, 8, 0, map, drivers)
  for (const item of read(`runs/${worldId}.reveal.json`).requests) {
    const request: PriceRequest = item.request
    const leg = request.legs[0]!
    const km = desk.network.km(leg.pickup.placeId, leg.delivery.placeId)
    if (km <= 550 || !desk.noteRules(request).safe) continue
    const supply = desk.supply(request)
    if (supply < 12) continue
    const options = request.options.filter(option => {
      const feasible = requestFeasibility(request, option.deadline, desk.network)
      return feasible && feasible.latestPickupAt >= Math.max(request.arrivedAt + 300, leg.pickup.window.from + 120)
    })
    if (!options.length) continue
    rows.push({ worldId, seed: meta.seed, requestId: request.id, km, supply, options: options.map(option => option.kind), feeCents: desk.baseFee(request), listCents: Math.min(...options.map(option => option.listPriceCents)) })
  }
}
const summary = [[550, 700], [700, 900], [900, Infinity]].map(([from, to]) => {
  const group = rows.filter(row => row.km > from! && row.km <= to!)
  return { fromKm: from, toKm: Number.isFinite(to) ? to : null, requests: group.length, meanPerWeek: group.length / worlds.length, meanListToFee: group.reduce((sum, row) => sum + row.listCents / row.feeCents, 0) / group.length, sameDayOptions: group.filter(row => row.options.includes("same_day")).length }
})
fs.writeFileSync("docs/route-frontier.json", JSON.stringify({ scope: "Eight named development weeks, no fresh validation outcomes.", method: "Count requests above550km passing the baseline note, local supply and conservative time gates. Dynamic capacity, competitor acceptance and actual costs remain unmodeled; these are opportunities, not expected profit.", summary, rows }, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
