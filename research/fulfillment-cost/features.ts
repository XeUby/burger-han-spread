import type { Dispatcher } from "../../src/policy.ts"
import type { PriceRequest } from "../../vendor/typescript/types.ts"

export const names = ["intercept", "roadHours", "logOriginSupply", "logDestinationSupply", "supplyImbalance", "readyLeadDays", "latestServiceDays", "readyHour", "fridayReady", "weekendReady", "batch", "manual", "plates", "premium", "charging", "regionalLoad"]

/** Only public request fields and commitments already known when quoting enter this model. */
export function costFeatures(desk: Dispatcher, request: PriceRequest): number[] {
  const leg = request.legs[0]!, rules = desk.noteRules(request)
  const originSupply = desk.supply(request)
  const destinationSupply = desk.supply({ ...request, legs: [{ ...leg, pickup: leg.delivery, delivery: leg.pickup }] })
  const day = Math.floor(leg.pickup.window.from / 1440)
  let load = 0
  for (const order of desk.orders.values()) {
    if (order.status === "cancelled") continue
    const original = desk.requests.get(order.id)
    if (!original || Math.floor(original.legs[0]!.pickup.window.from / 1440) !== day) continue
    const km = desk.network.km(leg.pickup.placeId, original.legs[0]!.pickup.placeId)
    load += km <= 30 ? 1 : km <= 70 ? 0.5 : 0
  }
  return [1, Math.min(3, desk.network.minutes(leg.pickup.placeId, leg.delivery.placeId)/180), Math.log1p(originSupply)/5, Math.log1p(destinationSupply)/5, Math.log((destinationSupply+1)/(originSupply+1))/3, Math.min(5, Math.max(0, leg.pickup.window.from-request.arrivedAt)/1440), Math.min(7, (Math.max(...request.options.map(option => option.deadline))-request.arrivedAt)/1440), (leg.pickup.window.from%1440)/1440, Number(day%7===4), Number(day%7>=5), Number(request.batchId!==null), Number(rules.manual), Number(rules.plates), Number(leg.car.premium), Number(leg.car.electric && (leg.car.chargePercent ?? 100)<30 && desk.network.km(leg.pickup.placeId, leg.delivery.placeId)>200), load/Math.max(1,originSupply)]
}
