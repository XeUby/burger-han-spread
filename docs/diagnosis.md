# Diagnosis of the original dispatcher

The strongest initial hypothesis is that conservative quoting sacrifices profitable demand. The other useful controls—local backlog, feasible pickup windows, equipment and driver eligibility—should be tested separately from price.

## Formal decision problem

This is a finite-horizon, partially observed stochastic control problem. The state includes outstanding quotes, cars, gigs, driver locations and commitments, dealer trust, weather, and beliefs about market prices and available drivers. The actions are quote menus, gig designs, fees, direct offers and releases. Driver assignments cannot be commanded.

Maximize expected weekly net ledger revenue, subject to a high probability that the realized number of late orders is at most 10% of the noncancelled won orders. The game itself checks that realized ratio, not its expectation. We should therefore test the probability of qualification across complete weeks, not treat orders within a week as independent replicates.

For request i and option o, an approximate admission value is:

`P(win | price, state) × [price − expected fulfillment cost − expected refunds + future trust value − capacity shadow cost − λ × (P(late | win,state) − 0.10)]`.

Choose the best positive-value feasible menu. Capacity shadow costs depend on pickup town, service day and required driver capabilities. Pricing controls demand; the backlog constraint limits simultaneous exposure. A route optimizer can supply feasible bundles and optimistic capacity bounds, but cannot replace a model of freelance driver acceptance.

## Evidence

The frozen final baseline consists of three completed level 8 worlds, 3,104 requests and 469 noncancelled wins. Thirteen historical runs support descriptive comparisons; repeated seeds and jointly changed policies are explicitly not independent causal experiments. See [diagnosis.json](diagnosis.json) and [diagnosis-dispatch.json](diagnosis-dispatch.json).

| Observation | Measurement | Hypothesis |
|---|---:|---|
| Limited demand coverage | 1,220/3,104 requests received a commercial quote | Expand understood work before relaxing risk control |
| Cost floor dominates | At least 892/1,220 quotes, 73.1% | Lowering only the list-price multiplier misses the main constraint |
| Price floor depresses wins | 32.1% wins when floor binds, 55.8% otherwise | Test a lower cost markup and remove the fixed €10 addition |
| Note exclusions | 855 requests, 27.5% | Better note understanding can expand supply of profitable orders |
| Equal option menus | 500 requests | Price different delivery promises separately; price safety slack |
| Typical realized driver cost | 1.108× reference fee, weighted | Quoted cost floor is more conservative than mean fulfillment cost |
| Most booking is quick | Median 2 minutes; 375/469 within 10 minutes | Test lower opening fees on well-supplied, nonurgent jobs |
| Rescue work loses money | 29 raised-fee orders: −€28 total; five of six lates | Anticipate difficult work and intervene before deadline rescue |
| Current direct-offer acceptance is low | 0/129 accepted: 39 declined, 90 expired | Offer earlier to recently active drivers with plausible incremental routes |

“Floor binds” is a lower bound because the calculation omits sparse-supply fee surcharges. Rescue means total driver fees exceed the first observed app fee by more than 5%; it is an observed outcome, not an ex ante classification. The rescue association does not show that raising fees causes lateness.

An expired offer can coincide with an app booking. Offer notifications may therefore help even when no offer is explicitly accepted; an isolated no-offer or early-offer experiment is needed to identify the effect.

Baseline net profit is €15,826.24 across the three weeks. Order-level dispatch tables exclude cancelled orders and therefore sum to €15,996.86; the €170.62 difference is cancellation costs. Actual driver fees, refunds and each booking come from event logs; opening fees use the earliest revealed view.

## Price sensitivity versus safety

On `holdout-3`, the earlier policy made €5,563.93 with 133 wins and 98.50% on-time delivery. The final baseline made €2,591.97 with 57 wins and 100% on-time delivery. Of the older wins that disappeared:

- 55 were still commercially quoted but lost. Those older orders were all on time and earned €1,853.41.
- 16 were excluded by the 400 km cap. Fifteen arrived on time and earned €1,121.81 together.
- Only six were excluded by the remaining supply, capacity or timing gates.

On the difficult `holdout-2`, the final policy's additional capacity/supply/timing exclusions removed 27 formerly won orders. Five of those had been late; together they earned only €276.40. That supports separating local safety admission from a global high price floor.

The old and new worlds have endogenous differences in driver assignments and trust. These matched request counts locate the likely lost opportunity; they do not assert that the old profit can be added back unchanged.

## Dispatch and cost heterogeneity

