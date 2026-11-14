import { readFile, writeFile, mkdir } from "node:fs/promises"
import { parseArgs } from "node:util"
import { Client } from "../vendor/typescript/spread.ts"
import { practice } from "./run.ts"
import { validateSettings } from "./policy.ts"
import type { Settings } from "./policy.ts"
import type { Score } from "../vendor/typescript/types.ts"

type Trial = { label: string; seed: string; settings: Partial<Settings> }
const { values } = parseArgs({ options: { plan: { type: "string" }, jobs: { type: "string", default: "3" } } })
if (!values.plan) throw new Error("--plan FILE is required")
const jobs = Number(values.jobs)
if (!Number.isInteger(jobs) || jobs < 1 || jobs > 4) throw new Error("--jobs must be 1–4")
const trials = JSON.parse(await readFile(values.plan, "utf8")) as Trial[]
if (!Array.isArray(trials) || !trials.length) throw new Error("Plan must be a nonempty trial array")
for (const trial of trials) {
  if (!trial.label || !trial.seed) throw new Error("Every trial needs label and seed")
  validateSettings(trial.settings)
}
await mkdir("runs", { recursive: true })
const results: { trial: Trial; score?: Score; error?: string }[] = []
let next = 0, stopped = false, gate = Promise.resolve()
const client = new Client()
async function create(seed: string) {
  const previous = gate
  let unlock!: () => void
  gate = new Promise(resolve => { unlock = resolve })
  await previous
  try {
    let announced = false
    while (!stopped) {
      if ((await client.worlds()).filter(world => !world.ended).length < Number(process.env.SPREAD_PLAY_CAP ?? 4)) return await client.create(8, { seed })
      if (!announced) console.log(`Waiting below the four-play cap: ${seed}`)
      announced = true
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    return null
  } finally { unlock() }
}
await Promise.all(Array.from({ length: jobs }, async () => {
  while (!stopped && next < trials.length) {
    const trial = trials[next++]!
    try {
      const world = await create(trial.seed)
      if (!world) return
      const score = await practice(client, { ...trial, worldId: world.id, label: trial.label })
      results.push({ trial, score })
    } catch (error) {
      stopped = true
      results.push({ trial, error: String(error) })
      console.error(`Trial ${trial.label}/${trial.seed} failed: ${String(error)}`)
      process.exitCode = 1
    }
  }
}))
const file = `runs/study-${Date.now()}.json`
await writeFile(file, JSON.stringify({ plan: values.plan, results }, null, 2))
console.log(`Study: ${file}`)
