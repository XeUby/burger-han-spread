# Pair a new car with a car that waits

Owner: Boris (Claude). 14 November 2026. Level 8 practice weeks. The base is candidate 1 (`candidate-1.md`).

## The idea

The dispatcher already puts two newly won cars in one gig when the second car starts near where the first ends: one driver, one trip home. It looked only at cars won in the same 15 minutes. Halal Team pairs new cars with cars whose gig is waiting for a driver, which is a larger pool.

Now a car whose gig has waited three hours without a driver can become the second car of a new car's gig. The old gig is taken out of the app first; if that fails, the new car goes alone. Setting `pairOpen`, the minutes a gig must wait first; 0 switches it off.

## The effect

| Weeks | Candidate 1 | With pairing after 3 hours | Difference | Weeks up / down |
| --- | ---: | ---: | ---: | ---: |
| The sixteen weeks of the earlier notes | €11,436 | €11,752 | +€316 (standard error €194) | 10 / 6 |
| Fresh weeks `bh-reader-20261114-01` to `-08` | €10,267 | €10,421 | +€154 | |
| The other 24 weeks of the forty | | | +€113 on 26 weeks, with 2 repeated (standard error €178) | 12 / 14 |
| All 48 weeks | | | +€197 (standard error €113) | 25 / 23 |

The lowest on-time share over the 48 weeks rises from 91.7% to 93.2%, and late orders fall from 3.9% to 3.5% on the sixteen weeks. Every week is ranked.

| Wait before pairing | Difference on the sixteen weeks | Lowest on-time share |
| --- | ---: | ---: |
| 1 hour | +€17 (standard error €230) | 92.4% |
| 3 hours | +€316 (standard error €194) | 93.2% |
| 6 hours | +€206 (standard error €151) | 91.2% |

We keep three hours: the margin gain is within the noise, but the weakest weeks are safer.
