import fs from "node:fs"
import { readNote } from "../../src/notes.ts"
import { Dispatcher } from "../../src/policy.ts"
import { requestFeasibility } from "../../src/admission.ts"
import type { World } from "../../vendor/typescript/spread.ts"
import type { Note, PriceRequest } from "../../vendor/typescript/types.ts"

const read = (path: string) => JSON.parse(fs.readFileSync(path, "utf8"))
const worlds = ["w14d6b0034235af787311", "w0c6ce51dfdf6d4cc3970", "wf5eaeba5a1ba7b164ded", "w9a4b2d98037747387f31", "w9d5670b3d63668d52477", "wde70f6509f014550a4a8"]
const source = fs.readFileSync("src/notes.ts", "utf8").split("const harmless = [")[1]!.split("].map(phrase)")[0]!
const protectedWords = new Set(["automatic", "automaatti", "automat", "manual", "manuaali", "manuell", "ready", "valmis", "valmiina", "haettavissa", "noudettavaksi", "before", "ennen", "innan", "tuntia", "timme", "arrival", "arrive", "collect", "pickup", "waiting"])
const vocabulary = [...new Set(source.match(/[a-z]{5,}/g))].filter(word => !protectedWords.has(word)).sort()
const cache = new Map<string, string>()
function correct(note: Note): { note: Note; edits: { from: string; to: string }[] } {
  const edits: { from: string; to: string }[] = []
  const text = note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[a-z]{5,}/g, word => {
    if (protectedWords.has(word) || vocabulary.includes(word)) return word
    if (!cache.has(word)) {
      const matches = vocabulary.filter(candidate => oneEdit(word, candidate))
      cache.set(word, matches.length === 1 ? matches[0]! : word)
    }
    const replacement = cache.get(word)!
    if (replacement !== word) edits.push({ from: word, to: replacement })
    return replacement
  })
  return { note: { ...note, text }, edits }
}
const weeks = [], rows = []
for (const worldId of worlds) {
  const meta = read(`runs/${worldId}.meta.json`), desk = new Dispatcher({} as World, 8, 0, read("docs/map.json"), read(`runs/${worldId}.drivers.json`), meta.settings)
  let unsafe = 0, corrected = 0, eligible = 0
  for (const { request } of read(`runs/${worldId}.reveal.json`).requests as { request: PriceRequest }[]) {
    if (!request.note || readNote(request.note).safe) continue
    unsafe++
    const fixed = correct(request.note)
    if (!fixed.edits.length || fixed.edits.length > 2 || !readNote(fixed.note).safe) continue
    corrected++
    const candidate = { ...request, note: fixed.note }, leg = candidate.legs[0]!, supply = desk.supply(candidate), road = desk.network.road(leg.pickup.placeId, leg.delivery.placeId)
    const feasible = candidate.legs.length === 1 && !leg.pickup.privateAddress && !leg.delivery.privateAddress && supply >= desk.settings.minDrivers && road.km <= desk.settings.maxKm && candidate.options.some(option => {
      if (option.kind === "same_day" && supply < 15) return false
      const trip = requestFeasibility(candidate, option.deadline, desk.network, desk.settings)
      return trip && trip.latestPickupAt >= Math.max(request.arrivedAt + (supply < 30 || road.km > 300 ? 300 : 210), leg.pickup.window.from + 120)
    })
    if (feasible) eligible++
    rows.push({ worldId, seed: meta.seed, requestId: request.id, original: request.note.text, normalized: fixed.note.text, edits: fixed.edits, staticallyFeasible: feasible })
  }
  weeks.push({ worldId, seed: meta.seed, unsafe, corrected, eligible })
}
const summary = { weeks: weeks.length, correctedNotes: rows.length, meanStaticallyFeasibleRequests: weeks.reduce((sum, week) => sum + week.eligible, 0) / weeks.length }
fs.writeFileSync("docs/note-spelling-screen.json", JSON.stringify({
  scope: "Six explicit old development weeks. This prototype does not change production notes or dispatch.",
  method: "Derive long-word vocabulary from the existing harmless-clause patterns. Correct at most two words by a unique single insertion, deletion, substitution or adjacent transposition, then require the entire strict note parser to accept the result. Protect equipment and time words. Count public single-car requests passing static supply, distance and option timing gates.",
  limitations: ["Static counts ignore admission congestion, sale probability and delivery costs.", "A plausible correction is not proof of the note's true restrictions. Newly accepted examples require semantic review and a practice reveal probe before implementation.", "The research prototype reads the parser source to obtain vocabulary; it is not a production parser design."],
  summary, protectedWords: [...protectedWords], vocabulary, weeks, rows,
}, null, 2) + "\n")
console.log(JSON.stringify({ summary, weeks, examples: rows.slice(0, 12) }, null, 2))

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false
  if (a.length === b.length) {
    const different = [...a].flatMap((letter, i) => letter === b[i] ? [] : [i])
    return different.length === 1 || different.length === 2 && different[1] === different[0]! + 1 && a[different[0]!] === b[different[1]!] && a[different[1]!] === b[different[0]!]
  }
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < shorter.length && shorter[i] === longer[i]) i++
  return shorter.slice(i) === longer.slice(i + 1)
}
