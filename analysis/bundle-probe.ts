import fs from "node:fs"
import { Client, SpreadError } from "../vendor/typescript/spread.ts"
import type { DeskEvent, Order, PostAction, PriceRequest, QuoteAction } from "../vendor/typescript/types.ts"
import { Network } from "../src/planning.ts"
import { readNote } from "../src/notes.ts"

if (!process.argv.includes("--execute")) throw new Error("Pass --execute only after the coordinator reserves one practice slot")
const seed = "mechanics-bundle-01"
const client = new Client(), network = new Network(JSON.parse(fs.readFileSync("docs/map.json", "utf8")))
async function createWhenAvailable() {
  for (let attempt = 0; ; attempt++) {
    try { return await client.create(8, { seed }) }
    catch (error) {
      if (!(error instanceof SpreadError) || error.status !== 409 || attempt >= 59) throw error
      if (attempt % 6 === 0) console.log("Waiting for one free practice slot; no worlds are changed")
      await new Promise(resolve => setTimeout(resolve, 10000))
    }
  }
}
const world = await createWhenAvailable()
const report: any = { seed, worldId: world.id, scope: "One bounded mechanics world; no profit benchmark. Multi-pickup action tested first; sequential acceptance control does not advance time.", events: [], actions: [], deleted: false }
const save = () => fs.writeFileSync(`runs/bundle-probe-${seed}.json`, JSON.stringify(report, null, 2) + "\n")
save()
console.log(JSON.stringify({ worldId: world.id, seed }))
const requests = new Map<string, PriceRequest>(), orders = new Map<string, Order>()
let now = 0, pair: [Order, Order] | undefined, pending: QuoteAction[] = [], quoted = 0
function ingest(events: DeskEvent[]): void {
  report.events.push(...events)
  for (const event of events) {
    if (event.kind === "price_request") {
      const r = event.request, leg = r.legs[0]!
      requests.set(r.id, r)
      if (r.legs.length !== 1 || leg.pickup.privateAddress || leg.delivery.privateAddress || !readNote(r.note).safe || network.km(leg.pickup.placeId, leg.delivery.placeId) < 50 || quoted >= 180) continue
      const option = r.options.at(-1)!
      pending.push({ type: "quote", requestId: r.id, prices: { [option.kind]: Math.max(1, Math.round(option.listPriceCents * 0.2)) } })
      quoted++
    } else if (event.kind === "order_won" || event.kind === "order_changed") orders.set(event.order.id, event.order)
    else if (event.kind === "order_cancelled") orders.delete(event.orderId)
  }
}
try {
  while (!pair && now < 4320) {
    const step = await world.advance({ untilEvent: ["price_request", "order_won"], max: 4320, actions: pending.splice(0) })
    now = step.now
    ingest(step.events)
    for (const first of orders.values()) for (const second of orders.values()) {
      if (first.id >= second.id || first.lastPickupAt < now + 240 || second.lastPickupAt < now + 240) continue
      const x = first.legs[0]!, y = second.legs[0]!
      if (x.pickup.placeId !== y.pickup.placeId || x.delivery.placeId !== y.delivery.placeId) continue
      const start = Math.max(now + 90, x.pickup.window.from, y.pickup.window.from)
      if (start + 2 * network.minutes(x.pickup.placeId, x.delivery.placeId) + 180 > Math.min(first.deadline, second.deadline)) continue
      pair = [first, second]
      break
    }
  }
  report.now = now
  report.quoted = quoted
  if (!pair) report.result = "No eligible same-lane pair found within the bounded acquisition window"
  else {
    report.orders = pair
    report.requests = pair.map(o => requests.get(o.id))
    const stops = pair.flatMap(o => {
      const rules = readNote(requests.get(o.id)!.note)
      return [{ orderId: o.id, leg: 0, kind: "pickup" as const, withPlates: rules.plates, withCharging: o.legs[0]!.car.electric && (o.legs[0]!.car.chargePercent ?? 100) < 30 }, { orderId: o.id, leg: 0, kind: "delivery" as const }]
    })
    const fee = 3 * pair.reduce((sum, o) => sum + requests.get(o.id)!.referenceFeeCents, 0)
    const grouped: PostAction = { type: "post", stops: [stops[0]!, stops[2]!, stops[1]!, stops[3]!], audience: { experienced: pair.some(o => o.legs[0]!.car.premium), manualLicence: pair.some(o => readNote(requests.get(o.id)!.note).manual) }, schedule: [{ at: now, feeCents: fee }] }
    const [result] = await world.act([grouped])
    report.actions.push({ kind: "grouped-first", action: grouped, result })
    save()
    if (!result?.ok) report.result = "Grouped pickups rejected by the documented post endpoint"
    else {
      report.actions.push({ kind: "withdraw-grouped", result: await world.act([{ type: "withdraw", gigId: result.id }]) })
      const sequential = { ...grouped, stops }
      const [control] = await world.act([sequential])
      report.actions.push({ kind: "sequential-control", action: sequential, result: control })
      if (control?.ok) report.actions.push({ kind: "withdraw-sequential", result: await world.act([{ type: "withdraw", gigId: control.id }]) })
      const [active] = await world.act([grouped])
      report.actions.push({ kind: "grouped-observed", action: grouped, result: active })
      if (!active?.ok) throw new Error("Grouped route was accepted initially but not on repost")
      report.gigId = active.id
      const routeMinutes = (post: PostAction) => post.stops.slice(1).reduce((sum, stop, i) => {
        const prev = post.stops[i]!, before = orders.get(prev.orderId)!.legs[0]![prev.kind], after = orders.get(stop.orderId)!.legs[0]![stop.kind]
        return sum + network.minutes(before.placeId, after.placeId)
      }, 0)
      report.mappedMinutes = { grouped: routeMinutes(grouped), sequential: routeMinutes(sequential) }
      const until = Math.min(10079, Math.max(...pair.map(o => o.deadline)) + 1440)
      while (now < until) {
        const step = await world.advance({ by: Math.min(180, until - now) })
        now = step.now
        ingest(step.events)
        save()
        if (pair.every(o => report.events.some((e: DeskEvent) => e.kind === "delivered" && e.orderId === o.id))) break
      }
      report.result = "Grouped route accepted; observed trace saved"
      report.snapshot = await world.snapshot()
      report.targetEvents = report.events.filter((e: any) => e.gigId === active.id || pair!.some(o => e.orderId === o.id))
    }
  }
} finally {
  save()
  await world.delete()
  report.deleted = true
  save()
}
console.log(JSON.stringify({ worldId: world.id, result: report.result, mappedMinutes: report.mappedMinutes, actions: report.actions, targetEvents: report.targetEvents, deleted: report.deleted }, null, 2))
