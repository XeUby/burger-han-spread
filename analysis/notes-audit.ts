import fs from "node:fs"
import path from "node:path"
import { readNote } from "../src/notes.ts"
import { readNote as baseline } from "./notes-baseline.ts"
import type { DeskEvent, PriceRequest } from "../vendor/typescript/types.ts"

const worlds = fs.readdirSync("runs").filter(f => f.endsWith(".meta.json"))
const seen = new Set<string>()
const results = []
const gained: { seed: string; requestId: string; text: string }[] = []
for (const file of worlds) {
  const meta = JSON.parse(fs.readFileSync(path.join("runs", file), "utf8"))
  const eventsFile = path.join("runs", file.replace(".meta.json", ".events.json"))
  if (!fs.existsSync(eventsFile) || seen.has(meta.seed)) continue
  seen.add(meta.seed)
  const requests = (JSON.parse(fs.readFileSync(eventsFile, "utf8")) as DeskEvent[]).filter(e => e.kind === "price_request").map(e => e.request)
  const counts = { seed: meta.seed, requests: requests.length, notes: 0, baselineSafe: 0, expandedSafe: 0, gained: 0, safeSingleDealer: 0, baselineSingleDealer: 0 }
  for (const r of requests) {
    if (r.note) counts.notes++
    const old = baseline(r.note).safe
    const safe = readNote(r.note).safe
    if (old) counts.baselineSafe++
    if (safe) counts.expandedSafe++
    if (safe && !old) { counts.gained++; gained.push({ seed: meta.seed, requestId: r.id, text: r.note!.text }) }
    if (r.legs.length === 1 && !r.legs[0]!.pickup.privateAddress && !r.legs[0]!.delivery.privateAddress) {
      if (old) counts.baselineSingleDealer++
      if (safe) counts.safeSingleDealer++
    }
  }
  results.push(counts)
}
fs.writeFileSync("analysis/notes-audit.json", JSON.stringify({ results, gained }, null, 2))
console.log(JSON.stringify(results, null, 2))
