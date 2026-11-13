import fs from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { readNote } from "../src/notes.ts"
import { readNote as baseline } from "./notes-baseline.ts"
import type { DeskEvent, DeskSnapshot, Leg, LegTruth, PriceRequest, Reveal } from "../vendor/typescript/types.ts"

type Issue = { field: string; declared: unknown; actual: unknown; restrictive: boolean }
type Finding = { worldId: string; seed: string; requestId: string; leg: number; note: string | null; issues: Issue[]; changed: boolean; differencesAgainstFinalOrder: string[] }
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T
const rows = []
const findings: Finding[] = []
const unique = new Map<string, { hasNote: boolean; expanded: boolean; legs: number; issues: string[] }>()
const checked = new Set<string>()
const newlyAcceptedExamples: { worldId: string; requestId: string; note: string; manual: boolean; plates: boolean }[] = []

function differences(request: PriceRequest, leg: Leg, truth: LegTruth): Issue[] {
  const rules = readNote(request.note)
  const issues: Issue[] = []
  const add = (field: string, declared: unknown, actual: unknown, restrictive = true) => issues.push({ field, declared, actual, restrictive })
  if (truth.readyAt !== leg.pickup.window.from) add("readyAt", leg.pickup.window.from, truth.readyAt, truth.readyAt > leg.pickup.window.from)
  if (truth.releasedAt !== null) add("releasedAt", null, truth.releasedAt, truth.releasedAt > leg.pickup.window.from)
  if (!isDeepStrictEqual(truth.pickupHours, leg.pickup.hours)) add("pickupHours", leg.pickup.hours, truth.pickupHours)
  if (!isDeepStrictEqual(truth.deliveryHours, leg.delivery.hours)) add("deliveryHours", leg.delivery.hours, truth.deliveryHours)
  if (truth.manualGearbox && !rules.manual) add("manualGearbox", false, true)
  if (truth.needsPlates && !rules.plates) add("needsPlates", false, true)
  if (truth.noteDeadline !== null) add("noteDeadline", null, truth.noteDeadline)
  if (truth.summerTyres) add("summerTyres", false, true)
  return issues
}

for (const file of fs.readdirSync("runs").filter(file => file.endsWith(".reveal.json")).sort()) {
  const worldId = file.replace(".reveal.json", "")
  const reveal = read<Reveal>(`runs/${file}`)
  const metaPath = `runs/${worldId}.meta.json`
  const seed = fs.existsSync(metaPath) ? read<{seed?:string}>(metaPath).seed ?? worldId : worldId
  const snapshotPath = `runs/${worldId}.snapshot.json`
  const snapshot = fs.existsSync(snapshotPath) ? read<DeskSnapshot>(snapshotPath) : null
  const requests = new Map(reveal.requests.map(r => [r.request.id, r.request]))
  const changed = new Set<string>()
  const eventsPath = `runs/${worldId}.events.json`
  if (fs.existsSync(eventsPath)) for (const event of read<DeskEvent[]>(eventsPath)) if (event.kind === "order_changed") changed.add(event.order.id)
  const row = { worldId, seed, wonRequests: reveal.orders.length, safeWon: 0, safeWithNote: 0, expandedSafeWon: 0, safeLegs: 0, falseSafeRequests: 0, falseSafeLegs: 0, mismatchFields: {} as Record<string, number> }
  for (const order of reveal.orders) {
    const key = `${worldId}:${order.orderId}`
    if (checked.has(key)) continue
    checked.add(key)
    const request = requests.get(order.orderId)
    if (!request) throw new Error(`Missing request ${key}`)
    const rules = readNote(request.note)
    if (!rules.safe) continue
    row.safeWon++
    if (request.note) row.safeWithNote++
    const expanded = !baseline(request.note).safe
    if (expanded) {
      row.expandedSafeWon++
      newlyAcceptedExamples.push({ worldId, requestId: order.orderId, note: request.note!.text, manual: rules.manual, plates: rules.plates })
    }
    let requestIssue = false
    const allFields: string[] = []
    for (const [index, truth] of order.legs.entries()) {
      row.safeLegs++
      const issues = differences(request, request.legs[index]!, truth)
      if (!issues.length) continue
      requestIssue = true
      row.falseSafeLegs++
      for (const issue of issues) {
        row.mismatchFields[issue.field] = (row.mismatchFields[issue.field] ?? 0) + 1
        allFields.push(issue.field)
      }
      const finalLeg = snapshot?.orders.find(o => o.id === order.orderId)?.legs[index]
      findings.push({ worldId, seed, requestId: order.orderId, leg: index, note: request.note?.text ?? null, issues, changed: changed.has(order.orderId), differencesAgainstFinalOrder: finalLeg ? differences(request, finalLeg, truth).map(i => i.field) : [] })
    }
    if (requestIssue) row.falseSafeRequests++
    const seedKey = `${seed}:${order.orderId}`
    const existing = unique.get(seedKey)
    unique.set(seedKey, { hasNote: request.note !== null, expanded, legs: order.legs.length, issues: [...new Set([...(existing?.issues ?? []), ...allFields])] })
  }
  rows.push(row)
}
const total = { worlds: rows.length, checkedWorldRequests: checked.size, safeWon: 0, safeWithNote: 0, expandedSafeWon: 0, safeLegs: 0, falseSafeRequests: 0, falseSafeLegs: 0 }
for (const row of rows) for (const field of ["safeWon", "safeWithNote", "expandedSafeWon", "safeLegs", "falseSafeRequests", "falseSafeLegs"] as const) total[field] += row[field]
const deduplicated = { seedRequests: unique.size, safeWithNote: 0, expandedSafe: 0, legs: 0, withMismatch: 0 }
for (const row of unique.values()) {
  if (row.hasNote) deduplicated.safeWithNote++
  if (row.expanded) deduplicated.expandedSafe++
  deduplicated.legs += row.legs
  if (row.issues.length) deduplicated.withMismatch++
}
const report = { total, deduplicated, limitations: "Truth is only available for won orders. Repeated deterministic seeds are additionally deduplicated by seed and request ID. Dynamic order changes can alter public site data and are marked separately. This audit cannot prove safety for unobserved wording or lost requests.", rows, findings, newlyAcceptedExamples }
fs.writeFileSync("analysis/notes-truth.json", JSON.stringify(report, null, 2))
console.log(JSON.stringify({total, deduplicated, findings}, null, 2))
