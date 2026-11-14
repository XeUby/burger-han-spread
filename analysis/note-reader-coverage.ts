// How many notes the reader understands, and what it leaves unread.
// Usage: node analysis/note-reader-coverage.ts NOTES.json [top]
// NOTES.json is a list of { text, count, arrived, legs, private } from the reveals of practice weeks.
import fs from "node:fs"
import { readFacts, unread } from "../src/note-reader.ts"

type Row = { text: string; count: number; arrived: number; legs: number; private: boolean }
const rows = JSON.parse(fs.readFileSync(process.argv[2]!, "utf8")) as Row[]
const top = Number(process.argv[3] ?? 60)
let all = 0
let read = 0
const kinds: Record<string, number> = {}
const left = new Map<string, { count: number; example: string }>()
for (const row of rows) {
  all += row.count
  const facts = readFacts({ language: "fi", text: row.text } as never, row.arrived)
  if (facts) {
    read += row.count
    const kind = [facts.deadline !== undefined && "deadline", facts.readyAt !== undefined && "ready", facts.pickup && "pickupHours", facts.delivery && "deliveryHours", facts.manual && "manual", facts.plates && "plates", facts.summerTyres && "tyres"].filter(Boolean).join("+") || "harmless"
    kinds[kind] = (kinds[kind] ?? 0) + row.count
    continue
  }
  const rest = unread({ language: "fi", text: row.text } as never).replace(/\d/g, "9") || "(conflict or impossible time)"
  const entry = left.get(rest) ?? { count: 0, example: row.text }
  entry.count += row.count
  left.set(rest, entry)
}
console.log(`notes ${all}, understood ${read} (${(100 * read / all).toFixed(2)}%), distinct rests ${left.size}`)
console.log(Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind} ${count}`).join(" | "))
for (const [rest, entry] of [...left].sort((a, b) => b[1].count - a[1].count).slice(0, top)) console.log(`${entry.count} | ${rest}  <=  ${entry.example}`)
