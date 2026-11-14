# Opening-only payout confirmation

The unchanged 15% opening-fee reduction passed all four predeclared confirmation weeks. Mean paired profit improved by €1,776.87, and the smallest gain was €1,498.29. All four weeks qualified, with no undelivered orders, failed visits or transport recoveries.

| Seed suffix | Baseline profit | Candidate profit | Gain | Candidate on time |
|---|---:|---:|---:|---:|
| 09 | €8,145.27 | €9,701.27 | €1,556.00 | 97.97% |
| 10 | €14,065.59 | €16,278.36 | €2,212.77 | 96.27% |
| 12 | €11,982.16 | €13,822.58 | €1,840.42 | 95.32% |
| 16 | €9,547.79 | €11,046.08 | €1,498.29 | 98.32% |

The final week had two refused reprices of gig `g194` at minute 7247, after its same-minute drop and expiry. The [audit](payout-confirmation-results.json) retains both errors and matching events. No attempts were discarded or replaced.

These are old development seeds, not independent evidence of generalization. The [confirmation protocol](../experiments/payout-confirmation-protocol.json) fixed the settings and seeds before confirmation started. After it passed, a [12-pair independent panel](../experiments/payout-validation-manifest.json) was reserved and launched. It compares the frozen validated late-rescue baseline with the frozen opening-only candidate, with no tuning between weeks. One worker respects the shared four-world guard; no ranking or final run is submitted.

Promotion requires all 12 candidate weeks to qualify, no undelivered orders or failed visits, and a positive mean paired gain with a positive 95% paired bootstrap lower endpoint. All action errors must be inspected. The production default remains unchanged pending the complete independent evaluation.
