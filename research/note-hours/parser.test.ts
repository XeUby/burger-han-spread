import test from "node:test"
import assert from "node:assert/strict"
import { readHours } from "../../src/hours-note.ts"

const parse = (text: string) => readHours({ text, language: "fi" }, 600)

test("pickup and delivery hours retain their distinct meanings", () => {
  assert.deepEqual(parse("Kohde auki arkisin klo 7–21. Nouto arkisin klo 8 - 16. Avain autossa."), { safe: true, manual: false, plates: false, delivery: { opens: 420, closes: 1260 }, pickup: { opens: 480, closes: 960 } })
  assert.deepEqual(parse("Receiving weekdays 8:00-20:00 only. Pickup weekdays 7:00-18:00 only"), { safe: true, manual: false, plates: false, delivery: { opens: 480, closes: 1200 }, pickup: { opens: 420, closes: 1080 } })
})

test("duplicate translations agree, clocks parse, and equipment remains mandatory", () => {
  assert.deepEqual(parse("Haettava ennen klo 18.00 / Collect before 18:00. Manuaali."), { safe: true, manual: true, plates: false, pickup: { opens: 0, closes: 1080 } })
  assert.deepEqual(parse("Destination open weekdays 7 am-8 pm. No plates."), { safe: true, manual: false, plates: true, delivery: { opens: 420, closes: 1200 } })
  assert.deepEqual(parse("Mottagning vardagar kl 9-20. Hämtning vardagar 10-17."), { safe: true, manual: false, plates: false, delivery: { opens: 540, closes: 1200 }, pickup: { opens: 600, closes: 1020 } })
})

test("readiness and hours can combine only when the remainder is fully understood", () => {
  assert.deepEqual(parse("Auto valmis vasta huomenna klo 12. Vastaanotto klo 9 - 20."), { safe: true, manual: false, plates: false, readyAt: 2160, delivery: { opens: 540, closes: 1200 } })
  for (const text of ["Open 8-18, correction: 17", "Not open 8-18", "Open 8-18. Open 9-17", "Open 18-8", "Open 8:99-17:00", "Collect before 15:3", "Collect before 17. Must arrive tomorrow 12", "Open 8-18. Summer tyres on."])
    assert.equal(parse(text), null, text)
})
