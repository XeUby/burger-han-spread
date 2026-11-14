import fs from "node:fs"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { Client } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import { practice } from "../../experiments/frontier/late-rescue/src/run.ts"
import { anchorTransport } from "./transport.ts"

if (!process.argv.includes("--execute") && !process.argv.includes("--dry-run")) throw new Error("Use --execute or --dry-run")
const protocolPath = "experiments/fee-anchor-protocol.json"
const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"))
const hash = (path: string) => createHash("sha256").update(fs.readFileSync(path)).digest("hex")
for (const [path, expected] of Object.entries(protocol.files)) assert.equal(hash(path), expected, `Changed probe file ${path}`)
const source = createHash("sha256")
for (const name of fs.readdirSync(`${protocol.bundle}/src`).filter(name => name.endsWith(".ts")).sort()) source.update(name).update(fs.readFileSync(`${protocol.bundle}/src/${name}`))
assert.equal(source.digest("hex"), protocol.revision)
assert.deepEqual(protocol.factors, [.5, 1, 2])
if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ sourceVerified: protocol.revision, seed: protocol.seed, factors: protocol.factors, plays: 3, ranking: false }))
  process.exit(0)
}

class AnchorClient extends Client {
  factor: number
  constructor(factor: number) { super(); this.factor = factor }
  override world(id: string) {
    return anchorTransport(super.world(id), this.factor, row => fs.appendFileSync(`runs/${id}.anchor.jsonl`, JSON.stringify(row) + "\n"))
  }
}
const coordinator = new Client()
if ((await coordinator.worlds()).some(world => !world.ended)) throw new Error("Wait until every other study finishes before this probe")
if (fs.existsSync("runs/fee-anchor-probe.json")) throw new Error("An anchor probe already exists; inspect and retain it before any new experiment")
const report = { protocol, protocolSha256: hash(protocolPath), startedAt: new Date().toISOString(), terminal: false, arms: [] as { factor: number; worldId: string; status: string; score?: unknown; error?: string }[] }
const save = () => fs.writeFileSync("runs/fee-anchor-probe.json", JSON.stringify(report, null, 2) + "\n")
save()
try {
  for (const factor of protocol.factors as number[]) {
    if ((await coordinator.worlds()).filter(world => !world.ended).length >= 4) throw new Error("Four-play cap reached during probe setup")
    const world = await coordinator.create(8, { seed: protocol.seed })
    report.arms.push({ factor, worldId: world.id, status: "created" })
    save()
    assert.equal((await world.snapshot()).now, 0)
    console.log(JSON.stringify({ factor, worldId: world.id }))
  }
} catch (error) {
  Object.assign(report, { setupError: String(error) })
  save()
  throw error
}
await Promise.all(report.arms.map(async arm => {
  arm.status = "running"
  save()
  try {
    arm.score = await practice(new AnchorClient(arm.factor), { worldId: arm.worldId, seed: protocol.seed, label: `fee-anchor-${arm.factor}`, settings: protocol.settings })
    arm.status = "complete"
  } catch (error) {
    arm.status = "error"
    arm.error = String(error)
    process.exitCode = 1
  } finally { save() }
}))
report.terminal = report.arms.every(arm => arm.status === "complete")
save()
console.log(JSON.stringify({ terminal: report.terminal, arms: report.arms }))
