# Payout-only development screen

Cutting only the opening unbundled fee by 15% passed the predeclared screen. It gained €1,093.57 per week across two old development seeds, and both weeks qualified. Cutting the full schedule failed because one week delivered only 89.10% on time. Neither variant is the production default.

| Seed suffix | Baseline profit | Full schedule cut / on time | Opening-only cut / on time |
|---|---:|---:|---:|
| 14 | €8,627.17 | €10,002.05 / 97.04% | €10,120.20 / 98.52% |
| 15 | €10,369.66 | €11,102.82 / 89.10% | €11,063.77 / 92.88% |

The opening-only gains were €1,493.03 and €694.11. Its escalation, urgent rescue and late-rescue fees remain unchanged. Both variants preserve customer pricing formulas and bundle schedules at identical states. Later admissions and quotes can still differ through backlog, trust and learning.

All four worlds finished, with no undelivered orders, failed visits or transport recoveries. The full-schedule treatment had three refused reprices after same-minute drops and replacement bookings. The opening-only treatment had one refused reprice after a same-minute booking. The raw errors and matching events are retained in the [complete audit](payout-results.json); these attempts were not replaced.

The [frozen protocol](../experiments/payout-protocol.json) selected opening-only for four predeclared confirmation seeds: 09, 10, 12 and 16. Confirmation runs serially with one worker and the shared four-world guard. It must pass before a new independent paired evaluation is reserved. These two development weeks do not establish generalization or a global optimum.
