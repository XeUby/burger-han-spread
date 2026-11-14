# fee-080 on panel screen: FAIL

**Idea:** Lower the fee setting to 0.80, which also lowers the price floor and the cost in the price optimisation.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:46 UTC · **Changed against champion `f8a730aaed7e`:** settings `fee=0.8`

Mean margin €7,652.32 a week against €7,989.52 for the champion on the same 4 weeks at level 8: −€337.19 a week. Margin rose on 2 weeks and fell on 2. Lowest on-time share 89.27% against 96.14%. Ranked weeks 3/4.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €6,959.90 | €7,621.19 | +€661.29 | 99.64% / 96.81% | 275 / 345 |
| formal-unseen-20261113-12 | €10,483.61 | €7,856.75 | −€2,626.86 | 97.83% / 89.27% | 323 / 317 |
| formal-unseen-20261113-14 | €6,136.34 | €7,124.89 | +€988.55 | 99.56% / 96.54% | 226 / 289 |
| formal-unseen-20261113-15 | €8,378.22 | €8,006.47 | −€371.75 | 96.14% / 92.04% | 285 / 314 |

Paired 95% bootstrap interval of the mean difference: [−€1,804.82, +€824.92], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** 1 week(s) not ranked: under 90% on time or no order won; lowest on-time share 89.27% is under the 94% guard; mean gain −€337.19 a week is under +€50.00; margin fell on 2 of 4 weeks; at most 1 allowed.
