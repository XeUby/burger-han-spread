import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Client } from "../../vendor/typescript/spread.ts"
import type { Score } from "../../vendor/typescript/types.ts"

const path = process.argv[2]
if (!path) throw new Error("Supply the frozen eight-world development manifest")
const plan = JSON.parse(await readFile(path, "utf8"))
if (plan.protocolSha256 && createHash("sha256").update(await readFile(plan.protocol)).digest("hex")!==plan.protocolSha256) throw new Error("Frozen protocol changed")
if (plan.launcherSha256 && createHash("sha256").update(await readFile(new URL(import.meta.url))).digest("hex")!==plan.launcherSha256) throw new Error("Frozen launcher changed")
if (!Number.isInteger(plan.jobs) || plan.jobs < 1 || plan.jobs > 4 || plan.maximumUnfinishedTeamWorlds !== 8 || plan.capacityAuthorization !== "remove 4 world limit, go 8") throw new Error("This runner requires the user's explicit eight-world authorization")
for (const trial of plan.trials) if (!trial.seed || "board" in trial || "worldId" in trial || !Number.isInteger(trial.level) || trial.level<1 || trial.level>8) throw new Error("Only seeded unranked trials are permitted")
for (const [file, hash] of Object.entries(plan.files)) {
  if (createHash("sha256").update(await readFile(resolve(plan.bundle, file))).digest("hex") !== hash) throw new Error(`Frozen file changed: ${file}`)
}
try { await readFile(plan.attempts); throw new Error("Attempts already exist; inspect every world before continuing") } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
const { practice } = await import(pathToFileURL(resolve(plan.bundle, "src/run.ts")).href)
const { Client: FrozenClient } = await import(pathToFileURL(resolve(plan.bundle, "vendor/typescript/spread.ts")).href)
const client = new FrozenClient() as Client
const lock = resolve("runs/team-world-creation.lock")
const rows: unknown[] = []
let next = 0, stopped = false

async function create(trial: { level: number; seed: string }) {
  const until = Date.now()+300_000
  while (!stopped && Date.now()<until) {
    try { await mkdir(lock) } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
      await new Promise(r => setTimeout(r, 1000)); continue
    }
    try {
      await writeFile(resolve(lock,"owner.json"), JSON.stringify({ pid: process.pid, plan: path, at: new Date().toISOString() }))
      const unfinished = (await client.worlds()).filter(w => !w.ended)
      await appendFile(plan.attempts, JSON.stringify({ event: "occupancy", at: new Date().toISOString(), unfinished: unfinished.map(w => w.worldId) })+"\n")
      if (unfinished.length<8) return await client.create(trial.level as 8, { seed: trial.seed })
    } finally { await rm(lock, { recursive: true }) }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!stopped) throw new Error("Team slots remained full for five minutes")
  return null
}

await Promise.all(Array.from({ length: plan.jobs }, async () => {
  while (!stopped && next<plan.trials.length) {
    const trial = plan.trials[next++]
    let worldId: string | undefined
    try {
      const world = await create(trial)
      if (!world) return
      worldId = world.id
      await appendFile(plan.attempts, JSON.stringify({ event: "created", at: new Date().toISOString(), ...trial, worldId })+"\n")
      const score: Score = await practice(client, { ...trial, worldId })
      const row = { ...trial, worldId, score }
      rows.push(row)
      await appendFile(plan.attempts, JSON.stringify({ event: "completed", at: new Date().toISOString(), ...row })+"\n")
    } catch (e) {
      stopped = true
      const row = { ...trial, worldId, error: String(e) }
      rows.push(row)
      await appendFile(plan.attempts, JSON.stringify({ event: "failed", at: new Date().toISOString(), ...row })+"\n")
      console.error(row)
      process.exitCode = 1
    }
  }
}))
await writeFile(plan.report, JSON.stringify({ plan: path, stopped, results: rows, unfinished: (await client.worlds()).filter(w => !w.ended) }, null, 2)+"\n")
