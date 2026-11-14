# Frozen paired frontier validation

Candidate mean profit: €10,054.80; baseline: €9,418.35. Paired gain: €636.44 (6.76%). Qualified weeks: candidate 12/12, baseline 12/12.

| Seed | Baseline profit | Candidate profit | Gain | On-time orders, baseline / candidate | Qualified, baseline / candidate |
|---|---:|---:|---:|---:|---:|
| payout-unseen-20261114-1c6cfe93689d0a32 | €7,642.09 | €9,365.45 | €1,723.36 | 260/261 / 255/258 | True / True |
| payout-unseen-20261114-11d2bc22e5a2e17d | €7,825.83 | €8,768.21 | €942.38 | 264/269 / 252/263 | True / True |
| payout-unseen-20261114-619e961538a5119e | €6,757.96 | €7,041.91 | €283.95 | 265/277 / 242/258 | True / True |
| payout-unseen-20261114-8a0fdb3994ac5c0e | €12,175.40 | €11,287.77 | €-887.63 | 374/382 / 349/369 | True / True |
| payout-unseen-20261114-166d26adce8afd0e | €9,128.64 | €10,338.55 | €1,209.91 | 271/272 / 262/265 | True / True |
| payout-unseen-20261114-df10216ee874354b | €11,469.38 | €11,457.35 | €-12.03 | 350/363 / 321/342 | True / True |
| payout-unseen-20261114-bdbb0af73763c605 | €6,666.86 | €7,928.98 | €1,262.12 | 233/236 / 227/231 | True / True |
| payout-unseen-20261114-bfc8b37c1c3b01b5 | €8,486.71 | €9,330.84 | €844.13 | 297/309 / 284/300 | True / True |
| payout-unseen-20261114-2b782dea15c2c930 | €10,615.01 | €11,586.78 | €971.77 | 302/303 / 289/295 | True / True |
| payout-unseen-20261114-e2258b662e732c8e | €7,529.47 | €7,594.43 | €64.96 | 249/258 / 235/246 | True / True |
| payout-unseen-20261114-1954b8aff04d03b3 | €15,339.96 | €15,519.32 | €179.36 | 373/380 / 349/365 | True / True |
| payout-unseen-20261114-266a2575198d039b | €9,382.93 | €10,437.95 | €1,055.02 | 296/297 / 289/294 | True / True |

Profit improved on 10 weeks, tied on 0 and declined on 2. Exact two-sided sign-test p = 0.038574. The 95% paired bootstrap interval for mean gain is [€228.53, €1,008.66], using 20,000 resamples and seed 2026111403.

Candidate minimum on-time share: 93.80%; aggregate on-time orders: 3354/3486; undelivered: 0. The one-sided 95% lower bound on weekly qualification is 77.91%, conditional on independent identically distributed weeks.

Every noncancelled order leg must arrive by its deadline; private delivery uses min(order deadline, booked slot end + 30 minutes). Snapshot counts and ledger totals must reconcile to official scores.

Baseline source: `16d908dd8e96325d972aa45529f69d6ca82910be212b68857e7cf3f0677530ef`. Candidate source: `45f4a853adb028d983d3c211a5b03f04b3b1c0d00ec67631bbee9959e00fdeea`. Selection frozen: `2026-11-14T03:24:40.100829+00:00`.

| Seed | Baseline world | Candidate world |
|---|---|---|
| payout-unseen-20261114-1c6cfe93689d0a32 | `w9792c36af80435e8356d` | `w15a04360a544c329bb74` |
| payout-unseen-20261114-11d2bc22e5a2e17d | `w62f0984788410938c8b4` | `wa9b528f059f37e37c717` |
| payout-unseen-20261114-619e961538a5119e | `wd481f1b570d17886c38b` | `wda18264c0af79369622f` |
| payout-unseen-20261114-8a0fdb3994ac5c0e | `we01419f6f195fbdd5f7e` | `w41c1a8d2426d61c029e1` |
| payout-unseen-20261114-166d26adce8afd0e | `w71f86a6450f582f13e62` | `w41dfb468b53ad569c41a` |
| payout-unseen-20261114-df10216ee874354b | `w69dc986161ca61b80710` | `w9e1bab078a65289af454` |
| payout-unseen-20261114-bdbb0af73763c605 | `wf3375255613b903cec06` | `w14cd72c5bdfa45326d2e` |
| payout-unseen-20261114-bfc8b37c1c3b01b5 | `wad509d6e69fbca969ac3` | `w8efb30b6ad8d38f3b698` |
| payout-unseen-20261114-2b782dea15c2c930 | `w49612a1b08ad3d5d7143` | `wa4a11bda0d9a8b8928dd` |
| payout-unseen-20261114-e2258b662e732c8e | `w9318346c090839395093` | `we80a390f2852a537e1dd` |
| payout-unseen-20261114-1954b8aff04d03b3 | `w43eaf76796aa26a5b328` | `w09695636c500760ddad6` |
| payout-unseen-20261114-266a2575198d039b | `w52ad5b635ac9d9a2a4a7` | `w899f3eb9598758f34fcb` |

Exact settings, file hashes and counts are in the accompanying JSON report. A small panel cannot establish a very low disqualification probability. Bootstrap intervals are descriptive small-sample estimates, not guarantees. All declared weeks remain in mean profit, including unqualified weeks. No outcomes are discovered by label or selected by performance; only exact manifest world IDs are opened. Do not tune against these outcomes and continue calling the same panel unseen.
