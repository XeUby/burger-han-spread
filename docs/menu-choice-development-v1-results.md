# Randomized menu-choice development results

Completed all 16 planned unranked worlds on eight fresh-at-freeze development seed pairs. No replacement or promotion.

Whole-week package effect: **€-314.82/week**, descriptive paired-t 95% interval **[€-860.28, €230.64]**; 1 positive pairs and 7 negative pairs. Whole-pair bootstrap interval [€-753.57, €97.92].

Retain the incumbent. The observed package does not establish a profit improvement; passing the choice-support gate permits model assessment only.

This comparison includes bounded menu-price exploration and suppression of unsupported scalar demand updates for both assigned arms. It cannot isolate the weekly profit effect of the same-day premium alone.

| Outcome | Preserved control | Menu exploration |
|---|---:|---:|
| Mean weekly profit | €11,116.58 | €10,801.76 |
| Qualified weeks | 8 | 8 |
| Mean orders | 293.38 | 292.88 |
| Aggregate on time | 97.32% | 97.40% |
| Lowest weekly on time | 91.57% | 93.28% |
| Mean driver payments | €17,830.52 | €17,950.34 |
| Mean late refunds | €361.13 | €379.81 |
| Undelivered orders | 0 | 0 |
| Failed visits | 0 | 0 |
| Fines, total | €0.00 | €0.00 |
| Action errors | 0 | 0 |
| Recoveries | 0 | 0 |
| Qualification one-sided 95% lower bound | 68.77% | 68.77% |

Qualification bounds assume independent weekly seeds. These eight development pairs cannot establish reliable qualification or leaderboard superiority.

## Randomized choice outcomes

| Assignment | Known outcomes | Same-day awards | Later awards | No purchase |
|---|---:|---:|---:|---:|
| original | 169 | 82 | 11 | 76 |
| premium | 144 | 31 | 25 | 88 |

Unknown assignment outcomes: 0. Support gate passed: True. Support permits separately frozen model assessment, not promotion or a causal claim for untested menus.

The primary contrasts below compare premium minus original per randomized eligible request, using probability weights within each week and equal week weights. They include no purchase and are not conditioned on winning. Interference through capacity and trust limits transport beyond this exploratory policy.

| Outcome | Mean change, percentage points | Descriptive week-level 95% interval |
|---|---:|---:|
| same_day | -32.52 | [-50.75, -14.28] |
| later | +8.92 | [+1.16, +16.67] |
| no_purchase | +7.14 | [-19.32, +33.60] |

These prespecified inverse-probability contrasts need not sum to zero in this finite sample because realized assignment counts differ. The counts above are descriptive; no alternative estimator has replaced the frozen primary analysis. The three intervals are unadjusted development diagnostics, not simultaneous confirmatory claims.

## Operational evidence

Independent audit checked 313 assignments for deterministic allocation, menu preservation, exact same-day price change, eligibility, caps and matching transmitted/acknowledged actions. Official inventory verified all sixteen worlds ended and were unranked. Maximum concurrent study worlds: 3; including the retained interrupted private world, the own unfinished-world bound was 4.

The full outcome report retains all ledgers, cancellations, action errors, runtime failures, individual world results and artifact hashes. Frozen source, protocol and journal remain in `experiments/menu-choice-development-v1*`. Reproduce with the report, assignment checker, official runner audit, concurrency audit and this renderer under `research/menu-choice/`.
