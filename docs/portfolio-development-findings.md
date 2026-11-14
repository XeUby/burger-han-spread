# Joint portfolio development results

The frozen four-arm panel completed all sixteen unranked worlds on four familiar underlying seed blocks. These are development results, not untouched validation. The validated selection and the separate lower-level candidate remain unchanged.

The policy compares customer quotes, existing route commitments and opening driver payments in one OR-Tools model. It executes one action, observes events and replans. NetworkX supplies an independent oracle for pair-only solver tests. Optimality of that finite model does not establish optimality in Spread.

## Whole-week outcomes

| Policy | Mean net profit | Paired gain | 95% paired-t interval | Qualified | Minimum on time | Mean orders | Mean driver payments | Mean refunds |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| benchmark | €11,790.90 | €0.00 | €0.00 to €0.00 | 4/4 | 92.88% | 316.25 | €20,969.28 | €664.68 |
| planner | €12,314.28 | €523.38 | €-1,285.88 to €2,332.64 | 4/4 | 93.75% | 319.75 | €20,298.65 | €796.57 |
| future | €12,314.07 | €523.17 | €-1,286.65 to €2,332.98 | 4/4 | 93.75% | 319.75 | €20,298.65 | €796.56 |
| payments | €12,407.14 | €616.24 | €-1,257.36 to €2,489.84 | 4/4 | 94.07% | 320.50 | €20,132.85 | €776.79 |

The JSON retains paired differences, whole-week bootstrap intervals, ledger decomposition, qualification bounds, errors and every world ID. Four adaptive blocks provide weak precision and cannot establish qualification reliability. With four successes, the one-sided 95% lower qualification bound is only 47.29% under IID-week assumptions.

## Mechanisms and decisions

| Policy | Changed quotes | Anchored quotes | Bundled posts | Higher-paid posts | Frames with future values | Solver fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| benchmark | 0 | 0 | 0 | 0 | 0 | 0 |
| planner | 1769 | 363 | 258 | 0 | 0 | 0 |
| future | 1767 | 363 | 258 | 0 | 170 | 0 |
| payments | 1824 | 357 | 258 | 201 | 173 | 0 |

**planner:** Does not pass this implementation's development screen: mean paired gain below €1,500.

**future:** Does not pass this implementation's development screen: mean paired gain below €1,500.

**payments:** Does not pass this implementation's development screen: mean paired gain below €1,500.

Added future-value term: €-0.21 per week relative to the preceding arm; descriptive 95% paired-t interval €-0.87 to €0.44.

Added payment choices: €93.08 per week relative to the preceding arm; descriptive 95% paired-t interval €-438.03 to €624.18.

## Operational and economic audit

All 4 control replications matched archived events and scores: True. All completed score totals and terminal order counts reconcile to the ledger and snapshots.

Across all sixteen worlds: 0 action errors, 0 recoveries, 0 failed visits, 0 undelivered orders, and €300.00 in fines. These outcomes remain in the report.

planner mean profit change: driver_fee €670.63; fine €-25.00; late_refund €-131.89; release_fee €17.37; revenue €-7.73.

future mean profit change: driver_fee €670.63; fine €-25.00; late_refund €-131.88; release_fee €17.37; revenue €-7.95.

payments mean profit change: driver_fee €836.43; fine €-25.00; late_refund €-112.11; release_fee €-20.20; revenue €-62.88.

## Remaining limits

- The common scenarios are eight parameter sensitivities, with analytically integrated customer wins. They are not a full multistage model of correlated bookings, drops or future demand.
- Capacity reservations, future value, payment response and refund/undelivery tails contain explicit unvalidated assumptions. Better booking prediction on historical accepted work does not identify counterfactual payment effects.
- Candidate generation is bounded, holds at most six anchors, and omits two-uncertain-request pairs, larger routes, private addresses and trade-ins. Rescue behavior remains inherited. Omitted candidates and overflow posts are logged.
- The API cannot add charging to an already-booked route. Changed-route exposure remains logged and paid; it is not claimed solved.
- A passing development screen only nominates a finalist. Freeze one policy before generating untouched seeds. The 24-pair minimum remains a floor; the current 95% qualification target needs at least 86 zero-failure pairs at the first allocated alpha, and possibly more for profit variance.
- No ranked round, test final or final was entered. No leaderboard rank or global optimum is inferred from these seeds.

Reproduction: [frozen manifest](../experiments/portfolio-development-v1.json), [protocol](../experiments/portfolio-v1-protocol.json), [audit](portfolio-development-v1-results.json), [server operations](portfolio-development-v1-operations.json), [code and commands](../research/portfolio/README.md), [pre-quote model check](portfolio-prior-check.json).
