# Opening fee: what we kept and what we dropped

Owner: Boris (Claude). 14 November 2026. All weeks are level 8 practice weeks. "Full fee" is the default of `codex/standalone-dispatcher` at `d188d36`. "Open fee" is the same source with the first fee step at 90% of the full fee, for orders with more than six hours to the last pickup.

## Kept: open 10% below the full fee

| Weeks | Full fee, mean margin | Open fee, mean margin | Difference | Weeks up / down | Lowest on-time share, full / open |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8 panel weeks | €10,538.06 | €11,890.73 | +€1,352.67 | 8 / 0 | 93.62% / 94.43% |
| 8 fresh weeks, played once (`bh-unseen1-20261114-01` to `-08`) | €8,471.95 | €9,521.46 | +€1,049.51 | 7 / 1 | 96.23% / 93.00% |

Why it works: the typical fee is what a driver is usually paid, not the least that a driver takes. At the full fee the median gig booked 2 minutes after posting. At 90% of it, 98.5% of first gigs still booked at the opening fee (1,094 of 1,111 gigs on four weeks of the earlier source). Driver fees fell from 1.113 to 1.027 times the typical fee; orders stayed at 330 a week.

What it costs: on one fresh week (`-03`) long routes of 325 km to 600 km stayed unbooked for a day and arrived late: 20 late orders against 10, and €898 less margin.

## Dropped

Each row compares a variant with the open fee above, on the same weeks.

| Variant | Weeks | Mean difference to open fee | Weeks down | Lowest on-time share | Why dropped |
| --- | ---: | ---: | ---: | ---: | --- |
| Back to the full fee after 180 minutes without a driver | 12 | +€230 | 6 | 93.5% | Within the noise of 12 weeks; a second fee step for little |
| No discount on routes over 300 km | 11 | −€362 | 8 | 93.9% | Loses on most weeks |
| Open 15% lower, back to full after 180 minutes | 11 | +€173 | 5 | 93.5% | Within the noise; more late orders (3.40% against 2.93%) |
| Open 15% lower | 8 | +€193 | 3 | 92.9% | Within the noise, lower on-time share |
| Open 20% lower for cars ready on a later day | 8 | +€237 | 2 | 92.4% | Lowest on-time share falls below the 94% guard |
| Price a dealer's first 25 orders as an investment in trust | 8 | +€27 | 3 | 93.2% | Wins 28 more orders a week but no more margin |
| Add a congestion cost to the price as local drivers fill up (factor 1, 2, 4) | 6 | +€123, +€35, −€583 | 3, 3, 4 | 92.4%, 94.3%, 95.0% | No gain; the strongest setting gives up margin for 2 points of on-time share |

On the earlier source (`16d9963`), four weeks each, against that source's default:

| Variant | Mean difference | Lowest on-time share | What happened |
| --- | ---: | ---: | --- |
| Fee ladder from 70% to the full fee over 10 hours | +€1,123 | 94.4% | No better than a flat 90%, and 46% of gigs booked on a raise |
| Fee ladder from 60% over 10 hours | +€142 | 93.1% | Drivers wait for the raise: median booking after 305 minutes |
| Fee ladder from 50% over 10 hours | −€2,708 | 89.0% | One week not ranked; fees paid rose to 1.217 times the typical fee |
| Flat 70% until four hours before the last pickup | −€2,927 | 87.7% | 15% of gigs reached the rescue fees |
| The `fee` setting at 0.80, which also lowers prices | −€337 | 89.3% | Wins more orders than drivers can move; one week not ranked |

What we do not know: a paired difference between two versions swings by about €750 from week to week, so 12 weeks cannot tell a €200 effect from none.
