import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import { planBundles } from "../../src/bundles.ts"
import type { BundleCandidate } from "../../src/bundles.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { DeskEvent } from "../../vendor/typescript/types.ts"
import { planRoutes } from "./routes.ts"

const worlds = ["wccca731d04dbfacbaba0", "w7b412da927edcef0081e", "w2464fa0a1a5ce6878d47", "w657d3e2075cdc8dcb443"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
type Totals = { batches: number; orders: number; routes: number; largeRoutes: number; coveredOrders: number; openingCents: number; savedWorkMinutes: number; truncatedBatches: number }
const rows: (Totals & { worldId: string; seed: string; label: string; openingSavingVsValidatedCents: number })[] = [], details: unknown[] = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`)
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const totals: Record<string, Totals> = {}
  const flush = (before: number) => {
    while (desk.held.size) {
      const now = Math.min(...[...desk.held.values()].map(item => item.at + 15))
      if (now >= before) break
      const candidates: BundleCandidate[] = [...desk.held].map(([id, item]) => ({ order: desk.orders.get(id)!, post: item.post, noteSafe: desk.noteRules(desk.requests.get(id)).safe }))
      desk.held.clear()
      const variants = [
        { label: "validated-pairs", selected: planBundles(now, candidates, desk.network), truncated: false },
        { label: "economic-pairs", ...planRoutes(now, candidates, desk.network, { maxCars: 2, connectorKm: 30, savingsShare: 0.5, maxDiscount: 0.2 }) },
        { label: "economic-four", ...planRoutes(now, candidates, desk.network, { maxCars: 4, connectorKm: 30, savingsShare: 0.5, maxDiscount: 0.2 }) },
        { label: "route-cost-four", ...planRoutes(now, candidates, desk.network) },
      ]
      for (const variant of variants) {
        const covered = new Set(variant.selected.flatMap(route => [...route.indices]))
        const fee = (candidate: BundleCandidate) => (candidate.post.schedule.findLast(step => step.at <= now) ?? candidate.post.schedule[0]!).feeCents
        const opening = variant.selected.reduce((sum, route) => sum + route.post.schedule[0]!.feeCents, 0) + candidates.reduce((sum, candidate, i) => sum + (covered.has(i) ? 0 : Math.round(fee(candidate)*0.85)), 0)
        const total = totals[variant.label] ??= { batches: 0, orders: 0, routes: 0, largeRoutes: 0, coveredOrders: 0, openingCents: 0, savedWorkMinutes: 0, truncatedBatches: 0 }
        total.batches++; total.orders += candidates.length; total.routes += variant.selected.length; total.largeRoutes += variant.selected.filter(route => route.indices.length >= 3).length; total.coveredOrders += covered.size; total.openingCents += opening; total.savedWorkMinutes += variant.selected.reduce((sum, route) => sum + route.savedWorkMinutes, 0); total.truncatedBatches += Number(variant.truncated)
        if (candidates.length >= 3) details.push({ worldId, now, label: variant.label, candidates: candidates.map(item => item.order.id), openingCents: opening, truncated: variant.truncated, routes: variant.selected.map(route => ({ orderIds: route.orderIds, feeCents: route.post.schedule[0]!.feeCents, drivingMinutes: route.drivingMinutes, savedWorkMinutes: route.savedWorkMinutes, latestPickupAt: route.latestPickupAt })) })
      }
    }
  }
  for (const event of events) {
    flush(event.at)
    desk.now = event.at
    if (event.kind === "price_request") desk.requests.set(event.request.id, structuredClone(event.request))
    if (event.kind === "order_won") {
      const order = { ...structuredClone(event.order), status: "waiting" as const, deliveredAt: event.order.legs.map(() => null) }
      desk.orders.set(order.id, order)
      await desk.post(order, order.legs.map((_, i) => i))
      desk.outbox.length = 0
    }
    if (event.kind === "order_changed") { desk.orders.set(event.order.id, structuredClone(event.order)); desk.held.delete(event.order.id) }
    if (event.kind === "order_cancelled") { desk.orders.delete(event.orderId); desk.held.delete(event.orderId) }
  }
  flush(Infinity)
  for (const [label, total] of Object.entries(totals)) rows.push({ worldId, seed: meta.seed, label, ...total, openingSavingVsValidatedCents: totals["validated-pairs"]!.openingCents - total.openingCents })
}
const labels = [...new Set(rows.map(row => row.label))]
const summary = labels.map(label => {
  const selected = rows.filter(row => row.label === label)
  return { label, weeks: selected.length, largeRoutes: selected.reduce((sum, row) => sum + row.largeRoutes, 0), coveredOrders: selected.reduce((sum, row) => sum + row.coveredOrders, 0), meanOpeningSavingVsValidatedEuros: selected.reduce((sum, row) => sum + row.openingSavingVsValidatedCents, 0) / selected.length / 100, truncatedBatches: selected.reduce((sum, row) => sum + row.truncatedBatches, 0) }
})
const report = { scope: "Four explicit old control weeks; causal-order replay of first won-order holding batches. No new worlds or fresh validation seeds.", method: "Use only requests and won orders known by each15minute hold flush. Build current note/equipment posts and canonical fees, then compare the incumbent pair planner with net-cost-aware pairs, four-car routes, and a wider route-cost policy. Apply cancellations and changes only when their public events arrive; no final gig stop reconstruction or future outcomes select routes.", limitations: ["Fixed accepted order stream. Driver reactions, trust, subsequent admission and eventual fees would change in a rollout.", "Opening-fee differences are a pricing hypothesis, not realized profit or an upper bound on profit.", "The four-car wide policy changes connectors and the share of modeled work saving reflected in pay; it does not isolate route length alone.", "Order changes during a hold are excluded at their event time. This is an exposure screen, not an exact action replay.", "Enumeration has a30000extension budget per batch. Set packing is exact only for at most20candidates and only among generated routes; larger queues use greedy packing."], summary, rows, details }
fs.writeFileSync("docs/multi-routes-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
