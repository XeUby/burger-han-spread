# Paired validation on eight unseen weeks

Candidate mean margin was €8,418.62, compared with €5,541.90 for the frozen baseline. The paired mean difference was €2,876.73 (51.91%). Candidate qualification: 8/8; baseline: 8/8.

| Seed | Baseline margin | Candidate margin | Difference | On time, baseline / candidate | Qualified, baseline / candidate |
| --- | ---: | ---: | ---: | ---: | --- |
| formal-unseen-20261113-09 | €3,483.06 | €6,959.90 | €3,476.84 | 100.00% / 99.64% | yes / yes |
| formal-unseen-20261113-10 | €7,333.50 | €10,252.30 | €2,918.80 | 100.00% / 98.66% | yes / yes |
| formal-unseen-20261113-11 | €4,254.47 | €7,598.25 | €3,343.78 | 100.00% / 99.59% | yes / yes |
| formal-unseen-20261113-12 | €8,794.45 | €10,483.61 | €1,689.16 | 99.59% / 97.83% | yes / yes |
| formal-unseen-20261113-13 | €6,337.97 | €9,956.95 | €3,618.98 | 98.48% / 99.34% | yes / yes |
| formal-unseen-20261113-14 | €3,381.06 | €6,136.34 | €2,755.28 | 98.31% / 99.56% | yes / yes |
| formal-unseen-20261113-15 | €5,704.51 | €8,378.22 | €2,673.71 | 98.79% / 96.14% | yes / yes |
| formal-unseen-20261113-16 | €5,046.15 | €7,583.41 | €2,537.26 | 100.00% / 98.37% | yes / yes |

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Mean margin | €5,541.90 | €8,418.62 |
| Median margin | €5,375.33 | €7,988.23 |
| Minimum margin | €3,381.06 | €6,136.34 |
| Total margin | €44,335.17 | €67,348.98 |
| Minimum on-time share | 98.31% | 96.14% |
| Aggregate on-time share | 99.39% | 98.59% |
| Won orders | 1311 | 2263 |
| On-time orders | 1303 | 2231 |
| Undelivered orders | 1 | 0 |

The candidate gained margin on 8 weeks, tied on 0 and lost on 0. Median paired difference: €2,837.04; worst difference: €1,689.16. The exact two-sided sign-test p-value is 0.0078.

The paired 95% percentile bootstrap interval for mean margin difference is [€2,459.73, €3,253.70], using 10,000 resamples and random seed 20261113. Each resample draws whole paired weeks; individual orders are not treated as independent.

Candidate qualification has a one-sided 95% exact binomial lower bound of 68.77%, assuming independent identically distributed weeks. Eight weeks cannot establish a very low disqualification rate. The bootstrap interval is a small-sample estimate, not a guarantee. Margins include all weeks, including any unqualified week.

Baseline revision: `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6`. Candidate revision: `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb`. Settings, world identifiers and full counts are in [optimization-validation.json](optimization-validation.json).

Every reserved seed must contain exactly one baseline with the original revision and settings, and exactly one candidate under the same candidate revision and settings. Missing or duplicate runs abort report generation. Validation outcomes must not be used to retune the candidate while retaining an unseen-validation claim.
