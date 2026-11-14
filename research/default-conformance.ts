import fs from "node:fs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { Dispatcher, defaults } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Action, DeskEvent } from "../vendor/typescript/types.ts"

const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const selection = read("experiments/current-selection.json")
const reference = read(selection.validationReport).method.candidate
const referenceRevision = reference.revision
assert.equal(selection.sourceReference, referenceRevision)
const archivedHash = createHash("sha256")
for (const name of fs.readdirSync(`${reference.bundle}/src`).filter(name => name.endsWith(".ts")).sort()) archivedHash.update(name).update(fs.readFileSync(`${reference.bundle}/src/${name}`))
assert.equal(archivedHash.digest("hex"), referenceRevision)
const { Dispatcher: ArchivedDispatcher } = await import(new URL(`../${reference.bundle}/src/policy.ts`, import.meta.url).href)
assert.deepEqual(Object.fromEntries(Object.keys(reference.settings).map(key => [key, defaults[key as keyof typeof defaults]])), reference.settings)
assert.deepEqual(read("experiments/final-config.json"), defaults)
const worlds = ["w0c6ce51dfdf6d4cc3970", "wde70f6509f014550a4a8", "w9d5670b3d63668d52477"]
function host() {
  let nextId = 0
  const sent: Action[] = []
  return { sent, world: { act: async (actions: Action[]) => {
    sent.push(...structuredClone(actions))
    return actions.map(action => ({ ok: true as const, id: action.type === "post" ? `g${++nextId}` : "ack" }))
  } } }
}
const results = []
for (const worldId of worlds) {
  const a = host(), b = host(), map = read("docs/map.json"), drivers = read(`runs/${worldId}.drivers.json`)
  const current = new Dispatcher(a.world as World, 8, 0, map, drivers)
  const archived = new ArchivedDispatcher(b.world as World, 8, 0, map, drivers, reference.settings)
  const events: DeskEvent[] = read(`runs/${worldId}.events.json`)
  const end = read(`runs/${worldId}.snapshot.json`).endsAt
  let cursor = 0, frames = 0, actions = 0, now = 0
  while (now <= end) {
    current.now = archived.now = now
    while (cursor < events.length && events[cursor]!.at <= now) {
      const event = events[cursor++]!
      await current.handle(structuredClone(event))
      await archived.handle(structuredClone(event))
    }
    await current.tick()
    await archived.tick()
    const currentActions = current.takeActions(), archivedActions = archived.takeActions()
    current.readResults(currentActions, await a.world.act(currentActions))
    archived.readResults(archivedActions, await b.world.act(archivedActions))
    assert.deepEqual(a.sent, b.sent, `${worldId} action difference at minute${now}`)
    assert.equal(current.nextDecisionAt(), archived.nextDecisionAt(), `${worldId} decision-clock difference at minute${now}`)
    actions += a.sent.length
    a.sent.splice(0)
    b.sent.splice(0)
    frames++
    if (now === end) break
    now = Math.min(end, events[cursor]?.at ?? end, current.nextDecisionAt())
    if (now <= current.now) throw new Error("Replay clock did not advance")
  }
  results.push({ worldId, seed: read(`runs/${worldId}.meta.json`).seed, events: events.length, decisionFrames: frames, identicalActions: actions })
}
const hash = createHash("sha256")
for (const name of fs.readdirSync("src").filter(name => name.endsWith(".ts")).sort()) hash.update(name).update(fs.readFileSync(`src/${name}`))
const report = { method: "Run the current default dispatcher and the candidate from the selected validation report through identical old development event streams and decision clocks. Verify the archived source hash and selected settings. Both receive identical deterministic action acknowledgements. Compare every emitted action and every next-decision time.", limitation: "Behavioral conformance on recorded inputs, not a new simulation or a profit estimate. Fake acknowledgements do not reproduce every real server refusal. The immutable fresh evaluation policies are unaffected by this check.", referenceRevision, currentRevision: hash.digest("hex"), defaults, results }
fs.writeFileSync(selection.conformance, JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(results, null, 2))
