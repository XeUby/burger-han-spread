import { createHash } from "node:crypto"
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises"
import { resolve, dirname, relative } from "node:path"
import { parseArgs } from "node:util"
import { spawn } from "node:child_process"

const { values } = parseArgs({ options: { plan: { type: "string" }, jobs: { type: "string", default: "3" }, "dry-run": { type: "boolean" } } })
if (!values.plan) throw new Error("Use --plan FILE [--jobs 1–4] [--dry-run]")
if (!/^[1-4]$/.test(values.jobs)) throw new Error("--jobs must be 1–4")
const root = resolve(import.meta.dirname, "..")
const files = [...await list(resolve(root, "src")), ...await list(resolve(root, "vendor"))].sort()
const source = await Promise.all(files.map(async path => ({ path: relative(root, path), bytes: await readFile(path) })))
const hash = createHash("sha256")
for (const file of source) hash.update(file.path).update(file.bytes)
const revision = hash.digest("hex")
const plan = resolve(root, values.plan)
const planBytes = await readFile(plan)
const study = createHash("sha256").update(planBytes).digest("hex")
const bundle = resolve(root, "runs/frozen", revision, study)
for (const file of source) {
  const target = resolve(bundle, file.path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, file.bytes)
}
await writeFile(resolve(bundle, "plan.json"), planBytes)
await writeFile(resolve(bundle, "manifest.json"), JSON.stringify({ revision, files: source.map(file => file.path), plan }, null, 2))
console.log(`Frozen source: ${bundle}`)
if (!values["dry-run"]) {
  const child = spawn(process.execPath, [`--env-file=${resolve(root, ".env")}`, resolve(bundle, "src/experiment.ts"), "--plan", resolve(bundle, "plan.json"), "--jobs", values.jobs], { cwd: root, stdio: "inherit" })
  process.exitCode = await new Promise<number>((done, reject) => { child.once("error", reject); child.once("exit", (code, signal) => done(code ?? (signal ? 1 : 0))) })
}

async function list(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? list(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))
  return nested.flat()
}
