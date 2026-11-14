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
  const desk = new Dispatcher({} as World, 8, 0, map, read(`runs/${worldId}.drivers.json`))
  for (const item of read(`runs/${worldId}.reveal.json`).requests) {
    const request: PriceRequest = item.request
    if (!request.note || desk.noteRules(request).safe || request.legs.length !== 1) continue
    const leg = request.legs[0]!
    if (leg.pickup.privateAddress || leg.delivery.privateAddress) continue
    const km = desk.network.km(leg.pickup.placeId, leg.delivery.placeId)
    const supply = desk.supply(request)
    if (km > 700 || supply < 12) continue
    const options = request.options.filter(option => {
      const feasible = requestFeasibility({ ...request, note: null }, option.deadline, desk.network)
      return feasible && feasible.latestPickupAt >= Math.max(request.arrivedAt + 300, leg.pickup.window.from + 120)
    })
    if (!options.length) continue
    const text = request.note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    const kinds = []
    if (/ready|valmi|klar|paid|maksu|betal|release|handover/.test(text)) kinds.push("readiness")
    if (/by |latest|viim|perilla|senast|destination|toimitus|vastaan|delivery|leveran/.test(text)) kinds.push("delivery-time")
    if (/hours|closing|opens|open |auki|stang|oppet|nouto|noud|pickup|collect|hamt/.test(text)) kinds.push("pickup-hours")
    if (/summer|kesaren|sommar/.test(text)) kinds.push("tyres-or-weather")
    rows.push({ worldId, requestId: request.id, text: request.note.text, kinds, km, supply, listCents: Math.min(...options.map(option => option.listPriceCents)), feeCents: desk.baseFee(request) })
  }
}
const categories = ["readiness", "delivery-time", "pickup-hours", "tyres-or-weather", "unclassified"].map(kind => {
  const subset = rows.filter(row => kind === "unclassified" ? !row.kinds.length : row.kinds.includes(kind))
  return { kind, requests: subset.length, meanPerWeek: subset.length / worlds.length, meanListToFee: subset.length ? subset.reduce((sum, row) => sum + row.listCents / row.feeCents, 0) / subset.length : null, examples: subset.slice(0, 8).map(row => row.text) }
})
fs.writeFileSync("docs/note-opportunities.json", JSON.stringify({ scope: "Eight previously inspected development weeks only.", method: "Count unsafe notes on public single-car requests passing geography, supply and stated-window gates. Ignore note restrictions only for this opportunity count, never for dispatch. Categories are overlapping keyword screens, not a semantic parser or feasibility proof.", limitations: ["Actual note restrictions can remove most of this apparent opportunity.", "No acceptance probabilities, dynamic capacity or realized profit are inferred.", "Examples and counts are development evidence only."], requests: rows.length, categories, rows }, null, 2) + "\n")
console.log(JSON.stringify({ requests: rows.length, categories }, null, 2))
