import type { DeliveryOption, QuoteAction } from "../vendor/typescript/types.ts"

export type MenuInputs = {
  ratio: number
  trust: number
  minPriceCents: number
  sameDayPremium: number
  laterDiscount: number
}

/** Changes the urgency premium only when the dealer has a feasible slower choice. */
export function priceMenu(options: DeliveryOption[], inputs: MenuInputs): { prices: QuoteAction["prices"]; observationRatio: number } {
  if (!options.length) throw new Error("A quote menu needs at least one option")
  for (const [name, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid menu ${name}`)
  }
  if (new Set(options.map(option => option.kind)).size !== options.length) throw new Error("A quote menu cannot repeat an option")
  const prices: QuoteAction["prices"] = {}
  let observationRatio = Infinity
  for (const option of options) {
    if (!Number.isFinite(option.listPriceCents) || option.listPriceCents <= 0) throw new Error("Invalid menu list price")
    const factor = options.length < 2 ? 1 : option.kind === "same_day" ? inputs.sameDayPremium : inputs.laterDiscount
    const scale = option.listPriceCents * inputs.trust
    const price = Math.ceil(Math.max(inputs.minPriceCents, scale * inputs.ratio * factor))
    prices[option.kind] = price
    observationRatio = Math.min(observationRatio, price / scale)
  }
  return { prices, observationRatio }
}
