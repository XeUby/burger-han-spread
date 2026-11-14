import fs from "node:fs"
import { planBundles } from "../src/bundles.ts"
import type { BundleCandidate } from "../src/bundles.ts"
import { Network } from "../src/planning.ts"
import { readNote } from "../src/notes.ts"
import type { DeskEvent, Gig, Order, PriceRequest } from "../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const network = new Network(read("docs/map.json"))
const rows = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`)
  const snapshot = read(`runs/${worldId}.snapshot.json`)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const requests = new Map<string, PriceRequest>()
  const won = new Map<string, Order>()
  const cancelled = new Map<string, number>()
  for (const event of events) {
    if (event.kind === "price_request") requests.set(event.request.id, event.request)
    if (event.kind === "order_won") won.set(event.order.id, { ...structuredClone(event.order), status: "waiting", deliveredAt: event.order.legs.map(() => null) })
    if (event.kind === "order_cancelled") cancelled.set(event.orderId, event.at)
  }
  const seen = new Set<string>()
  const arrivals: { at: number; candidate: BundleCandidate }[] = []
  for (const gig of (snapshot.gigs as Gig[]).toSorted((a, b) => a.postedAt - b.postedAt)) {
    const id = gig.stops[0]!.orderId, order = won.get(id), request = requests.get(id)
    if (!order || !request || seen.has(id)) continue
    seen.add(id)
    if (order.legs.length !== 1 || !readNote(request.note).safe || order.legs.some(leg => leg.pickup.privateAddress || leg.delivery.privateAddress) || order.lastPickupAt <= gig.postedAt + 360) continue
    const base = Math.max(2000, Math.round(request.referenceFeeCents * meta.settings.fee))
    const due = Math.max(gig.postedAt + 30, order.lastPickupAt - 240)
    const schedule = [{ at: gig.postedAt, feeCents: base }, { at: due, feeCents: Math.round(base * 1.45) }, { at: Math.max(due + 30, order.lastPickupAt - 120), feeCents: Math.round(base * 1.9) }, { at: Math.max(due + 60, order.lastPickupAt - 60), feeCents: Math.round(base * 2.5) }]
    arrivals.push({ at: gig.postedAt, candidate: { order, noteSafe: true, post: { type: "post", stops: gig.stops, audience: gig.audience, schedule } } })
  }
  for (const holdMinutes of [5, 15, 30, 60, 120]) {
    let cursor = 0, queue: typeof arrivals = [], pairs = 0, savings = 0, waited = 0, posts = 0
    while (cursor < arrivals.length || queue.length) {
      const flushAt = queue.length ? queue[0]!.at + holdMinutes : Infinity
      const arrivalAt = arrivals[cursor]?.at ?? Infinity
      if (arrivalAt < flushAt) {
        queue.push(arrivals[cursor++]!)
        continue
      }
      queue = queue.filter(item => (cancelled.get(item.candidate.order.id) ?? Infinity) > flushAt)
      const plans = planBundles(flushAt, queue.map(item => item.candidate), network)
      pairs += plans.length
      savings += plans.reduce((sum, plan) => sum + plan.feeSavingCents, 0)
      waited += queue.reduce((sum, item) => sum + flushAt - item.at, 0)
      posts += queue.length
      queue = []
    }
    rows.push({ worldId, seed: meta.seed, holdMinutes, eligibleOrders: arrivals.length, pairs, modeledFeeSavingCents: savings, averageWaitMinutes: waited / posts })
  }
}
const summary = [5, 15, 30, 60, 120].map(holdMinutes => {
  const selected = rows.filter(row => row.holdMinutes === holdMinutes)
  return { holdMinutes, weeks: selected.length, pairs: selected.reduce((sum, row) => sum + row.pairs, 0), meanModeledSavingEuros: selected.reduce((sum, row) => sum + row.modeledFeeSavingCents, 0) / selected.length / 100 }
})
const report = {
  scope: "Eight previously evaluated development weeks; fixed accepted orders and original first-post times.",
  method: "Flush the entire waiting batch when its oldest post reaches the hold limit, matching the current dispatcher. Exclude private, multi-leg, unsafe-note, urgent and cancelled orders. Reconstruct historical won payloads as waiting because old logs shared mutable order objects.",
  limitations: ["This is a timing opportunity screen, not a causal estimate of profit or reliability.", "Fees omit low-supply surcharges and use reconstructed initial schedules.", "The accepted order set, route changes and driver reactions would differ in a rollout.", "Matching at arrival exactly equal to a flush time is conservatively deferred to the next batch."],
  summary, rows,
}
fs.writeFileSync("docs/bundle-timing.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
