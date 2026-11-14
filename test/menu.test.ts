import test from "node:test"
import assert from "node:assert/strict"
import { priceMenu } from "../src/menu.ts"
import type { DeliveryOption } from "../vendor/typescript/types.ts"

const options: DeliveryOption[] = [
  { kind: "same_day", deadline: 1200, listPriceCents: 10000 },
  { kind: "next_day", deadline: 2640, listPriceCents: 9000 },
  { kind: "within_3_days", deadline: 5520, listPriceCents: 8500 },
]
const inputs = { ratio: 1.45, trust: 1.1, minPriceCents: 8000, sameDayPremium: 1, laterDiscount: 1 }

test("neutral menu preserves the shared ratio including integer rounding", () => {
  const menu = priceMenu(options, inputs)
  for (const option of options) assert.equal(menu.prices[option.kind], Math.ceil(option.listPriceCents * inputs.trust * inputs.ratio))
  assert.equal(menu.observationRatio, Math.min(...options.map(option => menu.prices[option.kind]! / (option.listPriceCents * inputs.trust))))
})

test("urgency premium and flexible discount affect their respective choices", () => {
  const menu = priceMenu(options, { ...inputs, sameDayPremium: 1.15, laterDiscount: 0.97 })
  assert.equal(menu.prices.same_day, Math.ceil(10000 * 1.1 * 1.45 * 1.15))
  assert.equal(menu.prices.next_day, Math.ceil(9000 * 1.1 * 1.45 * 0.97))
  assert.equal(menu.prices.within_3_days, Math.ceil(8500 * 1.1 * 1.45 * 0.97))
})

test("a sole feasible option is unchanged by menu perturbations", () => {
  for (const option of options) {
    const menu = priceMenu([option], { ...inputs, sameDayPremium: 1.15, laterDiscount: 0.97 })
    assert.equal(menu.prices[option.kind], Math.ceil(option.listPriceCents * 1.1 * 1.45))
  }
})

test("every option retains its price floor and invalid menus fail", () => {
  const menu = priceMenu(options, { ...inputs, minPriceCents: 20000, sameDayPremium: 1.15, laterDiscount: 0.5 })
  assert.ok(Object.values(menu.prices).every(price => price >= 20000 && Number.isInteger(price)))
  assert.throws(() => priceMenu([], inputs))
  assert.throws(() => priceMenu([options[0]!, options[0]!], inputs))
  assert.throws(() => priceMenu(options, { ...inputs, ratio: NaN }))
})
