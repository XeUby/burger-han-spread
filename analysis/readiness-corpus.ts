import fs from "node:fs"
import { createHash } from "node:crypto"
import { readReadiness } from "../src/readiness.ts"
import type { Reveal } from "../vendor/typescript/types.ts"

const rows = []
const examples = []
for (const file of fs.readdirSync("runs").filter(name => name.endsWith(".meta.json")).sort()) {
  const meta = JSON.parse(fs.readFileSync(`runs/${file}`, "utf8"))
  if (meta.label !== "validation-final") continue
  const reveal: Reveal = JSON.parse(fs.readFileSync(`runs/${file.replace(".meta.json", ".reveal.json")}`, "utf8"))
  const row = { worldId: meta.worldId, seed: meta.seed, parsed: 0, singlePublic: 0, sameDay: 0, calendarDelay: 0, full24HourDelay: 0 }
  for (const { request } of reveal.requests) {
    const parsed = readReadiness(request.note, request.arrivedAt)
    if (!parsed) continue
    row.parsed++
    const first = request.legs[0]!
    if (request.legs.length !== 1 || first.pickup.privateAddress || first.delivery.privateAddress) continue
    row.singlePublic++
    if (request.options.some(option => option.kind === "same_day")) row.sameDay++
    const delay = parsed.readyAt - first.pickup.window.from
    const calendarDays = Math.floor(parsed.readyAt / 1440) - Math.floor(first.pickup.window.from / 1440)
    if (calendarDays > 0) row.calendarDelay++
    if (delay >= 1440) row.full24HourDelay++
    examples.push({ seed: meta.seed, requestId: request.id, text: request.note!.text, statedReadyAt: first.pickup.window.from, parsedReadyAt: parsed.readyAt, delay, calendarDays })
  }
  rows.push(row)
}
const totals = { worlds: rows.length, parsed: 0, singlePublic: 0, sameDay: 0, calendarDelay: 0, full24HourDelay: 0 }
for (const row of rows) for (const field of ["parsed", "singlePublic", "sameDay", "calendarDelay", "full24HourDelay"] as const) totals[field] += row[field]
const probe = JSON.parse(fs.readFileSync("runs/w1987f7eddd8d7ce9dd4f.readiness-mechanism.json", "utf8"))
const events = JSON.parse(fs.readFileSync("runs/w1987f7eddd8d7ce9dd4f.readiness-events.json", "utf8"))
const report = {
  parserSha256: createHash("sha256").update(fs.readFileSync("src/readiness.ts")).digest("hex"),
  corpus: { purpose: "Former validation panel reused as development evidence; no unseen performance claim", totals, rows, examples },
  mechanism: { ...probe, wonPickupFrom: events.filter((event: {kind:string}) => event.kind === "order_won").map((event: {order:{id:string;legs:{pickup:{window:{from:number}}}[]}}) => ({ requestId: event.order.id, from: event.order.legs[0]!.pickup.window.from })) },
  conclusions: [
    "A 1392-minute readiness delay across one calendar boundary extended the quoted same-day deadline by 1440 minutes. Calendar-day difference, not complete elapsed 24-hour periods, controls the observed extension.",
    "The three probed readiness values exactly matched revealed readiness, with no other hidden note restrictions.",
    "Won-order windows retain the old pickup start. Explicit pickup windows must enforce parsed readiness before dispatch.",
    "Weekend rollover and final-Monday caps were not tested. Initial admission should exclude an inferred extended deadline outside a weekday and use the server's won-order deadline thereafter.",
    "This probe deliberately did not dispatch its three one-euro orders and is not evidence of policy profitability or delivery performance.",
  ],
}
fs.writeFileSync("docs/readiness-mechanism.json", JSON.stringify(report, null, 2))
console.log(JSON.stringify(totals))
