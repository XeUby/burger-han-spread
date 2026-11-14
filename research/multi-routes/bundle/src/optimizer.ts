export type MarketFeatures = { day: number; origin: string; destination: string; dealer: string; km: number }
export type PriceInputs = { costCents: number; listPriceCents: number; trust: number; minPrice?: number; maxPrice?: number }
export type PriceChoice = { priceCents: number; probability: number; expectedProfitCents: number; ratio: number }
export type DemandSettings = { threshold: number; slope: number }

/** Learns acceptance thresholds from quotes, with separate effects for each day and market. */
export class DemandModel {
  settings: DemandSettings
  private keys = new Map<string, number>()
  private means: number[] = []
  private covariance: number[][] = []

  constructor(settings: Partial<DemandSettings> = {}) {
    this.settings = { threshold: 1.4, slope: 14, ...settings }
    if (!(this.settings.threshold > 0) || !(this.settings.slope > 0) || !Number.isFinite(this.settings.threshold + this.settings.slope)) throw new Error("Invalid demand prior")
  }

  probability(features: MarketFeatures, normalizedRatio: number): number {
    return sigmoid(this.settings.slope * (this.threshold(features) - normalizedRatio))
  }

  threshold(features: MarketFeatures): number {
    return this.prior(features) + this.vector(features).reduce((sum, [i, value]) => sum + this.means[i]! * value, 0)
  }

  protected prior(_features: MarketFeatures): number { return this.settings.threshold }

  optimize(features: MarketFeatures, inputs: PriceInputs): PriceChoice {
    return optimalLogisticPrice({ ...inputs, threshold: this.threshold(features), slope: this.settings.slope })
  }

  /** The caller must exclude artificial decline quotes. A loss is evidence only at the actual offered price. */
  observe(features: MarketFeatures, normalizedRatio: number, won: boolean): void {
    if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) throw new Error("Quote ratio must be positive")
    const entries = this.vector(features)
    const slope = this.settings.slope
    const threshold = this.prior(features) + entries.reduce((sum, [i, value]) => sum + this.means[i]! * value, 0)
    const probability = sigmoid(slope * (threshold - normalizedRatio))
    const projection = this.covariance.map(row => entries.reduce((sum, [i, value]) => sum + row[i]! * value * slope, 0))
    const variance = entries.reduce((sum, [i, value]) => sum + projection[i]! * value * slope, 0)
    const curvature = probability * (1 - probability)
    const denominator = 1 + curvature * variance
    const error = Number(won) - probability
    for (let i = 0; i < this.means.length; i++) {
      this.means[i]! += projection[i]! * error / denominator
      for (let j = 0; j <= i; j++) {
        const value = this.covariance[i]![j]! - curvature * projection[i]! * projection[j]! / denominator
        this.covariance[i]![j] = value
        this.covariance[j]![i] = value
      }
    }
  }

  private vector(features: MarketFeatures): [number, number][] {
    const distance = Math.max(-1, Math.min(2, (features.km - 200) / 200))
    return [
      [this.key("world", 0.1), 1],
      [this.key(`day:${features.day}`, 0.16), 1],
      [this.key(`origin:${features.origin}`, 0.06), 1],
      [this.key(`destination:${features.destination}`, 0.06), 1],
      [this.key(`dealer:${features.dealer}`, 0.04), 1],
      [this.key("distance", 0.04), distance],
    ]
  }

  private key(name: string, deviation: number): number {
    const found = this.keys.get(name)
    if (found !== undefined) return found
    const index = this.means.length
    this.keys.set(name, index)
    this.means.push(0)
    for (const row of this.covariance) row.push(0)
    this.covariance.push(Array.from({ length: index + 1 }, (_, i) => i === index ? deviation * deviation : 0))
    return index
  }
}

/** Maximizes (price − cost) × P(win) on the permitted interval, including cent rounding. */
export function optimalLogisticPrice(inputs: PriceInputs & DemandSettings): PriceChoice {
  const { costCents: cost, listPriceCents: list, trust, threshold, slope } = inputs
  if (![cost, list, trust, threshold, slope].every(Number.isFinite) || cost < 0 || list <= 0 || trust <= 0 || slope <= 0) throw new Error("Invalid price inputs")
  const scale = list * trust
  const lower = Math.ceil(inputs.minPrice ?? Math.max(1, cost))
  const upper = Math.floor(inputs.maxPrice ?? Math.max(lower, scale * 2.5))
  if (!Number.isFinite(lower + upper) || lower <= 0 || upper < lower) throw new Error("Invalid price interval")
  const at = (priceCents: number): PriceChoice => {
    const ratio = priceCents / scale
    const probability = sigmoid(slope * (threshold - ratio))
    return { priceCents, probability, expectedProfitCents: (priceCents - cost) * probability, ratio }
  }
  let from = lower
  let to = upper
  for (let step = 0; step < 48; step++) {
    const price = (from + to) / 2
    const probability = at(price).probability
    const derivative = 1 - slope * (price - cost) * (1 - probability) / scale
    if (derivative > 0) from = price
    else to = price
  }
  const candidates = new Set([lower, upper, Math.floor((from + to) / 2), Math.ceil((from + to) / 2)])
  return [...candidates].filter(price => price >= lower && price <= upper).map(at)
    .reduce((best, next) => next.expectedProfitCents > best.expectedProfitCents ? next : best)
}

function sigmoid(value: number): number {
  return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value))
}
