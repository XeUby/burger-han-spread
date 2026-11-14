# c1 on panel all: FAIL

**Idea:** Open 10% lower, route ceiling 800 km, daily capacity 0.26, backlog 0.06.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:46 UTC · **Changed against champion `f8a730aaed7e`:** source `6a2cf784ace9`; settings `capacity=0.26`, `maxKm=800`, `backlog=0.06`, `openFee=0.9`, `ladderMinutes=0`, `minFee=2000`

Mean margin €10,506.11 a week against €8,418.62 for the champion on the same 8 weeks at level 8: +€2,087.49 a week. Margin rose on 8 weeks and fell on 0. Lowest on-time share 92.48% against 96.14%. Ranked weeks 8/8.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €6,959.90 | €9,181.77 | +€2,221.87 | 99.64% / 99.66% | 275 / 292 |
| formal-unseen-20261113-12 | €10,483.61 | €11,728.11 | +€1,244.50 | 97.83% / 92.93% | 323 / 368 |
| formal-unseen-20261113-14 | €6,136.34 | €8,332.39 | +€2,196.05 | 99.56% / 98.07% | 226 / 259 |
| formal-unseen-20261113-15 | €8,378.22 | €9,494.50 | +€1,116.28 | 96.14% / 92.48% | 285 / 319 |
| formal-unseen-20261113-10 | €10,252.30 | €12,827.12 | +€2,574.82 | 98.66% / 94.04% | 298 / 369 |
| formal-unseen-20261113-11 | €7,598.25 | €9,666.35 | +€2,068.10 | 99.59% / 97.41% | 245 / 270 |
| formal-unseen-20261113-13 | €9,956.95 | €12,088.78 | +€2,131.83 | 99.34% / 97.38% | 305 / 344 |
| formal-unseen-20261113-16 | €7,583.41 | €10,729.87 | +€3,146.46 | 98.37% / 98.84% | 306 / 346 |

Paired 95% bootstrap interval of the mean difference: [+€1,659.37, +€2,522.03], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 92.48% is under the 94% guard.
