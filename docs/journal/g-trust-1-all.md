# g-trust-1 on panel all: FAIL

**Idea:** Price each of a dealer's first 25 orders as an investment: add to its profit 1% of the price of each later order that it lifts.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:53 UTC · **Changed against champion `354b4710b464`:** settings `trustValue=1`

Mean margin €10,696.00 a week against €10,538.06 for the champion on the same 8 weeks at level 8: +€157.94 a week. Margin rose on 5 weeks and fell on 3. Lowest on-time share 94.29% against 93.62%. Ranked weeks 8/8.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €8,145.27 | €8,660.34 | +€515.07 | 100.00% / 99.42% | 304 / 342 |
| formal-unseen-20261113-12 | €11,982.16 | €14,032.54 | +€2,050.38 | 96.25% / 97.52% | 373 / 404 |
| formal-unseen-20261113-14 | €8,627.17 | €9,187.73 | +€560.56 | 99.27% / 99.68% | 275 / 311 |
| formal-unseen-20261113-15 | €10,369.66 | €10,162.50 | −€207.16 | 93.62% / 94.29% | 329 / 368 |
| formal-unseen-20261113-10 | €14,065.59 | €14,250.29 | +€184.70 | 96.14% / 95.66% | 389 / 415 |
| formal-unseen-20261113-11 | €9,010.09 | €7,469.55 | −€1,540.54 | 98.54% / 97.46% | 274 / 276 |
| formal-unseen-20261113-13 | €12,556.76 | €12,067.61 | −€489.15 | 99.73% / 98.95% | 364 / 381 |
| formal-unseen-20261113-16 | €9,547.79 | €9,737.41 | +€189.62 | 99.16% / 98.97% | 358 / 387 |

Paired 95% bootstrap interval of the mean difference: [−€497.46, +€834.32], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** margin fell on 3 of 8 weeks; at most 2 allowed.
