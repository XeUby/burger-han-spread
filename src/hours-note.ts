import { readNote } from "./notes.ts"
import { readReadiness } from "./readiness.ts"
import type { Note } from "../vendor/typescript/types.ts"

export type HoursBound = { opens: number; closes: number }
export type TimedNote = {
  safe: true
  manual: boolean
  plates: boolean
  pickup?: HoursBound
  delivery?: HoursBound
  readyAt?: number
  /** A tighter deadline from the note. */
  deadline?: number
}

/** Reads explicit opening hours, equipment and supported readiness clauses; rejects any unknown remainder. */
export function readHours(note: Note | null, arrivedAt: number): TimedNote | null {
  if (!note) return null
  let text = note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim()
  const bounds: { pickup?: HoursBound; delivery?: HoursBound } = {}
  let invalid = false
  for (const rule of rules) {
    text = text.replace(rule.pattern, (_whole, first: string, second: string) => {
      const opens = rule.closing ? 0 : clock(first)
      const closes = clock(rule.closing ? first : second)
      if (opens === null || closes === null || opens >= closes) { invalid = true; return " " }
      const previous = bounds[rule.stop]
      if (previous && (previous.opens !== opens || previous.closes !== closes)) invalid = true
      bounds[rule.stop] = { opens, closes }
      return " "
    })
  }
  if (invalid || !Object.keys(bounds).length) return null
  const remainder = { ...note, text }
  const plain = readNote(remainder)
  if (plain.safe) return { ...plain, safe: true, ...bounds }
  const ready = readReadiness(remainder, arrivedAt)
  return ready ? { ...ready, ...bounds } : null
}

const time = "([0-9]{1,2}(?:[.:][0-9]{2})?(?:\\s*[ap]m)?)"
const range = `${time}\\s*-\\s*${time}`
const fiDays = "(?:(?:arkisin|arkipaivisin|ma-pe) )?"
const patterns: { stop: "pickup" | "delivery"; source: string; closing?: boolean }[] = [
  { stop: "delivery", source: `(?:vastaanottava liike auki|toimitusosoite auki|kohde auki|kohteen aukioloajat|vastaanotto(?: onnistuu)?) ${fiDays}(?:klo )?${range}` },
  { stop: "delivery", source: `(?:receiving|destination open)(?: weekdays)? ${range}(?: only)?` },
  { stop: "delivery", source: `mottagning(?: vardagar)? (?:kl )?${range}` },
  { stop: "delivery", source: `(?:kohde sulkee|vastaanotto paattyy) (?:klo )?${time}`, closing: true },
  { stop: "delivery", source: `(?:destination closes|receiving shop closes)(?: at)? ${time}`, closing: true },
  { stop: "pickup", source: `(?:nouto|noudettavissa|liike auki|avoinna|huom aukioloajat) ${fiDays}(?:klo )?${range}` },
  { stop: "pickup", source: `(?:pickup|open)(?: weekdays)? ${range}(?: only)?` },
  { stop: "pickup", source: `(?:hamtning|avhamtning)(?: vardagar)? (?:kl )?${range}` },
  { stop: "pickup", source: `(?:haettava|nouto) ennen (?:klo )?${time}`, closing: true },
  { stop: "pickup", source: `liike kiinni (?:klo )?${time},? haettava ennen sita`, closing: true },
  { stop: "pickup", source: `liike sulkee (?:klo )?${time}`, closing: true },
  { stop: "pickup", source: `(?:collect before|we close at) ${time}`, closing: true },
]
const rules = patterns.map(rule => ({ ...rule, pattern: new RegExp(`(?<![a-z0-9])(?:${rule.source})(?![a-z0-9:]|\\.\\d)`, "g") }))

function clock(value: string): number | null {
  const match = /^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/.exec(value)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  if (minutes >= 60) return null
  if (match[3]) {
    if (hours < 1 || hours > 12) return null
    hours = hours % 12 + (match[3] === "pm" ? 12 : 0)
  }
  return hours < 24 ? hours * 60 + minutes : null
}
