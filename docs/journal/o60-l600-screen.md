# o60-l600 on panel screen: FAIL

**Idea:** Fee ladder: open at 60% and climb over 10 hours.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:46 UTC · **Changed against champion `f8a730aaed7e`:** source `6a2cf784ace9`; settings `openFee=0.6`, `ladderMinutes=600`, `minFee=2000`

Mean margin €8,131.10 a week against €7,989.52 for the champion on the same 4 weeks at level 8: +€141.59 a week. Margin rose on 2 weeks and fell on 2. Lowest on-time share 93.07% against 96.14%. Ranked weeks 4/4.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €6,959.90 | €8,485.56 | +€1,525.66 | 99.64% / 99.63% | 275 / 271 |
| formal-unseen-20261113-12 | €10,483.61 | €9,459.29 | −€1,024.32 | 97.83% / 94.69% | 323 / 320 |
| formal-unseen-20261113-14 | €6,136.34 | €6,008.28 | −€128.06 | 99.56% / 98.23% | 226 / 226 |
| formal-unseen-20261113-15 | €8,378.22 | €8,571.28 | +€193.06 | 96.14% / 93.07% | 285 / 274 |

Paired 95% bootstrap interval of the mean difference: [−€719.98, +€1,112.23], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 93.07% is under the 94% guard; margin fell on 2 of 4 weeks; at most 1 allowed.
