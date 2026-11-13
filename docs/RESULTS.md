# Measured results — 13 November 2026

## Config F (current default, 13–14 November)

Safe-note filter, min local drivers=1, no open-order cap; other parameters unchanged. Same seeds as below.

| Seed | Margin EUR | Orders | On time |
|---|---:|---:|---:|
| spread-1 | 4701.95 | 203 | 96.06% |
| burger-validation-1 | 3519.18 | 132 | 100.00% |
| burger-holdout-1 | 3690.40 | 128 | 100.00% |
| burger-holdout-2 | 2971.94 | 100 | 100.00% |
| burger-holdout-3 | 3823.36 | 133 | 96.99% |
| burger-holdout-4 | 5740.99 | 254 | 92.52% |

Mean over 6 weeks: EUR 4074.64 (previous policy on the same seeds: EUR 1850.08). Measured via a monkeypatched run of the same logic; a run through `run.py` after the code change is still pending (all 8 team practice slots were busy). Holdout-4 at 92.5% is close to the 90% minimum. Full sweep: docs/experiments/2026-11-13-capacity-sweep.md.

## Previous selected policy

Level 8, official server. All amounts are simulated euros. These are practice results, not leaderboard ranks or a prediction of the final.

Selected policy: price=1.45, opening fee=1.25, min local drivers=2, max open orders=16, max driving=300 minutes, margin floor=1000 cents. Notes, private addresses and trade-ins are currently declined.

| Seed | Margin EUR | Orders | On time | Qualified |
|---|---:|---:|---:|---|
| burger-holdout-1 | 2038.09 | 69 | 100.00% | True |
| burger-holdout-2 | 1726.47 | 57 | 98.25% | True |
| burger-holdout-3 | 1703.79 | 61 | 96.72% | True |
| burger-holdout-4 | 1929.54 | 66 | 100.00% | True |
| burger-holdout-5 | 2028.46 | 63 | 98.41% | True |
| burger-validation-1 | 1990.10 | 69 | 100.00% | True |
| burger-validation-2 | 2488.88 | 81 | 100.00% | True |
| spread-1 | 1712.42 | 65 | 98.46% | True |

Mean margin over 8 weeks: EUR 1952.22.

Selection: three initial paired seeds (spread-1, burger-validation-1, burger-validation-2); five new holdout seeds tested only after choosing the balanced configuration. Eight weeks are preliminary evidence, not a guarantee. No refused actions were recorded in these eight completed runs.

## Earlier conservative control

| Seed | Margin EUR | Orders | On time |
|---|---:|---:|---:|
| burger-validation-1 | 254.16 | 6 | 100.00% |
| burger-validation-2 | 1161.57 | 23 | 100.00% |
| spread-1 | 674.08 | 17 | 100.00% |

The official starter was interrupted by network failures and resumed using its rejoin logic: on spread-1 it finished at EUR -71,269.08 and 46.62% on time (946 orders). This is a recovered run, not an uninterrupted exact reproduction of the handbook baseline. The first conservative spread-1 run was also recovered; the balanced and holdout runs completed without such interruptions.

Unit checks: 9 tests cover admission constraints, schedule validity and safe read-only retries. Live clock, process restart during the live final, complex notes and route chaining still need validation.
