# g-open-090-trust-1 on panel all: FAIL

**Idea:** Open 10% lower and price dealer trust as an investment.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:53 UTC · **Changed against champion `354b4710b464`:** settings `openFee=0.9`, `laterFee=0.9`, `trustValue=1`

Mean margin €11,918.34 a week against €10,538.06 for the champion on the same 8 weeks at level 8: +€1,380.28 a week. Margin rose on 8 weeks and fell on 0. Lowest on-time share 93.24% against 93.62%. Ranked weeks 8/8.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €8,145.27 | €10,451.92 | +€2,306.65 | 100.00% / 99.13% | 304 / 344 |
| formal-unseen-20261113-12 | €11,982.16 | €14,499.90 | +€2,517.74 | 96.25% / 95.90% | 373 / 390 |
| formal-unseen-20261113-14 | €8,627.17 | €10,576.29 | +€1,949.12 | 99.27% / 98.38% | 275 / 309 |
| formal-unseen-20261113-15 | €10,369.66 | €11,146.07 | +€776.41 | 93.62% / 93.24% | 329 / 370 |
| formal-unseen-20261113-10 | €14,065.59 | €14,436.27 | +€370.68 | 96.14% / 93.54% | 389 / 418 |
| formal-unseen-20261113-11 | €9,010.09 | €9,754.40 | +€744.31 | 98.54% / 98.21% | 274 / 280 |
| formal-unseen-20261113-13 | €12,556.76 | €13,731.14 | +€1,174.38 | 99.73% / 97.35% | 364 / 378 |
| formal-unseen-20261113-16 | €9,547.79 | €10,750.77 | +€1,202.98 | 99.16% / 97.62% | 358 / 378 |

Paired 95% bootstrap interval of the mean difference: [+€883.65, +€1,904.74], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 93.24% is under the 94% guard.
