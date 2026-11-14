import test from "node:test"
import assert from "node:assert/strict"
import { readReadiness } from "../src/readiness.ts"

const parse = (text: string, arrivedAt = 600) => readReadiness({ language: "fi", text }, arrivedAt)

test("pure numeric readiness clauses resolve from the request day across languages", () => {
  for (const text of ["Auto valmis vasta huomenna klo 13.30", "Noudettavissa aikaisintaan huomenna kello 1330", "Voi noutaa huomenna klo 13.30 alkaen", "Huolto kesken, valmis huomenna klo 13.30", "Pesu kesken, haettavissa huomenna 13.30 jälkeen", "Ready for pickup from tomorrow 1:30pm", "Not ready before tmrw 13:30", "In the workshop, ready tomorrow 1:30 pm", "Car won't be ready until tomorrow 1:30pm", "Ready tomorrow 13:30 at the earliest", "Klar först i morgon kl 13.30", "Kan hämtas tidigast imorgon klockan 13.30"])
    assert.deepEqual(parse(text, 2 * 1440 + 600), { safe: true, manual: false, plates: false, readyAt: 3 * 1440 + 810 }, text)
  assert.equal(parse("Ready for pickup from the day after tomorrow 12am")!.readyAt, 2880)
  assert.equal(parse("Auto valmis vasta ylihuomenna klo 12.00")!.readyAt, 3600)
  assert.equal(parse("Klar först i övermorgon kl 12.00")!.readyAt, 3600)
  assert.equal(parse("Earliest pickup today 12pm")!.readyAt, 720)
})

test("harmless and equipment clauses survive a fully understood readiness note", () => {
  const text = "Hei vaan. Huolto kesken, valmis huomenna klo 9.30. Manuaali. Ei kilpiä, siirtokilvet mukaan. Tilausnumero 93542. Renkaat kyydissä. Kiitos!"
  assert.deepEqual(parse(text), { safe: true, manual: true, plates: true, readyAt: 2010 })
  assert.equal(parse("Voi noutaa huomenna klo 13.30 alkaen / In the workshop, ready tomorrow 13:30")!.readyAt, 2250)
})

test("corrections, denied times, mixed restrictions and uncertain text are rejected", () => {
  for (const text of [
    "Auto valmis vasta huomenna klo 15.30, ei kun klo 14.30", "Not ready before tomorrow 10:00, not 9:00",
    "Klar först i morgon kl 10 (inte kl 9)", "Ready for pickup from tomorrow 10:00. Correction: 11:00",
    "Not ready before tomorrow 10:00. Receiving weekdays 8:00-20:00 only", "Huolto kesken, valmis huomenna klo 9. Nouto ennen klo 12",
    "Auto valmis vasta huomenna klo 11. Auto vielä kesärenkailla", "Luovutus vasta kun maksettu, aikaisintaan huomenna klo 12",
    "Ready for pickup from tomorrow 10:00. Ready for pickup from tomorrow 11:00", "Not ready for pickup from tomorrow 10:00",
    "In the workshhop, ready tomorrow 10:00", "Auto valmistuu huomenna puoli kymmeneltä", "Ready for pickup from Friday 10:00",
    "Ready for pickup from tomorrow 10:00 unless payment delayed", "No plates. Nothing special", "Ready for pickup from tomorrow 10:00. Ready now",
    "Auto valmis vasta huomenna klo 10. Auto on valmis noudettavaksi",
  ]) assert.equal(parse(text), null, text)
})

test("invalid clocks cannot partially parse into an earlier readiness time", () => {
  for (const time of ["24:00", "25", "13pm", "0am", "12:70", "12.3", "090", "12345", "12:30:45", "10:00ish", "1330pm"])
    assert.equal(parse(`Ready for pickup from tomorrow ${time}`), null, time)
  assert.equal(parse("Ready for pickup from tomorrow 09:00")!.readyAt, 1980)
  assert.equal(parse("Ready for pickup from tomorrow 0900")!.readyAt, 1980)
})
