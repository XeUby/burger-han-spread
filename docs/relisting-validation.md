# Frozen paired frontier validation

Candidate mean profit: €7,861.83; baseline: €7,822.37. Paired gain: €39.46 (0.50%). Qualified weeks: candidate 8/8, baseline 8/8.

| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |
|---|---:|---:|---:|---:|---:|
| relisting-unseen-20261114-44179069f811e12a | €7,842.18 | €7,571.60 | €-270.58 | 260/266 / 263/267 | True / True |
| relisting-unseen-20261114-593862ba0453d993 | €7,623.73 | €7,247.32 | €-376.41 | 261/266 / 267/274 | True / True |
| relisting-unseen-20261114-ae921d2f5a004c5c | €5,989.32 | €6,539.06 | €549.74 | 237/241 / 239/241 | True / True |
| relisting-unseen-20261114-5291bd44e58fc0b8 | €5,642.62 | €5,763.04 | €120.42 | 234/237 / 240/242 | True / True |
| relisting-unseen-20261114-664fad94342f003c | €7,735.71 | €7,641.11 | €-94.60 | 257/265 / 258/260 | True / True |
| relisting-unseen-20261114-be6ccba2d5332cc6 | €7,860.98 | €7,925.93 | €64.95 | 293/295 / 296/297 | True / True |
| relisting-unseen-20261114-85e7c8159eb228d3 | €10,998.98 | €11,206.22 | €207.24 | 316/320 / 320/322 | True / True |
| relisting-unseen-20261114-49994c1da1bed296 | €8,885.45 | €9,000.35 | €114.90 | 262/269 / 264/270 | True / True |

Profit improved on 5 weeks, tied on 0 and declined on 3. Exact two-sided sign-test p = 0.726562. The 95% paired bootstrap interval for mean gain is [€-142.63, €233.05], using 10,000 resamples and seed 2026111402.

Candidate minimum on-time share: 97.45%; aggregate on-time orders: 2147/2173; undelivered: 0. The one-sided 95% lower bound on weekly qualification is 68.77%, conditional on independent identically distributed weeks.

Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.

Baseline source: `16d908dd8e96325d972aa45529f69d6ca82910be212b68857e7cf3f0677530ef`. Candidate source: `922033da58fb2c06c2d0cec1f6b8d67c5a320354d1dd93feb5591ab8d85eb49c`. Selection frozen: `2026-11-14T02:27:53.589771+00:00`.

| Seed | Baseline world | Candidate world |
|---|---|---|
| relisting-unseen-20261114-44179069f811e12a | `w91564fd780e4bc249119` | `w04e60027b7b2b4d7b58b` |
| relisting-unseen-20261114-593862ba0453d993 | `w7eaa6b3210b790c25028` | `w8baaaa6df86b54b0124f` |
| relisting-unseen-20261114-ae921d2f5a004c5c | `w129775e44fd461f4366b` | `wdff0665ab413b6995114` |
| relisting-unseen-20261114-5291bd44e58fc0b8 | `w204e5b617a8a34fb8b1b` | `w90976401207ea6e356ad` |
| relisting-unseen-20261114-664fad94342f003c | `w84f9b01fde2cae59d96e` | `wfc55b9fd2c33edcf38d2` |
| relisting-unseen-20261114-be6ccba2d5332cc6 | `w20a5b10fafcb6b7ad129` | `w5c65064df8ed758335b3` |
| relisting-unseen-20261114-85e7c8159eb228d3 | `w25bd5a8dbece356a4b6a` | `w948237ee99b62929f498` |
| relisting-unseen-20261114-49994c1da1bed296 | `w119bd36598fdf32552b2` | `wcab3544664a8a0e5ac1e` |

Exact settings, file hashes and counts are in the accompanying JSON report. A small panel cannot establish a very low disqualification probability. Bootstrap intervals are descriptive small-sample estimates, not guarantees. All declared weeks remain in mean profit, including unqualified weeks. No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened. Do not tune against these outcomes and continue calling the same panel unseen.
