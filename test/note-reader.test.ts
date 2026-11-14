import assert from "node:assert/strict"
import test from "node:test"
import { readFacts } from "../src/note-reader.ts"

const DAY = 1440
const at = (day: number, hour: number, minute = 0) => day * DAY + hour * 60 + minute
/** Reads a note that arrives on Tuesday at 10:00 unless the test says otherwise. */
const read = (text: string, arrivedAt = at(1, 10)) => readFacts({ language: "fi", text }, arrivedAt)

test("a note without a restriction changes nothing", () => {
  assert.deepEqual(read("Moi. Renkaat kyydissä. Tankissa vähän, viitenro 226745. Kiitos paljon"), { manual: false, plates: false, summerTyres: false })
  assert.deepEqual(readFacts(null, 0), { manual: false, plates: false, summerTyres: false })
})

test("a deadline counts from the day the request arrives", () => {
  assert.equal(read("Toimitus perille viim. huomenna klo 14")?.deadline, at(2, 14))
  assert.equal(read("At destination 6:30pm latest. Call 10 min before you arrive")?.deadline, at(1, 18, 30))
  assert.equal(read("Måste vara framme senast i övermorgon kl 16")?.deadline, at(3, 16))
})

test("a weekday name is that weekday 2 to 6 days after the request arrives", () => {
  assert.equal(read("Must be at destination by Fri 12:00.")?.deadline, at(4, 12))
  assert.equal(read("perillä ma klo 14 mennessä")?.deadline, at(7, 14))
  assert.equal(read("Valmiina to. klo 10.30 alkaen")?.readyAt, at(3, 10, 30))
  // A note never names the arrival day or the next day by its weekday, so this is not a note the reader knows.
  assert.equal(read("perillä ke klo 14 mennessä"), null)
})

test("an hour in words is a working hour, and half an hour is before it", () => {
  assert.equal(read("Odottaa osia, valmis huomenna puoli neljältä")?.readyAt, at(2, 15, 30))
  assert.equal(read("asiakas maksaa tänään kahdelta, luovutus sen jälkeen")?.readyAt, at(1, 14))
  assert.equal(read("Framme senast på måndag klockan halv ett")?.deadline, at(7, 12, 30))
  assert.equal(read("Kahden jälkeen ei enää luovutuksia!")?.pickup?.closes, 14 * 60)
})

test("a correction counts and a denied time does not", () => {
  assert.equal(read("auto valmistuu keskiviikkona klo 14, ei kun klo 13", at(0, 9))?.readyAt, at(2, 13))
  assert.equal(read("Must be at destination by Mon 3pm (not 4pm)")?.deadline, at(7, 15))
  assert.equal(read("toimitus perille viim. su klo 18. korjaus: ma")?.deadline, at(7, 18))
  assert.equal(read("At destination tomorrow 15:00 latest, sorry, i mean 14:00!")?.deadline, at(2, 14))
  assert.equal(read("voi noutaa klo 14 alkaen. korjaus: klo 15.")?.readyAt, at(1, 15))
  assert.equal(read("voi noutaa huomenna klo 12 alkaen. korjaus: torstaina. 2 sarjaa renkaita, toinen sarja kontissa")?.readyAt, at(3, 12))
})

test("hours of the pickup site and of the delivery site", () => {
  assert.deepEqual(read("Nouto arkisin 10.00 - 15.30. t. myynti.")?.pickup, { opens: 600, closes: 930 })
  assert.deepEqual(read("Collect before 19:00")?.pickup, { opens: 0, closes: 1140 })
  assert.deepEqual(read("receiving 7 am - 9 pm only.")?.delivery, { opens: 420, closes: 1260 })
  assert.deepEqual(read("Perillä auki 8:sta 21:een")?.delivery, { opens: 480, closes: 1260 })
  assert.deepEqual(read("Perillä liike kiinni klo 16.30 jälkeen")?.delivery, { opens: 0, closes: 990 })
  assert.deepEqual(read("Haettava ennen klo 20 / Collect before 20:00")?.pickup, { opens: 0, closes: 1200 })
})

test("payment, gearbox, plates and tyres", () => {
  assert.equal(read("Released after payment, not before tomorrow 9:00.")?.readyAt, at(2, 9))
  assert.equal(read("Manuaalivaihteet, kuski tarvii manuaalikortin.")?.manual, true)
  assert.equal(read("Automaatti, ei manuaali")?.manual, false)
  assert.equal(read("Skyltarna borttagna, ta med provskyltar")?.plates, true)
  assert.equal(read("Winter tyres not fitted yet.")?.summerTyres, true)
})

test("one slip of the keyboard is put right", () => {
  assert.equal(read("at desstination thu 16:00 latets.")?.deadline, at(3, 16))
  assert.equal(read("Kilvet poitsettu, ota koekilvet.")?.plates, true)
})

test("a note with an unknown word, or with two statements that disagree, is not understood", () => {
  assert.equal(read("Toimitus perille viim. huomenna klo 14. Koira autossa"), null)
  assert.equal(read("Collect before 19:00 / Haettava ennen klo 18"), null)
  assert.equal(read("perillä huomenna klo 25 mennessä"), null)
})
