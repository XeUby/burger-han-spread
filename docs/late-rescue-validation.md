# Frozen paired frontier validation

Candidate mean profit: €9,352.92; baseline: €9,070.28. Paired gain: €282.64 (3.12%). Qualified weeks: candidate 8/8, baseline 8/8.

| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |
|---|---:|---:|---:|---:|---:|
| late-rescue-unseen-20261114-5916726ab4e9f863 | €7,670.02 | €7,811.14 | €141.12 | 250/252 / 250/252 | True / True |
| late-rescue-unseen-20261114-e4ee0c5739a75ad0 | €10,608.56 | €11,232.00 | €623.44 | 300/311 / 301/311 | True / True |
| late-rescue-unseen-20261114-e48160564a27cf74 | €8,115.39 | €8,601.10 | €485.71 | 266/274 / 266/274 | True / True |
| late-rescue-unseen-20261114-824df9f835246148 | €5,011.17 | €5,124.35 | €113.18 | 203/207 / 203/207 | True / True |
| late-rescue-unseen-20261114-9b483a1a53deba54 | €10,103.79 | €10,103.79 | €0.00 | 292/294 / 292/294 | True / True |
| late-rescue-unseen-20261114-864cfcc97f2cade5 | €10,591.75 | €10,866.92 | €275.17 | 324/331 / 324/331 | True / True |
| late-rescue-unseen-20261114-c551e105a48e2148 | €11,519.83 | €11,723.09 | €203.26 | 333/342 / 333/342 | True / True |
| late-rescue-unseen-20261114-5e15a0a3962a54ba | €8,941.70 | €9,360.94 | €419.24 | 304/312 / 304/312 | True / True |

Profit improved on 7 weeks, tied on 1 and declined on 0. Exact two-sided sign-test p = 0.015625. The 95% paired bootstrap interval for mean gain is [€149.16, €423.22], using 10,000 resamples and seed 2026111402.

Candidate minimum on-time share: 96.78%; aggregate on-time orders: 2273/2323; undelivered: 0. The one-sided 95% lower bound on weekly qualification is 68.77%, conditional on independent identically distributed weeks.

Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.

Baseline source: `36a1c9ad35990355fcaa0cfa0902ed6de1bcf20adc32a868fbf46a4878d23d41`. Candidate source: `16d908dd8e96325d972aa45529f69d6ca82910be212b68857e7cf3f0677530ef`. Selection frozen: `2026-11-14T01:04:41.762245+00:00`.

| Seed | Baseline world | Candidate world |
|---|---|---|
| late-rescue-unseen-20261114-5916726ab4e9f863 | `wd88b3ed2a95472802fe4` | `wa6e982433a45fbcdd401` |
| late-rescue-unseen-20261114-e4ee0c5739a75ad0 | `wc950e844bea34b4bd79a` | `wbea5dbdaebeff5638d1c` |
| late-rescue-unseen-20261114-e48160564a27cf74 | `w49061de8484c00420b4f` | `w70550a8c599b38df78ac` |
| late-rescue-unseen-20261114-824df9f835246148 | `w1c1994a0583f1b960853` | `wada29dbdd78bf506f315` |
| late-rescue-unseen-20261114-9b483a1a53deba54 | `wd56e99c79ef5a6a8953e` | `wa8a176feea958e9bf80f` |
| late-rescue-unseen-20261114-864cfcc97f2cade5 | `w6c27a619f4da86e45a93` | `w2a2f50f79c60f9a8503f` |
| late-rescue-unseen-20261114-c551e105a48e2148 | `w23b23a9de15d1374e9d6` | `wfa55a0b7e052e3eb9f94` |
| late-rescue-unseen-20261114-5e15a0a3962a54ba | `w19ad9c95aa672e0b58b4` | `wc3a6f0a7ce2eaeb508e2` |

Exact settings, file hashes and counts are in the accompanying JSON report. A small panel cannot establish a very low disqualification probability. Bootstrap intervals are descriptive small-sample estimates, not guarantees. All declared weeks remain in mean profit, including unqualified weeks. No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened. Do not tune against these outcomes and continue calling the same panel unseen.
