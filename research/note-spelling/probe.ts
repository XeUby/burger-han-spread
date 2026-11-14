import fs from "node:fs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { Client } from "../../vendor/typescript/spread.ts"
import { readNote } from "../../src/notes.ts"
import type { DeskEvent, PriceRequest, QuoteAction } from "../../vendor/typescript/types.ts"

if (!process.argv.includes("--execute")) throw new Error("Use --execute for the ordinary-practice semantics probe")
const seed = "formal-unseen-20261113-10", file = "docs/note-spelling-screen.json", bytes = fs.readFileSync(file)
const selected = new Map<string, { original: string; normalized: string }>(JSON.parse(bytes.toString()).rows.filter((row: any) => row.seed === seed && row.staticallyFeasible).map((row: any) => [row.requestId, row]))
assert.equal(selected.size, 21)
const client = new Client()
if ((await client.worlds()).filter(world => !world.ended).length >= 4) throw new Error("Four unfinished worlds already exist")
const world = await client.create(8, { seed }), initial = await world.snapshot()
const report: Record<string, unknown> = { worldId: world.id, seed, startedAt: new Date().toISOString(), screen: file, screenSha256: createHash("sha256").update(bytes).digest("hex"), purpose: "Semantics only:21 reviewed spelling corrections, one-euro quotes, no dispatch. Not a profit or reliability benchmark, and not a ranking attempt.", terminal: false }
const save = () => fs.writeFileSync(`runs/${world.id}.spelling-probe.json`, JSON.stringify(report, null, 2) + "\n")
save()
console.log(JSON.stringify({ worldId: world.id, seed, selected: selected.size }))
const requests = new Map<string, PriceRequest>(), changed = new Set<string>(), events: DeskEvent[] = []
let now = initial.now, pending: QuoteAction[] = []
function ingest(batch: DeskEvent[]) {
  events.push(...batch)
  for (const event of batch) {
    if (event.kind === "order_changed") changed.add(event.order.id)
    if (event.kind !== "price_request") continue
    const request = event.request, row = selected.get(request.id)
    if (!row) continue
    assert.equal(request.note?.text, row.original)
    assert.equal(readNote(request.note).safe, false)
    assert.equal(readNote({ ...request.note!, text: row.normalized }).safe, true)
    assert(request.respondBy > now)
    requests.set(request.id, request)
    pending.push({ type: "quote", requestId: request.id, prices: { [request.options.at(-1)!.kind]: 100 } })
  }
}
try {
  ingest(await world.events())
  while (now < initial.endsAt) {
    const step = await world.advance({ untilEvent: ["price_request"], max: initial.endsAt, actions: pending.splice(0) })
    if (step.results.some(result => !result.ok)) throw new Error(JSON.stringify(step.results))
    now = step.now
    ingest(step.events)
  }
  const reveal = await world.reveal(), cases = []
  assert.equal(requests.size, selected.size)
  for (const order of reveal.orders) {
    const request = requests.get(order.orderId)
    if (!request) continue
    const row = selected.get(order.orderId)!, parsed = readNote({ ...request.note!, text: row.normalized })
    const leg = request.legs[0]!, truth = order.legs[0]!, problems = []
    if (truth.readyAt > leg.pickup.window.from) problems.push("unmodeled readiness")
    if (truth.releasedAt !== null && truth.releasedAt > leg.pickup.window.from) problems.push("unmodeled payment release")
    if (truth.manualGearbox && !parsed.manual) problems.push("unmodeled manual gearbox")
    if (truth.needsPlates && !parsed.plates) problems.push("unmodeled plates")
    if (truth.summerTyres) problems.push("unmodeled summer tyres")
    if (truth.noteDeadline !== null) problems.push("unmodeled deadline")
    for (const stop of ["pickup", "delivery"] as const) {
      const actual = stop === "pickup" ? truth.pickupHours : truth.deliveryHours
      if (JSON.stringify(actual) !== JSON.stringify(leg[stop].hours)) problems.push(`different ${stop} hours`)
    }
    cases.push({ requestId: request.id, original: row.original, normalized: row.normalized, parsed, publicLeg: leg, truth, changed: changed.has(request.id), problems })
  }
  report.summary = { quoted: requests.size, won: cases.length, unchanged: cases.filter(row => !row.changed).length, unchangedWithUnmodeledRestrictions: cases.filter(row => !row.changed && row.problems.length).length, changed: cases.filter(row => row.changed).length }
  report.cases = cases
  report.terminal = true
  fs.writeFileSync(`runs/${world.id}.spelling-events.json`, JSON.stringify(events))
  fs.writeFileSync(`runs/${world.id}.spelling-reveal.json`, JSON.stringify(reveal))
  console.log(JSON.stringify(report.summary))
} catch (error) {
  report.error = String(error)
  report.now = now
  throw error
} finally { save() }
