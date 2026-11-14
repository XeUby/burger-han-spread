# later-070 on panel screen: FAIL

**Idea:** Open at 90%, and at 70% for a car ready on a later day.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:46 UTC · **Changed against champion `f8a730aaed7e`:** source `dc8c8e1cbcef`; settings `openFee=0.9`, `laterFee=0.7`, `ladderMinutes=0`, `minFee=2000`, `trustValue=0`

Mean margin €8,029.71 a week against €7,989.52 for the champion on the same 4 weeks at level 8: +€40.19 a week. Margin rose on 2 weeks and fell on 2. Lowest on-time share 93.77% against 96.14%. Ranked weeks 4/4.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €6,959.90 | €7,533.59 | +€573.69 | 99.64% / 98.51% | 275 / 269 |
| formal-unseen-20261113-12 | €10,483.61 | €9,723.15 | −€760.46 | 97.83% / 93.77% | 323 / 321 |
| formal-unseen-20261113-14 | €6,136.34 | €5,618.02 | −€518.32 | 99.56% / 96.90% | 226 / 226 |
| formal-unseen-20261113-15 | €8,378.22 | €9,244.08 | +€865.86 | 96.14% / 94.79% | 285 / 288 |

Paired 95% bootstrap interval of the mean difference: [−€639.39, +€719.77], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 93.77% is under the 94% guard; mean gain +€40.19 a week is under +€50.00; margin fell on 2 of 4 weeks; at most 1 allowed.
