/** The chance that a won single car arrives late, from what is known when its request comes. A logistic model fitted by
 * `analysis/fitcost.py` on 130,555 won cars of the team's level 8 practice weeks, including weeks played with looser
 * limits on open work; on held-out weeks its AUC is 0.81. */
export type RiskSigns = {
  km: number
  slackHours: number // from now, or the car's ready time, to the last pickup that still meets the option's deadline
  pickupDrivers: number
  deliveryDrivers: number
  unbookedShare: number // our unbooked cars near the pickup that day, over (pickupDrivers × 0.08 + 2)
  loadShare: number // all our open cars near the pickup that day, over (pickupDrivers × 0.35 + 1)
  sameDay: boolean
  threeDays: boolean
  friday: boolean
  afternoon: boolean // the request comes at 15:00 or later
  premium: boolean
}

const W = [-0.2895, -3.9828, -0.247, -0.0354, 3.7823, 0.1375, -2.0121, -1.6535, -0.0772, 0.7508, 0.0617, 0.3365, 0.4546]
const INTERCEPT = 4.416
/** Of a late car's price, the share that goes back to the dealer on average. */
export const REFUND_SHARE = 0.329

export function lateChance(s: RiskSigns): number {
  const km = Math.log(Math.max(1, s.km))
  const slack = Math.log(Math.max(1, Math.min(72, s.slackHours)))
  const x = [km, slack, Math.log(s.pickupDrivers + 1), Math.log(s.deliveryDrivers + 1), s.unbookedShare, s.loadShare, s.unbookedShare ** 2,
    +s.sameDay, +s.threeDays, +s.friday, +s.afternoon, +s.premium, km * slack]
  const z = INTERCEPT + x.reduce((sum, value, i) => sum + value * W[i]!, 0)
  return 1 / (1 + Math.exp(-z))
}
