import type { Note } from "../vendor/typescript/types.ts"
import { readNote } from "./notes.ts"

export type Readiness = { safe: true; manual: boolean; plates: boolean; readyAt: number }

/** Reads only an explicit readiness bound plus clauses understood by readNote. */
export function readReadiness(note: Note | null, arrivedAt: number): Readiness | null {
  if (!note || !Number.isInteger(arrivedAt) || arrivedAt < 0) return null
  let text = note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim()
  const readyTimes: number[] = []
  let invalid = false
  for (const pattern of phrases) text = text.replace(pattern, (_whole, day: string, clock: string) => {
    const minute = readClock(clock)
    if (minute === null) invalid = true
    else readyTimes.push((Math.floor(arrivedAt / 1440) + days.get(day)!) * 1440 + minute)
    return " "
  })
  if (invalid || !readyTimes.length || readyTimes.some(at => at !== readyTimes[0])) return null
  if (/\b(?:ready|valmis|valmiina|haettavissa|noudettavaksi)\b/.test(text)) return null
  const rest = readNote({ ...note, text })
  return rest.safe ? { safe: true, manual: rest.manual, plates: rest.plates, readyAt: readyTimes[0]! } : null
}

const days = new Map([
  ["today", 0], ["tanaan", 0], ["idag", 0],
  ["tomorrow", 1], ["tmrw", 1], ["huomenna", 1], ["i morgon", 1], ["imorgon", 1],
  ["the day after tomorrow", 2], ["ylihuomenna", 2], ["i overmorgon", 2], ["iovermorgon", 2],
])
const clock = "([0-9]{1,4}(?:[.:][0-9]{1,2})?(?:\\s*[ap]m)?)"
const fiDay = "(ylihuomenna|huomenna|tanaan)"
const enDay = "(the day after tomorrow|tomorrow|tmrw|today)"
const svDay = "(i overmorgon|iovermorgon|i morgon|imorgon|idag)"
const phrases = [
  `(?:auto valmis vasta|noudettavissa aikaisintaan|huolto kesken,? valmis|odottaa osia,? valmis|auto valmistuu) ${fiDay} (?:klo |kello )?${clock}`,
  `voi noutaa ${fiDay} (?:klo |kello )?${clock} alkaen`,
  `(?:pesu kesken,? haettavissa|valmis noudettavaksi) ${fiDay} (?:klo |kello )?${clock} jalkeen`,
  `(?:ready for pickup from|not ready before|earliest pickup|car won't be ready until|in the workshop,? ready) ${enDay} ${clock}`,
  `ready ${enDay} ${clock} at the earliest`,
  `(?:(?:bilen )?klar forst|kan hamtas tidigast) ${svDay} (?:kl |klockan )?${clock}`,
].map(source => new RegExp(`(?<![a-z0-9])(?:${source})(?![a-z0-9:])`, "g"))

function readClock(text: string): number | null {
  const match = /^(\d{1,4})(?:[.:](\d{2}))?\s*(am|pm)?$/.exec(text)
  if (!match) return null
  const digits = match[1]!
  const suffix = match[3]
  let hour = Number(digits)
  let minute = Number(match[2] ?? 0)
  if (digits.length > 2) {
    if (match[2] || suffix || digits.length !== 4) return null
    hour = Number(digits.slice(0, 2))
    minute = Number(digits.slice(2))
  }
  if (minute > 59) return null
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    hour = hour % 12 + (suffix === "pm" ? 12 : 0)
  }
  return hour < 24 ? hour * 60 + minute : null
}
