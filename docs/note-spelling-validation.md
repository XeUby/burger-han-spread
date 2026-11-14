# Frozen paired frontier validation

Candidate mean profit: €9,667.23; baseline: €9,482.36. Paired gain: €184.87 (1.95%). Qualified weeks: candidate 8/8, baseline 8/8.

| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |
|---|---:|---:|---:|---:|---:|
| note-spelling-unseen-20261114-f78979dd4e5b3a7c | €11,410.29 | €11,947.78 | €537.49 | 332/336 / 345/346 | True / True |
| note-spelling-unseen-20261114-8bc883348a90d012 | €7,805.45 | €8,127.03 | €321.58 | 276/279 / 282/284 | True / True |
| note-spelling-unseen-20261114-df5da3c0bccf1e98 | €10,257.62 | €10,178.97 | €-78.65 | 283/288 / 288/293 | True / True |
| note-spelling-unseen-20261114-b0a0611536d3eb20 | €5,671.30 | €6,057.05 | €385.75 | 227/230 / 239/240 | True / True |
| note-spelling-unseen-20261114-309e12dc0f90a102 | €12,837.90 | €11,680.48 | €-1,157.42 | 348/348 / 348/357 | True / True |
| note-spelling-unseen-20261114-5914d58b5b701bdc | €9,695.59 | €10,594.64 | €899.05 | 307/312 / 313/316 | True / True |
| note-spelling-unseen-20261114-6e740a3630050c2d | €10,573.41 | €10,708.13 | €134.72 | 302/311 / 311/316 | True / True |
| note-spelling-unseen-20261114-c07ddff01f6c5f00 | €7,607.33 | €8,043.76 | €436.43 | 305/314 / 314/324 | True / True |

Profit improved on 6 weeks, tied on 0 and declined on 2. Exact two-sided sign-test p = 0.289062. The 95% paired bootstrap interval for mean gain is [€-251.05, €527.21], using 10,000 resamples and seed 2026111402.

Candidate minimum on-time share: 96.91%; aggregate on-time orders: 2440/2476; undelivered: 0. The one-sided 95% lower bound on weekly qualification is 68.77%, conditional on independent identically distributed weeks.

Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.

Baseline source: `16d908dd8e96325d972aa45529f69d6ca82910be212b68857e7cf3f0677530ef`. Candidate source: `1970e8fd325bb2a6de0154dba9a44f3b0816ad2e3a6f878a0a8368b7312681fa`. Selection frozen: `2026-11-14T01:48:17.588583+00:00`.

| Seed | Baseline world | Candidate world |
|---|---|---|
| note-spelling-unseen-20261114-f78979dd4e5b3a7c | `w8c4afff7ce388130bd35` | `wd4f662403988d00ca037` |
| note-spelling-unseen-20261114-8bc883348a90d012 | `w0be5b75baa67039789b8` | `w1299cdda80236cab3770` |
| note-spelling-unseen-20261114-df5da3c0bccf1e98 | `wddbfe455d9d22b4aa67c` | `we2331462004a20b30ac5` |
| note-spelling-unseen-20261114-b0a0611536d3eb20 | `wb6570508fe39f334178a` | `wf7c45bf5664bf3a25125` |
| note-spelling-unseen-20261114-309e12dc0f90a102 | `wf8fe012802581848040f` | `w2e9187237875066192e1` |
| note-spelling-unseen-20261114-5914d58b5b701bdc | `w3fc02045dd321beb8d6f` | `w4db41aefe518eca7aac9` |
| note-spelling-unseen-20261114-6e740a3630050c2d | `w05c7c136c1ff39724db3` | `wb938037efdc55437d704` |
| note-spelling-unseen-20261114-c07ddff01f6c5f00 | `w0a2762d880b912ef91d1` | `wc93886b2b5bc4b534125` |

Exact settings, file hashes and counts are in the accompanying JSON report. A small panel cannot establish a very low disqualification probability. Bootstrap intervals are descriptive small-sample estimates, not guarantees. All declared weeks remain in mean profit, including unqualified weeks. No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened. Do not tune against these outcomes and continue calling the same panel unseen.
