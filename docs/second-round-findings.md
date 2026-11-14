# Second research round: decisions and limitations

All 34 frozen replacement worlds completed. They represent six familiar underlying seed blocks: four at level 8 and two shared across levels 1 and 4. No untouched validation, ranking, test final or final was run.

No candidate passed the declared development gates. Keep the validated level-8 control and the separate lower-level development candidate unchanged.

## Level 8

| Policy | Mean net profit | Paired gain vs mechanisms | 95% paired-t interval | Qualified | Minimum on time | Mean driver payments | Mean refunds |
|---|---:|---:|---|---:|---:|---:|---:|
| benchmark | €11,790.90 | €0.00 | €0.00 to €0.00 | 4/4 | 92.88% | €20,969.28 | €664.68 |
| mechanisms | €11,790.90 | €0.00 | €0.00 to €0.00 | 4/4 | 92.88% | €20,969.28 | €664.68 |
| capacity | €11,503.58 | €-287.32 | €-1,902.27 to €1,327.62 | 4/4 | 93.02% | €21,377.53 | €851.79 |
| routes | €11,917.39 | €126.49 | €-1,496.21 to €1,749.19 | 4/4 | 92.24% | €21,442.03 | €856.71 |
| capacity-routes | €11,963.76 | €172.87 | €-274.09 to €619.82 | 4/4 | 90.53% | €21,990.33 | €1,068.86 |
| combined | €11,963.76 | €172.87 | €-274.09 to €619.82 | 4/4 | 90.53% | €21,990.33 | €1,068.86 |

Intervals are descriptive under independent-week/paired-t assumptions. Four adaptive development blocks do not justify confirmatory inference; the JSON also reports whole-week bootstrap sensitivity. Even four qualifying weeks imply only a 47.29% one-sided 95% lower qualification bound under IID-week sampling.

All four benchmark replications exactly match the archived event histories and scores. Every complete score reconciles to the full ledger and terminal order counts. No failed outcome is removed from a mean.

## Hypothesis decisions

- **capacity: Do not promote this implementation.** mean gain below the declared €1,500 threshold; aggregate on-time decline exceeded 0.5 percentage points. Throughput averaged 318.50 orders/week; aggregate on-time share was 95.37%.
- **routes: Do not promote this implementation.** mean gain below the declared €1,500 threshold; aggregate on-time decline exceeded 0.5 percentage points. Throughput averaged 323.25 orders/week; aggregate on-time share was 95.44%.
- **capacity-routes: Do not promote this implementation.** mean gain below the declared €1,500 threshold; a week below 92% on time; aggregate on-time decline exceeded 0.5 percentage points. Throughput averaged 329.25 orders/week; aggregate on-time share was 94.99%.
- **combined: Do not promote this implementation.** mean gain below the declared €1,500 threshold; a week below 92% on time; aggregate on-time decline exceeded 0.5 percentage points. Throughput averaged 329.25 orders/week; aggregate on-time share was 94.99%.
- **Capacity/route interaction:** €333.70/week, with paired differences €-609.20, €2,715.13, €714.72, €-1,485.85. This comparison separates the specified mechanisms; it does not generalize beyond these weeks.
- **Incremental return-offer effect:** €0.00/week, with paired differences €0.00, €0.00, €0.00, €0.00. This comparison separates the specified mechanisms; it does not generalize beyond these weeks.

## Where the profit went

| Treatment | Revenue change | Driver-payment change to profit | Refund change to profit | Fine change to profit | Release-fee change to profit | Net change |
|---|---:|---:|---:|---:|---:|---:|
| capacity | €278.95 | €-408.25 | €-187.11 | €0.00 | €29.09 | €-287.32 |
| routes | €806.68 | €-472.75 | €-192.03 | €-25.00 | €9.59 | €126.49 |
| capacity-routes | €1,620.86 | €-1,021.05 | €-404.18 | €-25.00 | €2.25 | €172.87 |

These are paired whole-week ledger differences, not causal costs assigned to individual routes. Higher revenue and throughput did not imply a comparable net-profit gain. The routing arms also exposed the known changed-route charging defect.

