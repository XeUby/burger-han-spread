import fs from "node:fs"
import { Client } from "../../vendor/typescript/spread.ts"
import { readHours } from "./parser.ts"
import type { DeskEvent, PriceRequest, QuoteAction } from "../../vendor/typescript/types.ts"

if (!process.argv.includes("--execute")) throw new Error("Use --execute after reserving one of the four practice slots")
const client = new Client()
if ((await client.worlds()).filter(world => !world.ended).length >= 4) throw new Error("Four unfinished worlds already exist")
const seed = "formal-unseen-20261113-09"
const world = await client.create(8, { seed })
const snapshot = await world.snapshot()
const report: Record<string, unknown> = { worldId: world.id, seed, purpose: "Bounded note-semantics probe, not a profit or reliability benchmark. One-euro quotes, no dispatch, no ranking attempt.", startedAt: new Date().toISOString(), terminal: false }
const save = () => fs.writeFileSync(`runs/${world.id}.hours-probe.json`, JSON.stringify(report, null, 2) + "\n")
save()
console.log(JSON.stringify({ worldId: world.id, seed, kind: "note-hours semantic probe" }))
const requests = new Map<string, PriceRequest>()
const changed = new Set<string>()
const events: DeskEvent[] = []
let now = snapshot.now, pending: QuoteAction[] = []
const ingest = (batch: DeskEvent[]) => {
  events.push(...batch)
  for (const event of batch) {
    if (event.kind === "order_changed") changed.add(event.order.id)
    if (event.kind !== "price_request") continue
    const request = event.request, leg = request.legs[0]!
    const parsed = readHours(request.note, request.arrivedAt)
    if (!parsed || request.legs.length !== 1 || leg.pickup.privateAddress || leg.delivery.privateAddress || request.respondBy <= now) continue
    requests.set(request.id, request)
    pending.push({ type: "quote", requestId: request.id, prices: { [request.options.at(-1)!.kind]: 100 } })
  }
}
try {
  ingest(await world.events())
  while (now < snapshot.endsAt) {
    const step = await world.advance({ untilEvent: ["price_request"], max: snapshot.endsAt, actions: pending.splice(0) })
    now = step.now
    ingest(step.events)
  }
  const reveal = await world.reveal()
  const cases = []
  for (const order of reveal.orders) {
    const request = requests.get(order.orderId)
    if (!request) continue
    const parsed = readHours(request.note, request.arrivedAt)!
    const leg = request.legs[0]!, truth = order.legs[0]!
    const problems: string[] = []
    if (truth.readyAt > Math.max(leg.pickup.window.from, parsed.readyAt ?? 0)) problems.push("unmodeled readiness")
    if (truth.releasedAt !== null && truth.releasedAt > Math.max(leg.pickup.window.from, parsed.readyAt ?? 0)) problems.push("unmodeled payment release")
    if (truth.manualGearbox && !parsed.manual) problems.push("unmodeled manual gearbox")
    if (truth.needsPlates && !parsed.plates) problems.push("unmodeled plates")
    if (truth.summerTyres) problems.push("unmodeled summer tyres")
    if (truth.noteDeadline !== null) problems.push("unmodeled deadline")
    for (const stop of ["pickup", "delivery"] as const) {
      const stated = leg[stop].hours
      const actual = stop === "pickup" ? truth.pickupHours : truth.deliveryHours
      const bound = parsed[stop]
      const opens = Math.max(stated?.opens ?? 0, bound?.opens ?? 0)
      const closes = Math.min(stated?.closes ?? 1440, bound?.closes ?? 1440)
      const days = (stated?.weekdays ?? [0, 1, 2, 3, 4]).filter(day => day < 5)
      if (actual && (opens < actual.opens || closes > actual.closes || days.some(day => !actual.weekdays.includes(day)))) problems.push(`unmodeled ${stop} hours`)
    }
    cases.push({ requestId: request.id, note: request.note, parsed, publicLeg: leg, truth, changed: changed.has(request.id), problems })
  }
  report.terminal = true
  report.quoted = requests.size
  report.cases = cases
  report.summary = { won: cases.length, unchanged: cases.filter(row => !row.changed).length, unchangedWithUnmodeledRestrictions: cases.filter(row => !row.changed && row.problems.length).length, changed: cases.filter(row => row.changed).length }
  fs.writeFileSync(`runs/${world.id}.hours-reveal.json`, JSON.stringify(reveal))
  fs.writeFileSync(`runs/${world.id}.hours-events.json`, JSON.stringify(events))
  console.log(JSON.stringify(report.summary))
} catch (error) {
  report.error = String(error)
  report.now = now
  throw error
} finally {
  save()
}
