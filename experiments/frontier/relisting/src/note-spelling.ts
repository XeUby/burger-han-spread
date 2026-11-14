import { equipmentWords, harmlessWords, readNote } from "./notes.ts"
import type { Note } from "../vendor/typescript/types.ts"

const protectedWords = new Set(["automatic", "automaatti", "automat", "manual", "manuaali", "manuell", "ready", "valmis", "valmiina", "haettavissa", "noudettavaksi", "before", "ennen", "innan", "tuntia", "timme", "arrival", "arrive", "collect", "pickup", "waiting"])
const vocabulary = harmlessWords.filter(word => !protectedWords.has(word))
const knownWords = new Set([...harmlessWords, ...equipmentWords, ...protectedWords])
const cache = new Map<string, string>()

/** A correction must make the whole strict grammar readable; unknown restrictions still reject the note. */
export function normalizeNote(note: Note | null): Note | null {
  if (!note || readNote(note).safe) return note
  let edits = 0
  const text = note.text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[a-z]{5,}/g, word => {
    if (knownWords.has(word)) return word
    if (!cache.has(word)) {
      const matches = vocabulary.filter(candidate => oneEdit(word, candidate))
      cache.set(word, matches.length === 1 ? matches[0]! : word)
    }
    const replacement = cache.get(word)!
    if (replacement !== word) edits++
    return replacement
  })
  const corrected = { ...note, text }
  return edits > 0 && edits <= 2 && readNote(corrected).safe ? corrected : note
}

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
