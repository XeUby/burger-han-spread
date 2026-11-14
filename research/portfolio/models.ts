import prior from "../../experiments/portfolio-prior.json" with { type: "json" }
import type { Dispatcher } from "../value/policy.ts"
import type { PriceRequest } from "../../vendor/typescript/types.ts"

export function prediction(target: keyof typeof prior.models, x: number[]): number {
  const m = prior.models[target]
  if (x.length !== m.mean.length || !x.every(Number.isFinite)) throw new Error("Invalid pre-quote features")
  const z = m.intercept + x.reduce((sum, value, i) => sum + (value-m.mean[i]!)/m.scale[i]!*m.coefficients[i]!, 0)
  return z >= 0 ? 1/(1+Math.exp(-z)) : Math.exp(z)/(1+Math.exp(z))
}

export function features(desk: Dispatcher, request: PriceRequest, deadline: number): number[] {
  const leg = request.legs[0]!, car = leg.car, at = request.respondBy
  const supply = (place: string) => desk.drivers.reduce((sum, driver) => {
    if (car.premium && (driver.rating < 4.8 || driver.completedGigs < 50)) return sum
    const km = desk.network.km(driver.homePlaceId, place)
    return sum + (km<=35 ? 1 : km<=70 ? .35 : 0)
  }, 0)
  return [desk.level, desk.network.minutes(leg.pickup.placeId,leg.delivery.placeId)/60, supply(leg.pickup.placeId), supply(leg.delivery.placeId), Number(car.premium), Number(car.electric && (car.chargePercent ?? 0)<30), request.referenceFeeCents/100, desk.settings.payout, desk.settings.fee, (deadline-at)/1440, (leg.pickup.window.from-at)/1440, at%1440/60, Math.floor(at/1440)%7]
}
