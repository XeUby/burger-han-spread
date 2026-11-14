import fs from "node:fs"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { Client } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import { practice } from "../../experiments/frontier/late-rescue/src/run.ts"
import { Network } from "../../experiments/frontier/late-rescue/src/planning.ts"
import type { World } from "../../experiments/frontier/late-rescue/vendor/typescript/spread.ts"
import type { Action, ActionResult, Advance, DeskEvent, DriverProfile, Gig, Order } from "../../experiments/frontier/late-rescue/vendor/typescript/types.ts"

if (!process.argv.includes("--execute") && !process.argv.includes("--dry-run")) throw new Error("Use --execute or --dry-run")
const file = "experiments/viewer-offers-protocol.json", bytes = fs.readFileSync(file), protocol = JSON.parse(bytes.toString())
const sha = (path: string) => createHash("sha256").update(fs.readFileSync(path)).digest("hex")
assert.equal(sha("research/viewer-offers/probe.ts"), protocol.probeSha256)
const source = createHash("sha256")
for (const name of fs.readdirSync(`${protocol.bundle}/src`).filter(name => name.endsWith(".ts")).sort()) source.update(name).update(fs.readFileSync(`${protocol.bundle}/src/${name}`))
assert.equal(source.digest("hex"), protocol.revision)
if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ seed: protocol.seed, maximumCases: protocol.maximumCases, maximumPlays: 4, sourceVerified: protocol.revision })); process.exit(0) }
if (fs.existsSync("runs/viewer-offers-probe.json")) throw new Error("An existing probe must be retained and inspected")
const coordinator = new Client()
if ((await coordinator.worlds()).some(world => !world.ended)) throw new Error("Wait for all other plays to finish")
const base = await coordinator.create(8, { seed: protocol.seed })
const driverOffers = new Map<string, number>()
const gigOffers = new Map<string, number[]>()
const report = { protocol, protocolSha256: createHash("sha256").update(bytes).digest("hex"), baseWorldId: base.id, startedAt: new Date().toISOString(), terminal: false, cases: [] as Case[], baseScore: undefined as unknown, error: undefined as string | undefined }
const save = () => fs.writeFileSync("runs/viewer-offers-probe.json", JSON.stringify(report, null, 2) + "\n")
type Arm = { kind: string; worldId: string; targetGigId: string; deleted: boolean; events: DeskEvent[]; actions: { actions: Action[]; results: unknown }[]; at10?: Gig; at30?: Gig; error?: string }
type Case = { at: number; afterSeq: number; gig: Gig; order: Order; driver: DriverProfile; viewAt: number; priorDriverOffers: number; arms: Arm[] }
const sampled = new Set<string>()
let lastCheck = -Infinity
save()
console.log(JSON.stringify({ baseWorldId: base.id, seed: protocol.seed }))
const network = new Network(await coordinator.map())
const drivers = new Map((await base.roster()).map(driver => [driver.id, driver]))

