export type Bid = { cost: number; scale: number; threshold: number; slope: number; minimum: number; maximum: number }
export type JointChoice = { prices: [number, number]; expectedProfit: number; upperBound: number; evaluations: number }

export function probability(bid: Bid, price: number): number {
  const z = bid.slope * (bid.threshold - price / bid.scale)
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z))
}

export function single(bid: Bid, cost = bid.cost, minimum = bid.minimum, maximum = bid.maximum): { price: number; profit: number } {
  let low = minimum, high = maximum
  for (let i = 0; i < 48; i++) {
    const p = (low + high) / 2
    if (1 - bid.slope * (p - cost) * (1 - probability(bid, p)) / bid.scale > 0) low = p
    else high = p
  }
  return [...new Set([minimum, maximum, Math.floor((low + high) / 2), Math.ceil((low + high) / 2)])]
    .filter(price => price >= minimum && price <= maximum)
    .map(price => ({ price, profit: probability(bid, price) * (price - cost) }))
    .reduce((a, b) => a.profit >= b.profit ? a : b)
}

/** Certifies the two-price optimum under independent logistic wins and a fixed saving when both win. */
export function joint(first: Bid, second: Bid, saving: number, tolerance = 0.01): JointChoice {
  for (const bid of [first, second]) {
    if (!Object.values(bid).every(Number.isFinite) || bid.cost < 0 || bid.scale <= 0 || bid.slope <= 0 || !Number.isInteger(bid.minimum) || !Number.isInteger(bid.maximum) || bid.minimum <= 0 || bid.maximum < bid.minimum) throw new Error("Invalid bid")
  }
  if (!Number.isFinite(saving) || saving < 0 || saving > first.cost + second.cost || !(tolerance > 0)) throw new Error("Invalid saving or tolerance")
  let evaluations = 0
  const evaluate = (price: number): JointChoice => {
    evaluations++
    const q = probability(second, price)
    const choice = single(first, first.cost - saving * q)
    const expectedProfit = choice.profit + q * (price - second.cost)
    return { prices: [choice.price, price], expectedProfit, upperBound: expectedProfit, evaluations }
  }
  const bound = (low: number, high: number) => single(second, second.cost, low, high).profit + single(first, first.cost - saving * probability(second, low)).profit
  let best = evaluate(single(second).price)
  const queue = [{ low: second.minimum, high: second.maximum, upper: bound(second.minimum, second.maximum) }]
  let discardedUpper = best.expectedProfit
  while (queue.length) {
    queue.sort((a, b) => a.upper - b.upper)
    const interval = queue.pop()!
    if (interval.upper <= best.expectedProfit + tolerance) { discardedUpper = Math.max(discardedUpper, interval.upper); continue }
    const middle = Math.floor((interval.low + interval.high) / 2)
    const candidate = evaluate(middle)
    if (candidate.expectedProfit > best.expectedProfit) best = candidate
    for (const [low, high] of [[interval.low, middle - 1], [middle + 1, interval.high]]) {
      if (low! > high!) continue
      const upper = bound(low!, high!)
      if (upper > best.expectedProfit + tolerance) queue.push({ low: low!, high: high!, upper })
      else discardedUpper = Math.max(discardedUpper, upper)
    }
  }
  return { ...best, upperBound: Math.max(best.expectedProfit, discardedUpper), evaluations }
}
