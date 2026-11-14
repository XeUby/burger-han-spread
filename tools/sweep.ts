// Plays several seeds with one settings file, one world at a time (the team's practice slots are shared),
// and prints a row per seed plus the mean. Same seeds for baseline and candidate, so the comparison is paired.
//   node --env-file=.env tools/sweep.ts --tag base --seeds win-a win-b win-c
//   node --env-file=.env tools/sweep.ts --tag wide --config experiments/wide-admission.json --seeds win-a win-b win-c
import { appendFile, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { parseArgs } from "node:util"

import { Client } from "../vendor/typescript/spread.ts"
import { practice } from "../src/run.ts"
import type { Settings } from "../src/policy.ts"

const { values } = parseArgs({
  options: {
    tag: { type: "string" },
    level: { type: "string", default: "8" },
    config: { type: "string" },
    seeds: { type: "string", multiple: true, default: [] },
  },
})
if (!values.tag) throw new Error("--tag is required")
if (!values.seeds.length) throw new Error("--seeds is required")
const level = Number(values.level)
if (!Number.isInteger(level) || level < 1 || level > 8) throw new Error("level must be 1–8")

let settings: Partial<Settings> = {}
if (values.config) {
  settings = existsSync(values.config)
    ? JSON.parse(await readFile(values.config, "utf8")) as Partial<Settings>
    : JSON.parse(values.config) as Partial<Settings>
}

const client = new Client({ url: process.env.SPREAD_URL ?? "https://spread.bahnexpress.com" })
const rows: { seed: string; margin: number; orders: number; onTime: number; ranked: boolean; worldId: string }[] = []
const out = `runs/sweep-${values.tag}.json`
for (const seed of values.seeds) {
  const score = await practice(client, { level, seed, settings, label: values.tag })
  rows.push({ seed, margin: score.marginCents / 100, orders: score.wonOrders, onTime: score.onTimeShare, ranked: score.ranked, worldId: score.worldId })
  console.log(`${values.tag} ${seed.padEnd(14)} €${(score.marginCents / 100).toFixed(0).padStart(7)}  ${String(score.wonOrders).padStart(4)} orders  ${(score.onTimeShare * 100).toFixed(1)}% on time  ${score.ranked ? "ranked" : "NOT RANKED"}`)
  await writeFile(out, JSON.stringify({ tag: values.tag, level, settings, rows }, null, 2))
  await appendFile("runs/results.jsonl", JSON.stringify({ worldId: score.worldId, seed, label: values.tag, settings, ...score }) + "\n")
}
const mean = rows.reduce((sum, row) => sum + row.margin, 0) / rows.length
const worst = Math.min(...rows.map(row => row.onTime))
console.log(`\n${values.tag}: mean €${mean.toFixed(0)} a week over ${rows.length} seeds, worst ${(worst * 100).toFixed(1)}% on time, ${rows.filter(row => row.ranked).length}/${rows.length} ranked`)
