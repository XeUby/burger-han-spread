# Early fee climb: no week below 94% on time

Owner: Boris (Claude). 14 November 2026. Forty level 8 practice weeks, the same for both versions: the eight weeks `formal-unseen-20261113-09` to `-16`, `bh-unseen1-20261114-01` to `-08` and `bh-robust-20261114-01` to `-24`. The base is `codex/standalone-dispatcher` at `d15dfd6` with its default settings (opening fee 15% below the full fee for single-car gigs).

## The idea

A gig that no driver has taken a day before its last pickup gets a higher fee then, not four hours before:

| Time before the last pickup | Fee, base | Fee, early climb |
| --- | ---: | ---: |
| 24 hours | opening fee | 1.2 times the full fee |
| 12 hours | opening fee | 1.45 times |
| 4 hours | 1.45 times | 1.45 times |
| 2 hours | 1.9 times | 1.9 times |
| 1 hour | 2.5 times | 2.5 times |

A gig that books before the 24-hour mark is not touched. That is 89% of the single-car gigs with a day or more to spare.

## Why

On the weakest week of the earlier version (`bh-robust-20261114-09`, 90.3% on time), 19 of 29 late orders had never been booked in time. Most were routes of 250 km to 600 km. They stayed open for one to five days at the opening fee, found no driver at 1.45 to 2.5 times the fee in the last four hours, and were booked within hours after the last pickup had passed. A driver needs time to see a gig and to reach the car, so a high fee shortly before the pickup finds nobody. The handbook says the same.

Across forty weeks of that version, routes of 250 km or more were 26% of the orders and 65% of the late ones.

## The effect

| | Base | Early climb |
| --- | ---: | ---: |
| Mean margin a week | €9,688 | €9,730 |
| Paired difference | | +€42 a week (standard error €127); 19 weeks up, 21 down |
| Ranked weeks | 39 of 40 | 40 of 40 |
| Late orders, share of all orders | 4.02% | 2.16% |
| Lowest on-time share | 89.2% | 94.4% |
| Five lowest on-time shares | 89.2%, 90.6%, 91.1%, 92.9%, 93.3% | 94.4%, 95.5%, 95.6%, 95.6%, 96.0% |

The base is not ranked on `bh-robust-20261114-09`: 89.2% on time. In the final that week would score nothing.

## What did not work

- A late-share safeguard that declines long routes once the week's late share passes 4% to 6%: replayed on recorded weeks it left the weakest week at 90.2% and made another worse, because the orders it declined were not the late ones.
- A steeper climb (1.25 and 1.6 times, then 1.9 and 2.2 times): on the six weakest weeks it cost €544 a week more than the climb above and was no more punctual.
- Raising the last steps to 1.7 and 2.1 times as well: on forty weeks of the earlier version it cost €288 a week against €159 for the same on-time shares.
- The early climb plus private addresses: lowest on-time share back to 90.4%.

## What we do not know

Forty ranked weeks do not prove that no week falls below 90%. The weeks were not chosen for this test, but the idea came from the weakest of them, so the gain on those weeks is partly selection.
