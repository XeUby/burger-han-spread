import fs from "node:fs"
import { createHash } from "node:crypto"
import { Dispatcher } from "../../src/policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { DeskEvent, DeskSnapshot } from "../../vendor/typescript/types.ts"
import { costFeatures, names } from "./features.ts"

const training = ["wccca731d04dbfacbaba0", "w7b412da927edcef0081e", "w1a7b82a91f712427b624", "w2464fa0a1a5ce6878d47", "w657d3e2075cdc8dcb443", "wb238803dfa49a69c2e0a"]
const holdout = process.argv.includes("--holdout")
if (holdout && !fs.existsSync("experiments/fulfillment-cost-model.json")) throw new Error("Freeze the training-only model before reading new development outcomes")
const attempts = holdout ? fs.readFileSync("experiments/cost-development-attempts.jsonl", "utf8").trim().split("\n").map(line => JSON.parse(line)) : []
const worlds: string[] = holdout ? attempts.filter(row => row.startedAt).map(row => row.worldId) : training
if (holdout && (worlds.length !== 4 || worlds.some(world => !attempts.some(row => row.worldId===world && row.completedAt)))) throw new Error("All four unique development weeks must finish")
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const groups = [], weeks = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), events: DeskEvent[] = read(`runs/${worldId}.events.json`), snapshot: DeskSnapshot = read(`runs/${worldId}.snapshot.json`)
  if (snapshot.now < snapshot.endsAt) throw new Error("Incomplete training world")
  const { multiRoutes: _mode, ...settings } = meta.settings
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), settings)
  const features = new Map<string, { x: number[]; base: number }>()
  const parent = new Map(snapshot.orders.map(order => [order.id, order.id]))
  const find = (id: string): string => { const p = parent.get(id); if (!p) throw new Error(`Unknown order ${id}`); if (p === id) return id; const root = find(p); parent.set(id, root); return root }
  const union = (ids: string[]) => { for (const id of ids.slice(1)) parent.set(find(id), find(ids[0]!)) }
  const memberships = new Map(snapshot.gigs.map(gig => [gig.id, new Set(gig.stops.map(stop => stop.orderId))]))
  for (const event of events) {
    desk.now = event.at
    if (event.kind === "price_request") {
      desk.requests.set(event.request.id, structuredClone(event.request))
      features.set(event.request.id, { x: costFeatures(desk, event.request), base: desk.baseFee(event.request) })
    }
    if (event.kind === "order_won" || event.kind === "order_changed") desk.orders.set(event.order.id, structuredClone(event.order))
    if (event.kind === "order_cancelled") {
      desk.orders.delete(event.orderId)
      for (const gig of event.gigs) memberships.get(gig.gigId)?.add(event.orderId)
    }
  }
  for (const ids of memberships.values()) union([...ids])
  const byRoot = new Map<string, typeof snapshot.orders>()
  for (const order of snapshot.orders) { const key = find(order.id); if (!byRoot.has(key)) byRoot.set(key, []); byRoot.get(key)!.push(order) }
  const costs = new Map<string, number>()
  let allCost = 0
  for (const event of events) if (event.kind === "ledger" && event.line.kind !== "revenue") {
    const line = event.line, id = line.orderId ?? (line.gigId ? memberships.get(line.gigId)?.values().next().value : undefined)
    if (!id) throw new Error(`Unassigned ledger cost in ${worldId}`)
    const key = find(id)
    costs.set(key, (costs.get(key) ?? 0) - line.cents)
    allCost -= line.cents
  }
  let excludedCost = 0, excludedOrders = 0, includedCost = 0, includedOrders = 0
  for (const [key, orders] of byRoot) {
    const costCents = costs.get(key) ?? 0
    if (orders.some(order => order.status === "cancelled" || desk.requests.get(order.id)?.legs.length !== 1)) { excludedCost += costCents; excludedOrders += orders.length; continue }
    const members = orders.map(order => ({ orderId: order.id, ...features.get(order.id)! }))
    if (members.some(member => !member.x || !member.base)) throw new Error("Missing arrival features")
    includedCost += costCents; includedOrders += orders.length
    groups.push({ worldId, seed: meta.seed, orders: members, costCents })
  }
  if (allCost !== includedCost + excludedCost) throw new Error("Group costs do not reconcile")
  weeks.push({ worldId, seed: meta.seed, revision: meta.revision, includedOrders, excludedOrders, includedCostCents: includedCost, excludedCostCents: excludedCost, totalCostCents: allCost, eventsSha256: createHash("sha256").update(fs.readFileSync(`runs/${worldId}.events.json`)).digest("hex") })
}
if (new Set(weeks.map(week => week.seed)).size !== weeks.length) throw new Error("Repeated seeds are not independent weeks")
const path = `docs/fulfillment-cost-${holdout ? "development-holdout" : "training"}.json`
fs.writeFileSync(path, JSON.stringify({ names, weeks, groups, interpretation: "Targets are complete connected groups of orders sharing a gig, with each ledger expense assigned once to its group. No arbitrary allocation of shared driver fees to individual cars. Features are captured at price-request arrival; final outcomes determine targets only. Groups containing cancellations or initial multi-leg requests are excluded and their costs reported. The model targets the observed admitted domain, not arbitrary rejected requests." }, null, 2)+"\n")
console.log(JSON.stringify({ path, weeks: weeks.length, groups: groups.length, includedOrders: weeks.reduce((sum, week) => sum+week.includedOrders,0), excludedOrders: weeks.reduce((sum, week) => sum+week.excludedOrders,0) }))
