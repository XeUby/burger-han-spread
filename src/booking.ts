/** The chance that a driver takes a single-car gig at its opening fee at least three hours before its last pickup.
 * A logistic model fitted by `analysis/fit_book.py` on 309,596 first gigs of 1,349 recorded practice weeks of the team,
 * opening fees from 0.6 to 1.4 times the typical fee; on held-out weeks AUC 0.77 and calibrated by quintile within 2 points. */
export type BookingSigns = {
  feeRatio: number // opening fee over the typical fee
  km: number // the route
  pickupDrivers: number // drivers who live near the pickup, weighted as in Dispatcher.supply
  deliveryDrivers: number // the same near the delivery
  slackHours: number // from now, or the car's ready time, to the last pickup
  weekday: number // 0 Monday
  hour: number // hour of the day at which the car can first be collected
  premium: boolean
}

const W = { fee: 4.6566, km: 0.0076, pickup: 0.2591, delivery: 0.2739, slack: -0.2558, friday: 0.1512, monday: -0.4334, premium: -1.1284, late: -1.0559, feeKm: 0.618, intercept: 1.1654 }

export function bookingChance(s: BookingSigns): number {
  const fee = Math.log(Math.max(0.3, s.feeRatio))
  const km = Math.log(Math.max(1, s.km))
  const z = W.intercept + W.fee * fee + W.km * km + W.pickup * Math.log(s.pickupDrivers + 1) + W.delivery * Math.log(s.deliveryDrivers + 1)
    + W.slack * Math.log(Math.min(72, Math.max(3, s.slackHours))) + (s.weekday === 4 ? W.friday : 0) + (s.weekday === 0 ? W.monday : 0)
    + (s.premium ? W.premium : 0) + (s.hour >= 16 ? W.late : 0) + W.feeKm * fee * km
  return 1 / (1 + Math.exp(-z))
}

/** The opening fee, as a multiple of the typical fee, that costs least when a gig that no driver takes at its opening
 * costs `missCost` typical fees more: the climb it then needs and the risk that the car is late. */
export function openingRatio(s: Omit<BookingSigns, "feeRatio">, missCost: number, lowest = 0.8, highest = 1.3): number {
  let best = lowest
  let bestCost = Infinity
  for (let ratio = lowest; ratio <= highest + 1e-9; ratio += 0.025) {
    const cost = ratio + (1 - bookingChance({ ...s, feeRatio: ratio })) * missCost
    if (cost < bestCost - 1e-12) { best = ratio; bestCost = cost }
  }
  return Math.round(best * 1000) / 1000
}