The added return-offer mechanism sent 5 offers: {'expired': 3, 'declined': 2}. Its zero profit increment does not test whether a calibrated driver-aware payment planner could help; this particular filter and offer rule produced no accepted offers on these weeks.

## Other regimes

| Level | Policy | Mean net profit | Paired capacity gain | Qualified | Minimum on time |
|---|---|---:|---:|---:|---:|
| 1 | capacity | €6,567.46 | €-19.70 | 2/2 | 99.42% |
| 1 | mechanisms | €6,587.16 | €0.00 | 2/2 | 99.45% |
| 4 | capacity | €1,519.49 | €-165.75 | 2/2 | 100.00% |
| 4 | mechanisms | €1,685.24 | €0.00 | 2/2 | 100.00% |

There are only two underlying blocks here, shared across levels. Two successes yield a 22.36% one-sided 95% qualification lower bound. These checks cannot validate transfer across levels 1–8.

## Payment interventions

| Opening multiplier | Assigned | Observed 120-minute outcome | Booked within 120 minutes |
|---|---:|---:|---:|
| 0.92 | 13 | 13 | 10 |
| 1 | 19 | 19 | 11 |
| 1.08 | 8 | 8 | 8 |

Each of at most 20 eligible posts per world used recorded probability 1/3 for each multiplier. These interventions came from two seed blocks with sequential interference, not 40 independent weeks. Unread offers, closed gigs, cancellations, failed posts and censored booking outcomes must not become imaginary driver-cost labels. No fee response or payment policy is promoted from this sample.

## Operational audit

The replacement panel retained action errors: 1; recoveries: 0; failed visits: 0; undelivered orders: 0; fines: €300.00. Error contexts remain in the JSON. The booked-reroute charging limitation is still unresolved.

The first panel suffered an unplanned CPU interruption: five full worlds, two partial worlds and 27 unstarted trials remain recorded separately. The two partial worlds were administratively closed without further dispatch; those administrative scores are not full-week policy evidence. Version 2 changed only redundant computation and durability/budget handling, with a new freeze. Its benchmark replications and offer-equivalence tests detect behavioral drift.

## What remains weak

- The capacity price uses heuristic work budgets and a pooled booking prior; it does not estimate causal driver availability or marginal capacity value.
- Anchored routes use fixed uncertainty discounts. Fallback, driver learning, release/booking interactions and changed-route charging still matter.
- Historical models learn on accepted work. Cost prediction gains are small, and the better 99th-percentile tail model is conditional on delivery and uses award-time features.
- The current matching fallback is greedy above 20 connected nodes. NetworkX verified 48 small cases and exposed a larger counterexample; no whole-game optimality claim follows.
- Any promotion requires a frozen evaluation procedure and untouched seed panel. At the first alpha allocation, at least 86 zero-failure weeks are required for a 95% qualification lower bound, before any larger profit-driven sample size. The 24-pair floor is insufficient for that reliability claim.

Exact results: [paired audit](value-development-v2-results.json), [payment outcomes](value-development-v2-payment-probes.json), [interruption record](value-development-interruption.json), [protocol](../experiments/value-v2-protocol.json), [frozen manifest](../experiments/value-development-v2.json), [model study](booking-response-models.json), [cost/tails](booking-cost-and-tail-models.json), [NetworkX check](value-networkx-check.json).

## Next architectural departure

The attached researcher note distinguishes the tested local adjustments from a portfolio planner. The next design compares mutually exclusive customer quotes, routes and payment schedules under common scenarios, executes one action and replans. Use NetworkX for pure disjoint pairs and a standard integer solver when capacity, overlapping routes and payment choices couple the decisions. A solver optimum is only as meaningful as the candidate set and economic model. See [portfolio research design](portfolio-research-design.md). This design has not been implemented or played; it is not a validated solution.

The [final server audit](value-operations-audit.json) verifies that all research worlds ended as unranked practice worlds. The server reported zero unfinished team worlds at that check. Occupancy observations and their limits are retained.
