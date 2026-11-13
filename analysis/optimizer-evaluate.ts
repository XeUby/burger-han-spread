import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { DemandModel, type MarketFeatures } from "../src/optimizer.ts"

const root = new URL("../runs/", import.meta.url)
const map = JSON.parse(readFileSync(new URL("../docs/map.json", import.meta.url), "utf8"))
const roads = new Map<string, number>(map.roads.map((road: any) => [`${road.from}:${road.to}`, road.km]))
const reserved = new Set(JSON.parse(readFileSync(new URL("../experiments/holdout-seeds.json", import.meta.url), "utf8")).seeds)
const worlds = readdirSync(root).filter(file => file.endsWith(".reveal.json")).map(file => file.replace(".reveal.json", "")).filter(world => {
  const meta = new URL(`${world}.meta.json`, root)
  return existsSync(meta) && !reserved.has(JSON.parse(readFileSync(meta, "utf8")).seed)
})
const results: unknown[] = []
for (const slope of [4, 8, 14, 20]) {
  let n = 0, loss = 0, brier = 0, staticLoss = 0, staticBrier = 0
  for (const world of worlds) {
    const reveal = JSON.parse(readFileSync(new URL(`${world}.reveal.json`, root), "utf8"))
    const events = JSON.parse(readFileSync(new URL(`${world}.events.json`, root), "utf8"))
    const quotes = new Map<string, any>(reveal.requests.map((row: any) => [row.request.id, row]))
    const model = new DemandModel({ slope })
    const trust = new Map<string, number>()
    const pending = new Map<string, { features: MarketFeatures; ratio: number; predicted: number }>()
    const orders = new Map<string, any>()
    for (const event of events) {
      if (event.kind === "price_request") {
        const row = quotes.get(event.request.id)
        if (!row?.quote || Math.min(...Object.values(row.quote) as number[]) > 1_000_000) continue
        const request = row.request
        const leg = request.legs[0]
        const features = { day: Math.floor(request.arrivedAt / 1440), origin: leg.pickup.placeId, destination: leg.delivery.placeId, dealer: request.dealerId, km: roads.get(`${leg.pickup.placeId}:${leg.delivery.placeId}`)! }
        const ratio = Math.min(...request.options.filter((option: any) => row.quote[option.kind] !== undefined).map((option: any) => row.quote[option.kind] / option.listPriceCents)) / (1 + 0.01 * (trust.get(request.dealerId) ?? 0))
        pending.set(request.id, { features, ratio, predicted: model.probability(features, ratio) })
      }
      if (event.kind === "order_won") orders.set(event.order.id, event.order)
      if (event.kind === "order_won" || event.kind === "order_lost") {
        const id = event.kind === "order_won" ? event.order.id : event.requestId
        const data = pending.get(id)
        if (!data) continue
        const won = event.kind === "order_won"
        model.observe(data.features, data.ratio, won)
        const predicted = Math.min(1 - 1e-12, Math.max(1e-12, data.predicted))
        const prior = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.exp(slope * (data.ratio - 1.4)))))
        n++
        loss -= Math.log(won ? predicted : 1 - predicted)
        brier += (Number(won) - predicted) ** 2
        staticLoss -= Math.log(won ? prior : 1 - prior)
        staticBrier += (Number(won) - prior) ** 2
        pending.delete(id)
      }
      if (event.kind === "delivered") {
        const order = orders.get(event.orderId)
        if (!order || order.legs.length !== 1) continue
        const current = trust.get(order.dealerId) ?? 0
        trust.set(order.dealerId, event.at <= order.deadline ? Math.min(25, current + 1) : Math.floor(current / 2))
      }
    }
  }
  results.push({ slope, n, logLoss: loss / n, brier: brier / n, staticLogLoss: staticLoss / n, staticBrier: staticBrier / n })
}
writeFileSync(new URL("./optimizer-calibration.json", import.meta.url), JSON.stringify(results, null, 2) + "\n")
console.log(JSON.stringify(results, null, 2))
