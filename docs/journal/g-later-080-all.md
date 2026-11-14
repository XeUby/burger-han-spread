# g-later-080 on panel all: FAIL

**Idea:** Open 10% lower, and 20% lower for a car that is ready on a later day.

**Owner:** Boris (Claude) · **Checked:** 2026-11-14 02:53 UTC · **Changed against champion `354b4710b464`:** settings `openFee=0.9`, `laterFee=0.8`

Mean margin €12,127.98 a week against €10,538.06 for the champion on the same 8 weeks at level 8: +€1,589.92 a week. Margin rose on 8 weeks and fell on 0. Lowest on-time share 92.38% against 93.62%. Ranked weeks 8/8.

| Seed | Champion margin | Candidate margin | Difference | On time, champion / candidate | Orders, champion / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| formal-unseen-20261113-09 | €8,145.27 | €9,571.45 | +€1,426.18 | 100.00% / 99.32% | 304 / 295 |
| formal-unseen-20261113-12 | €11,982.16 | €16,272.53 | +€4,290.37 | 96.25% / 96.34% | 373 / 382 |
| formal-unseen-20261113-14 | €8,627.17 | €10,259.37 | +€1,632.20 | 99.27% / 96.69% | 275 / 272 |
| formal-unseen-20261113-15 | €10,369.66 | €10,615.93 | +€246.27 | 93.62% / 92.38% | 329 / 328 |
| formal-unseen-20261113-10 | €14,065.59 | €14,794.08 | +€728.49 | 96.14% / 93.72% | 389 / 382 |
| formal-unseen-20261113-11 | €9,010.09 | €10,008.13 | +€998.04 | 98.54% / 97.72% | 274 / 263 |
| formal-unseen-20261113-13 | €12,556.76 | €13,261.73 | +€704.97 | 99.73% / 96.66% | 364 / 359 |
| formal-unseen-20261113-16 | €9,547.79 | €12,240.60 | +€2,692.81 | 99.16% / 98.88% | 358 / 356 |

Paired 95% bootstrap interval of the mean difference: [+€846.80, +€2,533.48], whole weeks resampled. With this few weeks it is a description, not a guarantee.

**Why it fails:** lowest on-time share 92.38% is under the 94% guard.
