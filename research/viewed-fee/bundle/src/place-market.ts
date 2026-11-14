import { DemandModel } from "./optimizer.ts"
import type { DemandSettings, MarketFeatures } from "./optimizer.ts"
import { placePrior } from "./place-prior.ts"

export class PlaceDemandModel extends DemandModel {
  private weight: number
  private coefficients: Readonly<Record<string, number>>

  constructor(settings: Partial<DemandSettings> = {}, weight = 1, coefficients: Readonly<Record<string, number>> = placePrior.coefficients) {
    super(settings)
    if (!Number.isFinite(weight) || weight < 0 || weight > 2) throw new Error("Place prior weight must be between 0 and 2")
    if (!Object.values(coefficients).every(Number.isFinite)) throw new Error("Place prior coefficients must be finite")
    this.weight = weight
    this.coefficients = coefficients
  }

  protected override prior(features: MarketFeatures): number {
    const c = this.coefficients
    return super.prior(features) + this.weight * ((c.intercept ?? 0) + (c[`origin:${features.origin}`] ?? 0) + (c[`destination:${features.destination}`] ?? 0))
  }
}
