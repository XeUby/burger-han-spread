import fs from "node:fs"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { Client } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import { practice } from "../../experiments/frontier/late-rescue/src/run.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { Action, Advance, DeskEvent, Gig, Order, PostAction } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

if (!process.argv.includes("--execute") && !process.argv.includes("--dry-run")) throw new Error("Use --execute or --dry-run")
const file = "experiments/relisting-protocol.json", bytes = fs.readFileSync(file), protocol = JSON.parse(bytes.toString())
const sha = (path: string) => createHash("sha256").update(fs.readFileSync(path)).digest("hex")
assert.equal(sha("research/relisting/probe.ts"), protocol.probeSha256)
const source = createHash("sha256")
for (const name of fs.readdirSync(`${protocol.bundle}/src`).filter(name => name.endsWith(".ts")).sort()) source.update(name).update(fs.readFileSync(`${protocol.bundle}/src/${name}`))
assert.equal(source.digest("hex"), protocol.revision)
if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ seed: protocol.seed, maximumCases: protocol.maximumCases, maximumPlays: 4, sourceVerified: protocol.revision })); process.exit(0) }
if (fs.existsSync("runs/relisting-probe.json")) throw new Error("An existing probe must be retained and inspected")
const coordinator = new Client()
if ((await coordinator.worlds()).some(world => !world.ended)) throw new Error("Wait for all other plays to finish")
const base = await coordinator.create(8, { seed: protocol.seed })
const report = { protocol, protocolSha256: createHash("sha256").update(bytes).digest("hex"), baseWorldId: base.id, startedAt: new Date().toISOString(), terminal: false, cases: [] as Case[], baseScore: undefined as unknown, error: undefined as string | undefined }
const save = () => fs.writeFileSync("runs/relisting-probe.json", JSON.stringify(report, null, 2) + "\n")
type Arm = { kind: string; worldId: string; targetGigId: string; deleted: boolean; events: DeskEvent[]; actions: { actions: Action[]; results: unknown }[]; at10?: Gig; at30?: Gig; error?: string }
type Case = { at: number; afterSeq: number; gig: Gig; order: Order; arms: Arm[] }
const sampled = new Set<string>()
let lastCheck = -Infinity
save()
console.log(JSON.stringify({ baseWorldId: base.id, seed: protocol.seed }))

async function probe(real: World, now: number, afterSeq: number) {
  if (report.cases.length >= protocol.maximumCases || now - lastCheck < 30 || now % 1440 < 480 || now % 1440 > 1080) return
  lastCheck = now
  const snapshot = await real.snapshot()
  assert.equal(snapshot.now, now)
  const selected = snapshot.gigs.find(gig => {
    if (gig.status !== "open" || gig.stops.length !== 2 || gig.stops[0]!.orderId !== gig.stops[1]!.orderId || now - gig.postedAt < 30) return false
    const order = snapshot.orders.find(order => order.id === gig.stops[0]!.orderId)
    if (!order || sampled.has(order.id) || order.legs.length !== 1 || order.status !== "waiting" || order.lastPickupAt < now + 180) return false
    const leg = order.legs[0]!
    return !leg.pickup.privateAddress && !leg.delivery.privateAddress && leg.pickup.window.from <= now + 180
  })
  if (!selected) return
  const order = snapshot.orders.find(order => order.id === selected.stops[0]!.orderId)!
  const row: Case = { at: now, afterSeq, gig: selected, order, arms: [] }
  sampled.add(order.id)
  report.cases.push(row)
  save()
  const forks: { world: World; arm: Arm }[] = []
  try {
    for (const kind of ["hold", "same-reprice", "relist"]) {
      if ((await coordinator.worlds()).filter(world => !world.ended).length >= 4) throw new Error("Four-play cap reached")
      const world = await real.fork()
      const arm: Arm = { kind, worldId: world.id, targetGigId: selected.id, deleted: false, events: [], actions: [] }
      row.arms.push(arm)
      forks.push({ world, arm })
      save()
    }
    const results = await Promise.allSettled(forks.map(async ({ world, arm }) => {
      const act = async (actions: Action[]) => {
        const results = await world.act(actions)
        arm.actions.push({ actions, results })
        save()
        if (results.length !== actions.length || results.some(result => !result.ok)) throw new Error(JSON.stringify(results))
        return results
      }
      try {
        if (arm.kind === "same-reprice") await act([{ type: "reprice", gigId: selected.id, schedule: selected.schedule }])
        if (arm.kind === "relist") {
          await act([{ type: "withdraw", gigId: selected.id }])
          const post: PostAction = { type: "post", stops: selected.stops, audience: selected.audience, schedule: selected.schedule }
          const posted = await act([post])
          if (!posted[0]!.ok) throw new Error("Missing post acknowledgement")
          arm.targetGigId = posted[0]!.id
        }
        for (const minutes of [10, 30] as const) {
          const step = await world.advance({ to: now + minutes })
          assert.equal(step.now, now + minutes)
          arm.events.push(...step.events.filter(event => event.seq > afterSeq))
          arm[minutes === 10 ? "at10" : "at30"] = (await world.snapshot()).gigs.find(gig => gig.id === arm.targetGigId)
          save()
        }
      } catch (error) { arm.error = String(error); save(); throw error }
    }))
    if (results.some(result => result.status === "rejected")) throw new Error("A relisting arm failed; retain its result and stop the probe")
  } finally {
    const cleanup = await Promise.allSettled(forks.map(async ({ world, arm }) => {
      await world.delete()
      arm.deleted = true
      save()
    }))
    if (cleanup.some(result => result.status === "rejected")) throw new Error("A fork could not be deleted; stop before creating more plays")
  }
  console.log(JSON.stringify({ sampled: report.cases.length, orderId: order.id, at: now }))
}

class ProbeClient extends Client {
  override world(id: string) {
    const real = super.world(id)
    let lastSeq = -1
    return new Proxy(real, { get(target, key) {
      if (key === "advance") return async (input: Advance) => {
        const step = await target.advance(input)
        lastSeq = Math.max(lastSeq, ...step.events.map(event => event.seq))
        try { await probe(target, step.now, lastSeq) } catch (error) { throw new Error(`Relisting probe stopped: ${String(error)}`) }
        return step
      }
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    } })
  }
}
try {
  report.baseScore = await practice(new ProbeClient(), { worldId: base.id, seed: protocol.seed, label: "relisting-probe-base", settings: protocol.settings })
  report.terminal = true
} catch (error) { report.error = String(error); throw error } finally { save() }
console.log(JSON.stringify({ terminal: report.terminal, cases: report.cases.length, baseWorldId: base.id }))
