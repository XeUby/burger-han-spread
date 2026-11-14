import { readFile, readdir, writeFile, rename, access } from "node:fs/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: { manifest: { type: "string" }, jobs: { type: "string", default: "4" }, "dry-run": { type: "boolean" } } })
if (!values.manifest || !/^[1-4]$/.test(values.jobs)) throw new Error("Use --manifest FILE --jobs 1–4")
const path = resolve(values.manifest)
const manifest = JSON.parse(await readFile(path, "utf8"))
if (!manifest.selectionFrozenAt || !manifest.unseenDeclaration) throw new Error("Freeze selection and declare the evaluation panel first")
type Side = "baseline" | "candidate"
type Task = { index: number; seed: string; side: Side; worldId: string | null }
const policies = new Map()
for (const side of ["baseline", "candidate"] as Side[]) {
  const policy = manifest[side]
  let bundle = resolve(policy.bundle)
  try { await access(bundle) } catch {
    const archives = JSON.parse(await readFile("experiments/frontier/source-index.json", "utf8"))
    if (!archives[policy.revision]) throw new Error(`No source archive for ${side}`)
    bundle = resolve(archives[policy.revision].bundle)
  }
  const hash = createHash("sha256")
  for (const name of (await readdir(resolve(bundle, "src"))).filter(name => name.endsWith(".ts")).sort()) hash.update(name).update(await readFile(resolve(bundle, "src", name)))
  if (hash.digest("hex") !== policy.revision) throw new Error(`${side} source does not match its frozen revision`)
  const { Client } = await import(pathToFileURL(resolve(bundle, "vendor/typescript/spread.ts")).href)
  const { practice } = await import(pathToFileURL(resolve(bundle, "src/run.ts")).href)
  policies.set(side, { client: new Client(), practice, settings: policy.settings })
}
const tasks: Task[] = manifest.pairs.flatMap((pair: { seed: string; baselineWorldId: string | null; candidateWorldId: string | null }, index: number) => (["baseline", "candidate"] as Side[]).map(side => ({ index, seed: pair.seed, side, worldId: pair[`${side}WorldId`] })))
const pending: Task[] = []
for (const task of tasks) {
  if (!task.worldId) { pending.push(task); continue }
  const snapshot = JSON.parse(await readFile(`runs/${task.worldId}.snapshot.json`, "utf8"))
  if (snapshot.now < snapshot.endsAt) throw new Error(`Existing attempt ${task.worldId} is unfinished; inspect it before resuming`)
  await readFile(`runs/${task.worldId}.score.json`)
}
if (values["dry-run"]) {
  console.log(JSON.stringify({ sourceRevisionsVerified: [manifest.baseline.revision, manifest.candidate.revision], pendingTrials: pending.length, maximumConcurrentPlays: Number(values.jobs), totalUnfinishedWorldGuard: 4 }))
  process.exit(0)
}
let next = 0, stopped = false, gate = Promise.resolve()
async function locked<T>(operation: () => Promise<T>): Promise<T> {
  const previous = gate
  let unlock!: () => void
  gate = new Promise(resolve => { unlock = resolve })
  await previous
  try { return await operation() } finally { unlock() }
}
async function save(): Promise<void> {
  await writeFile(`${path}.tmp`, JSON.stringify(manifest, null, 2) + "\n")
  await rename(`${path}.tmp`, path)
}
await Promise.all(Array.from({ length: Number(values.jobs) }, async () => {
  while (!stopped && next < pending.length) {
    const task = pending[next++]!
    const policy = policies.get(task.side)!
    let world, announced = false
    while (!world && !stopped) {
      world = await locked(async () => {
        if ((await policy.client.worlds()).filter((item: { ended: boolean }) => !item.ended).length >= 4) return null
        const created = await policy.client.create(8, { seed: task.seed })
        manifest.pairs[task.index][`${task.side}WorldId`] = created.id
        manifest.attempts.push({ seed: task.seed, side: task.side, worldId: created.id, startedAt: new Date().toISOString() })
        await save()
        return created
      })
      if (!world) {
        if (!announced) console.log(`Waiting below the four-play cap: ${task.side}/${task.seed}`)
        announced = true
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
    if (!world) return
    try {
      await policy.practice(policy.client, { worldId: world.id, seed: task.seed, settings: policy.settings, label: `frontier-evaluation-${task.side}` })
      await locked(async () => { manifest.attempts.find((attempt: { worldId: string }) => attempt.worldId === world.id).completedAt = new Date().toISOString(); await save() })
    } catch (error) {
      stopped = true
      await locked(async () => { manifest.attempts.find((attempt: { worldId: string }) => attempt.worldId === world.id).error = String(error); await save() })
      console.error(`${task.side}/${task.seed}: ${String(error)}; stopped new trials, preserving this attempt`)
      process.exitCode = 1
    }
  }
}).map(worker => worker.catch(async error => {
  stopped = true
  await locked(async () => { (manifest.runnerErrors ??= []).push({ at: new Date().toISOString(), error: String(error) }); await save() })
  console.error(`Study coordinator failed: ${String(error)}; active trials may finish, no new trials will start`)
  process.exitCode = 1
})))
console.log(`Paired study manifest: ${path}`)
