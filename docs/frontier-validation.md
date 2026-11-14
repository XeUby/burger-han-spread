# Frozen paired frontier validation

Candidate mean profit: €10,411.59; baseline: €8,242.34. Paired gain: €2,169.25 (26.32%). Qualified weeks: candidate 8/8, baseline 8/8.

| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |
|---|---:|---:|---:|---:|---:|
| frontier-unseen-20261114-19325279220dd249 | €9,624.09 | €12,326.93 | €2,702.84 | 321/325 / 364/368 | True / True |
| frontier-unseen-20261114-779e9add6b14a18b | €6,283.63 | €8,154.63 | €1,871.00 | 238/239 / 274/277 | True / True |
| frontier-unseen-20261114-7f39dd564e731085 | €5,270.87 | €7,226.37 | €1,955.50 | 200/200 / 237/239 | True / True |
| frontier-unseen-20261114-f5efce54acaddce6 | €9,338.94 | €12,172.19 | €2,833.25 | 325/326 / 377/382 | True / True |
| frontier-unseen-20261114-7233f333bf3d7c2e | €10,641.34 | €14,783.29 | €4,141.95 | 310/312 / 365/368 | True / True |
| frontier-unseen-20261114-98dcde7a3d066a80 | €7,267.44 | €8,000.26 | €732.82 | 246/248 / 282/293 | True / True |
| frontier-unseen-20261114-4d17ec2759243bc1 | €9,449.89 | €9,172.91 | €-276.98 | 287/291 / 319/336 | True / True |
| frontier-unseen-20261114-b256738651c1125d | €8,062.53 | €11,456.15 | €3,393.62 | 258/263 / 318/326 | True / True |

Profit improved on 7 weeks, tied on 0 and declined on 1. Exact two-sided sign-test p = 0.070312. The 95% paired bootstrap interval for mean gain is [€1,195.42, €3,048.48], using 10,000 resamples and seed 20261114.

Candidate minimum on-time share: 94.94%; aggregate on-time orders: 2536/2589; undelivered: 0. The one-sided 95% lower bound on weekly qualification is 68.77%, conditional on independent identically distributed weeks.

Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.

Baseline source: `f8a730aaed7e169b0e8df8fd1dee9cc5543a69ccaf93ea1780fb78d31747befb`. Candidate source: `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41`. Selection frozen: `2026-11-14T00:10:10.522740+00:00`.

| Seed | Baseline world | Candidate world |
|---|---|---|
| frontier-unseen-20261114-19325279220dd249 | `w2aabdee2d303f39f1b63` | `w370727e2f84b6616e27d` |
| frontier-unseen-20261114-779e9add6b14a18b | `wff88ce1176b470133d6b` | `wed077baaf55738a03245` |
| frontier-unseen-20261114-7f39dd564e731085 | `w90cc53e21105f50b767c` | `w6780460f61aa419c17c2` |
| frontier-unseen-20261114-f5efce54acaddce6 | `wf2522db2a6cd59f8b269` | `w531ed4987e09834cc1c1` |
| frontier-unseen-20261114-7233f333bf3d7c2e | `w08aa7edba012c50a9f39` | `w99ca20e04eb4a3578ba3` |
| frontier-unseen-20261114-98dcde7a3d066a80 | `w9bad3f6f3bb2a05f6e37` | `wda6efe29b349ddafa66e` |
| frontier-unseen-20261114-4d17ec2759243bc1 | `w7d747b57779c24ebbe3c` | `wf97529eaa1a9ec8a52c5` |
| frontier-unseen-20261114-b256738651c1125d | `w94ce568c0df96c131a31` | `wcda57d99f627c20ea663` |

Exact settings, file hashes and counts are in the accompanying JSON report. A small panel cannot establish a very low disqualification probability. Bootstrap intervals are descriptive small-sample estimates, not guarantees. All declared weeks remain in mean profit, including unqualified weeks. No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened. Do not tune against these outcomes and continue calling the same panel unseen.
