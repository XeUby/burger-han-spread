// Compares what the reader says a note means with what the reveal says was true of the car.
// Usage: node analysis/note-reader-truth.ts TRUTH.json [examples]
// TRUTH.json is a list of won, noted requests: { text, arrived, options, legs: [{ ready, pickup_hours, delivery_hours, private_pickup, private_delivery, diff }] },
// where diff holds the truth fields that differ from the request.
import fs from "node:fs"
import { readFacts } from "../src/note-reader.ts"

type Hours = { opens: number; closes: number } | null
type Leg = { ready: number; pickup_hours: Hours; delivery_hours: Hours; private_pickup: boolean; private_delivery: boolean; diff: Record<string, any> }
type Row = { text: string; arrived: number; options: [string, number][]; legs: Leg[] }
const rows = JSON.parse(fs.readFileSync(process.argv[2]!, "utf8")) as Row[]
const examples = Number(process.argv[3] ?? 40)
const count: Record<string, number> = {}
const wrong: string[] = []
const add = (key: string) => { count[key] = (count[key] ?? 0) + 1 }
const at = (minute: number | undefined | null) => minute == null ? "-" : `d${Math.floor(minute / 1440)}+${String(Math.floor(minute % 1440 / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
for (const row of rows) {
  add("rows")
  const facts = readFacts({ language: "fi", text: row.text } as never, row.arrived)
  const restrictive = row.legs.some(leg => Object.keys(leg.diff).length)
  if (restrictive) add("rows with a restriction in truth")
  if (!facts) { add("not understood"); if (restrictive) add("not understood, with a restriction"); continue }
  add("understood")
  if (row.legs.length !== 1) { add("understood, several cars (not compared)"); continue }
  const leg = row.legs[0]!
  const truth = leg.diff
  const errors: string[] = []
  // The car may not be collected before the later of its ready time and its release.
  const trueReady = Math.max(truth.readyAt ?? leg.ready, truth.releasedAt ?? 0)
  const readReady = Math.max(leg.ready, facts.readyAt ?? 0)
  if (readReady < trueReady) errors.push(`ready too early: read ${at(readReady)}, true ${at(trueReady)}`)
  else if (readReady > trueReady) add("ready later than true (safe)")
  const lastDeadline = Math.max(...row.options.map(option => option[1]))
  if (truth.noteDeadline !== undefined && facts.deadline !== truth.noteDeadline) errors.push(`deadline: read ${at(facts.deadline)}, true ${at(truth.noteDeadline)}`)
  if (truth.noteDeadline === undefined && facts.deadline !== undefined && facts.deadline < Math.min(...row.options.map(option => option[1]))) add("deadline read, none in truth, earlier than every option")
  for (const [site, stated, real, read] of [["pickup", leg.pickup_hours, truth.pickupHours as Hours | undefined, facts.pickup], ["delivery", leg.delivery_hours, truth.deliveryHours as Hours | undefined, facts.delivery]] as const) {
    if (!stated) continue // a private address has a slot, not hours
    const trueHours = real ?? stated
    const opens = Math.max(stated.opens, read?.opens ?? 0)
    const closes = Math.min(stated.closes, read?.closes ?? 1440)
    if (opens < trueHours.opens || closes > trueHours.closes) errors.push(`${site} hours: read ${opens}-${closes}, true ${trueHours.opens}-${trueHours.closes}`)
    else if (opens !== trueHours.opens || closes !== trueHours.closes) add(`${site} hours narrower than true (safe)`)
  }
  if (!!truth.manual !== facts.manual) errors.push(`manual: read ${facts.manual}, true ${!!truth.manual}`)
  if (!!truth.plates !== facts.plates) errors.push(`plates: read ${facts.plates}, true ${!!truth.plates}`)
  if (!!truth.tyres !== facts.summerTyres) errors.push(`summer tyres: read ${facts.summerTyres}, true ${!!truth.tyres}`)
  void lastDeadline
  if (errors.length) { add("WRONG"); wrong.push(`${row.text}\n    arrived ${at(row.arrived)}, window from ${at(leg.ready)}: ${errors.join("; ")}`) }
  else { add("right"); if (restrictive) add("right, with a restriction") }
}
for (const [key, value] of Object.entries(count)) console.log(`${value}\t${key}`)
for (const line of wrong.slice(0, examples)) console.log(line)
