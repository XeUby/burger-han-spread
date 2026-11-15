# Price each delivery option by its own risk of being late

Owner: Boris (Claude). 15 November 2026. Level 8 practice weeks. Base: the v3 build (candidate 1, pairing after three hours, capped rescue fees).

## The idea

Until now the dispatcher priced every option of a request from one cost, the expected fee, and refused requests by hard limits on open and unbooked work near the pickup. Now:

1. A model gives the chance that a won car arrives late, from what is known when its request comes: route length, the hours from now to the last pickup that still meets *this option's* deadline, drivers near the pickup and the delivery, our open and unbooked cars near the pickup that day, the option, Friday, afternoon, premium. Logistic regression on 130,555 won cars of our practice weeks, including weeks played with looser limits; AUC 0.81 on held-out weeks (`analysis/costdata.py`, `analysis/fitcost.py`, `src/risk.ts`).
2. Each option's cost is the fee plus P(late) × (the refund a late car gives back, 33% of its price on average, + a €100 penalty for the on-time line and for the dealer's trust).
3. Each option gets its own price from the market model for that cost; an option with P(late) over 30% is not sold.
4. With the risk priced, the hard limits on open and unbooked work are twice as wide.

Settings `riskPenalty` 100, `maxLate` 0.3, `riskGate` 2.

## Why

At level 8 every way to take more orders added late orders (`v3-night.md`). The late ones are not random: the model separates them with AUC 0.81, mostly by the slack left to the last pickup, which differs between the same-day and the next-day option of one request. Pricing that risk lets the dealer choose: a risky same-day option becomes dear, the safe next-day option stays cheap.

## The effect

| | Weeks | v3 build | Risk pricing | Difference | Weeks up / down | Lowest on-time share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `riskPenalty` 100, limits ×2 | 24 | €11,446 | €12,082 | +€636 (standard error €179) | 18 / 6 | 92.9% / 92.9% |
| `riskPenalty` 150, limits ×2.5 | 24 | €11,446 | €12,051 | +€605 (standard error €210) | 16 / 8 | 92.9% / 93.0% |

On the first eight weeks, other settings:

| Variant | Difference | Late orders | Lowest on-time share |
| --- | ---: | ---: | ---: |
| Penalty €100, limits as before | +€123 | 4.2% → 3.2% | 95.1% |
| Penalty €300, limits as before | −€272 | → 2.5% | 95.9% |
| Penalty €100, limits ×1.5 | +€431 | → 4.0% | 92.4% |
| Penalty €100, limits ×3 | +€171 | → 4.6% | 89.7%, one week not ranked |
| Penalty €50, limits ×2 | +€36 | → 5.4% | 90.7% |

Priced risk alone makes the week safer at the same margin; the safety is then spent on wider limits.

## Sixteen fresh weeks

Played once on `bh-sunday-20261115-01` to `-16`, the weeks the v3 build played for its record: €12,990 a week against €12,516, +€474 (standard error €212), 12 weeks up and 4 down. Late orders 3.2% → 2.2%; the worst week 95.3% on time against 92.4%. All 16 ranked.

## Tried on top, and dropped (eight weeks each, against risk pricing)

| Variant | Difference |
| --- | ---: |
| Do not sell options over 20% or 40% late chance (instead of 30%) | −€159, −€241 |
| Towns with four drivers; routes up to 1,000 km; both | −€44, −€571, −€673 |
| Penalty grows with the dealer's trust | −€129, −€249 |
| Least slack 150 or 240 minutes instead of 210–300 | −€454, −€283 |
| Fee from a fitted fee model instead of the fee estimate | −€912 to −€1,646 |
| Harm to our waiting cars in the cost (×0.5, ×1, ×2) | −€89, +€128, −€189 |
