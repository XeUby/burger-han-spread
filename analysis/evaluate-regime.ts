import { readFileSync, writeFileSync } from "node:fs"
import { DemandModel } from "../src/optimizer.ts"
import type { MarketFeatures } from "../src/optimizer.ts"

const worlds = JSON.parse(readFileSync(new URL("market-training-data.json", import.meta.url), "utf8"))
const places = JSON.parse(readFileSync(new URL("../docs/map.json", import.meta.url), "utf8")).places as { id: string; lat: number; lon: number }[]
const near = places.map(a => places.map(b => {
  const toRad = Math.PI / 180
  const sinLat = Math.sin((a.lat - b.lat) * toRad / 2)
  const sinLon = Math.sin((a.lon - b.lon) * toRad / 2)
  const km = 12742 * Math.asin(Math.sqrt(sinLat ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * sinLon ** 2))
  return km <= 80
}))
const ids = new Map(places.map((place, index) => [place.id, index]))
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))
class Regime {
  base = new DemandModel()
  states: { war: number; outage: number; center: number; weight: number }[] = []
  temperature: number
  constructor(temperature: number) {
    this.temperature = temperature
    for (let war = 0; war < 5; war++) for (let outage = 0; outage < 5; outage++) if (war !== outage) for (let center = 0; center < places.length; center++) this.states.push({ war, outage, center, weight: 1 / (20 * places.length) })
  }
  groups(f: MarketFeatures) {
    return this.states.map(state => state.war === f.day ? 1 : state.outage === f.day && near[state.center]![ids.get(f.origin)!] ? 2 : 0)
  }
  probabilities(f: MarketFeatures, ratio: number) {
    const threshold = this.base.threshold(f)
    return [0, -0.28, 0.42].map(shift => sigmoid(14 * (threshold + shift - ratio)))
  }
  probability(f: MarketFeatures, ratio: number) {
    const probabilities = this.probabilities(f, ratio)
    return this.groups(f).reduce((sum, group, index) => sum + this.states[index]!.weight * probabilities[group]!, 0)
  }
  observe(f: MarketFeatures, ratio: number, won: boolean) {
    const groups = this.groups(f)
    const probabilities = this.probabilities(f, ratio)
    let total = 0
    for (let i = 0; i < this.states.length; i++) {
      const p = probabilities[groups[i]!]!
      this.states[i]!.weight *= Math.pow(Math.max(1e-12, won ? p : 1 - p), this.temperature)
      total += this.states[i]!.weight
    }
    let shift = 0
    for (let i = 0; i < this.states.length; i++) {
      this.states[i]!.weight /= total
      shift += this.states[i]!.weight * [0, -0.28, 0.42][groups[i]!]!
    }
    this.base.observe(f, ratio - shift, won)
  }
}
const results = []
for (const temperature of [0, 0.25, 0.5, 1]) {
  const weeks = []
  for (const world of worlds) {
    const model = temperature ? new Regime(temperature) : new DemandModel()
    const actions = world.observations.flatMap((observation: any) => [{ at: observation.quoteSeq, kind: "quote", observation }, { at: observation.outcomeSeq, kind: "outcome", observation }]).sort((a: any, b: any) => a.at - b.at)
    let loss = 0, brier = 0
    for (const action of actions) {
      const row = action.observation
      if (action.kind === "outcome") model.observe(row.features, row.ratio, row.won)
      else {
        const p = Math.max(1e-10, Math.min(1 - 1e-10, model.probability(row.features, row.ratio)))
        loss -= Math.log(row.won ? p : 1 - p)
        brier += (Number(row.won) - p) ** 2
      }
    }
    weeks.push({ seed: world.seed, n: world.observations.length, logLoss: loss / world.observations.length, brier: brier / world.observations.length })
  }
  const n = weeks.reduce((sum, week) => sum + week.n, 0)
  const result = { temperature, n, logLoss: weeks.reduce((sum, week) => sum + week.n * week.logLoss, 0) / n, meanWorldLogLoss: weeks.reduce((sum, week) => sum + week.logLoss, 0) / weeks.length, brier: weeks.reduce((sum, week) => sum + week.n * week.brier, 0) / n, weeks }
  results.push(result)
  const { weeks: ignored, ...summary } = result
  console.log(summary)
}
writeFileSync(new URL("regime-evaluation.json", import.meta.url), JSON.stringify(results, null, 2) + "\n")
