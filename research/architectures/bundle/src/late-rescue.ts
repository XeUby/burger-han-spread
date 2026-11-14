import type { FeeStep, Order } from "../vendor/typescript/types.ts"

export function lateRescueApplies(order: Order, now: number): boolean {
  return order.legs.length === 1 && !order.legs[0]!.pickup.privateAddress && !order.legs[0]!.delivery.privateAddress && Number.isFinite(order.lastPickupAt) && now > order.lastPickupAt
}

/** A fixed clock prevents repeated reprices or reconnects from postponing the final rescue fee. */
export function lateRescueSchedule(order: Order, now: number, openingFee: number): FeeStep[] {
  const anchor = order.lastPickupAt + 1
  const steps = [
    { at: anchor, feeCents: Math.round(openingFee * 1.2) },
    { at: anchor + 120, feeCents: Math.round(openingFee * 1.45) },
    { at: anchor + 240, feeCents: Math.round(openingFee * 1.9) },
    { at: anchor + 360, feeCents: Math.round(openingFee * 2.5) },
  ]
  const current = steps.findLast(step => step.at <= now) ?? steps[0]!
  return [{ at: now, feeCents: current.feeCents }, ...steps.filter(step => step.at > now)]
}
