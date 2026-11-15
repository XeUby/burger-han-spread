# The night of Saturday to Sunday: what we tried on top of candidate 1

Owner: Boris (Claude). 15 November 2026. Level 8 practice weeks. Each variant is compared with the build it was played on, on the same weeks; eight weeks unless said. A control of the v3 build replayed three weeks to the cent, so the differences are the variants'.

## Kept

| Idea | Effect | Note |
| --- | ---: | --- |
| Cap the fees of the last two hours at 1.6 and 1.8 times the full fee (`rescue-cap.md`) | +€138 a week, 24 weeks, 20 up, 1 down | Now the default |
| Quotes go first in every batch of actions | none in practice | In the final a dealer waits 4.5 real seconds |
| The live loop checks its gigs against the world every five seconds | none in practice | The 01:00 test final had no refused duplicate post |

## Take more orders: every form lost

At level 8 the drivers are the limit, and the rules say so: "you can win more cars than drivers can move on time, so you must choose your cars".

| Variant | Mean difference | Lowest on-time share | Late orders |
| --- | ---: | ---: | ---: |
| Trade-ins | −€386 | 91.6% | 4.2% → 5.5% |
| Trade-ins and private addresses | −€287 | 88.5%, one week not ranked | → 6.5% |
| Any route length, towns with three drivers (`minDrivers` 3, `maxKm` 5,000) | −€3,256 on 5 weeks | 86.7%, four of five not ranked | → 10.2% |
| No refusal over the limits, a dearer price instead (`softLimits` 0.5, 1, 2) | −€2,449 to −€3,813 | 83.5% to 86.2% | → 11–12% |
| Pair-aware price for a car that can ride with ours (`pairQuote` 0.6, 0.8) | −€740, −€278 on 16 weeks | 90.3% | → 4.6% |
| More room for long routes, less for short ones (`shortGate`, `longGate`) | −€479 to −€1,519 on 5–6 weeks | 88.0% to 90.7% | up |

## Pay drivers differently: every form lost or was noise

| Variant | Mean difference |
| --- | ---: |
| One flat fee until the deadline warning (Halal Team's rule), 0.95 or 1.1 times | −€701, −€1,432 |
| Opening fee from a booking model fitted on 310,000 recorded gigs (`bookMiss` 0.6, 1, 1.5) | −€576 to −€974 on 11 weeks |
| Full opening fee on routes of 250 km or more | −€885 on 11 weeks |
| Opening 0.80 or 0.90 instead of 0.85 | −€472, −€792 |
| Early climb 1.05/1.2 or 1.15/1.3 instead of 1.1/1.25 | −€243, −€575 |
| Fee at four hours 1.35 instead of 1.45, with the cap | +€60 (noise) |

The booking model failed because its target, "booked at the opening fee", mixes in our own climb: a gig booked on a raise counts as a miss, so it raised the fee of gigs that book anyway.

## Combine cars: no further gain

| Variant | Mean difference |
| --- | ---: |
| Gigs of three or four cars, chained from a pair (`chainCars`) | +€49 (noise); only two gigs of three a week formed |
| Pairs whose second pickup is 60 or 100 km from the first delivery | −€38, −€625 |
| A pair without a driver after 60 minutes goes back to two gigs | −€51 on 16 weeks |
| Wait 5, 10 or 30 minutes for a partner instead of 15 | −€470, −€496, −€484 |
| Direct offers to drivers who finish far from home | +€18 on 5 weeks (rarely sent) |

## Price differently: no gain

| Variant | Mean difference |
| --- | ---: |
| A flatter price curve (`demandSlope` 10 or 7 instead of 14) | −€208, −€102 |
| A level per day and pickup town, for the competitor's outage (`marketDayOrigin`) | +€129 (noise), −€413 |
| A level per lane (`marketLane`) | −€378 |
| A dearer same-day option, or cheaper slower ones | −€613, −€2,680 on 16 weeks |
| A larger cost estimate in the price (`costRatio` 1.3, 1.45, 1.6) | −€655, −€1,750, −€3,809 |

Higher prices win fewer orders and earn less in all; lower ones win orders the drivers cannot move. The learned price sits near the best point.
