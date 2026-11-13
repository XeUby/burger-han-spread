# Initial unseen evaluation before the reroute correction

Candidate mean margin was €8,237.69, compared with €4,858.73 for the frozen baseline. The paired mean difference was €3,378.97 (69.54%). Candidate qualification: 8/8; baseline: 8/8.

| Seed | Baseline margin | Candidate margin | Difference | On time, baseline / candidate | Qualified, baseline / candidate |
| --- | ---: | ---: | ---: | ---: | --- |
| formal-unseen-20261113-01 | €5,073.57 | €8,278.87 | €3,205.30 | 98.67% / 99.63% | yes / yes |
| formal-unseen-20261113-02 | €4,589.25 | €7,428.03 | €2,838.78 | 100.00% / 99.18% | yes / yes |
| formal-unseen-20261113-03 | €4,877.61 | €9,176.38 | €4,298.77 | 100.00% / 100.00% | yes / yes |
| formal-unseen-20261113-04 | €7,831.46 | €12,271.19 | €4,439.73 | 98.37% / 99.14% | yes / yes |
| formal-unseen-20261113-05 | €4,748.95 | €7,401.20 | €2,652.25 | 100.00% / 99.62% | yes / yes |
| formal-unseen-20261113-06 | €1,453.24 | €4,803.42 | €3,350.18 | 97.67% / 100.00% | yes / yes |
| formal-unseen-20261113-07 | €3,808.69 | €6,180.35 | €2,371.66 | 100.00% / 99.12% | yes / yes |
| formal-unseen-20261113-08 | €6,487.03 | €10,362.10 | €3,875.07 | 100.00% / 99.34% | yes / yes |

| Metric | Baseline | Candidate |
| --- | ---: | ---: |
| Mean margin | €4,858.73 | €8,237.69 |
| Median margin | €4,813.28 | €7,853.45 |
| Minimum margin | €1,453.24 | €4,803.42 |
| Total margin | €38,869.80 | €65,901.54 |
| Minimum on-time share | 97.67% | 99.12% |
| Aggregate on-time share | 99.37% | 99.48% |
| Won orders | 1106 | 2135 |
| On-time orders | 1099 | 2124 |
| Undelivered orders | 0 | 1 |

The candidate gained margin on 8 weeks, tied on 0 and lost on 0. Median paired difference: €3,277.74; worst difference: €2,371.66. The exact two-sided sign-test p-value is 0.0078.

The paired 95% percentile bootstrap interval for mean margin difference is [€2,896.52, €3,874.05], using 10,000 resamples and random seed 20261113. Each resample draws whole paired weeks; individual orders are not treated as independent.

Candidate qualification has a one-sided 95% exact binomial lower bound of 68.77%, assuming independent identically distributed weeks. Eight weeks cannot establish a very low disqualification rate. The bootstrap interval is a small-sample estimate, not a guarantee. Margins include all weeks, including any unqualified week.

Baseline revision: `c440065717076cc4d14d2aae3b395f15a98efbc35cb3dfcc3d47f18813f39be6`. Candidate revision: `0b8d200ce7c85d4c04aac9411fb884e1382f2e5337a43916163c41bac4d9cd26`. Settings, world identifiers and full counts are in [optimization-validation-round1.json](optimization-validation-round1.json).

Every reserved seed must contain exactly one baseline with the original revision and settings, and exactly one candidate under the same candidate revision and settings. Missing or duplicate runs abort report generation. Validation outcomes must not be used to retune the candidate while retaining an unseen-validation claim.

This evaluation exposed an undelivered car after a dealer changed its route. The resulting fee correction means these weeks are development evidence for the final source. The final source is evaluated on a separate, fresh eight-week panel.
