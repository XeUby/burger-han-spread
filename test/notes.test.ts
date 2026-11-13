import { test } from "node:test"
import assert from "node:assert/strict"
import { readNote } from "../src/notes.ts"

const parse = (text: string) => readNote({ text, language: "fi" })

test("harmless note clauses compose across languages and missing accents", () => {
  for (const text of [
    "Hei vaan. Ylimääräinen rengassarja takakontissa, mukaan. Avaimet huollon tiskiltä. Tilausnumero 34915. Hyvää päivänjatkoa.",
    "Lisaksi 4 kesarengasta tavaratilassa. Meidan viite 387401. Kiitos paljon.",
    "Hi there. Extra set of tyres in the boot, take along. Car in bay 14, keys at the desk. Our ref: 32741. Thanks in advance.",
    "Hejsan. Extra däcksats i bagaget, ska med. Nycklar i receptionen. Ring kunden en timme innan. Mvh försäljningen.",
    "Kauppakirja mukana, anna vastaanottajalle. Soita 30 min ennen. Paperit hanskalokerossa.",
    "Pieni kolhu oik. ovessa, kuvaa noutaessa. Auto pesemättä. Ajettu n. 186 tkm.",
  ]) assert.deepEqual(parse(text), { safe: true, manual: false, plates: false }, text)
})

test("equipment restrictions survive greetings and references", () => {
  for (const text of [
    "Moi. Ei automaatti vaan manuaali. Ei kilpiä, siirtokilvet mukaan! Kiitos.",
    "Manuaalivaihteinen. Poistettu rekisteristä, tarvitaan siirtokilvet. Viitenro 12345.",
    "Hi. Stick shift. Plates removed, bring trade plates. Cheers.",
    "Manuellt växlad. Inga skyltar på bilen. Tack.",
  ]) assert.deepEqual(parse(text), { safe: true, manual: true, plates: true }, text)
  assert.deepEqual(parse("Automatic, not a manual"), { safe: true, manual: false, plates: false })
})

test("a known harmless clause cannot hide unmodeled timing or driving risks", () => {
  for (const constraint of [
    "Not ready before tomorrow 12:45", "Collect before 14:00", "Destination closes at 17:00",
    "Auto vielä kesärenkailla", "Still on summer tyres", "Har fortfarande sommardäck på",
    "Low on fuel", "Weak battery, may need a jump start", "Manual gearbox not allowed",
    "not ready now", "not nothing special", "plate exemption expires 10:00", "Unknown 12",
  ]) for (const text of [constraint, `${constraint}. Spare wheels in the boot.`, `Kiitos. ${constraint}. Renkaat kyydissä.`])
    assert.equal(parse(text).safe, false, text)
})

test("unrecognized words, typos and bare times are rejected instead of guessed", () => {
  for (const text of ["ready tmrw", "15:00", "Car has no plates tomorrow", "Spare wheels in the boot, arrive 12", "Rengassarjja mukaan", "Nothing specially", "No platesmanual gearbox"])
    assert.equal(parse(text).safe, false, text)
})
