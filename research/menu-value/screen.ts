import fs from "node:fs"
import assert from "node:assert/strict"
import { DemandModel, optimalLogisticPrice } from "../../src/optimizer.ts"
import { Dispatcher } from "../../src/policy.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { MarketFeatures } from "../../src/optimizer.ts"
import type { PriceRequest } from "../../vendor/typescript/types.ts"

type Observation = { features: MarketFeatures; ratio: number; won: boolean; quoteSeq: number; outcomeSeq: number; requestId: string }
type Week = { seed: string; worldId: string; fold: number; observations: Observation[] }
type Revealed = { request: PriceRequest; quote: Record<string, number>; outcome: string; option: string | null }
const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const weeks: Week[] = read("analysis/market-training-data.json")
const selected = read("analysis/market-training-selection.json").worlds
assert.deepEqual(weeks.map(({ seed, worldId, fold }) => ({ seed, worldId, fold })), selected)
const records = new Map<string, Map<string, Revealed>>(weeks.map(week => [week.worldId, new Map(read(`runs/${week.worldId}.reveal.json`).requests.map((row: Revealed) => [row.request.id, row]))]))
const offered = (row: Revealed) => row.request.options.filter(option => row.quote?.[option.kind] !== undefined && row.quote[option.kind]! < 100_000_000)
const key = (row: Revealed) => offered(row).map(option => option.kind).sort().join("+")
const results: { worldId: string; seed: string; fold: number; multiple: number; historicalWon: number; historicalSlow: number; modeledGainCents: number; meanAbsoluteRatioChange: number; modeledWinsChange: number }[] = []
for (const week of weeks) {
  const choices = new Map<string, Map<string, number>>()
  for (const training of weeks.filter(training => training.fold !== week.fold)) {
    for (const observation of training.observations) {
      if (!observation.won) continue
      const row = records.get(training.worldId)!.get(observation.requestId)!
      const counts = choices.get(key(row)) ?? new Map<string, number>()
      counts.set(row.option!, (counts.get(row.option!) ?? 0) + 1)
      choices.set(key(row), counts)
    }
  }
  const model = new DemandModel(), desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${week.worldId}.drivers.json`))
  const events = week.observations.flatMap(observation => [{ at: observation.quoteSeq, quote: true, observation }, { at: observation.outcomeSeq, quote: false, observation }]).sort((a, b) => a.at - b.at)
  let gain = 0, multiple = 0, absoluteRatioChange = 0, expectedWinsChange = 0, historicalWon = 0, historicalSlow = 0
  for (const event of events) {
    const observation = event.observation
    if (!event.quote) { model.observe(observation.features, observation.ratio, observation.won); continue }
    const row = records.get(week.worldId)!.get(observation.requestId)!, options = offered(row)
    if (options.length < 2) continue
    multiple++
    const counts = choices.get(key(row)) ?? new Map(), total = options.reduce((sum, option) => sum + (counts.get(option.kind) ?? 0) + 1, 0)
    const meanList = options.reduce((sum, option) => sum + option.listPriceCents * ((counts.get(option.kind) ?? 0) + 1) / total, 0)
    const minList = Math.min(...options.map(option => option.listPriceCents))
    const rawRatio = Math.min(...options.map(option => row.quote[option.kind]! / option.listPriceCents))
    const trust = rawRatio / observation.ratio
    const fee = desk.baseFee(row.request), cost = fee * desk.settings.costRatio
    const common = { costCents: cost, trust, minPrice: Math.ceil(fee / (1 - desk.settings.margin)), slope: model.settings.slope, threshold: model.threshold(observation.features) }
    const before = optimalLogisticPrice({ ...common, listPriceCents: minList })
    const after = optimalLogisticPrice({ ...common, listPriceCents: meanList, minPrice: Math.ceil(common.minPrice * meanList / minList) })
    const expected = (ratio: number) => (ratio * trust * meanList - cost) * model.probability(observation.features, ratio)
    gain += expected(after.ratio) - expected(before.ratio)
    absoluteRatioChange += Math.abs(after.ratio - before.ratio)
    expectedWinsChange += after.probability - before.probability
    if (observation.won) {
      historicalWon++
      const fastest = options.toSorted((a, b) => a.deadline - b.deadline)[0]!
      if (row.option !== fastest.kind) historicalSlow++
    }
  }
  results.push({ worldId: week.worldId, seed: week.seed, fold: week.fold, multiple, historicalWon, historicalSlow, modeledGainCents: gain, meanAbsoluteRatioChange: absoluteRatioChange / multiple, modeledWinsChange: expectedWinsChange })
}
const sum = (field: "multiple" | "historicalWon" | "historicalSlow" | "modeledGainCents" | "modeledWinsChange") => results.reduce((total, row) => total + row[field], 0)
const summary = { weeks: weeks.length, multipleMenus: sum("multiple"), historicalMultipleWins: sum("historicalWon"), historicalSlowerChoices: sum("historicalSlow"), meanModeledGainEuros: sum("modeledGainCents") / weeks.length / 100, meanModeledWinsChange: sum("modeledWinsChange") / weeks.length }
fs.writeFileSync("docs/menu-value-screen.json", JSON.stringify({
  scope: "The fixed24-seed old market-training allowlist; no new evaluation worlds.",
  hypothesis: "For a shared ratio menu, optimize expected revenue using the conditional paid option list price rather than always the cheapest offered list price.",
  method: "Estimate option-choice frequencies by offered menu from other seed folds, with one pseudocount per option. Replay only preceding actual win/loss observations into the existing online demand model. Compare scalar quote optima at minimum versus mean paid list price, holding current modeled costs and demand fixed.",
  limitations: ["A model-based screen, not identified counterfactual profit. Changing prices can change option shares, admission and future trust.", "Option-choice probabilities are assumed constant over a small markup change; historical menus supply little independent price variation.", "Uses only historically offered requests. Historical settings and prices differ from current policy.", "Cent rounding may make tiny modeled differences negative; the reported estimates retain them."],
  summary, results,
}, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
