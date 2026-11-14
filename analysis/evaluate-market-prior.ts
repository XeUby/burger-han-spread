import { readFileSync, writeFileSync } from "node:fs"
import { DemandModel } from "../src/optimizer.ts"
import type { MarketFeatures } from "../src/optimizer.ts"

type Observation = { features: MarketFeatures; ratio: number; won: boolean; quoteSeq: number; outcomeSeq: number; requestId: string }
type World = { seed: string; worldId: string; fold: number; observations: Observation[] }
type Fit = { variant: string; fold: number; coefficients: Record<string, number>; trainingSeeds: string[] }
const worlds: World[] = JSON.parse(readFileSync(new URL("market-training-data.json", import.meta.url), "utf8"))
const fits: Fit[] = JSON.parse(readFileSync(new URL("market-prior-cross-validation.json", import.meta.url), "utf8"))
const results = []
for (const variant of ["none", "places", "dealer", "lane"]) {
  for (const weight of variant === "none" ? [0] : [0.5, 1]) {
    const weeks = []
    for (const world of worlds) {
      const fit = fits.find(fit => fit.fold === world.fold && fit.variant === variant)
      if (fit?.trainingSeeds.includes(world.seed)) throw new Error("World leaked into training")
      const prior = (features: MarketFeatures) => {
        const c = fit?.coefficients ?? {}
        return weight * ((c.intercept ?? 0) + (c[`origin:${features.origin}`] ?? 0) + (c[`destination:${features.destination}`] ?? 0) + (c[`dealer:${features.dealer}`] ?? 0) + (c[`lane:${features.origin}:${features.destination}`] ?? 0) + (c.distance ?? 0) * Math.max(-1, Math.min(2, (features.km - 200) / 200)))
      }
      const model = new DemandModel()
      const actions = world.observations.flatMap(observation => [{ at: observation.quoteSeq, kind: "quote", observation }, { at: observation.outcomeSeq, kind: "outcome", observation }]).sort((a, b) => a.at - b.at)
      let loss = 0, brier = 0
      for (const action of actions) {
        const row = action.observation
        const ratio = row.ratio - prior(row.features)
        if (action.kind === "outcome") model.observe(row.features, ratio, row.won)
        else {
          const p = Math.max(1e-10, Math.min(1 - 1e-10, model.probability(row.features, ratio)))
          loss -= Math.log(row.won ? p : 1 - p)
          brier += (Number(row.won) - p) ** 2
        }
      }
      weeks.push({ seed: world.seed, n: world.observations.length, logLoss: loss / world.observations.length, brier: brier / world.observations.length })
    }
    const n = weeks.reduce((sum, week) => sum + week.n, 0)
    const result = { variant, weight, n, logLoss: weeks.reduce((sum, week) => sum + week.n * week.logLoss, 0) / n, meanWorldLogLoss: weeks.reduce((sum, week) => sum + week.logLoss, 0) / weeks.length, brier: weeks.reduce((sum, week) => sum + week.n * week.brier, 0) / n, weeks }
    results.push(result)
    const { weeks: ignored, ...summary } = result
    console.log(summary)
  }
}
writeFileSync(new URL("market-prior-evaluation.json", import.meta.url), JSON.stringify(results, null, 2) + "\n")
