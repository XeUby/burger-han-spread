# o50-l600 on panel screen: FAIL

**Idea:** Fee ladder: open at 50% and climb over 10 hours. Drivers learn to wait for the raise.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:46 UTC · **Changed against champion `f8a730aaed7e`:** source `6a2cf784ace9`; settings `openFee=0.5`, `ladderMinutes=600`, `minFee=2000`

Mean margin €5,281.20 a week against €7,989.52 for the champion on the same 4 weeks at level 8: −€2,708.32 a week. Margin rose on 0 weeks and fell on 4. Lowest on-time share 89.04% against 96.14%. Ranked weeks 2/4.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €6,959.90 | €6,270.83 | −€689.07 | 99.64% / 98.85% | 275 / 260 |
| formal-unseen-20261113-12 | €10,483.61 | €4,371.62 | −€6,111.99 | 97.83% / 89.04% | 323 / 292 |
| formal-unseen-20261113-14 | €6,136.34 | €4,460.02 | −€1,676.32 | 99.56% / 97.73% | 226 / 220 |
| formal-unseen-20261113-15 | €8,378.22 | €6,022.32 | −€2,355.90 | 96.14% / 89.89% | 285 / 267 |

Paired 95% bootstrap interval of the mean difference: [−€5,003.07, −€1,105.78], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** 2 week(s) not ranked: under 90% on time or no order won; lowest on-time share 89.04% is under the 94% guard; mean gain −€2,708.32 a week is under +€50.00; margin fell on 4 of 4 weeks; at most 1 allowed.
