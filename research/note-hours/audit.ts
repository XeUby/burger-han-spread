import fs from "node:fs"
import { createHash } from "node:crypto"
import { readHours } from "../../src/hours-note.ts"
import type { Reveal } from "../../vendor/typescript/types.ts"

const opportunities = JSON.parse(fs.readFileSync("docs/note-opportunities.json", "utf8"))
const training = JSON.parse(fs.readFileSync("analysis/market-training-selection.json", "utf8"))
const reveals = new Map<string, Reveal>()
function revealFor(worldId: string): Reveal {
  if (!reveals.has(worldId)) reveals.set(worldId, JSON.parse(fs.readFileSync(`runs/${worldId}.reveal.json`, "utf8")))
  return reveals.get(worldId)!
}
const parsed = opportunities.rows.flatMap((row: { worldId: string; requestId: string }) => {
  const reveal = revealFor(row.worldId)
  const request = reveal.requests.find(item => item.request.id === row.requestId)!.request
  const result = readHours(request.note, request.arrivedAt)
  return result ? [{ ...row, parsed: result }] : []
})
const checked = []
for (const { worldId, seed } of training.worlds) {
  const reveal = revealFor(worldId)
  const requests = new Map(reveal.requests.map(item => [item.request.id, item.request]))
  for (const order of reveal.orders) {
    const request = requests.get(order.orderId)!
    if (request.legs.length !== 1 || request.legs[0]!.pickup.privateAddress || request.legs[0]!.delivery.privateAddress) continue
    const result = readHours(request.note, request.arrivedAt)
    if (!result) continue
    checked.push({ worldId, seed, requestId: request.id, note: request.note, parsed: result, truth: order.legs[0] })
  }
}
const report = {
  parserSha256: createHash("sha256").update(fs.readFileSync("src/hours-note.ts")).digest("hex"),
  scope: "Coverage on the eight explicitly named old development weeks; revealed-truth availability checked only in the24-world market-training allowlist.",
  summary: { eligibleUnsafeRequests: opportunities.rows.length, parsed: parsed.length, meanParsedPerWeek: parsed.length / 8, pickupHours: parsed.filter((row: { parsed: { pickup?: unknown } }) => row.parsed.pickup).length, deliveryHours: parsed.filter((row: { parsed: { delivery?: unknown } }) => row.parsed.delivery).length, withReadiness: parsed.filter((row: { parsed: { readyAt?: number } }) => row.parsed.readyAt !== undefined).length, historicalTruthCases: checked.length },
  limitations: ["Syntactic coverage does not prove simulator semantics or dispatch feasibility.", "This parser is isolated research and is not enabled in any policy.", "A targeted ordinary-practice reveal audit is required before integration; no inferred restriction should be dropped."],
  parsed, checked,
}
fs.writeFileSync("docs/note-hours-audit.json", JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report.summary, null, 2))
