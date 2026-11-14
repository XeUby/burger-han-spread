import test from "node:test"
import assert from "node:assert/strict"
import { normalizeNote } from "../src/note-spelling.ts"
import { readNote } from "../src/notes.ts"
import { Dispatcher } from "../src/policy.ts"
import type { World } from "../vendor/typescript/spread.ts"
import type { Note, PriceRequest } from "../vendor/typescript/types.ts"

const note = (text: string): Note => ({ text, language: "en" })
test("unique harmless spelling corrections preserve equipment requirements", () => {
  for (const text of ["Papers in the glvebox", "Papers in the gloovebox", "Papres in the glovebox", "Nycklar i recepionen", "Renassarja takapenkillä, kulkee mukana"]) {
    assert.equal(readNote(note(text)).safe, false)
    assert.equal(readNote(normalizeNote(note(text))).safe, true)
  }
  assert.deepEqual(readNote(normalizeNote(note("Manual gearbox. No plates. Papres in the glovebox"))), { safe: true, manual: true, plates: true })
})

test("uncertain timing, negations, ambiguous edits and excessive corrections stay rejected", () => {
  for (const text of ["Papres in the glovebox. Ready tomorrow at 10", "Papres in the glovebox. Not ready", "Papres not in the glovebox", "No platse. Papres in the glovebox", "Manula gearbox. Papres in the glovebox", "Soita ennen noutoo", "Papres in the glvebox. Kiiitos"]) {
    const original = note(text)
    assert.equal(normalizeNote(original), original, text)
    assert.equal(readNote(normalizeNote(original)).safe, false, text)
  }
  const known = note("Key box code 1234. No plates")
  assert.equal(normalizeNote(known), known)
  assert.equal(normalizeNote(null), null)
})

test("the opt-in policy uses the same corrected note for admission, planning and equipment", async () => {
  const stop = { placeId: "a", privateAddress: false, hours: null, window: { from: 500, to: 2640 } }
  const request: PriceRequest = { id: "r", dealerId: "d", batchId: null, arrivedAt: 500, respondBy: 515, note: note("Manual gearbox. No plates. Papres in the glovebox"), referenceFeeCents: 2000, legs: [{ car: { premium: false, electric: false, chargePercent: null }, pickup: stop, delivery: { ...stop, placeId: "b" } }], options: [{ kind: "next_day", deadline: 2640, listPriceCents: 8000 }] }
  const map = { places: [], roads: [{ from: "a", to: "a", km: 12, minutes: 25 }, { from: "a", to: "b", km: 100, minutes: 90 }] }
  const drivers = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, homePlaceId: "a", rating: 4.9, completedGigs: 100, licence: "manual" as const, drops: 0 }))
  const off = new Dispatcher({} as World, 8, 500, map, drivers)
  const on = new Dispatcher({} as World, 8, 500, map, drivers, { noteSpelling: true, bundleWait: 0 })
  off.quote(request)
  on.quote(request)
  assert.equal(off.pending.has(request.id), false)
  assert.equal(on.pending.has(request.id), true)
  assert.deepEqual(readNote(on.plannedRequest(request).note), { safe: true, manual: true, plates: true })
  assert.equal(request.note!.text, "Manual gearbox. No plates. Papres in the glovebox")
  on.takeActions()
  await on.post({ id: request.id, dealerId: request.dealerId, option: "next_day", priceCents: 10000, deadline: 2640, lastPickupAt: 2500, legs: request.legs, status: "waiting", deliveredAt: [null] }, [0])
  const post = on.takeActions()[0]!
  assert.equal(post.type, "post")
  if (post.type !== "post") throw new Error("Expected post")
  assert.equal(post.audience.manualLicence, true)
  assert.equal(post.stops[0]!.withPlates, true)
})
