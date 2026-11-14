// A practice week with settings read from a JSON file, so nothing has to survive shell quoting.
//   node --env-file=.env tools/exp.ts --seed win-probe-1 --config experiments/price134.json
//   node --env-file=.env tools/exp.ts --seed win-probe-1 --config '{"price":1.34}'
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { parseArgs } from "node:util"

import { Client } from "../vendor/typescript/spread.ts"
import { practice } from "../src/run.ts"
import type { Settings } from "../src/policy.ts"

const { values } = parseArgs({
  options: {
    level: { type: "string", default: "8" },
    seed: { type: "string", default: "spread-1" },
    world: { type: "string" },
    config: { type: "string" },
    label: { type: "string" },
  },
})

const level = Number(values.level)
if (!Number.isInteger(level) || level < 1 || level > 8) throw new Error("level must be 1–8")

let settings: Partial<Settings> = {}
if (values.config) {
  const text = existsSync(values.config) ? await readFile(values.config, "utf8") : values.config
  settings = JSON.parse(text.replace(/^\uFEFF/, "")) as Partial<Settings>
}

const client = new Client({ url: process.env.SPREAD_URL ?? "https://spread.bahnexpress.com" })
const score = await practice(client, { level, seed: values.seed, worldId: values.world, settings, label: values.label })
console.log(JSON.stringify(score))
