import fs from "node:fs"
import { Dispatcher } from "../../src/policy.ts"
import { planBundles } from "../../src/bundles.ts"
import type { BundleCandidate } from "../../src/bundles.ts"
import { requestFeasibility } from "../../src/admission.ts"
import { needsCharge } from "../../src/planning.ts"
import { joint, probability, single } from "./optimizer.ts"
import type { Bid } from "./optimizer.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { PriceRequest, Reveal } from "../../vendor/typescript/types.ts"

const worlds = ["w09f7d47c59507d4e46cb", "w5e573ada5fed0a67a4a8", "w679c0fd4b18e923880c6", "w6ffd0c010757c76f97d8", "w2f96a475ae718d1589d9", "w8b85572a9b6fc286e4ec", "w735d87d8fe1b99845667", "wce13500dc9c2829611d1"]
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const map = read("docs/map.json")
const weeks = [], details = []
for (const worldId of worlds) {
  const desk = new Dispatcher({} as World, 8, 0, map, read(`runs/${worldId}.drivers.json`), { maxKm: 700, minDrivers: 8 })
  const reveal: Reveal = read(`runs/${worldId}.reveal.json`)
  const requests = reveal.requests.map(item => item.request).sort((a, b) => a.arrivedAt - b.arrivedAt)
  let queue: PriceRequest[] = [], cursor = 0, pairs = 0, jointGain = 0, routeValue = 0, subCost = 0
  while (cursor < requests.length || queue.length) {
    const decisionAt = queue.length ? Math.min(...queue.map(request => request.respondBy - 5)) : Infinity
    if ((requests[cursor]?.arrivedAt ?? Infinity) <= decisionAt && cursor < requests.length) { queue.push(requests[cursor++]!); continue }
    const available = queue.flatMap(request => {
      const candidate = makeCandidate(desk, request)
      return candidate ? [{ request, ...candidate }] : []
    })
    queue = []
    const matched = planBundles(decisionAt + 5, available.map(item => item.candidate), desk.network)
    for (const pair of matched) {
      const first = available[pair.indices[0]]!, second = available[pair.indices[1]]!
      const a = single(first.bid), b = single(second.bid)
      const expectedSaving = pair.feeSavingCents * probability(first.bid, a.price) * probability(second.bid, b.price)
      const independent = a.profit + b.profit + expectedSaving
      const choice = joint(first.bid, second.bid, pair.feeSavingCents)
      const gain = choice.expectedProfit - independent
      if (gain < -0.02) throw new Error("Joint optimization fell below feasible independent prices")
      pairs++
      routeValue += expectedSaving
      jointGain += gain
      subCost += Number(choice.prices[0] < first.bid.cost || choice.prices[1] < second.bid.cost)
      details.push({ worldId, decisionAt, requests: [first.request.id, second.request.id], savingCentsIfBothWin: pair.feeSavingCents, expectedRouteSavingCents: expectedSaving, independentPrices: [a.price, b.price], joint: choice, incrementalPricingProfitCents: gain })
    }
  }
  weeks.push({ worldId, seed: read(`runs/${worldId}.meta.json`).seed, requests: requests.length, contemporaneousPairs: pairs, expectedRouteSavingCents: routeValue, incrementalJointPricingProfitCents: jointGain, pairsWithSubCostLeg: subCost })
}
const summary = { weeks: weeks.length, pairs: weeks.reduce((sum, row) => sum + row.contemporaneousPairs, 0), meanModeledRouteSavingEuros: weeks.reduce((sum, row) => sum + row.expectedRouteSavingCents, 0) / weeks.length / 100, meanAdditionalJointPricingEuros: weeks.reduce((sum, row) => sum + row.incrementalJointPricingProfitCents, 0) / weeks.length / 100, pairsWithSubCostLeg: weeks.reduce((sum, row) => sum + row.pairsWithSubCostLeg, 0) }
fs.writeFileSync("docs/joint-acquisition-screen.json", JSON.stringify({ method: "Eight named development request streams. At five minutes before the oldest response deadline, form feasible sequential pairs among all then-known requests. Assume independent logistic wins, slope14 and threshold1.4, no trust uplift, and quoted alternatives all feasible under the earliest offered deadline. Compare independent optimal prices with a branch-and-bound certified joint price optimum, crediting both policies the route saving when both win.", limitations: ["This is a model-based screen, not measured profit or a global bound on dispatch performance.", "No future arrivals enter a decision, but counterfactual capacity, prices, dealer option choice and driver behavior are not simulated.", "Actual order wins are correlated through market conditions; the independent conditional-win assumption can be wrong.", "Pairs use the existing conservative routing helper and20% fee discount cap. This is not a proof against more ambitious acquisition or route planning."], summary, weeks, details }, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))

function makeCandidate(desk: Dispatcher, request: PriceRequest): { candidate: BundleCandidate; bid: Bid } | null {
  if (!desk.noteRules(request).safe || request.legs.length !== 1) return null
  const leg = request.legs[0]!
  if (leg.pickup.privateAddress || leg.delivery.privateAddress || desk.network.km(leg.pickup.placeId, leg.delivery.placeId) > 700 || desk.supply(request) < 8) return null
  const options = request.options.filter(option => {
    const feasible = requestFeasibility(request, option.deadline, desk.network)
    return feasible && feasible.latestPickupAt >= Math.max(request.respondBy + 300, leg.pickup.window.from + 120)
  })
  if (!options.length) return null
  const deadline = Math.min(...options.map(option => option.deadline))
  const latest = requestFeasibility(request, deadline, desk.network)!.latestPickupAt
  const fee = desk.baseFee(request), rules = desk.noteRules(request)
  const order = { id: request.id, dealerId: request.dealerId, option: options[0]!.kind, priceCents: 0, deadline, legs: [{ ...leg, pickup: { ...leg.pickup, window: { ...leg.pickup.window, to: deadline } }, delivery: { ...leg.delivery, window: { ...leg.delivery.window, to: deadline } } }], status: "waiting" as const, deliveredAt: [null], lastPickupAt: latest }
  return {
    candidate: { order, noteSafe: true, post: { type: "post", stops: [{ orderId: request.id, leg: 0, kind: "pickup", withPlates: rules.plates, withCharging: needsCharge(leg, desk.network) }, { orderId: request.id, leg: 0, kind: "delivery" }], audience: { experienced: leg.car.premium, manualLicence: rules.manual }, schedule: [{ at: request.respondBy, feeCents: fee }, { at: latest, feeCents: Math.round(fee * 2.5) }] } },
    bid: { cost: fee * 1.15, scale: Math.min(...options.map(option => option.listPriceCents)), threshold: 1.4, slope: 14, minimum: Math.ceil(fee * 0.5), maximum: Math.ceil(Math.max(fee, ...options.map(option => option.listPriceCents)) * 2.5) },
  }
}