| Cohort | Orders | Late | Weighted driver cost/reference | Profit/order before cancellation costs |
|---|---:|---:|---:|---:|
| Final, under 70 km | 148 | 1 | 1.166 | €21.54 |
| Final, 70–150 km | 85 | 3 | 1.132 | €27.75 |
| Final, 150–250 km | 155 | 2 | 1.108 | €37.09 |
| Final, 250–400 km | 81 | 0 | 1.069 | €58.05 |
| Earlier aggressive, 400–500 km | 44 | 2 | 1.055 | €60.03 |

Distance is not a sufficient risk measure. A short car's €20 opening-fee minimum and return travel can dominate its economics. Long, sufficiently slack trips can pay well. Test the 400–500 km expansion only with unchanged supply/backlog gates and an extra pickup buffer.

The three final request streams include 199 single-car, public-address trips of 400–600 km that pass expanded-note and 300-minute timing gates: 103 at 400–500 km, 44 at 500–550 km, and 52 at 550–600 km. Supply and dynamic backlog have not been checked because their original rosters were not saved. The 44 historically dispatched long routes passed the older minimum of eight weighted eligible drivers, not today's twelve. None exceeded 500 km. Their observed on-time rate is 95.45%, but its ordinary 95% Wilson lower bound is only 84.86%, even before accounting for weekly dependence. Treat expansion as an experiment.

Historical lanes with the largest accumulated positive margins were Tampere–Oulu (€315, 4/4 on time), Lempäälä–Oulu (€269, 3/4), Kuopio–Raisio (€250, 3/3), Espoo–Kokkola (€237, 3/3), and Helsinki–Vaasa (€214, 3/3). Oulu–Savonlinna's sole order was late and lost €161. These tiny lane samples support a pooled model, not a literal lane whitelist. Full counts and the note-parser source hash are in [diagnosis-long.json](diagnosis-long.json).

The final baseline has 243 cars ready more than three hours after the response deadline. Their first booking delay is one minute at the median and 12 minutes at the 95th percentile. They account for 54 of 62 drops, but only nine of the 29 raised-fee orders. This suggests a measured opening-fee reduction for future-ready work; delaying all future postings could sacrifice useful advance travel planning and is a lower priority.

In three earlier aggressive weeks, weighted local unbooked demand above four at quote time was associated with 15/131 late orders (11.45%). At four or below, 16/518 were late (3.09%). The final policy largely removes the dangerous combination of backlog and inadequate local supply. These counts reconstruct weighted nearby pending quotes and won, unbooked cars on the same pickup day. Rosters were not saved in those runs, so a trustworthy retrospective stratification by total eligible driver supply is unavailable. Do not equate raw backlog counts across towns.

The final policy spent an additional €873.40 above the first observed fees on its 29 rescue cases. The earlier aggressive cohort spent €3,837.06 on 95 such cases, which lost €862.57 collectively and contained 27/31 late orders. Tightening admission as booking delays accumulate is more promising than relying on extreme last-minute repricing.

## Ordered experiments

1. **Quote-floor ablation:** keep the current opening fees and all safety gates; reduce margin floor to 10% and fixed addition to €0. Evaluate on a low-price week and the difficult shortage week. This isolates the largest suspected demand constraint.
2. **Opening-fee ablation:** freeze quote generation separately from opening fees, then compare 0.95 versus 1.05 reference fee under identical admission. If safe, test 0.90 only on future-ready or dense low-backlog work. Track total fees, rescue costs, time to first booking, drops and qualification—not just opening fee.
3. **Early targeted offers:** one offer wave after 20–30 unbooked minutes on work available that day, at the current fee. Rank drivers by recent activity and inferred location/route compatibility, not only home distance. Keep the existing deadline rescue as fallback. The observed 0/129 offer conversion means the current late-offer design provides little evidence of value.
4. **Menu and long-route ablations:** preserve the above safety gates; compare withholding the tightest option, or a higher same-day premium with a lower flexible-option quote. Separately test 500 km maximum with additional feasible pickup slack.
5. **Online pricing:** estimate a shared price-sensitivity model with pickup/delivery, distance, day and dealer effects. Update a world/day price-level intercept from wins/losses; account for the known 1%-per-order trust effect. Use shrinkage and bounded prices because individual lanes have little data. Optimize expected contribution over a discrete price grid, with a capacity shadow price when local exposure grows.

Use a fixed development seed panel, paired candidate–baseline whole-week differences, and independent held-out weeks after selection. Report worst-week qualification and profit as well as means. No finite number of practice weeks proves global optimality or guarantees ranking on the secret final.

## Reproduction

The scripts read the frozen baseline manifest and saved completed-world logs. They make no API calls and do not modify the dispatcher:

```bash
node analysis/diagnosis.ts
python3 analysis/diagnosis_dispatch.py
node analysis/diagnosis_long.ts
```
