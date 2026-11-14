# g-open-085 on panel all: FAIL

**Idea:** Open every gig 15% below the full fee.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:53 UTC · **Changed against champion `354b4710b464`:** settings `openFee=0.85`, `laterFee=0.85`

Mean margin €12,084.31 a week against €10,538.06 for the champion on the same 8 weeks at level 8: +€1,546.25 a week. Margin rose on 7 weeks and fell on 1. Lowest on-time share 92.94% against 93.62%. Ranked weeks 8/8.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €8,145.27 | €10,537.07 | +€2,391.80 | 100.00% / 99.67% | 304 / 302 |
| formal-unseen-20261113-12 | €11,982.16 | €13,797.02 | +€1,814.86 | 96.25% / 94.92% | 373 / 374 |
| formal-unseen-20261113-14 | €8,627.17 | €9,891.12 | +€1,263.95 | 99.27% / 98.15% | 275 / 270 |
| formal-unseen-20261113-15 | €10,369.66 | €10,851.56 | +€481.90 | 93.62% / 92.94% | 329 / 326 |
| formal-unseen-20261113-10 | €14,065.59 | €16,842.34 | +€2,776.75 | 96.14% / 94.26% | 389 / 383 |
| formal-unseen-20261113-11 | €9,010.09 | €8,687.87 | −€322.22 | 98.54% / 95.51% | 274 / 245 |
| formal-unseen-20261113-13 | €12,556.76 | €13,915.82 | +€1,359.06 | 99.73% / 98.06% | 364 / 361 |
| formal-unseen-20261113-16 | €9,547.79 | €12,151.68 | +€2,603.89 | 99.16% / 98.61% | 358 / 360 |

Paired 95% bootstrap interval of the mean difference: [+€815.53, +€2,225.40], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 92.94% is under the 94% guard.
