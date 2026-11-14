import fs from "node:fs"
import { planBundles } from "../src/bundles.ts"
import type { BundleCandidate, BundlePlan } from "../src/bundles.ts"
import { Network } from "../src/planning.ts"
import { readNote } from "../src/notes.ts"
import type { DeskEvent, Gig, Order, PriceRequest } from "../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const network = new Network(read("docs/map.json")), rows: any[] = []
for (const world of worlds) {
  const meta = read(`runs/${world}.meta.json`), snapshot = read(`runs/${world}.snapshot.json`), events: DeskEvent[] = read(`runs/${world}.events.json`)
  const requests = new Map<string, PriceRequest>(), won = new Map<string, Order>()
  for (const event of events) {
    if (event.kind === "price_request") requests.set(event.request.id, event.request)
    if (event.kind === "order_won") won.set(event.order.id, { ...structuredClone(event.order), status: "waiting", deliveredAt: event.order.legs.map(() => null) })
  }
  const seen = new Set<string>(), arrivals: { at: number; candidate: BundleCandidate }[] = []
  for (const gig of (snapshot.gigs as Gig[]).toSorted((a, b) => a.postedAt - b.postedAt)) {
    const id = gig.stops[0]!.orderId, order = won.get(id), request = requests.get(id)
    if (!order || !request || seen.has(id)) continue
    seen.add(id)
    const base = Math.max(2000, Math.round(request.referenceFeeCents * meta.settings.fee))
    const due = Math.max(gig.postedAt + 30, order.lastPickupAt - 240)
    const schedule = [{ at: gig.postedAt, feeCents: base }, { at: due, feeCents: Math.round(base * 1.45) }, { at: Math.max(due + 30, order.lastPickupAt - 120), feeCents: Math.round(base * 1.9) }, { at: Math.max(due + 60, order.lastPickupAt - 60), feeCents: Math.round(base * 2.5) }]
    arrivals.push({ at: gig.postedAt, candidate: { order, noteSafe: readNote(request.note).safe, post: { type: "post", stops: gig.stops, audience: gig.audience, schedule } } })
  }
  for (const holdMinutes of [0, 5, 15]) {
    let queue: typeof arrivals = []
    const selected: (BundlePlan & { at: number; waitMinutes: number[] })[] = []
    for (let i = 0; i < arrivals.length;) {
      const at = arrivals[i]!.at
      queue = queue.filter(q => at - q.at <= holdMinutes)
      while (i < arrivals.length && arrivals[i]!.at === at) queue.push(arrivals[i++]!)
      const plans = planBundles(at, queue.map(q => q.candidate), network)
      const used = new Set(plans.flatMap(p => p.indices))
      for (const plan of plans) selected.push({ ...plan, at, waitMinutes: plan.indices.map(k => at - queue[k]!.at) })
      queue = queue.filter((_, k) => !used.has(k))
    }
    rows.push({ worldId: world, seed: meta.seed, holdMinutes, initialPosts: arrivals.length, pairs: selected.length, affectedOrders: 2 * selected.length, modeledFeeSavingsCents: selected.reduce((sum, p) => sum + p.feeSavingCents, 0), modeledSavedWorkMinutes: selected.reduce((sum, p) => sum + p.savedWorkMinutes, 0), meanWaitMinutes: selected.length ? selected.reduce((sum, p) => sum + p.waitMinutes.reduce((a, b) => a + b, 0), 0) / (selected.length * 2) : 0, selected })
  }
}
const summary = [0, 5, 15].map(holdMinutes => {
  const subset = rows.filter(row => row.holdMinutes === holdMinutes)
  return { holdMinutes, worlds: subset.length, initialPosts: subset.reduce((n, r) => n + r.initialPosts, 0), pairs: subset.reduce((n, r) => n + r.pairs, 0), modeledFeeSavingsCents: subset.reduce((n, r) => n + r.modeledFeeSavingsCents, 0), modeledSavedWorkMinutes: subset.reduce((n, r) => n + r.modeledSavedWorkMinutes, 0) }
})
const report = { scope: "Retrospective first-post queue replay on the eight previously evaluated worlds already authorized for stage-two development; no future holdouts.", method: "New first posts are accumulated for at most 0, 5 or 15 minutes. At each arrival minute the pure sequential-bundle helper chooses disjoint pairs. This ignores original driver bookings because held posts would not yet be visible. Prices are reference fee times the source fee multiplier, floored at 20 euros; low-supply surcharges are omitted. Saved order_won payloads were mutated by the original dispatcher, so their delivery status is explicitly reconstructed as waiting with no delivered legs at win time.", limitations: ["This is a queue opportunity count, not a causal rollout or acceptance/profit estimate.", "Holding every unmatched post introduces an unmeasured delay cost.", "Future orders, supply and trust could change after earlier bundling. No such counterfactual changes are simulated.", "Saved work is a geographic proxy with home at each independent pickup; actual driver homes, ticket prices and daily constraints are unknown.", "The accompanying normal-API probe rejected simultaneous car carrying; only pickup-delivery-pickup-delivery is considered."], summary, rows }
fs.writeFileSync("docs/bundle-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ summary, rows: rows.map(({ selected, ...r }) => r) }, null, 2))
