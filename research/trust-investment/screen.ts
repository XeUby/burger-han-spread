import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import { DemandModel, optimalLogisticPrice } from "../../src/optimizer.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { Order, Reveal } from "../../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks: { worldId: string; seed: string; offered: number; meanTrustPointEuros: number; maximumTrustPointEuros: number; modeledPricingGainEuros: number; additionalExpectedWins: number; quotesReduced: number }[] = []
for (const worldId of worlds) {
  const reveal: Reveal = read(`runs/${worldId}.reveal.json`)
  const orders: Order[] = read(`runs/${worldId}.snapshot.json`).orders
  const desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`))
  const market = new DemandModel()
  const trust = new Map<string, number>()
  const changes = orders.filter(order => order.status !== "cancelled" && order.deliveredAt.every(at => at !== null)).map(order => ({
    at: Math.max(...order.deliveredAt as number[]), dealer: order.dealerId,
    onTime: order.legs.every((leg, i) => order.deliveredAt[i]! <= Math.min(order.deadline, leg.delivery.privateAddress ? leg.delivery.window.to + 30 : Infinity)),
  })).sort((a, b) => a.at - b.at)
  const count = (value: number, onTime: boolean) => onTime ? Math.min(25, value + 1) : Math.floor(value / 2)
  const offered = reveal.requests.filter(row => row.quote && Object.values(row.quote).some(value => value! < 100_000_000)).sort((a, b) => a.request.arrivedAt - b.request.arrivedAt)
  const pending: { at: number; features: ReturnType<Dispatcher["features"]>; ratio: number; won: boolean }[] = []
  const rows = []
  let cursor = 0
  for (const row of offered) {
    const r = row.request, leg = r.legs[0]!, at = r.arrivedAt
    while (cursor < changes.length && changes[cursor]!.at <= at) {
      const change = changes[cursor++]!
      trust.set(change.dealer, count(trust.get(change.dealer) ?? 0, change.onTime))
    }
    for (let i = 0; i < pending.length;) {
      const result = pending[i]!
      if (result.at > at) { i++; continue }
      market.observe(result.features, result.ratio, result.won)
      pending.splice(i, 1)
    }
    const features = desk.features(r), n = trust.get(r.dealerId) ?? 0, factor = 1 + n * .01
    const options = r.options.filter(option => row.quote![option.kind] !== undefined && row.quote![option.kind]! < 100_000_000)
    const list = Math.min(...options.map(option => option.listPriceCents))
    const ratio = Math.min(...options.map(option => row.quote![option.kind]! / option.listPriceCents / factor))
    pending.push({ at: r.respondBy, features, ratio, won: row.outcome === "won" })
    rows.push({ id: r.id, dealer: r.dealerId, at, trust: n, factor, threshold: market.threshold(features), list, fee: desk.baseFee(r),
      earliest: Math.max(r.respondBy, leg.pickup.window.from) + desk.network.minutes(leg.pickup.placeId, leg.delivery.placeId) + 20,
      won: row.outcome === "won", price: row.option ? row.quote![row.option]! : 0 })
  }
  let gain = 0, extraWins = 0, totalValue = 0, maxValue = 0, reductions = 0
  for (const row of rows) {
    const earlier = changes.filter(change => change.dealer === row.dealer && change.at < row.earliest)
    let baseline = earlier.reduce((value, change) => count(value, change.onTime), 0)
    let augmented = Math.min(25, baseline + 1)
    const later = changes.filter(change => change.dealer === row.dealer && change.at >= row.earliest)
    let next = 0, value = 0
    for (const future of rows.filter(future => future.dealer === row.dealer && future.at >= row.earliest)) {
      while (next < later.length && later[next]!.at <= future.at) {
        baseline = count(baseline, later[next]!.onTime)
        augmented = count(augmented, later[next++]!.onTime)
      }
      if (future.won) value += future.price * .01 * (augmented - baseline) / future.factor
    }
    const inputs = { costCents: row.fee * 1.15, listPriceCents: row.list, trust: row.factor, threshold: row.threshold, slope: 14, minPrice: Math.ceil(row.fee / .9) }
    const immediate = optimalLogisticPrice(inputs)
    const investment = optimalLogisticPrice({ ...inputs, costCents: Math.max(0, inputs.costCents - value) })
    const evaluate = (price: typeof immediate) => (price.priceCents - inputs.costCents + value) * price.probability
    gain += evaluate(investment) - evaluate(immediate)
    extraWins += investment.probability - immediate.probability
    totalValue += value
    maxValue = Math.max(maxValue, value)
    reductions += Number(investment.priceCents < immediate.priceCents)
  }
  weeks.push({ worldId, seed: read(`runs/${worldId}.meta.json`).seed, offered: rows.length, meanTrustPointEuros: totalValue / rows.length / 100, maximumTrustPointEuros: maxValue / 100, modeledPricingGainEuros: gain / 100, additionalExpectedWins: extraWins, quotesReduced: reductions })
}
const mean = (key: "modeledPricingGainEuros" | "additionalExpectedWins" | "meanTrustPointEuros") => weeks.reduce((sum, row) => sum + row[key], 0) / weeks.length
const summary = { weeks: weeks.length, meanModeledPricingGainEuros: mean("modeledPricingGainEuros"), meanAdditionalExpectedWins: mean("additionalExpectedWins"), meanTrustPointEuros: mean("meanTrustPointEuros") }
const report = {
  method: "Screen eight explicitly named old development weeks. Learn demand chronologically from historical offered quotes. For each offered request, give a hypothetical extra on-time delivery one trust point at the optimistic earliest arrival. Replay later actual trust changes, including halving and the25-point cap. Value the point by raising later historical won prices proportionally while holding their normalized markup fixed. Compare immediate optimal logistic pricing with pricing that credits this retrospective continuation value.",
  limitations: ["Future wins are used only for retrospective screening, never as an implementable signal.", "The extra delivery is assumed on time with no booking delay, waiting or capacity displacement. Shared continuation values can be counted more than once; this is not a causal profit estimate or rigorous upper bound.", "Only historically offered requests are screened. Admission changes, new demand, refunds, correlated outcomes and dynamic capacity effects are not modeled.", "Real-time dealer request forecasts and fulfillment probabilities would be needed before a deployable trust-investment policy."], summary, weeks,
}
fs.writeFileSync("docs/trust-investment-screen.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
