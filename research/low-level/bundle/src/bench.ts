import { parseArgs } from "node:util"
import { Client } from "../vendor/typescript/spread.ts"
import { practice } from "./run.ts"

const { values } = parseArgs({ options: {
  seeds: { type: "string", default: "validate-1,validate-2,validate-3" },
  config: { type: "string", default: "{}" },
  jobs: { type: "string", default: "3" },
} })
const jobs = Number(values.jobs)
if (!Number.isInteger(jobs) || jobs < 1 || jobs > 3) throw new Error("--jobs must be 1–3")
const seeds = values.seeds.split(",").filter(Boolean)
const settings = JSON.parse(values.config)
const results = []
for (let i = 0; i < seeds.length; i += jobs) {
  const batch = await Promise.allSettled(seeds.slice(i, i + jobs).map(seed => practice(new Client(), { seed, settings })))
  for (const result of batch) {
    if (result.status === "rejected") { console.error(result.reason); process.exitCode = 1 }
    else results.push(result.value)
  }
}
console.log(JSON.stringify({ runs: results.length, ranked: results.filter(r => r.ranked).length, totalMarginCents: results.reduce((sum, r) => sum + r.marginCents, 0), minimumOnTimeShare: results.length ? Math.min(...results.map(r => r.onTimeShare)) : null }, null, 2))