async function probe(real: World, now: number, afterSeq: number, events: DeskEvent[]) {
  if (report.cases.length >= protocol.maximumCases || now - lastCheck < 10 || now % 1440 < 480 || now % 1440 > 1080) return
  const views = events.filter(event => event.kind === "gig_viewed" && event.at >= now - 2)
  if (!views.length) return
  lastCheck = now
  const snapshot = await real.snapshot()
  assert.equal(snapshot.now, now)
  let selected: Omit<Case, "at" | "afterSeq" | "arms"> | undefined
  for (const view of [...views].reverse()) {
    if (view.kind !== "gig_viewed") continue
    const gig = snapshot.gigs.find(gig => gig.id === view.gigId), driver = drivers.get(view.driverId)
    if (!gig || !driver || gig.status !== "open" || gig.stops.length !== 2 || gig.stops[0]!.orderId !== gig.stops[1]!.orderId) continue
    const order = snapshot.orders.find(order => order.id === gig.stops[0]!.orderId)
    if (!order || sampled.has(order.id) || order.legs.length !== 1 || order.status !== "waiting" || order.lastPickupAt < now + 300) continue
    const leg = order.legs[0]!
    if (leg.pickup.privateAddress || leg.delivery.privateAddress || leg.pickup.window.from > now + 180) continue
    if (network.km(driver.homePlaceId, leg.pickup.placeId) > 35) continue
    if (gig.audience.manualLicence && driver.licence !== "manual") continue
    if (gig.audience.experienced && (driver.rating < 4.8 || driver.completedGigs < 50)) continue
    if (snapshot.gigs.some(other => other.driverId === driver.id && ["booked", "working"].includes(other.status))) continue
    const priorDriverOffers = driverOffers.get(`${Math.floor(now / 1440)}:${driver.id}`) ?? 0
    if (priorDriverOffers >= 3 || gigOffers.get(gig.id)?.some(until => until >= now)) continue
    selected = { gig, order, driver, viewAt: view.at, priorDriverOffers }
    break
  }
  if (!selected) return
  const row: Case = { at: now, afterSeq, ...selected, arms: [] }
  sampled.add(row.order.id)
  report.cases.push(row)
  save()
  const forks: { world: World; arm: Arm }[] = []
  try {
    for (const kind of ["hold", "same-fee-offer", "discount-offer"]) {
      if ((await coordinator.worlds()).filter(world => !world.ended).length >= 4) throw new Error("Four-play cap reached")
      const world = await real.fork()
      const arm: Arm = { kind, worldId: world.id, targetGigId: row.gig.id, deleted: false, events: [], actions: [] }
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
        if (arm.kind !== "hold") await act([{ type: "offer", gigId: row.gig.id, driverId: row.driver.id, feeCents: Math.round(row.gig.feeCents * (arm.kind === "discount-offer" ? .9 : 1)) }])
        for (const minutes of [10, 30] as const) {
          const step = await world.advance({ to: now + minutes })
          assert.equal(step.now, now + minutes)
          arm.events.push(...step.events.filter(event => event.seq > afterSeq))
          arm[minutes === 10 ? "at10" : "at30"] = (await world.snapshot()).gigs.find(gig => gig.id === arm.targetGigId)
          save()
        }
      } catch (error) { arm.error = String(error); save(); throw error }
    }))
    if (results.some(result => result.status === "rejected")) throw new Error("A viewer-offer arm failed; retain its result and stop the probe")
  } finally {
    const cleanup = await Promise.allSettled(forks.map(async ({ world, arm }) => {
      await world.delete()
      arm.deleted = true
      save()
    }))
    if (cleanup.some(result => result.status === "rejected")) throw new Error("A fork could not be deleted; stop before creating more plays")
  }
  console.log(JSON.stringify({ sampled: report.cases.length, orderId: row.order.id, at: now }))
}

function countOffers(actions: readonly Action[], results: ActionResult[], at: number) {
  assert.equal(actions.length, results.length)
  actions.forEach((action, index) => {
    if (action.type !== "offer" || !results[index]!.ok) return
    const key = `${Math.floor(at / 1440)}:${action.driverId}`
    driverOffers.set(key, (driverOffers.get(key) ?? 0) + 1)
    gigOffers.set(action.gigId, [...(gigOffers.get(action.gigId) ?? []), at + 10])
  })
}

class ProbeClient extends Client {
  override world(id: string) {
    const real = super.world(id)
    let lastSeq = -1, now = 0
    return new Proxy(real, { get(target, key) {
      if (key === "act") return async (actions: readonly Action[]) => {
        try {
          const results = await target.act(actions)
          countOffers(actions, results, now)
          return results
        } catch (error) { throw new Error(`Viewer-offer base action stopped: ${String(error)}`) }
      }
      if (key === "advance") return async (input: Advance) => {
        try {
          const step = await target.advance(input)
          countOffers(input.actions ?? [], step.results, now)
          now = step.now
          lastSeq = Math.max(lastSeq, ...step.events.map(event => event.seq))
          await probe(target, now, lastSeq, step.events)
          return step
        } catch (error) { throw new Error(`Viewer-offer probe stopped: ${String(error)}`) }
      }
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    } })
  }
}
try {
  report.baseScore = await practice(new ProbeClient(), { worldId: base.id, seed: protocol.seed, label: "viewer-offers-probe-base", settings: protocol.settings })
  report.terminal = true
} catch (error) { report.error = String(error); throw error } finally { save() }
console.log(JSON.stringify({ terminal: report.terminal, cases: report.cases.length, baseWorldId: base.id }))
