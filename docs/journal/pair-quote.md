# Pair-aware quoting (not yet played)

Owner: Boris (Claude). 14 November 2026. Base: candidate 1 with pairing after three hours (`pair-waiting.md`).

## Why

Drivers are the limit (`candidate-1.md`). A car that shares a gig with a car we already have needs no new driver. By fee per order, from the 24 weeks of candidate 1:

| Gig | Fee per order |
| --- | ---: |
| One car | €73 |
| Two cars, the second starts where the first ends | €51 |
| Two cars, a trip and a trip back | €25 |

## What the recorded weeks say

Offline, the dispatcher was replayed over the events of 16 recorded weeks of the current build, with the real booking times. At each request it asked whether the new car could share a gig with one of our cars that no driver had booked yet: the new pickup within 30 km of that car's delivery, or the new delivery within 30 km of its pickup, on the same day and in time for both deadlines.

| Request in the recorded week | Has such a partner, a week | Has none, a week |
| --- | ---: | ---: |
| Won | 88 | 272 |
| Quoted and lost | 75 | 214 |
| Declined by us | 68 | 319 |

143 requests a week that we lost or declined could have ridden with a car we already had.

## The idea

When a request has such a partner: price it as if it cost `pairQuote` times its usual cost, and do not refuse it for the limits on open work. When it is won, the partner's gig joins the bundling at once, whatever its age. Setting `pairQuote`; 0 is off and the default. Three tests in `test/pair-quote.test.ts`.

## Not known yet

Whether the extra orders really ride together. A driver must book the pair, and a pair that does not book is two cars with one driver's fee less than they need. It has to be played on practice weeks before it can be switched on.

## Played: it does not work

Sixteen weeks, against candidate 1 with pairing after three hours (€11,752 a week, lowest on-time share 93.2%):

| Variant | Mean difference | Weeks up / down | Late orders | Lowest on-time share |
| --- | ---: | ---: | ---: | ---: |
| Pair-aware price at 0.6 of the cost (`pairQuote` 0.6) | −€740 (standard error €205) | 2 / 14 | 3.5% → 4.5% | 90.7% |
| Pair-aware price at 0.8 of the cost | −€278 (standard error €239) | 7 / 9 | 3.5% → 4.6% | 90.3% |
| A two-car gig without a driver after 60 minutes goes back to two gigs (`pairPatience` 60, Halal Team's rule) | −€51 (standard error €166) | 8 / 8 | 3.7% | 92.4% |
| Wait 30 minutes for a partner instead of 15 (`bundleWait` 30) | −€484 (standard error €205) | 6 / 10 | 4.2% | 91.3% |

The extra cars that the pair-aware price wins mostly do not ride with their partner: they need drivers of their own, and the late share rises. All four stay off.
